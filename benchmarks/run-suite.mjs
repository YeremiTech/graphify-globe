#!/usr/bin/env node
/**
 * Suite reproducible de benchmarks del pipeline (Node).
 *
 * Por defecto (smoke, seguro para CI/dev):
 *   node benchmarks/run-suite.mjs
 *   → 1k + 5k · density medium · sin escribir archivos enormes
 *
 * Ladder completo (puede agotar RAM; no se ejecuta en CI):
 *   node benchmarks/run-suite.mjs --full
 *
 * Personalizado:
 *   node benchmarks/run-suite.mjs --sizes 1000,5000,10000 --densities sparse,medium,hierarchical
 *   node benchmarks/run-suite.mjs --sizes 50000 --write-files --format json
 *
 * Con GC:
 *   node --expose-gc benchmarks/run-suite.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DENSITIES,
  DEFAULT_SIZE_LADDER,
  generateGraphDocument,
  writeGraphJsonStream,
} from './lib/syntheticGraph.js';
import { rowsToMarkdownMatrix, runPipelineBenchmark } from './lib/pipelineBench.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'benchmarks', 'results');
const GENERATED_DIR = path.join(ROOT, 'benchmarks', 'generated');

function parseArgs(argv) {
  const args = {
    sizes: [1_000, 5_000],
    densities: ['medium'],
    full: false,
    writeFiles: false,
    format: 'json',
    keepFiles: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--full') {
      args.full = true;
      args.sizes = [...DEFAULT_SIZE_LADDER];
      args.densities = ['sparse', 'medium', 'hierarchical'];
    } else if (key === '--sizes') {
      args.sizes = next.split(',').map((value) => Number(value.trim())).filter(Boolean);
      i += 1;
    } else if (key === '--densities') {
      args.densities = next.split(',').map((value) => value.trim()).filter(Boolean);
      i += 1;
    } else if (key === '--write-files') {
      args.writeFiles = true;
    } else if (key === '--keep-files') {
      args.keepFiles = true;
    } else if (key === '--format') {
      args.format = next;
      i += 1;
    } else if (key === '--out') {
      args.out = next;
      i += 1;
    } else if (key === '--help' || key === '-h') {
      args.help = true;
    }
  }
  return args;
}

function categoryBucket(nodeCount) {
  if (nodeCount < 10_000) return 'Pequeño';
  if (nodeCount < 100_000) return 'Mediano';
  if (nodeCount < 500_000) return 'Grande';
  return 'Masivo';
}

async function runCase({ nodes, density, writeFiles, keepFiles, format }) {
  const label = `${categoryBucket(nodes)} · ${density}`;
  console.log(`\n=== ${label} · ${nodes} nodos ===`);

  let filePath = null;
  let document = null;

  try {
    if (writeFiles || nodes >= 50_000) {
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
      filePath = path.join(GENERATED_DIR, `bench-${nodes}-${density}.${format === 'jsonl' ? 'jsonl' : 'json'}`);
      console.log(`  escribiendo ${filePath}…`);
      const written = await writeGraphJsonStream(filePath, { nodes, density });
      console.log(`  archivo ${written.bytes} bytes`);
      const row = await runPipelineBenchmark({
        filePath,
        format: 'json',
        label: `${label}`,
      });
      row.density = density;
      row.generator = written.scenario;
      if (!keepFiles && filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        row.notes = [...(row.notes || []), 'Archivo temporal eliminado tras el bench.'];
      }
      return row;
    }

    const generated = generateGraphDocument({ nodes, density });
    document = generated.document;
    const row = await runPipelineBenchmark({
      document,
      format: 'json',
      label: `${label}`,
    });
    row.density = density;
    row.generator = generated.scenario;
    return row;
  } catch (error) {
    return {
      label,
      density,
      scenario: { nodeCount: nodes },
      format,
      error: { message: error.message, name: error.name },
      crashed: true,
      category: 'No soportado',
      timings: {},
      view: {},
      notes: ['Fallo antes de completar el pipeline.'],
    };
  }
}

function printHelp() {
  console.log(`Uso:
  node benchmarks/run-suite.mjs
  node benchmarks/run-suite.mjs --full
  node benchmarks/run-suite.mjs --sizes 1000,5000,10000 --densities sparse,medium,hierarchical
  node --expose-gc benchmarks/run-suite.mjs --sizes 50000 --write-files

Densidades: ${DEFAULT_DENSITIES.join(', ')}
Ladder completo: ${DEFAULT_SIZE_LADDER.join(', ')}

Importante: los resultados del ladder completo SOLO son válidos si se ejecutan en tu máquina.
No declares soporte sin haber corrido el tamaño correspondiente.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const rows = [];

  for (const density of args.densities) {
    for (const nodes of args.sizes) {
      const row = await runCase({
        nodes,
        density,
        writeFiles: args.writeFiles || args.full,
        keepFiles: args.keepFiles,
        format: args.format,
      });
      rows.push(row);
      if (row.error) {
        console.log(`  FALLO: ${row.error.message}`);
      } else {
        console.log(
          `  OK ${row.category} · 1ª vista ${row.timings.firstVisualizationMs} ms · vista ${row.view.renderedNodes}/${row.view.renderedEdges} · heap ${row.memory?.afterView?.heapUsedMb ?? '—'} MB`,
        );
      }
    }
  }

  const stamp = startedAt.replace(/[:.]/g, '-');
  const jsonPath = path.resolve(ROOT, args.out || path.join('benchmarks', 'results', `suite-${stamp}.json`));
  const mdPath = jsonPath.replace(/\.json$/i, '.md');

  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpus: (await import('node:os')).cpus()?.length,
      totalMemGb: Number(((await import('node:os')).totalmem() / (1024 ** 3)).toFixed(2)),
    },
    args,
    disclaimer:
      'Estos números solo aplican a este host/runtime. No generalizar a “soportado” sin repetir el escenario.',
    rows,
    matrixMarkdown: rowsToMarkdownMatrix(rows),
  };

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(mdPath, `# Benchmark suite ${startedAt}

Host: ${payload.host.platform}/${payload.host.arch} · Node ${payload.host.node} · RAM ${payload.host.totalMemGb} GB · CPUs ${payload.host.cpus}

${payload.disclaimer}

## Matriz

${payload.matrixMarkdown}

## Notas

- FPS / navegadores no se miden en este runner. Ver \`docs/BENCHMARKS.md\`.
- \`normalizationMs\` está incluido en \`indexingMs\`.
- Fallos se listan explícitamente en la columna Resultado.
`);

  console.log(`\nResultados: ${jsonPath}`);
  console.log(`Matriz:     ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
