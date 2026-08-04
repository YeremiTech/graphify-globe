import { CancelledError } from "./graphErrors.js";
import { firstValue, isObject } from "./graphValidation.js";
import { codeToKind, kindColor, kindToCode } from "./kindCatalog.js";
import { extractTags, normalizeSearchText } from "./searchNormalize.js";
import {
  searchIndexed as runSearchIndexed,
  searchIndexedProgressive
} from "./graphSearch.js";
const KIND_ALIASES = [
  ["interface", ["interface", "contract"]],
  ["class", ["class", "entity", "dto", "model", "service", "controller", "repository"]],
  ["method", ["method", "member", "constructor"]],
  ["function", ["function", "procedure", "lambda"]],
  ["package", ["package", "namespace"]],
  ["module", ["module", "component"]],
  ["table", ["table", "database", "schema", "collection"]],
  ["config", ["config", "configuration", "property"]],
  ["endpoint", ["endpoint", "route", "api"]],
  ["file", ["file", "document", "source"]]
];
function normalizeKind(node) {
  const labels = Array.isArray(node.labels) ? node.labels.join(" ") : node.labels;
  const raw = String(
    firstValue(node, [
      "kind",
      "type",
      "category",
      "node_type",
      "entity_type",
      "label_type"
    ]) || labels || ""
  ).toLowerCase();
  const label = String(firstValue(node, ["label", "name", "qualified_name"]) || "").toLowerCase();
  const file = String(firstValue(node, ["source_file", "file", "path", "source.path"]) || "").toLowerCase();
  const searchable = `${raw} ${label}`;
  for (const [kind, aliases] of KIND_ALIASES) {
    if (aliases.some((alias) => searchable.includes(alias))) return kind;
  }
  if (/\.(ya?ml|json|xml|properties|toml|ini|env)$/.test(file)) return "config";
  if (/\.(sql|ddl)$/.test(file)) return "table";
  if (file) return "file";
  return "default";
}
function normalizeFile(node) {
  return String(
    firstValue(node, [
      "source_file",
      "sourceFile",
      "file",
      "filepath",
      "file_path",
      "path",
      "source.path",
      "metadata.file",
      "metadata.path"
    ]) || ""
  ).replaceAll("\\", "/");
}
function normalizeLocation(node) {
  const value = firstValue(node, [
    "source_location",
    "sourceLocation",
    "location",
    "range",
    "line",
    "line_number",
    "source.location",
    "metadata.location"
  ]);
  if (isObject(value)) {
    const start = firstValue(value, ["start.line", "startLine", "start", "line"]);
    const end = firstValue(value, ["end.line", "endLine", "end"]);
    if (start !== void 0 && end !== void 0) return `L${start}-L${end}`;
    return JSON.stringify(value);
  }
  return value === void 0 || value === null ? "" : String(value);
}
function groupKey(node, file) {
  const explicit = firstValue(node, ["package", "namespace", "module", "group", "metadata.package"]);
  if (explicit) return String(explicit);
  const parts = file.split("/").filter(Boolean);
  if (!parts.length) return "sin-grupo";
  const sourceIndex = Math.max(parts.lastIndexOf("java"), parts.lastIndexOf("kotlin"), parts.lastIndexOf("src"));
  if (sourceIndex >= 0 && parts.length > sourceIndex + 2) {
    return parts.slice(sourceIndex + 1, Math.min(parts.length - 1, sourceIndex + 4)).join("/");
  }
  if (parts.length === 1) return parts[0];
  return parts.slice(0, Math.min(parts.length - 1, 4)).join("/");
}
function primitiveMetadata(node) {
  const ignored = /* @__PURE__ */ new Set([
    "id",
    "label",
    "name",
    "type",
    "kind",
    "category",
    "source",
    "target",
    "data",
    "properties",
    "attributes",
    "metadata",
    "source_file",
    "sourceFile",
    "file",
    "path",
    "location",
    "source_location"
  ]);
  const sources = [node, node.properties, node.metadata, node.data].filter(isObject);
  const output = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (ignored.has(key) || key in output) continue;
      if (["string", "number", "boolean"].includes(typeof value)) output[key] = value;
      if (Array.isArray(value) && value.length <= 8 && value.every((item) => typeof item !== "object")) {
        output[key] = value.join(", ");
      }
      if (Object.keys(output).length >= 16) return output;
    }
  }
  return output;
}
function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
function wrapLongitude(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}
function centerOutSlots(count) {
  const center = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b
  );
}
function createSphericalLayout(prepared, groups) {
  const total = Math.max(1, prepared.length);
  const yLimit = 0.985;
  const membersByGroup = new Map(groups.map((group) => [group, []]));
  const positions = /* @__PURE__ */ new Map();
  for (const item of prepared) {
    const members = membersByGroup.get(item.group);
    if (members) members.push(item);
  }
  let consumed = 0;
  groups.forEach((group, groupOrder) => {
    const members = membersByGroup.get(group) || [];
    const count = members.length;
    if (!count) return;
    members.sort((a, b) => b.degree - a.degree || String(a.id).localeCompare(String(b.id)));
    const top = yLimit - consumed / total * yLimit * 2;
    consumed += count;
    const bottom = yLimit - consumed / total * yLimit * 2;
    const bandHeight = top - bottom;
    const padding = groups.length > 1 ? Math.min(0.012, bandHeight * 0.08) : 0;
    const usableTop = top - padding * 0.5;
    const usableBottom = bottom + padding * 0.5;
    const usableHeight = Math.max(1e-4, usableTop - usableBottom);
    const phase = hashString(group) / 4294967295 * Math.PI * 2 + groupOrder * 0.73;
    const slots = centerOutSlots(count);
    members.forEach((item, rank) => {
      const slot = slots[rank];
      const fraction = (slot + 0.5) / count;
      const y = usableTop - fraction * usableHeight;
      const theta = phase + slot * GOLDEN_ANGLE + fraction * 0.55;
      const key = item.layoutKey ?? item.numericId;
      positions.set(key, {
        lat: Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI,
        lon: wrapLongitude(theta * 180 / Math.PI)
      });
    });
  });
  return positions;
}
function assertNotCancelled(signal) {
  if (signal?.cancelled) throw new CancelledError();
}
function internString(pool, value) {
  const text = String(value || "");
  const existing = pool.get(text);
  if (existing !== void 0) return existing;
  pool.set(text, text);
  return text;
}
function buildIndexedGraph(validated, options = {}) {
  const { signal, onProgress } = options;
  const report = (value, label, phase) => {
    assertNotCancelled(signal);
    onProgress?.(value, label, phase);
  };
  report(0.35, "Indexando identificadores…", "indexing");
  const entries = [...validated.nodeById.values()];
  const nodeCount = entries.length;
  const edgeCount = validated.edges.length;
  const originalIds = new Array(nodeCount);
  const idToNumeric = /* @__PURE__ */ new Map();
  const labels = new Array(nodeCount);
  const files = new Array(nodeCount);
  const groups = new Array(nodeCount);
  const locations = new Array(nodeCount);
  const searchText = new Array(nodeCount);
  const searchLabels = new Array(nodeCount);
  const searchIds = new Array(nodeCount);
  const searchFiles = new Array(nodeCount);
  const searchGroups = new Array(nodeCount);
  const metadatas = new Array(nodeCount);
  const kindCodes = new Uint8Array(nodeCount);
  const degrees = new Uint32Array(nodeCount);
  const incoming = new Uint32Array(nodeCount);
  const outgoing = new Uint32Array(nodeCount);
  const stringPool = /* @__PURE__ */ new Map();
  entries.forEach((item, numericId) => {
    assertNotCancelled(signal);
    const node = item.raw;
    const file = internString(stringPool, normalizeFile(node));
    const group = internString(stringPool, groupKey(node, file));
    const label = internString(
      stringPool,
      String(firstValue(node, ["label", "name", "qualified_name", "title"]) || item.id)
    );
    const kind = normalizeKind(node);
    const location = internString(stringPool, normalizeLocation(node));
    const moduleName = String(
      firstValue(node, ["module", "package", "namespace", "metadata.module", "metadata.package"]) || group || ""
    );
    const metadata = primitiveMetadata(node);
    const tags = extractTags(metadata, node);
    originalIds[numericId] = item.id;
    idToNumeric.set(item.id, numericId);
    labels[numericId] = label;
    files[numericId] = file;
    groups[numericId] = group;
    locations[numericId] = location;
    kindCodes[numericId] = kindToCode(kind);
    degrees[numericId] = item.degree >>> 0;
    metadatas[numericId] = metadata;
    const metaBlob = Object.entries(metadata).flatMap(([key, value]) => [key, String(value)]).join(" ");
    searchLabels[numericId] = normalizeSearchText(label);
    searchIds[numericId] = normalizeSearchText(item.id);
    searchFiles[numericId] = normalizeSearchText(file);
    searchGroups[numericId] = normalizeSearchText(`${group} ${moduleName}`);
    searchText[numericId] = normalizeSearchText(
      [label, item.id, file, group, moduleName, kind, location, tags, metaBlob].join(" ")
    );
  });
  report(0.48, "Indexando relaciones y adyacencia…", "indexing");
  const edgeSource = new Uint32Array(edgeCount);
  const edgeTarget = new Uint32Array(edgeCount);
  const edgeRelations = new Array(edgeCount);
  const edgeConfidences = new Array(edgeCount);
  let written = 0;
  for (const edge of validated.edges) {
    assertNotCancelled(signal);
    const source = idToNumeric.get(edge.source);
    const target = idToNumeric.get(edge.target);
    if (source === void 0 || target === void 0) continue;
    edgeSource[written] = source;
    edgeTarget[written] = target;
    edgeRelations[written] = internString(stringPool, edge.relation || "related");
    edgeConfidences[written] = internString(stringPool, edge.confidence || "EXTRACTED");
    outgoing[source] += 1;
    incoming[target] += 1;
    written += 1;
  }
  const finalEdgeCount = written;
  const compactSource = edgeSource.subarray(0, finalEdgeCount);
  const compactTarget = edgeTarget.subarray(0, finalEdgeCount);
  const compactRelations = edgeRelations.slice(0, finalEdgeCount);
  const compactConfidences = edgeConfidences.slice(0, finalEdgeCount);
  const degreeForCsr = new Uint32Array(nodeCount);
  for (let index = 0; index < finalEdgeCount; index += 1) {
    degreeForCsr[compactSource[index]] += 1;
    degreeForCsr[compactTarget[index]] += 1;
  }
  const offsets = new Uint32Array(nodeCount + 1);
  for (let index = 0; index < nodeCount; index += 1) {
    offsets[index + 1] = offsets[index] + degreeForCsr[index];
  }
  const neighbors = new Uint32Array(offsets[nodeCount]);
  const neighborEdgeIds = new Uint32Array(offsets[nodeCount]);
  const neighborOutgoing = new Uint8Array(offsets[nodeCount]);
  const cursor = offsets.slice();
  for (let edgeId = 0; edgeId < finalEdgeCount; edgeId += 1) {
    const source = compactSource[edgeId];
    const target = compactTarget[edgeId];
    let slot = cursor[source];
    neighbors[slot] = target;
    neighborEdgeIds[slot] = edgeId;
    neighborOutgoing[slot] = 1;
    cursor[source] = slot + 1;
    slot = cursor[target];
    neighbors[slot] = source;
    neighborEdgeIds[slot] = edgeId;
    neighborOutgoing[slot] = 0;
    cursor[target] = slot + 1;
  }
  const discardReasons = [];
  const orphanCount = validated.stats?.orphanCount || 0;
  const incompleteCount = validated.stats?.incompleteCount || 0;
  const selfLoopCount = validated.stats?.selfLoopCount || 0;
  const foundEdges = validated.totalEdges;
  const foundNodes = validated.totalNodes;
  const discardedNodes = Math.max(0, foundNodes - nodeCount);
  if (orphanCount) {
    discardReasons.push({
      reason: "Relaciones huérfanas (origen/destino inexistente)",
      count: orphanCount
    });
  }
  if (incompleteCount) {
    discardReasons.push({
      reason: "Relaciones incompletas o nulas",
      count: incompleteCount
    });
  }
  if (selfLoopCount) {
    discardReasons.push({
      reason: "Bucles omitidos",
      count: selfLoopCount
    });
  }
  if (discardedNodes > 0) {
    discardReasons.push({
      reason: "Nodos inválidos o duplicados rechazados en validación",
      count: discardedNodes
    });
  }
  return {
    nodeCount,
    edgeCount: finalEdgeCount,
    originalIds,
    idToNumeric,
    labels,
    files,
    groups,
    locations,
    searchText,
    searchLabels,
    searchIds,
    searchFiles,
    searchGroups,
    metadatas,
    kindCodes,
    degrees,
    incoming,
    outgoing,
    edgeSource: compactSource,
    edgeTarget: compactTarget,
    edgeRelations: compactRelations,
    edgeConfidences: compactConfidences,
    offsets,
    neighbors,
    neighborEdgeIds,
    neighborOutgoing,
    foundNodes,
    foundEdges,
    validNodes: nodeCount,
    validEdges: finalEdgeCount,
    discardReasons,
    disposition: validated.disposition,
    warnings: validated.warnings || []
  };
}
function emptyStats() {
  return {
    foundNodes: 0,
    foundEdges: 0,
    validNodes: 0,
    validEdges: 0,
    indexedNodes: 0,
    indexedEdges: 0,
    visibleNodes: 0,
    visibleEdges: 0,
    renderedNodes: 0,
    renderedEdges: 0,
    groupedNodes: 0,
    discardedNodes: 0,
    discardedEdges: 0,
    discardReasons: []
  };
}
function buildStats(indexed, view = null) {
  if (!indexed) return emptyStats();
  const visibleNodes = view?.nodes?.length || 0;
  const visibleEdges = view?.edges?.length || 0;
  const coveredLeaves = view?.hierarchyActive ? view.coveredLeafCount || 0 : view?.visibleNumericIds?.length || visibleNodes;
  const groupedNodes = Math.max(0, indexed.nodeCount - coveredLeaves);
  const discardReasons = [...indexed.discardReasons || []];
  if (view?.hierarchyActive && groupedNodes > 0) {
    discardReasons.push({
      reason: "Nodos representados dentro de grupos jerárquicos (no renderizados individualmente)",
      count: groupedNodes
    });
  } else if (groupedNodes > 0) {
    discardReasons.push({
      reason: "Fuera del límite de calidad de la vista (priorizados por grado)",
      count: groupedNodes
    });
  }
  if (view?.edgesTruncated) {
    discardReasons.push({
      reason: "Relaciones omitidas por límite de calidad de la vista",
      count: view.edgesTruncated
    });
  }
  return {
    foundNodes: indexed.foundNodes,
    foundEdges: indexed.foundEdges,
    validNodes: indexed.validNodes,
    validEdges: indexed.validEdges,
    indexedNodes: indexed.nodeCount,
    indexedEdges: indexed.edgeCount,
    visibleNodes,
    visibleEdges,
    renderedNodes: visibleNodes,
    renderedEdges: visibleEdges,
    groupedNodes,
    discardedNodes: Math.max(0, indexed.foundNodes - indexed.validNodes),
    discardedEdges: Math.max(0, indexed.foundEdges - indexed.validEdges),
    discardReasons,
    tier: view?.tier || null,
    hierarchyActive: Boolean(view?.hierarchyActive)
  };
}
function selectVisibleView(indexed, limits = {}, options = {}) {
  const { signal, focusNumericId = -1 } = options;
  assertNotCancelled(signal);
  const maxNodes = Math.max(50, Number(limits.maxNodes) || 900);
  const maxEdges = Math.max(100, Number(limits.maxEdges) || 2400);
  const maxAnimatedEdges = Math.max(0, Number(limits.maxAnimatedEdges) || 42);
  const ranked = Array.from({ length: indexed.nodeCount }, (_, numericId) => numericId).sort((a, b) => {
    const degreeDiff = indexed.degrees[b] - indexed.degrees[a];
    if (degreeDiff !== 0) return degreeDiff;
    return indexed.originalIds[a].localeCompare(indexed.originalIds[b]);
  });
  const selected = [];
  const selectedSet = /* @__PURE__ */ new Set();
  if (focusNumericId >= 0 && focusNumericId < indexed.nodeCount) {
    selected.push(focusNumericId);
    selectedSet.add(focusNumericId);
  }
  for (const numericId of ranked) {
    if (selected.length >= maxNodes) break;
    if (selectedSet.has(numericId)) continue;
    selected.push(numericId);
    selectedSet.add(numericId);
  }
  const prepared = selected.map((numericId) => ({
    numericId,
    id: indexed.originalIds[numericId],
    degree: indexed.degrees[numericId],
    group: indexed.groups[numericId]
  }));
  const groupCounts = /* @__PURE__ */ new Map();
  for (const item of prepared) {
    groupCounts.set(item.group, (groupCounts.get(item.group) || 0) + 1);
  }
  const groupOrder = [...groupCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([group]) => group);
  assertNotCancelled(signal);
  const layout = createSphericalLayout(prepared, groupOrder);
  const viewIndex = new Map(selected.map((numericId, index) => [numericId, index]));
  const nodes = selected.map((numericId, index) => {
    const kind = codeToKind(indexed.kindCodes[numericId]);
    const position = layout.get(numericId) || { lat: 0, lon: 0 };
    return {
      index,
      numericId,
      id: indexed.originalIds[numericId],
      label: indexed.labels[numericId],
      kind,
      color: kindColor(kind),
      group: indexed.groups[numericId],
      file: indexed.files[numericId],
      location: indexed.locations[numericId],
      degree: indexed.degrees[numericId],
      incoming: indexed.incoming[numericId],
      outgoing: indexed.outgoing[numericId],
      lat: position.lat,
      lon: position.lon,
      metadata: indexed.metadatas[numericId] || {},
      inView: true
    };
  });
  const edges = [];
  let edgesTruncated = 0;
  for (let edgeId = 0; edgeId < indexed.edgeCount; edgeId += 1) {
    assertNotCancelled(signal);
    const sourceNumeric = indexed.edgeSource[edgeId];
    const targetNumeric = indexed.edgeTarget[edgeId];
    if (!selectedSet.has(sourceNumeric) || !selectedSet.has(targetNumeric)) continue;
    if (edges.length >= maxEdges) {
      edgesTruncated += 1;
      continue;
    }
    edges.push({
      source: viewIndex.get(sourceNumeric),
      target: viewIndex.get(targetNumeric),
      relation: indexed.edgeRelations[edgeId],
      confidence: indexed.edgeConfidences[edgeId]
    });
  }
  for (const node of nodes) {
    node.incoming = 0;
    node.outgoing = 0;
  }
  for (const edge of edges) {
    nodes[edge.source].outgoing += 1;
    nodes[edge.target].incoming += 1;
  }
  return {
    nodes,
    edges,
    maxAnimatedEdges,
    edgesTruncated,
    focusNumericId,
    visibleNumericIds: selected
  };
}
function searchIndexed(indexed, query, options = {}) {
  return runSearchIndexed(indexed, query, options);
}
function getNodeDetail(indexed, numericId, options = {}) {
  if (!indexed || numericId < 0 || numericId >= indexed.nodeCount) return null;
  const connectionLimit = Math.max(1, Number(options.connectionLimit) || 24);
  const visibleSet = options.visibleSet instanceof Set ? options.visibleSet : null;
  const kind = codeToKind(indexed.kindCodes[numericId]);
  const node = {
    index: -1,
    numericId,
    id: indexed.originalIds[numericId],
    label: indexed.labels[numericId],
    kind,
    color: kindColor(kind),
    group: indexed.groups[numericId],
    file: indexed.files[numericId],
    location: indexed.locations[numericId],
    degree: indexed.degrees[numericId],
    incoming: indexed.incoming[numericId],
    outgoing: indexed.outgoing[numericId],
    metadata: indexed.metadatas[numericId] || {},
    inView: visibleSet ? visibleSet.has(numericId) : false,
    lat: 0,
    lon: 0
  };
  const connections = [];
  const start = indexed.offsets[numericId];
  const end = indexed.offsets[numericId + 1];
  for (let slot = start; slot < end; slot += 1) {
    if (connections.length >= connectionLimit) break;
    const neighborId = indexed.neighbors[slot];
    const edgeId = indexed.neighborEdgeIds[slot];
    const outgoingFlag = indexed.neighborOutgoing[slot] === 1;
    const neighborKind = codeToKind(indexed.kindCodes[neighborId]);
    connections.push({
      direction: outgoingFlag ? "saliente" : "entrante",
      relation: indexed.edgeRelations[edgeId],
      confidence: indexed.edgeConfidences[edgeId],
      node: {
        numericId: neighborId,
        id: indexed.originalIds[neighborId],
        label: indexed.labels[neighborId],
        kind: neighborKind,
        color: kindColor(neighborKind),
        group: indexed.groups[neighborId],
        file: indexed.files[neighborId],
        degree: indexed.degrees[neighborId],
        inView: visibleSet ? visibleSet.has(neighborId) : false
      }
    });
  }
  return { node, connections };
}
function resolveNumericId(indexed, ref) {
  if (!indexed || ref == null) return -1;
  if (typeof ref === "number" && Number.isInteger(ref)) return ref;
  if (typeof ref === "object") {
    if (Number.isInteger(ref.numericId)) return ref.numericId;
    if (ref.id != null && indexed.idToNumeric.has(String(ref.id))) {
      return indexed.idToNumeric.get(String(ref.id));
    }
  }
  if (typeof ref === "string" && indexed.idToNumeric.has(ref)) {
    return indexed.idToNumeric.get(ref);
  }
  return -1;
}
function releaseIndexedGraph(indexed) {
  if (!indexed) return;
  indexed.originalIds.length = 0;
  indexed.labels.length = 0;
  indexed.files.length = 0;
  indexed.groups.length = 0;
  indexed.locations.length = 0;
  indexed.searchText.length = 0;
  if (indexed.searchLabels) indexed.searchLabels.length = 0;
  if (indexed.searchIds) indexed.searchIds.length = 0;
  if (indexed.searchFiles) indexed.searchFiles.length = 0;
  if (indexed.searchGroups) indexed.searchGroups.length = 0;
  indexed.metadatas.length = 0;
  indexed.edgeRelations.length = 0;
  indexed.edgeConfidences.length = 0;
  indexed.idToNumeric.clear();
}
export {
  buildIndexedGraph,
  buildStats,
  createSphericalLayout,
  getNodeDetail,
  releaseIndexedGraph,
  resolveNumericId,
  searchIndexed,
  searchIndexedProgressive,
  selectVisibleView
};
