#!/usr/bin/env node
/**
 * Genera GRAPHIFY.json / .jsonl sintéticos sin commitearlos.
 *
 * Ejemplos:
 *   node benchmarks/generate-graph.mjs --nodes 5000 --density medium
 *   node benchmarks/generate-graph.mjs --nodes 100000 --density hierarchical --format jsonl
 *   node benchmarks/generate-graph.mjs --ladder --density medium --format json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DENSITIES,
  DEFAULT_SIZE_LADDER,
  writeGraphJsonlStream,
  writeGraphJsonStream,
} from './lib/syntheticGraph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'benchmarks', 'generated');

function parseArgs(argv) {
  const args = {
    nodes: null,
    density: 'medium',
    format: 'json',
    out: null,
    ladder: false,
    densities: null,
    seed: null,
    edges: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--nodes') { args.nodes = Number(next); i += 1; }
    else if (key === '--density') { args.density = next; i += 1; }
    else if (key === '--format') { args.format = next; i += 1; }
    else if (key === '--out') { args.out = next; i += 1; }
    else if (key === '--seed') { args.seed = Number(next); i += 1; }
    else if (key === '--edges') { args.edges = Number(next); i += 1; }
    else if (key === '--ladder') { args.ladder = true; }
    else if (key === '--densities') { args.densities = next.split(',').map((s) => s.trim()); i += 1; }
    else if (key === '--help' || key === '-h') { args.help = true; }
  }
  return args;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

async function generateOne({ nodes, density, format, out, seed, edges }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ext = format === 'jsonl' ? 'jsonl' : 'json';
  const fileName = out
    || path.join(OUT_DIR, `synthetic-${nodes}-${density}.${ext}`);
  const absolute = path.isAbsolute(fileName) ? fileName : path.resolve(ROOT, fileName);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });

  const writer = format === 'jsonl' ? writeGraphJsonlStream : writeGraphJsonStream;
  const started = performance.now();
  const result = await writer(absolute, { nodes, density, seed, edges });
  const ms = performance.now() - started;
  return {
    ...result,
    ms,
    humanSize: formatBytes(result.bytes),
  };
}

function printHelp() {
  console.log(`Uso:
  node benchmarks/generate-graph.mjs --nodes <N> [--density sparse|medium|dense|hierarchical]
                                      [--format json|jsonl] [--out path] [--seed N]

  node benchmarks/generate-graph.mjs --ladder [--densities medium,sparse] [--format json]

Los archivos se escriben en benchmarks/generated/ (gitignored).
Tamaños del ladder: ${DEFAULT_SIZE_LADDER.join(', ')}
Densidades: ${DEFAULT_DENSITIES.join(', ')}
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.ladder) {
    const densities = args.densities || ['medium'];
    const results = [];
    for (const density of densities) {
      for (const nodes of DEFAULT_SIZE_LADDER) {
        console.log(`Generando ${nodes} nodos · ${density} · ${args.format}…`);
        const result = await generateOne({
          nodes,
          density,
          format: args.format,
          seed: args.seed,
        });
        console.log(`  → ${result.path} (${result.humanSize}, ${result.ms.toFixed(0)} ms, edges≈${result.edgeCountWritten})`);
        results.push(result);
      }
    }
    const manifestPath = path.join(OUT_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      results: results.map((item) => ({
        path: item.path,
        bytes: item.bytes,
        scenario: item.scenario,
        edgeCountWritten: item.edgeCountWritten,
        generateMs: item.ms,
      })),
    }, null, 2)}\n`);
    console.log(`Manifest: ${manifestPath}`);
    return;
  }

  if (!args.nodes) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  console.log(`Generando ${args.nodes} nodos · ${args.density} · ${args.format}…`);
  const result = await generateOne(args);
  console.log(JSON.stringify({
    path: result.path,
    bytes: result.bytes,
    humanSize: result.humanSize,
    generateMs: Number(result.ms.toFixed(1)),
    scenario: result.scenario,
    edgeCountWritten: result.edgeCountWritten,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
