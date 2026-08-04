import { describe, expect, it } from 'vitest';
import { searchIndexed, searchIndexedProgressive } from '../graphSearch.js';
import {
  buildHierarchy,
  createHierarchyNav,
  revealLeafInNav,
  selectSceneView,
} from '../hierarchy.js';
import {
  buildIndexedGraph,
  searchIndexed as searchFromIndexed,
  selectVisibleView,
} from '../indexedGraph.js';
import { normalizeSearchText, tokenizeQuery } from '../searchNormalize.js';
import { validateGraphDocument } from '../graphValidation.js';

function makeDoc(nodeCount, edgeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: index === 77 ? 'ServicioAutenticación' : `Node ${index}`,
    type: index % 2 === 0 ? 'class' : 'method',
    source_file: `src/pkg/File${index}.java`,
    package: index > 60 ? 'auth.module' : 'core',
    tags: index === 77 ? ['security', 'login'] : undefined,
    metadata: index === 77 ? { owner: 'platform' } : undefined,
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

describe('searchNormalize', () => {
  it('normaliza mayúsculas y acentos', () => {
    expect(normalizeSearchText('ServicioAutenticación')).toBe('servicioautenticacion');
    expect(tokenizeQuery('  Auth  Módulo ')).toEqual(['auth', 'modulo']);
  });
});

describe('búsqueda global sobre índice', () => {
  it('encuentra nodo visible y no visible', () => {
    const indexed = buildIndexedGraph(validateGraphDocument(makeDoc(80, 100)));
    const view = selectVisibleView(indexed, { maxNodes: 50, maxEdges: 60, maxAnimatedEdges: 4 });
    const visible = new Set(view.nodes.map((node) => node.numericId));
    const hidden = [...Array(indexed.nodeCount).keys()].find((id) => !visible.has(id));

    const visibleHit = searchFromIndexed(indexed, view.nodes[0].label, { visibleSet: visible, limit: 5 });
    expect(visibleHit[0].numericId).toBe(view.nodes[0].numericId);
    expect(visibleHit[0].inView).toBe(true);

    const hiddenHit = searchFromIndexed(indexed, indexed.labels[hidden], { visibleSet: visible, limit: 5 });
    expect(hiddenHit.some((item) => item.numericId === hidden)).toBe(true);
    expect(hiddenHit.find((item) => item.numericId === hidden).inView).toBe(false);
  });

  it('busca por ruta, módulo, tipo, etiquetas y metadatos', () => {
    const indexed = buildIndexedGraph(validateGraphDocument(makeDoc(90, 40)));
    expect(searchIndexed(indexed, 'File77').some((item) => item.id === 'n77')).toBe(true);
    expect(searchIndexed(indexed, 'auth module File77').some((item) => item.id === 'n77')).toBe(true);
    expect(searchIndexed(indexed, 'security').some((item) => item.id === 'n77')).toBe(true);
    expect(searchIndexed(indexed, 'platform').some((item) => item.id === 'n77')).toBe(true);
    expect(searchIndexed(indexed, 'servicioautenticacion').some((item) => item.id === 'n77')).toBe(true);
  });

  it('ordena por relevancia y limita resultados numerosos', () => {
    const indexed = buildIndexedGraph(validateGraphDocument(makeDoc(120, 50)));
    const results = searchIndexed(indexed, 'node', { limit: 10 });
    expect(results).toHaveLength(10);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index].score).toBeGreaterThanOrEqual(results[index - 1].score);
    }
  });

  it('término inexistente devuelve vacío', () => {
    const indexed = buildIndexedGraph(validateGraphDocument(makeDoc(30, 20)));
    expect(searchIndexed(indexed, 'zzz-no-existe-xyz')).toEqual([]);
  });

  it('búsqueda progresiva se puede cancelar', async () => {
    const indexed = buildIndexedGraph(validateGraphDocument(makeDoc(200, 80)));
    const signal = { cancelled: false };
    const partials = [];
    const pending = searchIndexedProgressive(indexed, 'node', {
      batchSize: 40,
      limit: 8,
      signal,
      onPartial: (results) => partials.push(results.length),
    });
    signal.cancelled = true;
    const outcome = await pending;
    expect(outcome.cancelled).toBe(true);
    expect(outcome.results).toEqual([]);
  });
});

describe('reveal jerárquico y restauración', () => {
  it('expande jerarquía e incluye el nodo foco aunque el cupo esté lleno', () => {
    const indexed = buildIndexedGraph(validateGraphDocument(makeDoc(500, 200)));
    const hierarchy = buildHierarchy(indexed);
    let nav = createHierarchyNav(indexed, hierarchy);
    expect(nav.mode).toBe('hierarchy');

    const leafId = indexed.nodeCount - 1;
    const revealed = revealLeafInNav(nav, hierarchy, leafId);
    nav = revealed.nav;

    const view = selectSceneView(indexed, hierarchy, nav, {
      maxNodes: 40,
      maxEdges: 80,
      maxAnimatedEdges: 8,
    }, { focusNumericId: leafId });

    expect(view.nodes.some((node) => node.numericId === leafId)).toBe(true);
    expect(view.contextGroupId).toBeTruthy();
  });
});
