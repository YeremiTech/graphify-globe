import { buildGraphIndexes, serializeIndexes } from './buildGraphIndexes.js';
import { buildGraphStatistics } from './buildGraphStatistics.js';
import { normalizeGraph } from './normalizeGraph.js';
import { selectVisibleSubgraph } from './selectVisibleSubgraph.js';

/**
 * End-to-end processing used by the worker (and tests).
 */
export function processGraphDocument(raw, options = {}) {
  const {
    sourceName = 'graph.json',
    limits = {},
    focusNodeIds = [],
    onProgress = () => {},
  } = options;

  onProgress(0.12, 'Detectando formato Graphify…');
  const fullGraph = normalizeGraph(raw, sourceName);

  onProgress(0.4, 'Construyendo índices…');
  const indexes = buildGraphIndexes(fullGraph);

  onProgress(0.55, 'Calculando estadísticas…');
  const statistics = buildGraphStatistics(fullGraph, indexes);

  onProgress(0.7, 'Seleccionando subgrafo visible…');
  const visible = selectVisibleSubgraph(fullGraph, indexes, limits, { focusNodeIds });

  onProgress(0.92, 'Preparando visualización…');

  return {
    format: fullGraph.format,
    sourceName: fullGraph.sourceName,
    directed: fullGraph.directed,
    multigraph: fullGraph.multigraph,
    graphMetadata: fullGraph.graphMetadata,
    hyperedges: fullGraph.hyperedges,
    diagnostics: fullGraph.diagnostics,
    statistics,
    // Full model for search / panel
    allNodes: fullGraph.nodes,
    allEdges: fullGraph.edges,
    indexes: serializeIndexes(indexes),
    // Visible model for Three.js (keeps legacy field names)
    nodes: visible.nodes,
    edges: visible.edges,
    totalNodes: visible.totalNodes,
    totalEdges: visible.totalEdges,
    visibleNodes: visible.visibleNodes,
    visibleEdges: visible.visibleEdges,
    hiddenNodes: visible.hiddenNodes,
    hiddenEdges: visible.hiddenEdges,
    maxAnimatedEdges: visible.maxAnimatedEdges,
  };
}

/**
 * Parse JSON text (UTF-8 BOM tolerant) then process.
 */
export function processGraphText(text, options = {}) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  let raw;
  try {
    raw = JSON.parse(cleaned);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'JSON inválido';
    throw new Error(`JSON inválido: ${detail}`);
  }
  return processGraphDocument(raw, options);
}
