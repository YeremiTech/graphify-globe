/**
 * Dynamic statistics derived from the actual graph content.
 * Never hardcodes frontend/backend categories.
 */
export function buildGraphStatistics(graph, indexes) {
  const kinds = {};
  const fileTypes = {};
  const relations = {};
  const communities = {};
  const confidence = { EXTRACTED: 0, INFERRED: 0, AMBIGUOUS: 0, OTHER: 0 };

  let isolatedNodes = 0;
  let nodesWithoutFile = 0;
  let nodesWithoutLocation = 0;

  for (const node of graph.nodes) {
    kinds[node.kind] = (kinds[node.kind] || 0) + 1;
    const fileType = node.fileType || 'sin-file-type';
    fileTypes[fileType] = (fileTypes[fileType] || 0) + 1;
    const community = node.communityName || node.group || 'Sin grupo';
    communities[community] = (communities[community] || 0) + 1;
    if (!node.degree) isolatedNodes += 1;
    if (!node.file) nodesWithoutFile += 1;
    if (!node.location) nodesWithoutLocation += 1;
  }

  for (const edge of graph.edges) {
    relations[edge.relation] = (relations[edge.relation] || 0) + 1;
    const key = edge.confidence;
    if (key === 'EXTRACTED' || key === 'INFERRED' || key === 'AMBIGUOUS') {
      confidence[key] += 1;
    } else {
      confidence.OTHER += 1;
    }
  }

  const sortEntries = (object) =>
    Object.entries(object)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    communityCount: Object.keys(communities).length,
    kindCount: Object.keys(kinds).length,
    fileTypeCount: Object.keys(fileTypes).length,
    relationCount: Object.keys(relations).length,
    hyperedgeCount: Array.isArray(graph.hyperedges) ? graph.hyperedges.length : 0,
    isolatedNodes,
    nodesWithoutFile,
    nodesWithoutLocation,
    selfLoops: graph.diagnostics?.selfLoopCount || 0,
    danglingEdges: graph.diagnostics?.danglingEdgeCount || 0,
    duplicateNodeIds: graph.diagnostics?.duplicateNodeIdCount || 0,
    unnamedCommunities: graph.diagnostics?.unnamedCommunities?.length || 0,
    confidence,
    kinds: sortEntries(kinds),
    fileTypes: sortEntries(fileTypes),
    relations: sortEntries(relations),
    communities: sortEntries(communities),
    filters: {
      kinds: sortEntries(kinds).map((item) => item.name),
      fileTypes: sortEntries(fileTypes).map((item) => item.name),
      relations: sortEntries(relations).map((item) => item.name),
      communities: sortEntries(communities).map((item) => item.name),
      confidences: Object.entries(confidence)
        .filter(([, count]) => count > 0)
        .map(([name]) => name),
    },
    directed: Boolean(graph.directed),
    multigraph: Boolean(graph.multigraph),
    format: graph.format,
  };
}
