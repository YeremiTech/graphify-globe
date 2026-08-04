import { describe, expect, it } from 'vitest';
import {
  buildIndexedGraph,
  buildStats,
  releaseIndexedGraph,
  searchIndexed,
  selectVisibleView,
} from '../indexedGraph.js';
import { ingestGraphDocument, parseGraph } from '../parseGraph.js';
import { validateGraphDocument } from '../graphValidation.js';

function makeLargeDoc(nodeCount, edgeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
    type: index % 2 === 0 ? 'class' : 'method',
    source_file: `src/pkg/File${index}.java`,
  }));
  const edges = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const source = index % nodeCount;
    const target = (index * 7 + 1) % nodeCount;
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

describe('separación indexado vs renderizado', () => {
  it('indexa todos los nodos válidos y renderiza solo el subconjunto', () => {
    const doc = makeLargeDoc(120, 300);
    const validated = validateGraphDocument(doc);
    const indexed = buildIndexedGraph(validated);
    const view = selectVisibleView(indexed, {
      maxNodes: 55,
      maxEdges: 120,
      maxAnimatedEdges: 8,
    });
    const stats = buildStats(indexed, view);

    expect(indexed.nodeCount).toBe(120);
    expect(stats.indexedNodes).toBe(120);
    expect(stats.visibleNodes).toBe(55);
    expect(stats.renderedNodes).toBe(55);
    expect(stats.groupedNodes).toBe(65);
    expect(view.nodes).toHaveLength(55);
    expect(view.edges.length).toBeLessThanOrEqual(120);
    expect(stats.discardReasons.some((item) => /límite de calidad/i.test(item.reason))).toBe(true);

    // Cambiar límites no requiere otro parse: misma estructura indexada.
    const view2 = selectVisibleView(indexed, {
      maxNodes: 70,
      maxEdges: 100,
      maxAnimatedEdges: 8,
    });
    expect(indexed.nodeCount).toBe(120);
    expect(view2.nodes).toHaveLength(70);
    expect(buildStats(indexed, view2).groupedNodes).toBe(50);
  });

  it('busca en el índice completo aunque el nodo no esté en la vista', () => {
    const doc = makeLargeDoc(80, 100);
    const validated = validateGraphDocument(doc);
    const indexed = buildIndexedGraph(validated);
    const view = selectVisibleView(indexed, { maxNodes: 50, maxEdges: 60, maxAnimatedEdges: 4 });
    const visibleIds = new Set(view.nodes.map((node) => node.numericId));

    const hidden = [...Array(indexed.nodeCount).keys()].find((id) => !visibleIds.has(id));
    expect(hidden).toBeTypeOf('number');

    const results = searchIndexed(indexed, indexed.labels[hidden], {
      visibleSet: visibleIds,
      limit: 5,
    });
    expect(results.some((item) => item.numericId === hidden)).toBe(true);
    expect(results.find((item) => item.numericId === hidden).inView).toBe(false);
  });

  it('ingestGraphDocument separa capas y parseGraph no expone el índice completo', () => {
    const doc = makeLargeDoc(90, 120);
    const ingested = ingestGraphDocument(JSON.stringify(doc), 'GRAPHIFY.json', {
      maxNodes: 50,
      maxEdges: 70,
      maxAnimatedEdges: 6,
    });

    expect(ingested.indexed.nodeCount).toBe(90);
    expect(ingested.view.nodes).toHaveLength(50);
    expect(ingested.stats.indexedNodes).toBe(90);
    expect(ingested.stats.visibleNodes).toBe(50);
    expect(ingested.stats.groupedNodes).toBe(40);

    const parsed = parseGraph(JSON.stringify(doc), 'GRAPHIFY.json', {
      maxNodes: 50,
      maxEdges: 70,
      maxAnimatedEdges: 6,
    });
    expect(parsed.nodes).toHaveLength(50);
    expect(parsed.indexedNodeCount).toBe(90);
    expect(parsed.visibleNodeCount).toBe(50);
    expect(parsed).not.toHaveProperty('indexed');
  });

  it('releaseIndexedGraph limpia referencias al cargar otro archivo', () => {
    const validated = validateGraphDocument(makeLargeDoc(10, 8));
    const indexed = buildIndexedGraph(validated);
    expect(indexed.nodeCount).toBe(10);
    releaseIndexedGraph(indexed);
    expect(indexed.originalIds).toHaveLength(0);
    expect(indexed.idToNumeric.size).toBe(0);
  });

  it('enfocar un nodo omitido lo incluye en la nueva vista sin reindexar', () => {
    const validated = validateGraphDocument(makeLargeDoc(80, 100));
    const indexed = buildIndexedGraph(validated);
    const firstView = selectVisibleView(indexed, { maxNodes: 50, maxEdges: 60, maxAnimatedEdges: 4 });
    const visible = new Set(firstView.visibleNumericIds);
    const omitted = [...Array(indexed.nodeCount).keys()].find((id) => !visible.has(id));
    expect(omitted).toBeTypeOf('number');
    const focused = selectVisibleView(indexed, { maxNodes: 50, maxEdges: 60, maxAnimatedEdges: 4 }, {
      focusNumericId: omitted,
    });
    expect(focused.nodes.some((node) => node.numericId === omitted)).toBe(true);
    expect(focused.nodes).toHaveLength(50);
    expect(indexed.nodeCount).toBe(80);
  });
});
