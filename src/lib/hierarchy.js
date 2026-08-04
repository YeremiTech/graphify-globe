import { createSphericalLayout, selectVisibleView } from "./indexedGraph.js";
import { kindColor } from "./kindCatalog.js";
import { codeToKind } from "./kindCatalog.js";
const SIZE_TIERS = Object.freeze({
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
  MASSIVE: "massive"
});
const TIER_THRESHOLDS = Object.freeze({
  small: 400,
  medium: 4e3,
  large: 4e4
});
const ROOT_ID = "__root__";
function stableGroupId(type, pathKey) {
  return `${type}:${pathKey}`;
}
function basename(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || path || "archivo";
}
function dirnameParts(path) {
  const parts = String(path || "").replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(0, -1);
}
function detectProjectName(files) {
  const counts = /* @__PURE__ */ new Map();
  for (const file of files) {
    if (!file) continue;
    const parts = file.split("/").filter(Boolean);
    if (!parts.length) continue;
    const root = parts[0];
    counts.set(root, (counts.get(root) || 0) + 1);
  }
  let best = "proyecto";
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
function classifyGraphSize(nodeCount) {
  if (nodeCount < TIER_THRESHOLDS.small) return SIZE_TIERS.SMALL;
  if (nodeCount < TIER_THRESHOLDS.medium) return SIZE_TIERS.MEDIUM;
  if (nodeCount < TIER_THRESHOLDS.large) return SIZE_TIERS.LARGE;
  return SIZE_TIERS.MASSIVE;
}
function leafPathSegments(indexed, numericId, projectName) {
  const file = indexed.files[numericId] || "";
  const packageOrModule = indexed.groups[numericId] || "";
  const kind = codeToKind(indexed.kindCodes[numericId]);
  const label = indexed.labels[numericId];
  const segments = [];
  segments.push({
    type: "project",
    name: projectName,
    key: projectName
  });
  if (packageOrModule && packageOrModule !== "sin-grupo") {
    const isModule = /module|component/i.test(packageOrModule);
    segments.push({
      type: isModule ? "module" : "package",
      name: packageOrModule.split("/").pop() || packageOrModule,
      key: packageOrModule
    });
  }
  const folders = dirnameParts(file);
  const folderStart = folders[0] === projectName ? 1 : 0;
  let folderKey = projectName;
  for (let index = folderStart; index < folders.length; index += 1) {
    folderKey = folderKey ? `${folderKey}/${folders[index]}` : folders[index];
    segments.push({
      type: "folder",
      name: folders[index],
      key: folderKey
    });
  }
  if (file) {
    segments.push({
      type: "file",
      name: basename(file),
      key: file
    });
  }
  if (kind === "method" || kind === "function" || kind === "class" || kind === "interface") {
    segments.push({
      type: kind === "class" || kind === "interface" ? "class" : "function",
      name: label,
      key: `${file || packageOrModule || "symbol"}::${indexed.originalIds[numericId]}`
    });
  }
  if (segments.length === 1) {
    segments.push({
      type: kind === "default" ? "group" : kind,
      name: label,
      key: indexed.originalIds[numericId]
    });
  }
  return segments;
}
function ensureGroup(groups, segment, parentId, level) {
  const id = stableGroupId(segment.type, segment.key);
  let group = groups.get(id);
  if (!group) {
    group = {
      id,
      name: segment.name,
      type: segment.type,
      level,
      parentId,
      childGroupIds: [],
      childLeafIds: [],
      descendantLeafIds: [],
      nodeCount: 0,
      internalEdges: 0,
      externalEdges: 0,
      importance: 0,
      expanded: false
    };
    groups.set(id, group);
    if (parentId && parentId !== ROOT_ID) {
      const parent = groups.get(parentId);
      if (parent && !parent.childGroupIds.includes(id)) parent.childGroupIds.push(id);
    }
  }
  return group;
}
function buildHierarchy(indexed) {
  const projectName = detectProjectName(indexed.files);
  const groups = /* @__PURE__ */ new Map();
  const leafPathIds = new Array(indexed.nodeCount);
  const roots = [];
  for (let numericId = 0; numericId < indexed.nodeCount; numericId += 1) {
    const segments = leafPathSegments(indexed, numericId, projectName);
    const pathIds = [];
    let parentId = null;
    segments.forEach((segment, level) => {
      const group = ensureGroup(groups, segment, parentId, level);
      pathIds.push(group.id);
      parentId = group.id;
    });
    leafPathIds[numericId] = pathIds;
    const leafParentId = pathIds.length >= 2 ? pathIds[pathIds.length - 2] : pathIds[0];
    const leafParent = groups.get(leafParentId);
    if (leafParent && !leafParent.childLeafIds.includes(numericId)) {
      leafParent.childLeafIds.push(numericId);
    }
    for (const groupId of pathIds) {
      groups.get(groupId).descendantLeafIds.push(numericId);
    }
    const rootId = pathIds[0];
    if (!roots.includes(rootId)) roots.push(rootId);
  }
  for (const group of groups.values()) {
    group.nodeCount = group.descendantLeafIds.length;
    let importance = 0;
    for (const leafId of group.descendantLeafIds) {
      importance += indexed.degrees[leafId];
    }
    group.importance = importance;
  }
  for (let edgeId = 0; edgeId < indexed.edgeCount; edgeId += 1) {
    const source = indexed.edgeSource[edgeId];
    const target = indexed.edgeTarget[edgeId];
    const sourcePath = leafPathIds[source] || [];
    const targetPath = leafPathIds[target] || [];
    let shared = 0;
    while (shared < sourcePath.length && shared < targetPath.length && sourcePath[shared] === targetPath[shared]) {
      groups.get(sourcePath[shared]).internalEdges += 1;
      shared += 1;
    }
    for (let index = shared; index < sourcePath.length; index += 1) {
      groups.get(sourcePath[index]).externalEdges += 1;
    }
    for (let index = shared; index < targetPath.length; index += 1) {
      groups.get(targetPath[index]).externalEdges += 1;
    }
  }
  for (const group of groups.values()) {
    group.childGroupIds.sort((a, b) => {
      const ga = groups.get(a);
      const gb = groups.get(b);
      return gb.importance - ga.importance || a.localeCompare(b);
    });
    group.childLeafIds.sort((a, b) => {
      const degreeDiff = indexed.degrees[b] - indexed.degrees[a];
      if (degreeDiff !== 0) return degreeDiff;
      return indexed.originalIds[a].localeCompare(indexed.originalIds[b]);
    });
  }
  roots.sort((a, b) => {
    const ga = groups.get(a);
    const gb = groups.get(b);
    return gb.importance - ga.importance || a.localeCompare(b);
  });
  return {
    projectName,
    groups,
    roots,
    leafPathIds,
    rootId: ROOT_ID
  };
}
function createHierarchyNav(indexed, hierarchy) {
  const tier = classifyGraphSize(indexed.nodeCount);
  const mode = tier === SIZE_TIERS.SMALL ? "flat" : "hierarchy";
  return {
    tier,
    mode,
    contextGroupId: null,
    breadcrumb: [{ id: null, name: hierarchy.projectName || "Proyecto", type: "project" }]
  };
}
function maxVisibleForTier(tier, limits) {
  const qualityCap = Math.max(50, Number(limits?.maxNodes) || 900);
  if (tier === SIZE_TIERS.MASSIVE) return Math.min(qualityCap, 120);
  if (tier === SIZE_TIERS.LARGE) return Math.min(qualityCap, 240);
  if (tier === SIZE_TIERS.MEDIUM) return Math.min(qualityCap, 420);
  return qualityCap;
}
function childrenOfContext(hierarchy, contextGroupId) {
  if (!contextGroupId) {
    return {
      childGroupIds: [...hierarchy.roots],
      childLeafIds: []
    };
  }
  const group = hierarchy.groups.get(contextGroupId);
  if (!group) {
    return { childGroupIds: [...hierarchy.roots], childLeafIds: [] };
  }
  return {
    childGroupIds: [...group.childGroupIds],
    childLeafIds: [...group.childLeafIds]
  };
}
function mapLeafToVisibleEntity(hierarchy, leafId, contextGroupId, visibleGroupIds, visibleLeafIds) {
  if (visibleLeafIds.has(leafId)) return `leaf:${leafId}`;
  const path = hierarchy.leafPathIds[leafId] || [];
  const contextIndex = contextGroupId ? path.indexOf(contextGroupId) : -1;
  const candidateIndex = contextIndex + 1;
  if (candidateIndex >= 0 && candidateIndex < path.length) {
    const candidate = path[candidateIndex];
    if (visibleGroupIds.has(candidate)) return candidate;
  }
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (visibleGroupIds.has(path[index])) return path[index];
  }
  return null;
}
function buildBreadcrumb(hierarchy, contextGroupId) {
  const crumbs = [{ id: null, name: hierarchy.projectName || "Proyecto", type: "project" }];
  if (!contextGroupId) return crumbs;
  const group = hierarchy.groups.get(contextGroupId);
  if (!group) return crumbs;
  const chain = [];
  let current = group;
  while (current) {
    chain.push({ id: current.id, name: current.name, type: current.type });
    current = current.parentId ? hierarchy.groups.get(current.parentId) : null;
  }
  chain.reverse();
  return crumbs.concat(chain);
}
function selectSceneView(indexed, hierarchy, nav, limits = {}, options = {}) {
  if (!nav || nav.mode === "flat" || !hierarchy) {
    const view = selectVisibleView(indexed, limits, options);
    return {
      ...view,
      mode: "flat",
      tier: nav?.tier || SIZE_TIERS.SMALL,
      breadcrumb: [{ id: null, name: hierarchy?.projectName || "Proyecto", type: "project" }],
      contextGroupId: null,
      hierarchyActive: false
    };
  }
  const maxNodes = maxVisibleForTier(nav.tier, limits);
  const maxEdges = Math.max(50, Number(limits.maxEdges) || 2400);
  const maxAnimatedEdges = Math.max(0, Number(limits.maxAnimatedEdges) || 42);
  const { childGroupIds, childLeafIds } = childrenOfContext(hierarchy, nav.contextGroupId);
  const rankedGroups = childGroupIds.map((id) => hierarchy.groups.get(id)).filter(Boolean).sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id));
  const selectedGroups = [];
  const selectedLeaves = [];
  for (const group of rankedGroups) {
    if (selectedGroups.length + selectedLeaves.length >= maxNodes) break;
    selectedGroups.push(group);
  }
  for (const leafId of childLeafIds) {
    if (selectedGroups.length + selectedLeaves.length >= maxNodes) break;
    selectedLeaves.push(leafId);
  }
  const focusNumericId = Number.isInteger(options.focusNumericId) ? options.focusNumericId : -1;
  if (focusNumericId >= 0 && focusNumericId < indexed.nodeCount) {
    const leafSet = new Set(selectedLeaves);
    if (!leafSet.has(focusNumericId)) {
      while (selectedGroups.length + selectedLeaves.length >= maxNodes) {
        if (selectedLeaves.length) selectedLeaves.pop();
        else if (selectedGroups.length) selectedGroups.pop();
        else break;
      }
      selectedLeaves.push(focusNumericId);
      leafSet.add(focusNumericId);
    }
    const neighborBudget = Math.min(12, Math.max(0, maxNodes - selectedGroups.length - selectedLeaves.length));
    if (neighborBudget > 0) {
      const start = indexed.offsets[focusNumericId];
      const end = indexed.offsets[focusNumericId + 1];
      const rankedNeighbors = [];
      for (let slot = start; slot < end; slot += 1) {
        const neighborId = indexed.neighbors[slot];
        rankedNeighbors.push(neighborId);
      }
      rankedNeighbors.sort((a, b) => indexed.degrees[b] - indexed.degrees[a] || a - b);
      for (const neighborId of rankedNeighbors) {
        if (selectedGroups.length + selectedLeaves.length >= maxNodes) break;
        if (leafSet.has(neighborId)) continue;
        selectedLeaves.push(neighborId);
        leafSet.add(neighborId);
      }
    }
  }
  if (selectedGroups.length + selectedLeaves.length === 0 && hierarchy.roots.length) {
    for (const rootId of hierarchy.roots) {
      if (selectedGroups.length >= maxNodes) break;
      selectedGroups.push(hierarchy.groups.get(rootId));
    }
  }
  const visibleGroupIds = new Set(selectedGroups.map((group) => group.id));
  const visibleLeafIds = new Set(selectedLeaves);
  const entities = [];
  for (const group of selectedGroups) {
    entities.push({
      kind: "group",
      group,
      layoutKey: group.id,
      id: group.id,
      degree: Math.max(1, group.importance),
      band: group.type
    });
  }
  for (const leafId of selectedLeaves) {
    entities.push({
      kind: "leaf",
      leafId,
      layoutKey: `leaf:${leafId}`,
      id: indexed.originalIds[leafId],
      degree: indexed.degrees[leafId],
      band: indexed.groups[leafId] || "hojas"
    });
  }
  const prepared = entities.map((entity) => ({
    layoutKey: entity.layoutKey,
    id: entity.id,
    degree: entity.degree,
    group: entity.band,
    numericId: entity.layoutKey
  }));
  const bandOrder = [...new Set(prepared.map((item) => item.group))];
  const layout = createSphericalLayout(prepared, bandOrder);
  const nodes = entities.map((entity, index) => {
    const position = layout.get(entity.layoutKey) || { lat: 0, lon: 0 };
    if (entity.kind === "group") {
      const group = entity.group;
      return {
        index,
        id: group.id,
        groupId: group.id,
        numericId: null,
        label: group.name,
        kind: group.type,
        color: kindColor(group.type),
        group: group.parentId || hierarchy.projectName,
        file: "",
        location: "",
        degree: group.importance,
        incoming: 0,
        outgoing: 0,
        lat: position.lat,
        lon: position.lon,
        metadata: {
          nodeCount: group.nodeCount,
          internalEdges: group.internalEdges,
          externalEdges: group.externalEdges,
          level: group.level
        },
        inView: true,
        isGroup: true,
        nodeCount: group.nodeCount,
        internalEdges: group.internalEdges,
        externalEdges: group.externalEdges,
        importance: group.importance,
        level: group.level,
        expanded: Boolean(nav.contextGroupId === group.id),
        parentId: group.parentId
      };
    }
    const leafId = entity.leafId;
    const kind = codeToKind(indexed.kindCodes[leafId]);
    return {
      index,
      id: indexed.originalIds[leafId],
      groupId: null,
      numericId: leafId,
      label: indexed.labels[leafId],
      kind,
      color: kindColor(kind),
      group: indexed.groups[leafId],
      file: indexed.files[leafId],
      location: indexed.locations[leafId],
      degree: indexed.degrees[leafId],
      incoming: indexed.incoming[leafId],
      outgoing: indexed.outgoing[leafId],
      lat: position.lat,
      lon: position.lon,
      metadata: indexed.metadatas[leafId] || {},
      inView: true,
      isGroup: false
    };
  });
  const entityIndex = new Map(nodes.map((node) => [node.isGroup ? node.groupId : `leaf:${node.numericId}`, node.index]));
  const aggregate = /* @__PURE__ */ new Map();
  for (let edgeId = 0; edgeId < indexed.edgeCount; edgeId += 1) {
    const sourceLeaf = indexed.edgeSource[edgeId];
    const targetLeaf = indexed.edgeTarget[edgeId];
    const sourceEntity = mapLeafToVisibleEntity(
      hierarchy,
      sourceLeaf,
      nav.contextGroupId,
      visibleGroupIds,
      visibleLeafIds
    );
    const targetEntity = mapLeafToVisibleEntity(
      hierarchy,
      targetLeaf,
      nav.contextGroupId,
      visibleGroupIds,
      visibleLeafIds
    );
    if (!sourceEntity || !targetEntity || sourceEntity === targetEntity) continue;
    const key = sourceEntity < targetEntity ? `${sourceEntity}=>${targetEntity}` : `${targetEntity}=>${sourceEntity}`;
    const current = aggregate.get(key) || {
      sourceEntity: sourceEntity < targetEntity ? sourceEntity : targetEntity,
      targetEntity: sourceEntity < targetEntity ? targetEntity : sourceEntity,
      weight: 0,
      relation: indexed.edgeRelations[edgeId],
      confidence: "AGGREGATED"
    };
    current.weight += 1;
    aggregate.set(key, current);
  }
  const rankedAggregates = [...aggregate.values()].sort((a, b) => b.weight - a.weight);
  const edges = [];
  let edgesTruncated = 0;
  for (const item of rankedAggregates) {
    const source = entityIndex.get(item.sourceEntity);
    const target = entityIndex.get(item.targetEntity);
    if (source === void 0 || target === void 0) continue;
    if (edges.length >= maxEdges) {
      edgesTruncated += 1;
      continue;
    }
    edges.push({
      source,
      target,
      relation: item.weight > 1 ? `${item.relation}×${item.weight}` : item.relation,
      confidence: item.confidence,
      weight: item.weight,
      aggregated: true
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
  const visibleLeafCount = selectedLeaves.length + selectedGroups.reduce((sum, group) => sum + group.nodeCount, 0);
  return {
    nodes,
    edges,
    maxAnimatedEdges,
    edgesTruncated,
    focusNumericId: options.focusNumericId ?? -1,
    visibleNumericIds: selectedLeaves,
    visibleGroupIds: [...visibleGroupIds],
    mode: "hierarchy",
    tier: nav.tier,
    breadcrumb: buildBreadcrumb(hierarchy, nav.contextGroupId),
    contextGroupId: nav.contextGroupId,
    hierarchyActive: true,
    coveredLeafCount: visibleLeafCount
  };
}
function expandNavToGroup(nav, hierarchy, groupId) {
  const group = hierarchy.groups.get(groupId);
  if (!group) return nav;
  return {
    ...nav,
    mode: "hierarchy",
    contextGroupId: groupId,
    breadcrumb: buildBreadcrumb(hierarchy, groupId)
  };
}
function collapseNav(nav, hierarchy) {
  if (!nav.contextGroupId) {
    return {
      ...nav,
      contextGroupId: null,
      breadcrumb: buildBreadcrumb(hierarchy, null)
    };
  }
  const current = hierarchy.groups.get(nav.contextGroupId);
  const parentId = current?.parentId || null;
  return {
    ...nav,
    contextGroupId: parentId,
    breadcrumb: buildBreadcrumb(hierarchy, parentId)
  };
}
function navigateToBreadcrumb(nav, hierarchy, groupId) {
  if (groupId == null) {
    return {
      ...nav,
      contextGroupId: null,
      breadcrumb: buildBreadcrumb(hierarchy, null)
    };
  }
  return expandNavToGroup(nav, hierarchy, groupId);
}
function revealLeafInNav(nav, hierarchy, leafNumericId) {
  const path = hierarchy.leafPathIds[leafNumericId] || [];
  if (!path.length) return { nav, parentGroupId: null };
  const parentGroupId = path.length >= 2 ? path[path.length - 2] : path[0];
  return {
    nav: expandNavToGroup(nav, hierarchy, parentGroupId),
    parentGroupId
  };
}
function getGroupDetail(hierarchy, groupId, viewNodes = []) {
  const group = hierarchy.groups.get(groupId);
  if (!group) return null;
  const viewNode = viewNodes.find((node) => node.isGroup && node.groupId === groupId);
  return {
    node: {
      index: viewNode?.index ?? -1,
      id: group.id,
      groupId: group.id,
      numericId: null,
      label: group.name,
      kind: group.type,
      color: kindColor(group.type),
      group: group.parentId || "",
      file: "",
      location: "",
      degree: group.importance,
      incoming: viewNode?.incoming || 0,
      outgoing: viewNode?.outgoing || 0,
      lat: viewNode?.lat || 0,
      lon: viewNode?.lon || 0,
      metadata: {
        nodeCount: group.nodeCount,
        internalEdges: group.internalEdges,
        externalEdges: group.externalEdges,
        level: group.level,
        importance: group.importance
      },
      inView: Boolean(viewNode),
      isGroup: true,
      nodeCount: group.nodeCount,
      internalEdges: group.internalEdges,
      externalEdges: group.externalEdges,
      importance: group.importance,
      level: group.level,
      expanded: false,
      parentId: group.parentId
    },
    connections: []
  };
}
function releaseHierarchy(hierarchy) {
  if (!hierarchy) return;
  hierarchy.groups.clear();
  hierarchy.roots.length = 0;
  hierarchy.leafPathIds.length = 0;
}
export {
  SIZE_TIERS,
  buildHierarchy,
  classifyGraphSize,
  collapseNav,
  createHierarchyNav,
  expandNavToGroup,
  getGroupDetail,
  navigateToBreadcrumb,
  releaseHierarchy,
  revealLeafInNav,
  selectSceneView
};
