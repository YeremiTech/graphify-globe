import { DIAGNOSTIC_SAMPLE_LIMIT } from './constants.js';
import { sampleList } from './utils.js';

/**
 * Validate adapted graph. Never silently swallows issues.
 * Rejects only when there are no valid nodes.
 */
export function validateGraph(adapted) {
  const diagnostics = {
    invalidNodes: [],
    duplicateNodeIds: [],
    danglingEdges: [],
    selfLoops: [],
    unknownKinds: {},
    unnamedCommunities: [],
    warnings: [],
  };

  if (!adapted || !Array.isArray(adapted.nodes)) {
    throw new Error('El JSON no contiene una colección de nodos válida.');
  }

  const seenIds = new Map();
  const validNodes = [];

  for (const node of adapted.nodes) {
    if (!node || node.id === undefined || node.id === null || node.id === '') {
      diagnostics.invalidNodes.push({
        originalIndex: node?.originalIndex,
        reason: 'Nodo sin identificador usable',
      });
      continue;
    }

    const id = String(node.id);
    if (seenIds.has(id)) {
      diagnostics.duplicateNodeIds.push({
        id,
        originalIndex: node.originalIndex,
        firstIndex: seenIds.get(id),
      });
      diagnostics.warnings.push(`Identificador duplicado ignorado: ${id}`);
      continue;
    }

    seenIds.set(id, node.originalIndex);
    validNodes.push({ ...node, id });
  }

  if (validNodes.length === 0) {
    throw new Error(
      'No se encontraron nodos válidos. Revisa que el archivo Graphify contenga un array "nodes".',
    );
  }

  if (diagnostics.invalidNodes.length) {
    diagnostics.warnings.push(
      `${diagnostics.invalidNodes.length} nodo(s) inválido(s) fueron omitidos`,
    );
  }

  if (diagnostics.duplicateNodeIds.length) {
    diagnostics.warnings.push(
      `${diagnostics.duplicateNodeIds.length} identificador(es) duplicado(s)`,
    );
  }

  const nodeIds = new Set(validNodes.map((node) => node.id));
  const validLinks = [];
  const dangling = [];
  const selfLoops = [];

  for (const link of adapted.links || []) {
    if (!link.source || !link.target) {
      dangling.push({
        originalIndex: link.originalIndex,
        source: link.source || null,
        target: link.target || null,
        reason: 'Extremo ausente',
      });
      continue;
    }

    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) {
      dangling.push({
        originalIndex: link.originalIndex,
        source: link.source,
        target: link.target,
        reason: 'Nodo inexistente',
      });
      continue;
    }

    if (link.source === link.target) {
      selfLoops.push({
        originalIndex: link.originalIndex,
        source: link.source,
        relation: link.relation || 'related',
      });
      // Keep self-loops in the full model; visibility layer may hide them.
      validLinks.push(link);
      continue;
    }

    validLinks.push(link);
  }

  diagnostics.danglingEdges = sampleList(dangling, DIAGNOSTIC_SAMPLE_LIMIT);
  diagnostics.selfLoops = sampleList(selfLoops, DIAGNOSTIC_SAMPLE_LIMIT);
  diagnostics.danglingEdgeCount = dangling.length;
  diagnostics.selfLoopCount = selfLoops.length;
  diagnostics.duplicateNodeIdCount = diagnostics.duplicateNodeIds.length;
  diagnostics.invalidNodeCount = diagnostics.invalidNodes.length;

  if (dangling.length) {
    diagnostics.warnings.push(
      `${dangling.length} relación(es) no pudieron resolverse`,
    );
  }
  if (selfLoops.length) {
    diagnostics.warnings.push(`${selfLoops.length} self-loop(s) detectado(s)`);
  }

  diagnostics.invalidNodes = sampleList(diagnostics.invalidNodes, DIAGNOSTIC_SAMPLE_LIMIT);
  diagnostics.duplicateNodeIds = sampleList(diagnostics.duplicateNodeIds, DIAGNOSTIC_SAMPLE_LIMIT);

  return {
    ...adapted,
    nodes: validNodes,
    links: validLinks,
    diagnostics,
  };
}
