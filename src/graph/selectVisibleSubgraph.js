import { applySphericalLayout } from './layoutSpherical.js';

const CONFIDENCE_RANK = {
  EXTRACTED: 0,
  INFERRED: 1,
  AMBIGUOUS: 2,
};

function confidenceRank(value) {
  return CONFIDENCE_RANK[value] ?? 3;
}

/**
 * Select a quality-limited visible subgraph without destroying the full model.
 * Balanced across communities, then filled by global degree.
 */
export function selectVisibleSubgraph(graph, indexes, limits = {}, options = {}) {
  const maxNodes = Math.max(50, Number(limits.maxNodes) || 900);
  const maxEdges = Math.max(100, Number(limits.maxEdges) || 2400);
  const maxAnimatedEdges = Math.max(0, Number(limits.maxAnimatedEdges) || 42);
  const focusNodeIds = new Set((options.focusNodeIds || []).map(String));

  const communities = [...indexes.nodesByCommunity.entries()];
  const selectedIds = new Set();

  // 1) Ensure minimum representation of every community.
  const communityQuota = Math.max(1, Math.floor(maxNodes / Math.max(1, communities.length)));
  const perCommunityCap = Math.max(
    communityQuota,
    Math.floor(maxNodes * 0.35),
  );

  const communityPicks = new Map();

  for (const [community, nodeIndexes] of communities) {
    const ranked = nodeIndexes
      .map((index) => graph.nodes[index])
      .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));

    const pickCount = Math.min(ranked.length, communityQuota, perCommunityCap);
    const picked = [];
    for (let i = 0; i < pickCount; i += 1) {
      picked.push(ranked[i]);
      selectedIds.add(ranked[i].id);
    }
    communityPicks.set(community, { ranked, picked });
  }

  // Force-include focus nodes (e.g. search hit outside visible set).
  for (const focusId of focusNodeIds) {
    const focusNode = indexes.nodeById.get(focusId);
    if (!focusNode) continue;
    selectedIds.add(focusNode.id);
    const connected = indexes.connectedEdgeIndexesByNode.get(focusNode.index) || [];
    for (const edgeIndex of connected) {
      const edge = graph.edges[edgeIndex];
      if (!edge || edge.isSelfLoop) continue;
      const neighborId = edge.sourceId === focusId ? edge.targetId : edge.sourceId;
      selectedIds.add(neighborId);
    }
  }

  // 2) Fill remaining slots by global relevance without letting one community dominate.
  if (selectedIds.size < maxNodes) {
    const globalRanked = [...graph.nodes].sort(
      (a, b) => b.degree - a.degree || a.id.localeCompare(b.id),
    );

    const communitySelectedCounts = new Map();
    for (const id of selectedIds) {
      const node = indexes.nodeById.get(id);
      if (!node) continue;
      const key = node.communityName || node.group || 'Sin grupo';
      communitySelectedCounts.set(key, (communitySelectedCounts.get(key) || 0) + 1);
    }

    for (const node of globalRanked) {
      if (selectedIds.size >= maxNodes) break;
      if (selectedIds.has(node.id)) continue;
      const key = node.communityName || node.group || 'Sin grupo';
      const current = communitySelectedCounts.get(key) || 0;
      if (current >= perCommunityCap && selectedIds.size > maxNodes * 0.5) continue;
      selectedIds.add(node.id);
      communitySelectedCounts.set(key, current + 1);
    }

    // If still under quota (cap blocked everything), fill without community cap.
    for (const node of globalRanked) {
      if (selectedIds.size >= maxNodes) break;
      if (selectedIds.has(node.id)) continue;
      selectedIds.add(node.id);
    }
  }

  // Trim if focus neighborhood pushed over maxNodes (keep focus + highest degree).
  if (selectedIds.size > maxNodes) {
    const rankedSelected = [...selectedIds]
      .map((id) => indexes.nodeById.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        const aFocus = focusNodeIds.has(a.id) ? 1 : 0;
        const bFocus = focusNodeIds.has(b.id) ? 1 : 0;
        if (aFocus !== bFocus) return bFocus - aFocus;
        return b.degree - a.degree || a.id.localeCompare(b.id);
      })
      .slice(0, maxNodes);
    selectedIds.clear();
    for (const node of rankedSelected) selectedIds.add(node.id);
  }

  const visibleNodesRaw = [...selectedIds]
    .map((id) => indexes.nodeById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  const visibleNodes = applySphericalLayout(
    visibleNodesRaw.map((node) => ({
      ...node,
      fullIndex: node.index,
    })),
  );

  // Re-index for the visible mesh; keep fullIndex for full-graph lookups.
  visibleNodes.forEach((node, index) => {
    node.visibleIndex = index;
    node.index = index;
  });

  const visibleIdToIndex = new Map(visibleNodes.map((node) => [node.id, node.index]));

  // Edges: only between visible nodes; exclude self-loops from globe.
  const candidateEdges = graph.edges.filter((edge) => {
    if (edge.isSelfLoop) return false;
    return selectedIds.has(edge.sourceId) && selectedIds.has(edge.targetId);
  });

  candidateEdges.sort((a, b) => {
    const conf = confidenceRank(a.confidence) - confidenceRank(b.confidence);
    if (conf !== 0) return conf;
    const score = (b.confidenceScore || 0) - (a.confidenceScore || 0);
    if (score !== 0) return score;

    const aCross = (indexes.nodeById.get(a.sourceId)?.communityName || '')
      !== (indexes.nodeById.get(a.targetId)?.communityName || '');
    const bCross = (indexes.nodeById.get(b.sourceId)?.communityName || '')
      !== (indexes.nodeById.get(b.targetId)?.communityName || '');
    if (aCross !== bCross) return aCross ? -1 : 1;

    const aDeg = (indexes.nodeById.get(a.sourceId)?.degree || 0)
      + (indexes.nodeById.get(a.targetId)?.degree || 0);
    const bDeg = (indexes.nodeById.get(b.sourceId)?.degree || 0)
      + (indexes.nodeById.get(b.targetId)?.degree || 0);
    if (bDeg !== aDeg) return bDeg - aDeg;

    return a.sourceId.localeCompare(b.sourceId)
      || a.targetId.localeCompare(b.targetId)
      || a.relation.localeCompare(b.relation);
  });

  // If multigraph is false, optionally keep parallels; if true, never collapse.
  // Spec: do not collapse parallel relations when multigraph is true.
  // When false, still keep them for fidelity unless identical triple — keep all for view priority.

  const visibleEdges = [];
  for (const edge of candidateEdges) {
    if (visibleEdges.length >= maxEdges) break;
    const source = visibleIdToIndex.get(edge.sourceId);
    const target = visibleIdToIndex.get(edge.targetId);
    if (source === undefined || target === undefined) continue;
    visibleEdges.push({
      ...edge,
      index: visibleEdges.length,
      source,
      target,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
    });
  }

  // Recompute visible in/out degrees for panel display of visible graph.
  for (const node of visibleNodes) {
    node.incoming = 0;
    node.outgoing = 0;
    node.degree = 0;
  }
  for (const edge of visibleEdges) {
    visibleNodes[edge.source].outgoing += 1;
    visibleNodes[edge.target].incoming += 1;
    visibleNodes[edge.source].degree += 1;
    visibleNodes[edge.target].degree += 1;
    if (!graph.directed) {
      visibleNodes[edge.source].incoming += 1;
      visibleNodes[edge.target].outgoing += 1;
    }
  }

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    visibleNodes: visibleNodes.length,
    visibleEdges: visibleEdges.length,
    hiddenNodes: Math.max(0, graph.nodes.length - visibleNodes.length),
    hiddenEdges: Math.max(0, graph.edges.length - visibleEdges.length),
    maxAnimatedEdges,
    focusNodeIds: [...focusNodeIds],
  };
}

/**
 * Ensure a searched node (and its neighborhood) appears in the visible subgraph.
 */
export function ensureNodeVisible(fullGraph, indexes, currentVisible, nodeId, limits) {
  const id = String(nodeId);
  const alreadyVisible = currentVisible?.nodes?.some((node) => node.id === id);
  if (alreadyVisible) {
    return {
      ...currentVisible,
      focusNodeIds: [id],
    };
  }

  return selectVisibleSubgraph(fullGraph, indexes, limits, {
    focusNodeIds: [id],
  });
}
