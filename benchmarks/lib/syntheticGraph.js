/**
 * Generador de grafos sintéticos compatibles con GRAPHIFY.json.
 * Determinista vía seed para reproducibilidad.
 */

const DENSITY_PRESETS = Object.freeze({
  sparse: { edgeFactor: 0.8, label: 'pocas relaciones', crossModuleRatio: 0.05 },
  medium: { edgeFactor: 3, label: 'densidad media', crossModuleRatio: 0.12 },
  dense: { edgeFactor: 8, label: 'muchas relaciones', crossModuleRatio: 0.2 },
  hierarchical: { edgeFactor: 3.5, label: 'grupos jerárquicos + cross-module', crossModuleRatio: 0.25 },
});

const KINDS = ['class', 'interface', 'method', 'function', 'file', 'config', 'endpoint', 'table'];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const ch of String(text)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function listDensityPresets() {
  return { ...DENSITY_PRESETS };
}

export function resolveScenario({
  nodes,
  density = 'medium',
  edges = null,
  modules = null,
  seed = null,
} = {}) {
  const nodeCount = Math.max(1, Number(nodes) || 1000);
  const preset = DENSITY_PRESETS[density] || DENSITY_PRESETS.medium;
  const edgeCount = edges != null
    ? Math.max(0, Number(edges))
    : Math.max(0, Math.round(nodeCount * preset.edgeFactor));
  const moduleCount = modules != null
    ? Math.max(1, Number(modules))
    : Math.max(4, Math.min(64, Math.round(Math.sqrt(nodeCount / 8))));
  const resolvedSeed = seed == null
    ? hashSeed(`${nodeCount}:${density}:${edgeCount}:${moduleCount}`)
    : Number(seed) >>> 0;

  return {
    nodeCount,
    edgeCount,
    moduleCount,
    density,
    densityLabel: preset.label,
    crossModuleRatio: preset.crossModuleRatio,
    seed: resolvedSeed,
  };
}

function nodeRecord(index, moduleCount, rand) {
  const moduleId = index % moduleCount;
  const packageId = Math.floor(index / Math.max(1, Math.floor(moduleCount / 2))) % 12;
  const kind = KINDS[index % KINDS.length];
  const file = `src/mod-${moduleId}/pkg-${packageId}/Component${index}.java`;
  return {
    id: `n${index}`,
    label: kind === 'method' ? `method_${index}` : `Type${index}`,
    type: kind,
    source_file: file,
    source_location: `L${10 + (index % 200)}-L${40 + (index % 200)}`,
    package: `com.bench.mod${moduleId}.pkg${packageId}`,
    module: `mod-${moduleId}`,
    tags: index % 17 === 0 ? ['hot', 'core'] : index % 23 === 0 ? ['legacy'] : undefined,
    metadata: index % 31 === 0 ? { owner: `team-${moduleId % 5}` } : undefined,
    // ruido determinista no usado por el layout
    _rand: rand(),
  };
}

function cleanNode(node) {
  const { _rand, tags, metadata, ...rest } = node;
  void _rand;
  const out = { ...rest };
  if (tags) out.tags = tags;
  if (metadata) out.metadata = metadata;
  return out;
}

/**
 * Genera el documento en memoria (solo para tamaños modestos).
 */
export function generateGraphDocument(options = {}) {
  const scenario = resolveScenario(options);
  const rand = mulberry32(scenario.seed);
  const nodes = Array.from({ length: scenario.nodeCount }, (_, index) => (
    cleanNode(nodeRecord(index, scenario.moduleCount, rand))
  ));

  const edges = [];
  const crossBudget = Math.floor(scenario.edgeCount * scenario.crossModuleRatio);
  const localBudget = scenario.edgeCount - crossBudget;

  for (let index = 0; index < localBudget; index += 1) {
    const source = index % scenario.nodeCount;
    const span = 1 + Math.floor(rand() * 12);
    const target = (source + span) % scenario.nodeCount;
    if (source === target) continue;
    edges.push({
      source: `n${source}`,
      target: `n${target}`,
      relation: index % 5 === 0 ? 'uses' : 'calls',
      confidence: index % 7 === 0 ? 'INFERRED' : 'EXTRACTED',
    });
  }

  for (let index = 0; index < crossBudget; index += 1) {
    const source = Math.floor(rand() * scenario.nodeCount);
    const sourceMod = source % scenario.moduleCount;
    let target = Math.floor(rand() * scenario.nodeCount);
    let guard = 0;
    while (target % scenario.moduleCount === sourceMod && guard < 8) {
      target = Math.floor(rand() * scenario.nodeCount);
      guard += 1;
    }
    if (source === target) continue;
    edges.push({
      source: `n${source}`,
      target: `n${target}`,
      relation: 'depends',
      confidence: 'EXTRACTED',
    });
  }

  return {
    scenario,
    document: {
      nodes,
      edges,
      meta: {
        generator: 'graphify-globe-benchmarks',
        version: 1,
        ...scenario,
      },
    },
  };
}

/**
 * Escribe GRAPHIFY.json de forma streaming (sin retener el documento completo).
 */
export async function writeGraphJsonStream(filePath, options = {}) {
  const fs = await import('node:fs');
  const scenario = resolveScenario(options);
  const rand = mulberry32(scenario.seed);
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });

  const write = (chunk) => new Promise((resolve, reject) => {
    if (stream.write(chunk)) resolve();
    else stream.once('drain', resolve);
    stream.once('error', reject);
  });

  await write('{\n  "meta": ');
  await write(JSON.stringify({
    generator: 'graphify-globe-benchmarks',
    version: 1,
    ...scenario,
  }, null, 2));
  await write(',\n  "nodes": [\n');

  for (let index = 0; index < scenario.nodeCount; index += 1) {
    const node = cleanNode(nodeRecord(index, scenario.moduleCount, rand));
    const prefix = index === 0 ? '    ' : ',\n    ';
    await write(prefix + JSON.stringify(node));
  }

  await write('\n  ],\n  "edges": [\n');

  let writtenEdges = 0;
  const pushEdge = async (edge) => {
    const prefix = writtenEdges === 0 ? '    ' : ',\n    ';
    await write(prefix + JSON.stringify(edge));
    writtenEdges += 1;
  };

  const crossBudget = Math.floor(scenario.edgeCount * scenario.crossModuleRatio);
  const localBudget = scenario.edgeCount - crossBudget;

  for (let index = 0; index < localBudget; index += 1) {
    const source = index % scenario.nodeCount;
    const span = 1 + Math.floor(rand() * 12);
    const target = (source + span) % scenario.nodeCount;
    if (source === target) continue;
    await pushEdge({
      source: `n${source}`,
      target: `n${target}`,
      relation: index % 5 === 0 ? 'uses' : 'calls',
      confidence: index % 7 === 0 ? 'INFERRED' : 'EXTRACTED',
    });
  }

  for (let index = 0; index < crossBudget; index += 1) {
    const source = Math.floor(rand() * scenario.nodeCount);
    const sourceMod = source % scenario.moduleCount;
    let target = Math.floor(rand() * scenario.nodeCount);
    let guard = 0;
    while (target % scenario.moduleCount === sourceMod && guard < 8) {
      target = Math.floor(rand() * scenario.nodeCount);
      guard += 1;
    }
    if (source === target) continue;
    await pushEdge({
      source: `n${source}`,
      target: `n${target}`,
      relation: 'depends',
      confidence: 'EXTRACTED',
    });
  }

  await write('\n  ]\n}\n');
  await new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.on('error', reject);
  });

  const stat = fs.statSync(filePath);
  return { scenario, bytes: stat.size, edgeCountWritten: writtenEdges, path: filePath };
}

/**
 * Escribe Graphify Globe Lines (.jsonl) streaming.
 */
export async function writeGraphJsonlStream(filePath, options = {}) {
  const fs = await import('node:fs');
  const scenario = resolveScenario(options);
  const rand = mulberry32(scenario.seed);
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });

  const write = (chunk) => new Promise((resolve, reject) => {
    if (stream.write(chunk)) resolve();
    else stream.once('drain', resolve);
    stream.once('error', reject);
  });

  await write(`# graphify-globe-lines seed=${scenario.seed} nodes=${scenario.nodeCount}\n`);

  for (let index = 0; index < scenario.nodeCount; index += 1) {
    const node = cleanNode(nodeRecord(index, scenario.moduleCount, rand));
    await write(`${JSON.stringify({ type: 'node', ...node })}\n`);
  }

  let writtenEdges = 0;
  const pushEdge = async (edge) => {
    await write(`${JSON.stringify({ type: 'edge', ...edge })}\n`);
    writtenEdges += 1;
  };

  const crossBudget = Math.floor(scenario.edgeCount * scenario.crossModuleRatio);
  const localBudget = scenario.edgeCount - crossBudget;

  for (let index = 0; index < localBudget; index += 1) {
    const source = index % scenario.nodeCount;
    const span = 1 + Math.floor(rand() * 12);
    const target = (source + span) % scenario.nodeCount;
    if (source === target) continue;
    await pushEdge({
      source: `n${source}`,
      target: `n${target}`,
      relation: index % 5 === 0 ? 'uses' : 'calls',
      confidence: index % 7 === 0 ? 'INFERRED' : 'EXTRACTED',
    });
  }

  for (let index = 0; index < crossBudget; index += 1) {
    const source = Math.floor(rand() * scenario.nodeCount);
    const sourceMod = source % scenario.moduleCount;
    let target = Math.floor(rand() * scenario.nodeCount);
    let guard = 0;
    while (target % scenario.moduleCount === sourceMod && guard < 8) {
      target = Math.floor(rand() * scenario.nodeCount);
      guard += 1;
    }
    if (source === target) continue;
    await pushEdge({
      source: `n${source}`,
      target: `n${target}`,
      relation: 'depends',
      confidence: 'EXTRACTED',
    });
  }

  await new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.on('error', reject);
  });

  const stat = fs.statSync(filePath);
  return { scenario, bytes: stat.size, edgeCountWritten: writtenEdges, path: filePath };
}

export const DEFAULT_SIZE_LADDER = Object.freeze([
  1_000,
  5_000,
  10_000,
  50_000,
  100_000,
  250_000,
  500_000,
]);

export const DEFAULT_DENSITIES = Object.freeze(['sparse', 'medium', 'dense', 'hierarchical']);
