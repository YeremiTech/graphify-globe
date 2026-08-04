import { describe, expect, it } from 'vitest';
import { validateGraphDocument } from '../graphValidation.js';
import { buildIndexedGraph, buildStats } from '../indexedGraph.js';
import {
  buildHierarchy,
  classifyGraphSize,
  collapseNav,
  createHierarchyNav,
  expandNavToGroup,
  releaseHierarchy,
  revealLeafInNav,
  selectSceneView,
  SIZE_TIERS,
} from '../hierarchy.js';

function makeDoc(nodeCount, edgeCount = nodeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const pkg = `com.demo.mod${index % 8}`;
    const folder = `src/main/java/${pkg.replaceAll('.', '/')}`;
    return {
      id: `n${index}`,
      label: `Symbol${index}`,
      type: index % 3 === 0 ? 'class' : 'method',
      package: pkg,
      source_file: `${folder}/File${index % 20}.java`,
    };
  });
  const edges = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const source = index % nodeCount;
    const target = (index * 5 + 3) % nodeCount;
    if (source === target) continue;
    edges.push({
      source: `n${source}`,
      target: `n${target}`,
      relation: 'calls',
      confidence: 'EXTRACTED',
    });
  }
  return { nodes, edges };
}

describe('agrupamiento jerárquico', () => {
  it('clasifica tamaños de grafo', () => {
    expect(classifyGraphSize(10)).toBe(SIZE_TIERS.SMALL);
    expect(classifyGraphSize(800)).toBe(SIZE_TIERS.MEDIUM);
    expect(classifyGraphSize(8000)).toBe(SIZE_TIERS.LARGE);
    expect(classifyGraphSize(80000)).toBe(SIZE_TIERS.MASSIVE);
  });

  it('construye jerarquía determinista', () => {
    const validated = validateGraphDocument(makeDoc(40, 60));
    const indexed = buildIndexedGraph(validated);
    const a = buildHierarchy(indexed);
    const b = buildHierarchy(indexed);
    expect([...a.groups.keys()].sort()).toEqual([...b.groups.keys()].sort());
    expect(a.roots).toEqual(b.roots);
    expect(a.groups.size).toBeGreaterThan(1);
    for (const group of a.groups.values()) {
      expect(group).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        type: expect.any(String),
        nodeCount: expect.any(Number),
        internalEdges: expect.any(Number),
        externalEdges: expect.any(Number),
        importance: expect.any(Number),
        level: expect.any(Number),
      });
      expect(group.nodeCount).toBe(group.descendantLeafIds.length);
    }
  });

  it('muestra grupos con relaciones agregadas y permite expandir/colapsar', () => {
    const validated = validateGraphDocument(makeDoc(120, 200));
    const indexed = buildIndexedGraph(validated);
    const hierarchy = buildHierarchy(indexed);
    let nav = {
      ...createHierarchyNav(indexed, hierarchy),
      mode: 'hierarchy',
      tier: SIZE_TIERS.MEDIUM,
    };

    const rootView = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 200,
      maxEdges: 400,
      maxAnimatedEdges: 20,
    });
    expect(rootView.hierarchyActive).toBe(true);
    expect(rootView.nodes.some((node) => node.isGroup)).toBe(true);
    expect(rootView.edges.every((edge) => edge.aggregated || edge.weight >= 1)).toBe(true);

    const firstGroup = rootView.nodes.find((node) => node.isGroup);
    expect(firstGroup).toBeTruthy();

    nav = expandNavToGroup(nav, hierarchy, firstGroup.groupId);
    const expanded = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 200,
      maxEdges: 400,
      maxAnimatedEdges: 20,
    });
    expect(expanded.contextGroupId).toBe(firstGroup.groupId);
    expect(expanded.breadcrumb.some((crumb) => crumb.id === firstGroup.groupId)).toBe(true);

    nav = collapseNav(nav, hierarchy);
    const collapsed = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 200,
      maxEdges: 400,
      maxAnimatedEdges: 20,
    });
    expect(collapsed.contextGroupId).not.toBe(firstGroup.groupId);
  });

  it('revela un nodo de búsqueda expandiendo padres', () => {
    const validated = validateGraphDocument(makeDoc(80, 100));
    const indexed = buildIndexedGraph(validated);
    const hierarchy = buildHierarchy(indexed);
    let nav = {
      ...createHierarchyNav(indexed, hierarchy),
      mode: 'hierarchy',
      tier: SIZE_TIERS.MEDIUM,
    };

    const leafId = 42;
    const revealed = revealLeafInNav(nav, hierarchy, leafId);
    nav = revealed.nav;
    const view = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 200,
      maxEdges: 400,
      maxAnimatedEdges: 12,
    });
    expect(view.nodes.some((node) => node.numericId === leafId || node.isGroup)).toBe(true);
    expect(view.breadcrumb.length).toBeGreaterThan(1);
  });

  it('persiste selección de grupo tras rebuild de vista', () => {
    const validated = validateGraphDocument(makeDoc(60, 80));
    const indexed = buildIndexedGraph(validated);
    const hierarchy = buildHierarchy(indexed);
    const nav = {
      ...createHierarchyNav(indexed, hierarchy),
      mode: 'hierarchy',
      tier: SIZE_TIERS.MEDIUM,
    };
    const view = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 100,
      maxEdges: 200,
      maxAnimatedEdges: 8,
    });
    const group = view.nodes.find((node) => node.isGroup);
    const again = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 100,
      maxEdges: 200,
      maxAnimatedEdges: 8,
    });
    const same = again.nodes.find((node) => node.groupId === group.groupId);
    expect(same).toBeTruthy();
    expect(same.id).toBe(group.id);
    expect(same.nodeCount).toBe(group.nodeCount);
  });

  it('libera la jerarquía al soltar el subgrafo', () => {
    const validated = validateGraphDocument(makeDoc(30, 40));
    const indexed = buildIndexedGraph(validated);
    const hierarchy = buildHierarchy(indexed);
    expect(hierarchy.groups.size).toBeGreaterThan(0);
    releaseHierarchy(hierarchy);
    expect(hierarchy.groups.size).toBe(0);
    expect(hierarchy.roots).toHaveLength(0);
  });

  it('en grafos pequeños mantiene vista plana', () => {
    const validated = validateGraphDocument(makeDoc(20, 30));
    const indexed = buildIndexedGraph(validated);
    const hierarchy = buildHierarchy(indexed);
    const nav = createHierarchyNav(indexed, hierarchy);
    expect(nav.mode).toBe('flat');
    const view = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 100,
      maxEdges: 200,
      maxAnimatedEdges: 8,
    });
    expect(view.mode).toBe('flat');
    expect(view.nodes.every((node) => !node.isGroup)).toBe(true);
    const stats = buildStats(indexed, view);
    expect(stats.hierarchyActive).toBe(false);
  });
});
