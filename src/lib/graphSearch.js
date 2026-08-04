import { tokenizeQuery } from "./searchNormalize.js";
import { codeToKind, kindColor } from "./kindCatalog.js";
const SEARCH_DEFAULT_LIMIT = 18;
const SEARCH_CANDIDATE_CAP = 240;
const SEARCH_BATCH_SIZE = 500;
function scoreMatch(indexed, numericId, term, tokens) {
  const label = indexed.searchLabels[numericId] || "";
  const idNorm = indexed.searchIds[numericId] || "";
  const haystack = indexed.searchText[numericId] || "";
  if (!tokens.every((token) => haystack.includes(token))) return -1;
  let score = 50;
  if (label === term) score = 0;
  else if (label.startsWith(term)) score = 1;
  else if (idNorm === term) score = 2;
  else if (idNorm.startsWith(term)) score = 3;
  else if (label.includes(term)) score = 4;
  else if (tokens.some((token) => label.startsWith(token))) score = 5;
  else if (indexed.searchFiles[numericId]?.includes(term)) score = 6;
  else if (indexed.searchGroups[numericId]?.includes(term)) score = 7;
  else score = 8;
  return score;
}
function toResult(indexed, numericId, score, visibleSet) {
  const kind = codeToKind(indexed.kindCodes[numericId]);
  return {
    numericId,
    id: indexed.originalIds[numericId],
    label: indexed.labels[numericId],
    kind,
    color: kindColor(kind),
    group: indexed.groups[numericId],
    file: indexed.files[numericId],
    location: indexed.locations[numericId] || "",
    degree: indexed.degrees[numericId],
    inView: visibleSet ? visibleSet.has(numericId) : false,
    score
  };
}
function sortCandidates(matches) {
  return matches.sort(
    (a, b) => a.score - b.score || b.degree - a.degree || a.label.localeCompare(b.label, "es")
  );
}
function trimCandidates(matches, cap) {
  if (matches.length <= cap) return matches;
  sortCandidates(matches);
  matches.length = cap;
  return matches;
}
function searchIndexed(indexed, query, options = {}) {
  const limit = Math.max(1, Number(options.limit) || SEARCH_DEFAULT_LIMIT);
  const visibleSet = options.visibleSet instanceof Set ? options.visibleSet : null;
  const tokens = tokenizeQuery(query);
  if (!tokens.length || !indexed) return [];
  const term = tokens.join(" ");
  const matches = [];
  for (let numericId = 0; numericId < indexed.nodeCount; numericId += 1) {
    const score = scoreMatch(indexed, numericId, term, tokens);
    if (score < 0) continue;
    matches.push(toResult(indexed, numericId, score, visibleSet));
    if (matches.length >= SEARCH_CANDIDATE_CAP * 2) {
      trimCandidates(matches, SEARCH_CANDIDATE_CAP);
    }
  }
  return sortCandidates(matches).slice(0, limit);
}
async function searchIndexedProgressive(indexed, query, options = {}) {
  const limit = Math.max(1, Number(options.limit) || SEARCH_DEFAULT_LIMIT);
  const batchSize = Math.max(50, Number(options.batchSize) || SEARCH_BATCH_SIZE);
  const visibleSet = options.visibleSet instanceof Set ? options.visibleSet : null;
  const signal = options.signal;
  const onPartial = options.onPartial;
  const tokens = tokenizeQuery(query);
  if (!tokens.length || !indexed) {
    return { results: [], totalMatched: 0, cancelled: false, scanned: 0 };
  }
  const term = tokens.join(" ");
  const matches = [];
  let scanned = 0;
  let totalMatched = 0;
  const publish = (done) => {
    const top = sortCandidates(matches.slice()).slice(0, limit);
    onPartial?.(top, {
      done,
      scanned,
      total: indexed.nodeCount,
      totalMatched,
      cancelled: false
    });
    return top;
  };
  for (let start = 0; start < indexed.nodeCount; start += batchSize) {
    if (signal?.cancelled) {
      return {
        results: [],
        totalMatched,
        cancelled: true,
        scanned
      };
    }
    const end = Math.min(indexed.nodeCount, start + batchSize);
    for (let numericId = start; numericId < end; numericId += 1) {
      const score = scoreMatch(indexed, numericId, term, tokens);
      if (score < 0) continue;
      totalMatched += 1;
      matches.push(toResult(indexed, numericId, score, visibleSet));
    }
    scanned = end;
    if (matches.length > SEARCH_CANDIDATE_CAP) {
      trimCandidates(matches, SEARCH_CANDIDATE_CAP);
    }
    publish(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (signal?.cancelled) {
    return { results: [], totalMatched, cancelled: true, scanned };
  }
  const results = publish(true);
  return {
    results,
    totalMatched,
    cancelled: false,
    scanned
  };
}
export {
  SEARCH_BATCH_SIZE,
  SEARCH_CANDIDATE_CAP,
  SEARCH_DEFAULT_LIMIT,
  searchIndexed,
  searchIndexedProgressive
};
