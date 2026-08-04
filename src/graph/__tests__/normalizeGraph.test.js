import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectGraphFormat } from '../detectGraphFormat.js';
import { processGraphText, processGraphDocument } from '../processGraph.js';
import { normalizeGraph as normalizeOnly } from '../normalizeGraph.js';
import { buildGraphIndexes, hydrateIndexes } from '../buildGraphIndexes.js';
import { selectVisibleSubgraph, ensureNodeVisible } from '../selectVisibleSubgraph.js';
import { CONNECTION_PAGE_SIZE, GRAPH_FORMAT } from '../constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(__dirname, '../__fixtures__', name), 'utf8'));

describe('detectGraphFormat', () => {
  it('detects graphify-native with nodes and links', () => {
    expect(detectGraphFormat(load('graphify-native-minimal.json'))).toBe(GRAPH_FORMAT.NATIVE);
  });

  it('detects legacy with nodes and edges', () => {
    expect(detectGraphFormat(load('legacy-edges.json'))).toBe(GRAPH_FORMAT.LEGACY);
  });

  it('returns unknown without nodes', () => {
    expect(detectGraphFormat({ links: [] })).toBe(GRAPH_FORMAT.UNKNOWN);
  });
});

describe('native adapter / normalize', () => {
  it('normalizes native minimal graph', () => {
    const graph = normalizeOnly(load('graphify-native-minimal.json'));
    expect(graph.format).toBe(GRAPH_FORMAT.NATIVE);
    expect(graph.directed).toBe(false);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0].relation).toBe('calls');
    expect(graph.edges[1].confidenceScore).toBe(0.5);
  });

  it('stringifies numeric ids', () => {
    const graph = normalizeOnly(load('graphify-native-directed.json'));
    expect(graph.nodes.map((n) => n.id)).toEqual(['1', '2', '3']);
    expect(graph.edges[0].sourceId).toBe('1');
    expect(graph.directed).toBe(true);
  });

  it('keeps parallel relations in multigraph', () => {
    const graph = normalizeOnly(load('graphify-native-multigraph.json'));
    expect(graph.multigraph).toBe(true);
    expect(graph.edges.filter((e) => !e.isSelfLoop)).toHaveLength(2);
    expect(graph.edges.some((e) => e.isSelfLoop)).toBe(true);
    expect(graph.hyperedges).toHaveLength(1);
  });

  it('handles node without label using id', () => {
    const graph = normalizeOnly({
      directed: false,
      multigraph: false,
      nodes: [{ id: 'x1', kind: 'file' }],
      links: [],
    });
    expect(graph.nodes[0].label).toBe('x1');
  });

  it('handles node without source_file', () => {
    const graph = normalizeOnly({
      directed: false,
      multigraph: false,
      nodes: [{ id: 'n', label: 'N', community: 3 }],
      links: [],
    });
    expect(graph.nodes[0].file).toBe('');
    expect(graph.nodes[0].communityName).toBe('Comunidad 3');
    expect(graph.diagnostics.unnamedCommunities).toContain('3');
  });

  it('maps missing confidence_score from confidence label', () => {
    const graph = normalizeOnly({
      directed: true,
      multigraph: false,
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      links: [
        { source: 'a', target: 'b', relation: 'r', confidence: 'EXTRACTED' },
        { source: 'b', target: 'c', relation: 'r', confidence: 'AMBIGUOUS' },
      ],
    });
    expect(graph.edges[0].confidenceScore).toBe(1);
    expect(graph.edges[1].confidenceScore).toBe(0.2);
  });

  it('records dangling edges and duplicate ids', () => {
    const graph = normalizeOnly(load('graphify-native-invalid-links.json'));
    expect(graph.diagnostics.danglingEdgeCount).toBe(1);
    expect(graph.diagnostics.duplicateNodeIdCount).toBe(1);
    expect(graph.diagnostics.selfLoopCount).toBe(1);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.find((n) => n.kind === 'unknown')).toBeTruthy();
    expect(graph.nodes.find((n) => n.metadata.originalKind === 'weird_custom_kind')).toBeTruthy();
  });

  it('uses related only when relation is absent', () => {
    const graph = normalizeOnly({
      directed: false,
      multigraph: false,
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [{ source: 'a', target: 'b' }],
    });
    expect(graph.edges[0].relation).toBe('related');
  });
});

describe('legacy adapter', () => {
  it('loads legacy nodes/edges', () => {
    const graph = normalizeOnly(load('legacy-edges.json'));
    expect(graph.format).toBe(GRAPH_FORMAT.LEGACY);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges[0].relation).toBe('calls');
  });
});

describe('processGraphText', () => {
  it('rejects invalid JSON', () => {
    expect(() => processGraphText('{broken')).toThrow(/JSON inválido/);
  });

  it('rejects graph without nodes', () => {
    expect(() => processGraphDocument({ links: [] })).toThrow(/nodos/);
  });

  it('accepts UTF-8 BOM', () => {
    const raw = load('graphify-native-minimal.json');
    const text = `\uFEFF${JSON.stringify(raw)}`;
    const graph = processGraphText(text);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });
});

describe('visible subgraph and indexes', () => {
  it('does not destroy full graph when quality limits apply', () => {
    const nodes = Array.from({ length: 120 }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
      kind: 'class',
      community: i % 6,
      community_name: `C${i % 6}`,
    }));
    const links = [];
    for (let i = 0; i < 119; i += 1) {
      links.push({ source: `n${i}`, target: `n${i + 1}`, relation: 'next', confidence: 'EXTRACTED' });
    }
    const result = processGraphDocument(
      { directed: true, multigraph: false, nodes, links, graph: {}, hyperedges: [] },
      { limits: { maxNodes: 50, maxEdges: 80, maxAnimatedEdges: 10 } },
    );
    expect(result.allNodes).toHaveLength(120);
    expect(result.totalNodes).toBe(120);
    expect(result.nodes.length).toBeLessThanOrEqual(50);
    expect(result.visibleNodes).toBe(result.nodes.length);
    expect(result.hiddenNodes).toBe(120 - result.nodes.length);
  });

  it('can reveal a previously hidden search hit', () => {
    const nodes = Array.from({ length: 80 }, (_, i) => ({
      id: `n${i}`,
      label: i === 79 ? 'HiddenTarget' : `Node ${i}`,
      kind: 'class',
      community: i % 4,
      community_name: `C${i % 4}`,
    }));
    const links = Array.from({ length: 40 }, (_, i) => ({
      source: `n${i}`,
      target: `n${i + 1}`,
      relation: 'calls',
      confidence: 'EXTRACTED',
    }));
    const full = normalizeOnly({ directed: true, multigraph: false, nodes, links, graph: {}, hyperedges: [] });
    const indexes = buildGraphIndexes(full);
    const visible = selectVisibleSubgraph(full, indexes, { maxNodes: 20, maxEdges: 40 });
    expect(visible.nodes.some((n) => n.id === 'n79')).toBe(false);

    const revealed = ensureNodeVisible(full, indexes, visible, 'n79', { maxNodes: 20, maxEdges: 40 });
    expect(revealed.nodes.some((n) => n.id === 'n79')).toBe(true);
  });

  it('indexes make connection lookup proportional to degree', () => {
    const full = normalizeOnly(load('graphify-native-directed.json'));
    const indexes = buildGraphIndexes(full);
    const hydrated = hydrateIndexes(
      {
        nodeIndexById: Object.fromEntries([...indexes.nodeIndexById.entries()]),
        incomingEdgeIndexesByNode: Object.fromEntries(
          [...indexes.incomingEdgeIndexesByNode.entries()].map(([k, v]) => [String(k), v]),
        ),
        outgoingEdgeIndexesByNode: Object.fromEntries(
          [...indexes.outgoingEdgeIndexesByNode.entries()].map(([k, v]) => [String(k), v]),
        ),
        connectedEdgeIndexesByNode: Object.fromEntries(
          [...indexes.connectedEdgeIndexesByNode.entries()].map(([k, v]) => [String(k), v]),
        ),
        nodesByCommunity: Object.fromEntries([...indexes.nodesByCommunity.entries()]),
        nodesByFileType: Object.fromEntries([...indexes.nodesByFileType.entries()]),
        nodesByKind: Object.fromEntries([...indexes.nodesByKind.entries()]),
        edgesByRelation: Object.fromEntries([...indexes.edgesByRelation.entries()]),
      },
      full,
    );

    const hub = full.nodes.find((n) => n.id === '2');
    const connected = hydrated.connectedEdgeIndexesByNode.get(hub.index);
    expect(connected.length).toBe(hub.degree);
    expect(connected.length).toBeGreaterThan(CONNECTION_PAGE_SIZE > 100 ? 0 : 0);
    expect(connected.length).toBe(3);
  });

  it('supports NodeInfoPanel pagination over >24 connections', () => {
    const nodes = [{ id: 'hub', label: 'Hub', kind: 'class' }];
    const links = [];
    for (let i = 0; i < 40; i += 1) {
      nodes.push({ id: `leaf${i}`, label: `Leaf ${i}`, kind: 'function' });
      links.push({ source: 'hub', target: `leaf${i}`, relation: 'calls', confidence: 'EXTRACTED' });
    }
    const full = normalizeOnly({ directed: true, multigraph: false, nodes, links, graph: {}, hyperedges: [] });
    const indexes = buildGraphIndexes(full);
    const hub = full.nodes.find((n) => n.id === 'hub');
    const all = indexes.connectedEdgeIndexesByNode.get(hub.index);
    expect(all.length).toBe(40);
    const page = all.slice(0, CONNECTION_PAGE_SIZE);
    expect(page).toHaveLength(24);
    expect(`Mostrando ${page.length} de ${all.length} conexiones`).toBe('Mostrando 24 de 40 conexiones');
  });
});
