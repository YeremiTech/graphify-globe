/**
 * Build O(1) lookup indexes once during processing.
 * NodeInfoPanel and search should use these instead of scanning all edges.
 */
export function buildGraphIndexes(graph) {
  const nodeById = new Map();
  const nodeIndexById = new Map();
  const incomingEdgeIndexesByNode = new Map();
  const outgoingEdgeIndexesByNode = new Map();
  const connectedEdgeIndexesByNode = new Map();
  const nodesByCommunity = new Map();
  const nodesByFileType = new Map();
  const nodesByKind = new Map();
  const edgesByRelation = new Map();

  const ensureList = (map, key) => {
    if (!map.has(key)) map.set(key, []);
    return map.get(key);
  };

  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
    nodeIndexById.set(node.id, node.index);
    incomingEdgeIndexesByNode.set(node.index, []);
    outgoingEdgeIndexesByNode.set(node.index, []);
    connectedEdgeIndexesByNode.set(node.index, []);

    const communityKey = node.communityName || node.group || 'Sin grupo';
    ensureList(nodesByCommunity, communityKey).push(node.index);

    const fileTypeKey = node.fileType || 'sin-file-type';
    ensureList(nodesByFileType, fileTypeKey).push(node.index);

    ensureList(nodesByKind, node.kind || 'unknown').push(node.index);
  }

  for (const edge of graph.edges) {
    ensureList(edgesByRelation, edge.relation || 'related').push(edge.index);

    if (edge.isSelfLoop) {
      ensureList(connectedEdgeIndexesByNode, edge.source).push(edge.index);
      ensureList(outgoingEdgeIndexesByNode, edge.source).push(edge.index);
      ensureList(incomingEdgeIndexesByNode, edge.source).push(edge.index);
      continue;
    }

    ensureList(outgoingEdgeIndexesByNode, edge.source).push(edge.index);
    ensureList(incomingEdgeIndexesByNode, edge.target).push(edge.index);
    ensureList(connectedEdgeIndexesByNode, edge.source).push(edge.index);
    ensureList(connectedEdgeIndexesByNode, edge.target).push(edge.index);
  }

  return {
    nodeById,
    nodeIndexById,
    incomingEdgeIndexesByNode,
    outgoingEdgeIndexesByNode,
    connectedEdgeIndexesByNode,
    nodesByCommunity,
    nodesByFileType,
    nodesByKind,
    edgesByRelation,
  };
}

/**
 * Serialize indexes for structured clone (postMessage) as plain objects of arrays.
 */
export function serializeIndexes(indexes) {
  const mapToObject = (map) => {
    const output = {};
    for (const [key, value] of map.entries()) {
      output[String(key)] = value;
    }
    return output;
  };

  return {
    nodeIndexById: mapToObject(indexes.nodeIndexById),
    incomingEdgeIndexesByNode: mapToObject(indexes.incomingEdgeIndexesByNode),
    outgoingEdgeIndexesByNode: mapToObject(indexes.outgoingEdgeIndexesByNode),
    connectedEdgeIndexesByNode: mapToObject(indexes.connectedEdgeIndexesByNode),
    nodesByCommunity: mapToObject(indexes.nodesByCommunity),
    nodesByFileType: mapToObject(indexes.nodesByFileType),
    nodesByKind: mapToObject(indexes.nodesByKind),
    edgesByRelation: mapToObject(indexes.edgesByRelation),
  };
}

/**
 * Rebuild Map-based indexes on the main thread from serialized payload or full graph.
 */
export function hydrateIndexes(serialized, graph) {
  if (!serialized) return buildGraphIndexes(graph);

  const toMap = (object, parseKeyAsNumber = false) => {
    const map = new Map();
    for (const [key, value] of Object.entries(object || {})) {
      map.set(parseKeyAsNumber ? Number(key) : key, value);
    }
    return map;
  };

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return {
    nodeById,
    nodeIndexById: toMap(serialized.nodeIndexById, false),
    incomingEdgeIndexesByNode: toMap(serialized.incomingEdgeIndexesByNode, true),
    outgoingEdgeIndexesByNode: toMap(serialized.outgoingEdgeIndexesByNode, true),
    connectedEdgeIndexesByNode: toMap(serialized.connectedEdgeIndexesByNode, true),
    nodesByCommunity: toMap(serialized.nodesByCommunity, false),
    nodesByFileType: toMap(serialized.nodesByFileType, false),
    nodesByKind: toMap(serialized.nodesByKind, false),
    edgesByRelation: toMap(serialized.edgesByRelation, false),
  };
}
