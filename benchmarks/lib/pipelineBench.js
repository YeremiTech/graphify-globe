/**
 * Medición del pipeline CPU (Node): lectura → parse → validación → índice → vista → búsqueda → expand → release.
 * No mide FPS de WebGL (ver harness de navegador / protocolo manual).
 */

import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseJsonText, validateGraphDocument } from '../../src/lib/graphValidation.js';
import { buildIndexedGraph, buildStats, releaseIndexedGraph, searchIndexed } from '../../src/lib/indexedGraph.js';
import {
  buildHierarchy,
  createHierarchyNav,
  expandNavToGroup,
  releaseHierarchy,
  selectSceneView,
} from '../../src/lib/hierarchy.js';

const DEFAULT_LIMITS = {
  maxNodes: 900,
  maxEdges: 2400,
  maxAnimatedEdges: 42,
};

function memSnapshot() {
  const usage = process.memoryUsage();
  return {
    heapUsedMb: Number((usage.heapUsed / (1024 * 1024)).toFixed(2)),
    rssMb: Number((usage.rss / (1024 * 1024)).toFixed(2)),
    externalMb: Number((usage.external / (1024 * 1024)).toFixed(2)),
  };
}

async function timeAsync(fn) {
  const start = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - start };
}

function timeSync(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

function classifyOutcome(row) {
  if (row.error || row.crashed) return 'No soportado';
  const nodes = row.scenario?.nodeCount || 0;
  const format = row.format || 'json';
  const firstViewMs = row.timings?.firstVisualizationMs;
  const indexMs = row.timings?.indexingMs;

  if (format === 'json' && nodes >= 250_000) {
    return firstViewMs != null && firstViewMs < 120_000
      ? 'Experimental'
      : 'No soportado';
  }
  if (format === 'json' && nodes >= 100_000) {
    return firstViewMs != null && firstViewMs < 60_000
      ? 'Soportado con degradación'
      : 'Experimental';
  }
  if (nodes >= 50_000) {
    return row.view?.hierarchyActive
      ? 'Soportado con degradación'
      : 'Soportado con degradación';
  }
  if (firstViewMs != null && firstViewMs < 15_000 && indexMs != null && indexMs < 10_000) {
    return 'Soportado';
  }
  if (firstViewMs != null) return 'Soportado con degradación';
  return 'Experimental';
}

/**
 * Ejecuta un benchmark de pipeline sobre un archivo o documento en memoria.
 */
export async function runPipelineBenchmark({
  filePath = null,
  document = null,
  format = 'json',
  limits = DEFAULT_LIMITS,
  label = '',
  skipSearch = false,
  skipExpand = false,
} = {}) {
  const row = {
    label,
    format,
    filePath,
    startedAt: new Date().toISOString(),
    env: {
      runtime: 'node',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryLimitHintMb: Number(process.env.BENCH_MEMORY_HINT_MB) || null,
    },
    timings: {},
    memory: {},
    view: {},
    search: {},
    expand: {},
    error: null,
    crashed: false,
    notes: [],
  };

  let text = null;
  let raw = document;
  let indexed = null;
  let hierarchy = null;
  let nav = null;
  let view = null;

  try {
    if (filePath) {
      const read = await timeAsync(async () => fs.promises.readFile(filePath, 'utf8'));
      text = read.value;
      row.fileBytes = Buffer.byteLength(text, 'utf8');
      row.timings.readMs = Number(read.ms.toFixed(2));
      row.memory.afterRead = memSnapshot();
    } else if (document) {
      const serialize = timeSync(() => JSON.stringify(document));
      text = serialize.value;
      row.fileBytes = Buffer.byteLength(text, 'utf8');
      row.timings.serializeMs = Number(serialize.ms.toFixed(2));
      row.notes.push('Documento generado en memoria (sin archivo previo).');
    } else {
      throw new Error('Se requiere filePath o document');
    }

    if (format === 'jsonl') {
      row.notes.push('JSONL: el runner Node usa convertidor a documento para medir el pipeline de índice; no sustituye el ingest streaming del worker.');
      if (!raw) {
        // Parse línea a línea mínimo para obtener documento.
        const parseJsonl = timeSync(() => {
          const nodes = [];
          const edges = [];
          for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const item = JSON.parse(trimmed);
            if (item.type === 'edge' || item.source != null) {
              const { type, ...rest } = item;
              void type;
              edges.push(rest);
            } else {
              const { type, ...rest } = item;
              void type;
              nodes.push(rest);
            }
          }
          return { nodes, edges };
        });
        raw = parseJsonl.value;
        row.timings.parseMs = Number(parseJsonl.ms.toFixed(2));
      }
    } else {
      const parse = timeSync(() => parseJsonText(text));
      raw = parse.value;
      row.timings.parseMs = Number(parse.ms.toFixed(2));
      row.memory.afterParse = memSnapshot();
      // Liberar texto lo antes posible.
      text = null;
    }

    const validate = timeSync(() => validateGraphDocument(raw));
    const validated = validate.value;
    row.timings.validationMs = Number(validate.ms.toFixed(2));
    row.scenario = {
      nodeCount: validated.totalNodes,
      edgeCount: validated.totalEdges,
      validNodes: validated.nodeById?.size,
    };
    raw = null;

    const normalizeNoteStart = performance.now();
    // buildIndexedGraph incluye normalización de campos + indexación.
    const index = timeSync(() => buildIndexedGraph(validated));
    indexed = index.value;
    row.timings.normalizationAndIndexingMs = Number(index.ms.toFixed(2));
    row.timings.indexingMs = row.timings.normalizationAndIndexingMs;
    row.timings.normalizationMs = null;
    row.notes.push('normalizationMs no está instrumentado por separado: incluido en indexingMs (buildIndexedGraph).');
    row.memory.afterIndex = memSnapshot();
    void normalizeNoteStart;

    const hierarchyBuild = timeSync(() => buildHierarchy(indexed));
    hierarchy = hierarchyBuild.value;
    nav = createHierarchyNav(indexed, hierarchy);
    row.timings.hierarchyMs = Number(hierarchyBuild.ms.toFixed(2));

    const viewBuild = timeSync(() => selectSceneView(indexed, hierarchy, nav, limits));
    view = viewBuild.value;
    let stats = buildStats(indexed, view);
    row.timings.firstVisualizationMs = Number((
      (row.timings.readMs || 0)
      + (row.timings.parseMs || 0)
      + (row.timings.validationMs || 0)
      + (row.timings.indexingMs || 0)
      + (row.timings.hierarchyMs || 0)
      + viewBuild.ms
    ).toFixed(2));
    row.timings.viewSelectMs = Number(viewBuild.ms.toFixed(2));
    row.view = {
      renderedNodes: view.nodes.length,
      renderedEdges: view.edges.length,
      hierarchyActive: Boolean(view.hierarchyActive),
      mode: view.mode,
      tier: view.tier,
      indexedNodes: stats.indexedNodes,
      foundNodes: stats.foundNodes,
      foundEdges: stats.foundEdges,
      groupedNodes: stats.groupedNodes,
    };

    if (!skipExpand && hierarchy && nav?.mode === 'hierarchy' && hierarchy.roots?.length) {
      const groupId = hierarchy.roots[0];
      const expand = timeSync(() => {
        const nextNav = expandNavToGroup(nav, hierarchy, groupId);
        return selectSceneView(indexed, hierarchy, nextNav, limits);
      });
      row.timings.expandGroupMs = Number(expand.ms.toFixed(2));
      row.expand = {
        groupId,
        renderedNodes: expand.value.nodes.length,
        renderedEdges: expand.value.edges.length,
      };
      // La matriz de render usa la vista expandida (más representativa que solo la raíz).
      row.view.renderedNodes = expand.value.nodes.length;
      row.view.renderedEdges = expand.value.edges.length;
      row.view.context = 'after-first-group-expand';
      stats = buildStats(indexed, expand.value);
      row.view.groupedNodes = stats.groupedNodes;
    } else {
      row.notes.push('expandGroup omitido (modo flat o sin raíces).');
    }

    row.timings.stabilizationMs = row.timings.firstVisualizationMs;
    row.notes.push('stabilizationMs (Node) ≈ firstVisualizationMs; en navegador incluye FPS estable.');
    row.memory.afterView = memSnapshot();

    if (!skipSearch) {
      const term = indexed.labels[Math.min(3, indexed.nodeCount - 1)] || 'Type';
      const search = timeSync(() => searchIndexed(indexed, term, { limit: 18 }));
      row.timings.searchMs = Number(search.ms.toFixed(2));
      row.search = {
        query: term,
        resultCount: search.value.length,
      };
    }

    const release = timeSync(() => {
      releaseHierarchy(hierarchy);
      releaseIndexedGraph(indexed);
      indexed = null;
      hierarchy = null;
      nav = null;
      view = null;
    });
    row.timings.releaseMs = Number(release.ms.toFixed(2));
    row.memory.afterRelease = memSnapshot();

    if (global.gc) {
      global.gc();
      row.memory.afterGc = memSnapshot();
      row.notes.push('GC forzado (--expose-gc).');
    }
  } catch (error) {
    row.error = {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      code: error?.code || null,
    };
    row.crashed = /out of memory|heap|allocation|invalid string length/i.test(String(error?.message || ''));
    try {
      if (hierarchy) releaseHierarchy(hierarchy);
      if (indexed) releaseIndexedGraph(indexed);
    } catch {
      // ignore
    }
  }

  row.category = classifyOutcome(row);
  row.finishedAt = new Date().toISOString();
  return row;
}

export function rowsToMarkdownMatrix(rows) {
  const header = '| Categoría | Nodos | Relaciones | Formato | Lectura (ms) | Parse (ms) | Validación (ms) | Indexación (ms) | 1ª vista (ms) | Render nodos | Render rel. | Búsqueda (ms) | Resultado |';
  const sep = '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |';
  const lines = [header, sep];
  for (const row of rows) {
    const nodes = row.scenario?.nodeCount ?? row.view?.foundNodes ?? '—';
    const edges = row.scenario?.edgeCount ?? row.view?.foundEdges ?? '—';
    lines.push([
      row.label || row.density || '—',
      nodes,
      edges,
      row.format || 'json',
      row.timings?.readMs ?? '—',
      row.timings?.parseMs ?? '—',
      row.timings?.validationMs ?? '—',
      row.timings?.indexingMs ?? '—',
      row.timings?.firstVisualizationMs ?? '—',
      row.view?.renderedNodes ?? '—',
      row.view?.renderedEdges ?? '—',
      row.timings?.searchMs ?? '—',
      row.error ? `FALLO: ${row.error.message}` : row.category,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  return `${lines.join('\n')}\n`;
}

export { DEFAULT_LIMITS };
