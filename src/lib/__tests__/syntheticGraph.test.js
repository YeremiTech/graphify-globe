import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIZE_LADDER,
  generateGraphDocument,
  resolveScenario,
} from '../../../benchmarks/lib/syntheticGraph.js';
import { validateGraphDocument } from '../graphValidation.js';

describe('synthetic GRAPHIFY generator', () => {
  it('incluye el ladder de tamaños requerido', () => {
    expect(DEFAULT_SIZE_LADDER).toEqual([
      1_000, 5_000, 10_000, 50_000, 100_000, 250_000, 500_000,
    ]);
  });

  it('genera documentos válidos con densidades distintas', () => {
    for (const density of ['sparse', 'medium', 'dense', 'hierarchical']) {
      const { document, scenario } = generateGraphDocument({ nodes: 120, density, seed: 42 });
      const validated = validateGraphDocument(document);
      expect(validated.nodeById.size).toBe(120);
      expect(scenario.edgeCount).toBeGreaterThan(0);
      expect(validated.edges.length).toBeGreaterThan(0);
      expect(document.nodes[0]).toHaveProperty('package');
      expect(document.nodes[0]).toHaveProperty('module');
    }
  });

  it('es determinista con la misma seed', () => {
    const a = generateGraphDocument({ nodes: 40, density: 'medium', seed: 7 });
    const b = generateGraphDocument({ nodes: 40, density: 'medium', seed: 7 });
    expect(a.document.edges[0]).toEqual(b.document.edges[0]);
    expect(a.document.nodes[10].source_file).toBe(b.document.nodes[10].source_file);
  });

  it('resuelve escenarios del ladder sin materializar archivos', () => {
    const scenario = resolveScenario({ nodes: 100_000, density: 'hierarchical' });
    expect(scenario.nodeCount).toBe(100_000);
    expect(scenario.edgeCount).toBe(Math.round(100_000 * 3.5));
  });
});
