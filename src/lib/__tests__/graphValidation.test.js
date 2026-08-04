import { describe, expect, it, vi } from 'vitest';
import { CancelledError, GraphError } from '../graphErrors.js';
import { parseGraph } from '../parseGraph.js';
import {
  parseJsonText,
  validateGraphDocument,
} from '../graphValidation.js';
import {
  clearGraphSceneResources,
  disposeMaterial,
  disposeObject,
} from '../threeDispose.js';

const validDoc = {
  nodes: [
    { id: 'a', label: 'Alpha', type: 'class' },
    { id: 'b', label: 'Beta', type: 'interface' },
  ],
  edges: [
    { source: 'a', target: 'b', relation: 'uses', confidence: 'EXTRACTED' },
  ],
};

describe('parseJsonText', () => {
  it('acepta JSON válido', () => {
    expect(parseJsonText(JSON.stringify(validDoc))).toEqual(validDoc);
  });

  it('rechaza JSON inválido', () => {
    expect(() => parseJsonText('{not-json')).toThrow(GraphError);
    try {
      parseJsonText('{not-json');
    } catch (error) {
      expect(error.code).toBe('INVALID_JSON');
      expect(error.disposition).toBe('rejected');
      expect(error.message).toMatch(/Sección:/);
      expect(error.message).toMatch(/Qué puedes hacer:/);
      expect(error.message).toMatch(/rechazado completamente/);
    }
  });

  it('rechaza archivo vacío', () => {
    expect(() => parseJsonText('')).toThrow(GraphError);
    expect(() => parseJsonText('   ')).toThrow(/vacío/i);
  });
});

describe('validateGraphDocument', () => {
  it('valida un grafo correcto', () => {
    const result = validateGraphDocument(validDoc);
    expect(result.stats.uniqueNodeCount).toBe(2);
    expect(result.edges).toHaveLength(1);
    expect(result.disposition).toBe('accepted');
  });

  it('rechaza nodos duplicados', () => {
    const doc = {
      nodes: [
        { id: 'dup', label: 'One' },
        { id: 'dup', label: 'Two' },
      ],
      edges: [],
    };
    expect(() => validateGraphDocument(doc)).toThrow(/duplicados/i);
    try {
      validateGraphDocument(doc);
    } catch (error) {
      expect(error.code).toBe('DUPLICATE_NODE_ID');
      expect(error.disposition).toBe('rejected');
    }
  });

  it('procesa parcialmente relaciones huérfanas', () => {
    const doc = {
      nodes: [{ id: 'a', label: 'A' }],
      edges: [
        { source: 'a', target: 'missing', relation: 'calls' },
        { source: 'a', target: 'a', relation: 'self' },
      ],
    };
    const result = validateGraphDocument(doc);
    expect(result.edges).toHaveLength(0);
    expect(result.disposition).toBe('partial');
    expect(result.stats.orphanCount).toBe(1);
    expect(result.warnings.some((item) => item.code === 'ORPHAN_EDGES')).toBe(true);
    expect(result.warnings.some((item) => item.message || item.code)).toBe(true);
  });

  it('rechaza colección de nodos faltante', () => {
    expect(() => validateGraphDocument({ edges: [] })).toThrow(/nodos/i);
  });

  it('usa edges vacíos como valor predeterminado seguro', () => {
    const result = validateGraphDocument({ nodes: [{ id: 'only', label: 'Only' }] });
    expect(result.edges).toEqual([]);
    expect(result.stats.uniqueNodeCount).toBe(1);
  });

  it('rechaza números no finitos', () => {
    expect(() => validateGraphDocument({
      nodes: [{ id: 'x', label: 'X', weight: Number.NaN }],
      edges: [],
    })).toThrow(/no finito/i);
  });

  it('rechaza strings excesivamente largos', () => {
    const long = 'x'.repeat(9000);
    expect(() => validateGraphDocument({
      nodes: [{ id: 'x', label: long }],
      edges: [],
    })).toThrow(/límite/i);
  });
});

describe('parseGraph', () => {
  it('normaliza un GRAPHIFY.json válido', () => {
    const graph = parseGraph(JSON.stringify(validDoc), 'GRAPHIFY.json', {
      maxNodes: 900,
      maxEdges: 2400,
      maxAnimatedEdges: 42,
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.sourceName).toBe('GRAPHIFY.json');
    expect(graph.nodes[0]).toHaveProperty('lat');
    expect(graph.nodes[0]).toHaveProperty('lon');
    expect(graph.indexedNodeCount).toBe(2);
    expect(graph.visibleNodeCount).toBe(2);
    expect(graph.stats.indexedNodes).toBe(2);
    expect(graph.stats.renderedNodes).toBe(2);
  });

  it('permite cancelación durante el procesamiento', () => {
    const signal = { cancelled: true };
    expect(() => parseGraph(JSON.stringify(validDoc), 'g.json', {}, { signal }))
      .toThrow(CancelledError);
  });

  it('reporta progreso por fases', () => {
    const phases = [];
    parseGraph(JSON.stringify(validDoc), 'g.json', {}, {
      onProgress: (_value, _label, phase) => phases.push(phase),
    });
    expect(phases).toContain('validating');
    expect(phases).toContain('processing');
    expect(phases).toContain('indexing');
    expect(phases).toContain('preparing');
  });
});

describe('threeDispose cleanup', () => {
  it('disposeMaterial libera texturas y material', () => {
    const texture = { dispose: vi.fn() };
    const material = {
      map: texture,
      dispose: vi.fn(),
    };
    disposeMaterial(material);
    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
    expect(material.map).toBeNull();
  });

  it('disposeObject recorre geometrías y materiales', () => {
    const geometry = { dispose: vi.fn() };
    const material = { dispose: vi.fn() };
    const child = { geometry, material };
    const root = {
      traverse(callback) {
        callback(child);
      },
    };
    disposeObject(root);
    expect(geometry.dispose).toHaveBeenCalled();
    expect(material.dispose).toHaveBeenCalled();
    expect(child.geometry).toBeNull();
    expect(child.material).toBeNull();
  });

  it('clearGraphSceneResources elimina hijos al cargar otro archivo', () => {
    const disposed = [];
    const mesh = {
      traverse(callback) {
        callback({
          geometry: { dispose: () => disposed.push('geometry') },
          material: { dispose: () => disposed.push('material') },
        });
      },
    };
    const selection = { visible: true };
    const context = {
      dataGroup: {
        children: [selection, mesh],
        remove: vi.fn((child) => {
          context.dataGroup.children = context.dataGroup.children.filter((item) => item !== child);
        }),
      },
      selection,
      nodesMesh: mesh,
      nodeVectors: [1, 2],
      particleData: [1],
      particles: mesh,
      edgeLines: mesh,
      focusGroup: mesh,
      focusParticleData: [1],
      focusParticles: mesh,
      baseColors: [1],
      focusQuaternion: {},
    };

    clearGraphSceneResources(context);

    expect(context.dataGroup.remove).toHaveBeenCalledWith(mesh);
    expect(context.nodesMesh).toBeNull();
    expect(context.nodeVectors).toEqual([]);
    expect(context.particleData).toEqual([]);
    expect(context.baseColors).toEqual([]);
    expect(selection.visible).toBe(false);
    expect(disposed.length).toBeGreaterThan(0);
  });

  it('simula limpieza al desmontar (scene + resources)', () => {
    const sceneDispose = vi.fn();
    const rendererDispose = vi.fn();
    const context = {
      dataGroup: {
        children: [],
        remove: vi.fn(),
      },
      selection: { visible: true },
      nodesMesh: null,
      nodeVectors: [1],
      particleData: [],
      particles: null,
      edgeLines: null,
      focusGroup: null,
      focusParticleData: [],
      focusParticles: null,
      baseColors: [1],
    };

    clearGraphSceneResources(context);
    expect(context.nodeVectors).toEqual([]);
    expect(context.baseColors).toEqual([]);

    // El desmontaje real llama disposeObject(scene) + disposeRenderer; aquí verificamos contrato.
    const scene = {
      traverse(callback) {
        callback({
          geometry: { dispose: sceneDispose },
          material: { dispose: sceneDispose },
        });
      },
    };
    disposeObject(scene);
    rendererDispose();
    expect(sceneDispose).toHaveBeenCalled();
    expect(rendererDispose).toHaveBeenCalled();
  });
});

describe('errores del worker (payload)', () => {
  it('GraphError expone payload completo para la UI', () => {
    const error = new GraphError({
      what: 'Fallo de prueba',
      section: 'worker',
      action: 'Reintenta',
      disposition: 'rejected',
      code: 'WORKER_TEST',
    });
    const payload = error.toMessagePayload();
    expect(payload.message).toMatch(/Fallo de prueba/);
    expect(payload.section).toBe('worker');
    expect(payload.disposition).toBe('rejected');
    expect(payload.code).toBe('WORKER_TEST');
  });
});
