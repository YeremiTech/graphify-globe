const RENDER_PROFILES = Object.freeze({
  bajo: "bajo",
  medio: "medio",
  alto: "alto",
  automatico: "automatico"
});
const IMPORT_TO_RENDER_PROFILE = Object.freeze({
  ligero: RENDER_PROFILES.bajo,
  equilibrado: RENDER_PROFILES.medio,
  detallado: RENDER_PROFILES.alto,
  automatico: RENDER_PROFILES.automatico
});
const RENDER_PROFILE_LIMITS = Object.freeze({
  [RENDER_PROFILES.bajo]: {
    maxNodes: 450,
    maxEdges: 1e3,
    maxAnimatedEdges: 16,
    maxPixelRatio: 1,
    nodeBatch: 80,
    edgeBatch: 60,
    edgeSegmentsSimple: 4,
    edgeSegmentsFull: 7,
    sphereSegments: 6,
    maxLabels: 0,
    maxRaycastCandidates: 120,
    idleParticleSkip: true,
    antialias: false
  },
  [RENDER_PROFILES.medio]: {
    maxNodes: 900,
    maxEdges: 2400,
    maxAnimatedEdges: 36,
    maxPixelRatio: 1.5,
    nodeBatch: 120,
    edgeBatch: 90,
    edgeSegmentsSimple: 5,
    edgeSegmentsFull: 9,
    sphereSegments: 8,
    maxLabels: 8,
    maxRaycastCandidates: 280,
    idleParticleSkip: true,
    antialias: true
  },
  [RENDER_PROFILES.alto]: {
    maxNodes: 1800,
    maxEdges: 6e3,
    maxAnimatedEdges: 64,
    maxPixelRatio: 2,
    nodeBatch: 180,
    edgeBatch: 140,
    edgeSegmentsSimple: 7,
    edgeSegmentsFull: 11,
    sphereSegments: 9,
    maxLabels: 18,
    maxRaycastCandidates: 600,
    idleParticleSkip: false,
    antialias: true
  }
});
const LOD_CAPS = Object.freeze({
  0: { nodeFraction: 0.22, edgeFraction: 0.18, preferGroups: true, particles: 0.25, segments: "simple" },
  1: { nodeFraction: 0.45, edgeFraction: 0.4, preferGroups: true, particles: 0.5, segments: "simple" },
  2: { nodeFraction: 0.75, edgeFraction: 0.7, preferGroups: false, particles: 0.75, segments: "full" },
  3: { nodeFraction: 1, edgeFraction: 1, preferGroups: false, particles: 1, segments: "full" }
});
function resolveRenderProfile(importQuality) {
  return IMPORT_TO_RENDER_PROFILE[importQuality] || RENDER_PROFILES.medio;
}
function getProfileLimits(profile) {
  if (profile === RENDER_PROFILES.automatico) {
    return { ...RENDER_PROFILE_LIMITS[RENDER_PROFILES.medio], adaptive: true };
  }
  return { ...RENDER_PROFILE_LIMITS[profile] || RENDER_PROFILE_LIMITS[RENDER_PROFILES.medio], adaptive: false };
}
function chooseAutomaticProfile({
  nodeCount = 0,
  edgeCount = 0,
  viewportPixels = 1,
  devicePixelRatio = 1,
  observedFps = 60,
  deviceMemoryGb = null,
  saveData = false
}) {
  let score = 50;
  if (nodeCount > 1200 || edgeCount > 4e3) score -= 18;
  else if (nodeCount > 700 || edgeCount > 2e3) score -= 10;
  else if (nodeCount < 200 && edgeCount < 500) score += 8;
  if (viewportPixels > 25e5) score -= 10;
  else if (viewportPixels < 9e5) score += 6;
  if (devicePixelRatio >= 2.5) score -= 8;
  else if (devicePixelRatio <= 1) score += 4;
  if (observedFps > 0) {
    if (observedFps < 28) score -= 22;
    else if (observedFps < 40) score -= 12;
    else if (observedFps > 55) score += 6;
  }
  if (typeof deviceMemoryGb === "number") {
    if (deviceMemoryGb <= 2) score -= 16;
    else if (deviceMemoryGb <= 4) score -= 8;
    else if (deviceMemoryGb >= 8) score += 6;
  }
  if (saveData) score -= 12;
  if (score < 35) return RENDER_PROFILES.bajo;
  if (score < 58) return RENDER_PROFILES.medio;
  return RENDER_PROFILES.alto;
}
function computeLodLevel({
  cameraZ = 4.45,
  selectedIndex = -1,
  searchActive = false,
  hierarchyActive = false,
  expandedGroup = false,
  profile = RENDER_PROFILES.medio,
  observedFps = 60
}) {
  let level = 1;
  if (cameraZ >= 5.45) level = 0;
  else if (cameraZ >= 4.7) level = 1;
  else if (cameraZ >= 3.85) level = 2;
  else level = 3;
  if (selectedIndex >= 0 || expandedGroup) level = Math.max(level, 2);
  if (searchActive) level = Math.max(level, 2);
  if (hierarchyActive && cameraZ >= 5) level = Math.min(level, 1);
  const effective = profile === RENDER_PROFILES.automatico ? chooseAutomaticProfile({ observedFps }) : profile;
  if (effective === RENDER_PROFILES.bajo) level = Math.min(level, 1);
  if (effective === RENDER_PROFILES.medio) level = Math.min(level, 2);
  if (observedFps > 0 && observedFps < 26) level = Math.min(level, 0);
  else if (observedFps > 0 && observedFps < 36) level = Math.min(level, 1);
  return Math.max(0, Math.min(3, level));
}
function getLodPolicy(level) {
  return LOD_CAPS[level] || LOD_CAPS[1];
}
function scoreNodeForLod(node, { selectedIndex = -1, searchIds = null } = {}) {
  let score = Number(node.degree || node.importance || 0);
  if (node.isGroup) score += 40 + Math.log2((node.nodeCount || 1) + 1) * 12;
  if (Number.isInteger(selectedIndex) && node.index === selectedIndex) score += 1e4;
  if (searchIds instanceof Set) {
    const key = node.isGroup ? node.groupId : node.numericId;
    if (searchIds.has(key) || searchIds.has(node.id)) score += 5e3;
  }
  return score;
}
function selectRenderableSubset(view, {
  lodLevel = 1,
  profileLimits,
  selectedIndex = -1,
  searchIds = null
} = {}) {
  const nodes = view?.nodes || [];
  const edges = view?.edges || [];
  const policy = getLodPolicy(lodLevel);
  const maxNodes = Math.max(
    8,
    Math.floor((profileLimits?.maxNodes || nodes.length) * policy.nodeFraction)
  );
  const maxEdges = Math.max(
    4,
    Math.floor((profileLimits?.maxEdges || edges.length) * policy.edgeFraction)
  );
  const ranked = nodes.map((node, sourceIndex) => ({ node, sourceIndex, score: scoreNodeForLod(node, { selectedIndex, searchIds }) })).sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex);
  let picked = ranked;
  if (policy.preferGroups) {
    const groups = ranked.filter((item) => item.node.isGroup);
    const leaves = ranked.filter((item) => !item.node.isGroup);
    const groupBudget = Math.min(groups.length, Math.max(4, Math.floor(maxNodes * 0.7)));
    picked = [
      ...groups.slice(0, groupBudget),
      ...leaves.slice(0, Math.max(0, maxNodes - groupBudget))
    ].sort((a, b) => b.score - a.score);
  } else {
    picked = ranked.slice(0, Math.min(maxNodes, ranked.length));
  }
  if (selectedIndex >= 0 && !picked.some((item) => item.sourceIndex === selectedIndex)) {
    const selected = ranked.find((item) => item.sourceIndex === selectedIndex);
    if (selected) {
      picked = [selected, ...picked.filter((item) => item.sourceIndex !== selectedIndex)].slice(0, maxNodes);
    }
  }
  picked.sort((a, b) => a.sourceIndex - b.sourceIndex);
  const sourceToRender = new Map(picked.map((item, renderIndex) => [item.sourceIndex, renderIndex]));
  const renderNodes = picked.map((item, index) => ({
    ...item.node,
    index,
    sourceIndex: item.sourceIndex,
    lodScore: item.score
  }));
  const renderEdges = [];
  let omittedEdges = 0;
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const source = sourceToRender.get(edge.source);
    const target = sourceToRender.get(edge.target);
    if (source === void 0 || target === void 0) {
      omittedEdges += 1;
      continue;
    }
    renderEdges.push({
      ...edge,
      source,
      target,
      sourceOriginal: edge.source,
      targetOriginal: edge.target
    });
    if (renderEdges.length >= maxEdges) {
      omittedEdges += edges.length - edgeIndex - 1;
      break;
    }
  }
  const simplified = renderNodes.length < nodes.length || renderEdges.length < edges.length || lodLevel < 3;
  const reasons = [];
  if (renderNodes.length < nodes.length) {
    reasons.push(`Nodos en escena: ${renderNodes.length} de ${nodes.length} (LOD ${lodLevel})`);
  }
  if (renderEdges.length < edges.length) {
    reasons.push(`Relaciones dibujadas: ${renderEdges.length} de ${edges.length}`);
  }
  if (policy.preferGroups) {
    reasons.push("Priorizando grupos sobre nodos individuales");
  }
  return {
    nodes: renderNodes,
    edges: renderEdges,
    sourceToRender,
    lodLevel,
    simplified,
    reasons,
    omittedNodes: Math.max(0, nodes.length - renderNodes.length),
    omittedEdges: Math.max(0, omittedEdges),
    maxAnimatedEdges: Math.max(
      0,
      Math.floor((profileLimits?.maxAnimatedEdges || 24) * policy.particles)
    ),
    edgeSegments: policy.segments
  };
}
function describeSimplification({ stats, subset, profile, lodLevel }) {
  const parts = [];
  if (stats?.groupedNodes > 0) {
    parts.push(`${stats.groupedNodes.toLocaleString("es")} nodos agrupados/no individuales`);
  }
  if (subset?.omittedNodes > 0) {
    parts.push(`${subset.omittedNodes.toLocaleString("es")} nodos de la vista omitidos por LOD`);
  }
  if (subset?.omittedEdges > 0) {
    parts.push(`${subset.omittedEdges.toLocaleString("es")} relaciones simplificadas`);
  }
  parts.push(`calidad ${profile}, detalle ${lodLevel}`);
  return parts.join(" · ");
}
function frameBudgetMs(profile) {
  if (profile === RENDER_PROFILES.bajo) return 6;
  if (profile === RENDER_PROFILES.alto) return 10;
  return 8;
}
export {
  IMPORT_TO_RENDER_PROFILE,
  RENDER_PROFILES,
  RENDER_PROFILE_LIMITS,
  chooseAutomaticProfile,
  computeLodLevel,
  describeSimplification,
  frameBudgetMs,
  getLodPolicy,
  getProfileLimits,
  resolveRenderProfile,
  scoreNodeForLod,
  selectRenderableSubset
};
