const DIACRITICS = /[\u0300-\u036f]/g;
function normalizeSearchText(value) {
  return String(value || "").normalize("NFD").replace(DIACRITICS, "").toLocaleLowerCase("es").replace(/[_./\\:+-]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokenizeQuery(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}
function extractTags(metadata = {}, raw = null) {
  const parts = [];
  const sources = [
    metadata.tags,
    metadata.labels,
    metadata.keywords,
    raw?.tags,
    raw?.labels
  ];
  for (const source of sources) {
    if (Array.isArray(source)) parts.push(...source.map(String));
    else if (typeof source === "string" && source.trim()) parts.push(source);
  }
  return parts.join(" ");
}
export {
  extractTags,
  normalizeSearchText,
  tokenizeQuery
};
