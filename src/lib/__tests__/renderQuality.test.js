import { describe, expect, it, vi } from 'vitest';
import {
  bumpProgressToken,
  createFpsMonitor,
  createProgressToken,
  runProgressiveBatches,
} from '../progressiveRender.js';
import {
  chooseAutomaticProfile,
  computeLodLevel,
  getProfileLimits,
  resolveRenderProfile,
  selectRenderableSubset,
} from '../renderQuality.js';

function makeView(nodeCount, edgeCount, { groups = 0 } = {}) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    numericId: index,
    index,
    label: `Node ${index}`,
    kind: index < groups ? 'group' : 'class',
    isGroup: index < groups,
    groupId: index < groups ? `g${index}` : null,
    nodeCount: index < groups ? 20 : undefined,
    degree: Math.max(1, nodeCount - index),
    lat: (index % 90) - 45,
    lon: (index * 17) % 360 - 180,
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    source: index % nodeCount,
    target: (index * 3 + 1) % nodeCount,
    confidence: index % 5 === 0 ? 'INFERRED' : 'EXPLICIT',
  }));
  return { nodes, edges, hierarchyActive: groups > 0 };
}

describe('renderQuality profiles', () => {
  it('mapea calidad de importación a perfil de render', () => {
    expect(resolveRenderProfile('ligero')).toBe('bajo');
    expect(resolveRenderProfile('equilibrado')).toBe('medio');
    expect(resolveRenderProfile('detallado')).toBe('alto');
    expect(resolveRenderProfile('automatico')).toBe('automatico');
  });

  it('elige perfil automático sin depender solo de hardwareConcurrency', () => {
    const low = chooseAutomaticProfile({
      nodeCount: 1500,
      edgeCount: 5000,
      viewportPixels: 3_000_000,
      devicePixelRatio: 3,
      observedFps: 24,
      deviceMemoryGb: 2,
      saveData: true,
    });
    const high = chooseAutomaticProfile({
      nodeCount: 100,
      edgeCount: 200,
      viewportPixels: 800_000,
      devicePixelRatio: 1,
      observedFps: 60,
      deviceMemoryGb: 16,
      saveData: false,
    });
    expect(low).toBe('bajo');
    expect(high).toBe('alto');
  });

  it('cambia el nivel de detalle según cámara, selección y FPS', () => {
    const far = computeLodLevel({ cameraZ: 6, profile: 'alto', observedFps: 60 });
    const near = computeLodLevel({ cameraZ: 3.2, profile: 'alto', observedFps: 60 });
    const selected = computeLodLevel({
      cameraZ: 5.5,
      selectedIndex: 3,
      profile: 'alto',
      observedFps: 60,
    });
    const stressed = computeLodLevel({
      cameraZ: 3.2,
      profile: 'alto',
      observedFps: 22,
    });
    expect(far).toBe(0);
    expect(near).toBe(3);
    expect(selected).toBeGreaterThanOrEqual(2);
    expect(stressed).toBe(0);
  });
});

describe('selectRenderableSubset', () => {
  it('reduce nodos/aristas en LOD bajo y conserva selección', () => {
    const view = makeView(200, 400, { groups: 12 });
    const limits = getProfileLimits('bajo');
    const subset = selectRenderableSubset(view, {
      lodLevel: 0,
      profileLimits: limits,
      selectedIndex: 150,
    });
    expect(subset.nodes.length).toBeLessThan(view.nodes.length);
    expect(subset.edges.length).toBeLessThanOrEqual(view.edges.length);
    expect(subset.nodes.some((node) => node.sourceIndex === 150)).toBe(true);
    expect(subset.simplified).toBe(true);
    expect(subset.reasons.length).toBeGreaterThan(0);
    expect(subset.sourceToRender.get(150)).toBeTypeOf('number');
  });

  it('en LOD 3 con presupuesto alto puede incluir toda la vista pequeña', () => {
    const view = makeView(40, 60);
    const subset = selectRenderableSubset(view, {
      lodLevel: 3,
      profileLimits: getProfileLimits('alto'),
      selectedIndex: -1,
    });
    expect(subset.nodes.length).toBe(40);
    expect(subset.edges.length).toBe(60);
  });
});

describe('progressiveRender', () => {
  it('procesa lotes y permite cancelación', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

    const items = Array.from({ length: 50 }, (_, index) => index);
    const seen = [];
    const token = createProgressToken();
    let cancel = () => {};

    await new Promise((resolve) => {
      cancel = runProgressiveBatches({
        items,
        batchSize: 5,
        budgetMs: 0,
        token,
        processBatch: (batch) => {
          seen.push(...batch);
          if (seen.length >= 5) {
            cancel();
            resolve();
          }
        },
        onComplete: resolve,
      });
    });

    const afterCancel = seen.length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(seen.length).toBe(afterCancel);
    expect(seen.length).toBeLessThan(50);
    expect(seen.length).toBeGreaterThanOrEqual(5);

    const token2 = bumpProgressToken(token);
    expect(token.cancelled).toBe(true);
    expect(token2.cancelled).toBe(false);

    const completed = [];
    await new Promise((resolve) => {
      runProgressiveBatches({
        items: [1, 2, 3, 4],
        batchSize: 2,
        budgetMs: 50,
        token: token2,
        processBatch: (batch) => completed.push(...batch),
        onComplete: resolve,
      });
    });
    expect(completed).toEqual([1, 2, 3, 4]);

    const monitor = createFpsMonitor(1);
    monitor.sample(0);
    monitor.sample(16);
    expect(monitor.fps).toBeGreaterThan(0);

    vi.unstubAllGlobals();
  });
});
