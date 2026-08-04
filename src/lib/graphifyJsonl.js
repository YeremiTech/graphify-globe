import { CancelledError, GraphError } from "./graphErrors.js";
import { isObject } from "./graphValidation.js";
const JSONL_FORMAT_ID = "graphify-globe-lines";
const JSONL_FORMAT_VERSION = 1;
const BUNDLE_MANIFEST_SCHEMA = Object.freeze({
  format: "graphify-globe-bundle",
  version: 1,
  description: "Manifiesto que apunta a fragmentos JSONL por módulo. Pensado para preprocesamiento; el visor actual importa un único .jsonl o .json.",
  example: {
    format: "graphify-globe-bundle",
    version: 1,
    project: "mi-repo",
    nodes: [
      { path: "modules/auth.nodes.jsonl", count: 1200 },
      { path: "modules/billing.nodes.jsonl", count: 800 }
    ],
    edges: [
      { path: "modules/auth.edges.jsonl", count: 3400 },
      { path: "cross.edges.jsonl", count: 500 }
    ],
    index: {
      byId: "indexes/nodes-by-id.jsonl",
      byFile: "indexes/nodes-by-file.jsonl"
    }
  }
});
function classifyJsonlRecord(raw) {
  if (!isObject(raw)) return null;
  const explicit = String(raw.type || raw.t || "").toLowerCase();
  if (explicit === "node" || explicit === "vertex" || explicit === "entity") return "node";
  if (explicit === "edge" || explicit === "link" || explicit === "relationship" || explicit === "relation") {
    return "edge";
  }
  if (raw.source != null || raw.from != null || raw.target != null || raw.to != null) {
    return "edge";
  }
  if (raw.id != null || raw.label != null || raw.name != null) return "node";
  return null;
}
function stripTypeFields(record) {
  if (!isObject(record)) return record;
  const { type, t, ...rest } = record;
  void type;
  void t;
  return rest;
}
function splitCompleteLines(buffer) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer.charCodeAt(i) !== 10) continue;
    let line = buffer.slice(start, i);
    start = i + 1;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    lines.push(line);
  }
  return {
    lines,
    remainder: buffer.slice(start)
  };
}
async function ingestJsonlBlob(file, {
  signal,
  onProgress,
  batchSize = 400,
  maxPendingChars = 1.5 * 1024 * 1024
} = {}) {
  if (!file || typeof file.stream !== "function") {
    throw new GraphError({
      what: "El archivo JSONL no admite lectura por stream.",
      section: "jsonl",
      action: "Usa un File/Blob moderno en el navegador.",
      disposition: "rejected",
      code: "JSONL_NO_STREAM"
    });
  }
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";
  let lineNo = 0;
  let received = 0;
  const total = Math.max(1, Number(file.size) || 1);
  const nodes = [];
  const edges = [];
  let sinceYield = 0;
  const handleLine = async (line, { final = false } = {}) => {
    lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new GraphError({
        what: final ? `JSON truncado o inválido al final del archivo: ${error instanceof Error ? error.message : "parse error"}` : `JSON inválido en la línea ${lineNo}: ${error instanceof Error ? error.message : "parse error"}`,
        section: "jsonl",
        action: final ? "Verifica que el archivo no esté cortado y que cada línea sea JSON completo." : "Corrige la línea o regenera el .jsonl.",
        disposition: "rejected",
        code: final ? "JSONL_TRUNCATED" : "JSONL_LINE_INVALID",
        details: { line: lineNo }
      });
    }
    const kind = classifyJsonlRecord(parsed);
    if (!kind) {
      throw new GraphError({
        what: `No se pudo clasificar el registro de la línea ${lineNo}.`,
        section: "jsonl",
        action: 'Usa {"type":"node",...} o {"type":"edge",...}.',
        disposition: "rejected",
        code: "JSONL_UNKNOWN_RECORD",
        details: { line: lineNo }
      });
    }
    const record = stripTypeFields(parsed);
    if (kind === "node") nodes.push(record);
    else edges.push(record);
    sinceYield += 1;
    if (sinceYield >= batchSize) {
      sinceYield = 0;
      if (signal?.cancelled) throw new CancelledError();
      onProgress?.(
        Math.min(0.85, received / total * 0.85),
        `JSONL: ${nodes.length.toLocaleString("es")} nodos · ${edges.length.toLocaleString("es")} rel.…`,
        "processing"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  try {
    while (true) {
      if (signal?.cancelled) {
        try {
          await reader.cancel();
        } catch {
        }
        throw new CancelledError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > maxPendingChars) {
        throw new GraphError({
          what: "Línea JSONL excesivamente larga o archivo sin saltos de línea.",
          section: "jsonl",
          action: "Un objeto JSON por línea, o importa GRAPHIFY.json si es un JSON monolítico.",
          disposition: "rejected",
          code: "JSONL_LINE_TOO_LONG"
        });
      }
      const split = splitCompleteLines(buffer);
      buffer = split.remainder;
      for (const line of split.lines) {
        await handleLine(line);
      }
      onProgress?.(Math.min(0.8, received / total * 0.8), "Leyendo JSONL…", "reading");
    }
    buffer += decoder.decode();
    if (buffer.length) {
      await handleLine(buffer, { final: true });
      buffer = "";
    }
  } finally {
    reader.releaseLock?.();
    buffer = "";
  }
  if (!nodes.length) {
    throw new GraphError({
      what: "El JSONL no contiene nodos.",
      section: "jsonl",
      action: 'Incluye líneas {"type":"node",...}.',
      disposition: "rejected",
      code: "JSONL_EMPTY_NODES"
    });
  }
  onProgress?.(0.88, "Validando registros JSONL…", "validating");
  return {
    document: { nodes, edges },
    nodeCount: nodes.length,
    edgeCount: edges.length,
    bytesRead: received
  };
}
function traditionalToJsonlText(doc) {
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc?.edges) ? doc.edges : [];
  const lines = [];
  for (const node of nodes) {
    lines.push(JSON.stringify({ type: "node", ...node }));
  }
  for (const edge of edges) {
    lines.push(JSON.stringify({ type: "edge", ...edge }));
  }
  return `${lines.join("\n")}
`;
}
export {
  BUNDLE_MANIFEST_SCHEMA,
  JSONL_FORMAT_ID,
  JSONL_FORMAT_VERSION,
  classifyJsonlRecord,
  ingestJsonlBlob,
  splitCompleteLines,
  stripTypeFields,
  traditionalToJsonlText
};
