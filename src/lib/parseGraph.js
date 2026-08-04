import { CancelledError } from "./graphErrors.js";
import { parseJsonText, validateGraphDocument } from "./graphValidation.js";
import { buildIndexedGraph, buildStats } from "./indexedGraph.js";
import {
  buildHierarchy,
  createHierarchyNav,
  selectSceneView
} from "./hierarchy.js";
function assertNotCancelled(signal) {
  if (signal?.cancelled) throw new CancelledError();
}
function ingestGraphDocument(text, fileName, limits, options = {}) {
  const { signal, onProgress } = options;
  const report = (value, label, phase) => {
    assertNotCancelled(signal);
    onProgress?.(value, label, phase);
  };
  report(0.05, "Validando JSON…", "validating");
  const raw = parseJsonText(text);
  report(0.12, "Validando estructura GRAPHIFY…", "validating");
  return ingestValidatedRaw(raw, fileName, limits, { signal, onProgress, progressBase: 0.12 });
}
function ingestValidatedRaw(raw, fileName, limits, options = {}) {
  const { signal, onProgress, progressBase = 0 } = options;
  const report = (value, label, phase) => {
    assertNotCancelled(signal);
    onProgress?.(progressBase + value * (1 - progressBase), label, phase);
  };
  report(0.02, "Validando estructura GRAPHIFY…", "validating");
  const validated = validateGraphDocument(raw);
  assertNotCancelled(signal);
  report(0.18, "Procesando nodos y relaciones…", "processing");
  const indexed = buildIndexedGraph(validated, { signal, onProgress });
  report(0.55, "Construyendo jerarquía…", "indexing");
  const hierarchy = buildHierarchy(indexed);
  const nav = createHierarchyNav(indexed, hierarchy);
  assertNotCancelled(signal);
  report(0.72, "Preparando vista visible…", "preparing");
  const view = selectSceneView(indexed, hierarchy, nav, limits, { signal });
  const stats = buildStats(indexed, view);
  report(0.92, "Preparando visualización…", "preparing");
  return {
    sourceName: fileName || "graph.json",
    indexed,
    hierarchy,
    nav,
    view,
    stats,
    disposition: indexed.disposition,
    warnings: indexed.warnings
  };
}
function parseGraph(text, fileName, limits, options = {}) {
  const result = ingestGraphDocument(text, fileName, limits, options);
  return {
    sourceName: result.sourceName,
    nodes: result.view.nodes,
    edges: result.view.edges,
    totalNodes: result.stats.foundNodes,
    totalEdges: result.stats.foundEdges,
    maxAnimatedEdges: result.view.maxAnimatedEdges,
    disposition: result.disposition,
    warnings: result.warnings,
    stats: result.stats,
    indexedNodeCount: result.stats.indexedNodes,
    visibleNodeCount: result.stats.visibleNodes,
    mode: result.view.mode,
    breadcrumb: result.view.breadcrumb
  };
}
export {
  ingestGraphDocument,
  ingestValidatedRaw,
  parseGraph
};
