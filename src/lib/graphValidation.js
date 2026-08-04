import { GraphError } from "./graphErrors.js";
const VALIDATION_LIMITS = Object.freeze({
  MAX_STRING_LENGTH: 8e3,
  MAX_ID_LENGTH: 2048,
  MAX_DEPTH: 12,
  MAX_WARNINGS: 40,
  MAX_ORPHAN_SAMPLE: 8,
  MAX_DUPLICATE_SAMPLE: 8
});
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function firstValue(object, keys) {
  for (const key of keys) {
    const parts = key.split(".");
    let current = object;
    let valid = true;
    for (const part of parts) {
      if (!isObject(current) && !Array.isArray(current)) {
        valid = false;
        break;
      }
      current = current?.[part];
    }
    if (valid && current !== void 0 && current !== null && current !== "") return current;
  }
  return void 0;
}
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (isObject(value)) {
    return Object.entries(value).map(
      ([key, item]) => isObject(item) && item.id === void 0 ? { ...item, id: key } : item
    );
  }
  return [];
}
function flattenEntity(entity) {
  if (!isObject(entity)) return entity;
  const nested = [entity.data, entity.properties, entity.attributes].filter(isObject);
  return Object.assign({}, entity, ...nested);
}
function findGraphArrays(raw) {
  const nodeCandidates = [
    raw?.nodes,
    raw?.graph?.nodes,
    raw?.data?.nodes,
    raw?.elements?.nodes,
    raw?.vertices,
    raw?.entities,
    raw?.items?.nodes
  ];
  const edgeCandidates = [
    raw?.edges,
    raw?.links,
    raw?.relationships,
    raw?.relations,
    raw?.graph?.edges,
    raw?.graph?.links,
    raw?.graph?.relationships,
    raw?.data?.edges,
    raw?.data?.links,
    raw?.elements?.edges,
    raw?.elements?.relationships,
    raw?.items?.edges
  ];
  const nodes = nodeCandidates.map(asArray).find((items) => items.length > 0) || [];
  const edges = edgeCandidates.map(asArray).find((items) => items.length > 0) || [];
  if (nodes.length) return { nodes, edges, source: "named-collections" };
  if (Array.isArray(raw)) {
    const probableNodes = raw.filter((item) => {
      const flat = flattenEntity(item);
      return firstValue(flat, ["source", "target", "from", "to"]) === void 0;
    });
    const probableEdges = raw.filter((item) => {
      const flat = flattenEntity(item);
      return firstValue(flat, ["source", "target", "from", "to"]) !== void 0;
    });
    return { nodes: probableNodes, edges: probableEdges, source: "mixed-array" };
  }
  return { nodes: [], edges: [], source: "none" };
}
function measureDepth(value, depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
  if (depth > VALIDATION_LIMITS.MAX_DEPTH) return depth;
  if (value === null || typeof value !== "object") return depth;
  if (seen.has(value)) return depth;
  seen.add(value);
  let max = depth;
  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const child of entries) {
    max = Math.max(max, measureDepth(child, depth + 1, seen));
    if (max > VALIDATION_LIMITS.MAX_DEPTH) return max;
  }
  return max;
}
function assertFiniteNumber(value, section, label) {
  if (typeof value !== "number") return;
  if (!Number.isFinite(value)) {
    throw new GraphError({
      what: `Se encontró un número no finito (${label}=${value}).`,
      section,
      action: "Sustituye NaN/Infinity por valores numéricos válidos o elimina la propiedad.",
      disposition: "rejected",
      code: "NON_FINITE_NUMBER"
    });
  }
}
function scanValue(value, path, warnings, limits = VALIDATION_LIMITS) {
  if (value === void 0) return;
  if (typeof value === "string") {
    if (value.length > limits.MAX_STRING_LENGTH) {
      throw new GraphError({
        what: `Una cadena supera el límite de ${limits.MAX_STRING_LENGTH} caracteres.`,
        section: path,
        action: "Acorta el texto o mueve el contenido largo fuera del GRAPHIFY.json.",
        disposition: "rejected",
        code: "STRING_TOO_LONG",
        details: { length: value.length, path }
      });
    }
    return;
  }
  if (typeof value === "number") {
    assertFiniteNumber(value, path, path);
    return;
  }
  if (value === null) {
    warnings.push({
      code: "UNEXPECTED_NULL",
      section: path,
      message: `Valor nulo en ${path}. Se ignorará o se sustituirá por un valor seguro.`
    });
    return;
  }
  if (typeof value !== "object") return;
  const depth = measureDepth(value);
  if (depth > limits.MAX_DEPTH) {
    throw new GraphError({
      what: `La estructura anidada supera ${limits.MAX_DEPTH} niveles de profundidad.`,
      section: path,
      action: "Aplana metadatos anidados en el exportador de Graphify.",
      disposition: "rejected",
      code: "STRUCTURE_TOO_DEEP",
      details: { depth, path }
    });
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      scanValue(child, `${path}[${index}]`, warnings, limits);
    });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    scanValue(child, path ? `${path}.${key}` : key, warnings, limits);
  }
}
function parseJsonText(text) {
  if (text == null || String(text).trim() === "") {
    throw new GraphError({
      what: "El archivo está vacío.",
      section: "archivo",
      action: "Selecciona un GRAPHIFY.json generado por Graphify con nodos y relaciones.",
      disposition: "rejected",
      code: "EMPTY_FILE"
    });
  }
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new GraphError({
      what: `JSON inválido: ${error instanceof Error ? error.message : "no se pudo analizar"}.`,
      section: "JSON raíz",
      action: "Corrige la sintaxis del archivo (comas, comillas o llaves) e impórtalo de nuevo.",
      disposition: "rejected",
      code: "INVALID_JSON"
    });
  }
  if (raw === null || typeof raw !== "object" && !Array.isArray(raw)) {
    throw new GraphError({
      what: "La raíz del JSON debe ser un objeto o un arreglo.",
      section: "JSON raíz",
      action: "Exporta de nuevo desde Graphify o envuelve nodos/edges en un objeto.",
      disposition: "rejected",
      code: "INVALID_ROOT"
    });
  }
  return raw;
}
function resolveNodeId(node, index) {
  const candidate = firstValue(node, [
    "id",
    "elementId",
    "identity",
    "key",
    "uid",
    "qualified_name",
    "name",
    "label"
  ]);
  if (candidate === void 0 || candidate === null || candidate === "") {
    return { id: `node-${index}`, usedFallback: true };
  }
  if (typeof candidate === "number" && !Number.isFinite(candidate)) {
    throw new GraphError({
      what: "Un identificador de nodo no es un número finito.",
      section: `nodes[${index}].id`,
      action: "Usa identificadores string o enteros finitos.",
      disposition: "rejected",
      code: "INVALID_NODE_ID"
    });
  }
  const id = String(candidate);
  if (!id.trim()) {
    return { id: `node-${index}`, usedFallback: true };
  }
  if (id.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    throw new GraphError({
      what: `Un identificador de nodo supera ${VALIDATION_LIMITS.MAX_ID_LENGTH} caracteres.`,
      section: `nodes[${index}].id`,
      action: "Acorta los IDs en el exportador.",
      disposition: "rejected",
      code: "ID_TOO_LONG"
    });
  }
  return { id, usedFallback: false };
}
function resolveEndpointId(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "string" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) return "";
    return String(value);
  }
  if (isObject(value)) {
    return String(
      firstValue(value, ["id", "elementId", "identity", "key", "data.id", "properties.id", "label"]) || ""
    );
  }
  return String(value);
}
function validateGraphDocument(raw, options = {}) {
  const limits = { ...VALIDATION_LIMITS, ...options.limits };
  const warnings = [];
  const pushWarning = (warning) => {
    if (warnings.length < limits.MAX_WARNINGS) warnings.push(warning);
  };
  if (raw === null || typeof raw !== "object" && !Array.isArray(raw)) {
    throw new GraphError({
      what: "Estructura raíz inválida.",
      section: "JSON raíz",
      action: "El archivo debe contener un objeto con nodos/edges o un arreglo de entidades.",
      disposition: "rejected",
      code: "INVALID_ROOT"
    });
  }
  scanValue(raw, "raíz", warnings, limits);
  const extracted = findGraphArrays(raw);
  if (!extracted.nodes.length) {
    throw new GraphError({
      what: "No se encontró un arreglo de nodos.",
      section: "nodes / graph.nodes / vertices",
      action: "Asegúrate de que GRAPHIFY.json incluya una colección de nodos reconocible.",
      disposition: "rejected",
      code: "MISSING_NODES"
    });
  }
  if (!Array.isArray(extracted.nodes)) {
    throw new GraphError({
      what: "La colección de nodos no es un arreglo.",
      section: "nodes",
      action: "Exporta los nodos como un array JSON.",
      disposition: "rejected",
      code: "NODES_NOT_ARRAY"
    });
  }
  const edgeList = Array.isArray(extracted.edges) ? extracted.edges : [];
  if (!Array.isArray(extracted.edges) && extracted.edges != null && extracted.source === "named-collections") {
    pushWarning({
      code: "EDGES_DEFAULT_EMPTY",
      section: "edges",
      message: "No se encontró un arreglo de relaciones. Se usará una lista vacía."
    });
  }
  const flatNodes = [];
  const idCounts = /* @__PURE__ */ new Map();
  const nodeById = /* @__PURE__ */ new Map();
  extracted.nodes.forEach((entry, index) => {
    if (entry == null) {
      throw new GraphError({
        what: "Hay un nodo nulo o indefinido.",
        section: `nodes[${index}]`,
        action: "Elimina entradas nulas del arreglo de nodos.",
        disposition: "rejected",
        code: "NULL_NODE"
      });
    }
    if (!isObject(entry) && typeof entry !== "object") {
      throw new GraphError({
        what: "Un nodo tiene un tipo de dato incorrecto.",
        section: `nodes[${index}]`,
        action: "Cada nodo debe ser un objeto JSON.",
        disposition: "rejected",
        code: "INVALID_NODE_TYPE"
      });
    }
    const flat = flattenEntity(entry);
    const { id, usedFallback } = resolveNodeId(flat, index);
    if (usedFallback) {
      pushWarning({
        code: "MISSING_NODE_ID",
        section: `nodes[${index}]`,
        message: `Nodo sin id explícito; se asignó “${id}”.`
      });
    }
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
    if (!nodeById.has(id)) {
      nodeById.set(id, { raw: flat, id, originalIndex: index, degree: 0 });
      flatNodes.push(flat);
    }
  });
  const duplicates = [...idCounts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length) {
    const sample = duplicates.slice(0, limits.MAX_DUPLICATE_SAMPLE).map(([id, count]) => `“${id}”×${count}`).join(", ");
    throw new GraphError({
      what: `Hay identificadores de nodo duplicados (${duplicates.length}). Ejemplo: ${sample}.`,
      section: "nodes[].id",
      action: "Haz únicos los IDs en Graphify y vuelve a exportar.",
      disposition: "rejected",
      code: "DUPLICATE_NODE_ID",
      details: { duplicates: duplicates.slice(0, limits.MAX_DUPLICATE_SAMPLE) }
    });
  }
  const acceptedEdges = [];
  let orphanCount = 0;
  let incompleteCount = 0;
  let selfLoopCount = 0;
  const orphanSample = [];
  edgeList.forEach((entry, index) => {
    if (entry == null) {
      incompleteCount += 1;
      pushWarning({
        code: "NULL_EDGE",
        section: `edges[${index}]`,
        message: "Relación nula omitida."
      });
      return;
    }
    if (!isObject(entry) && typeof entry !== "object") {
      incompleteCount += 1;
      pushWarning({
        code: "INVALID_EDGE_TYPE",
        section: `edges[${index}]`,
        message: "Relación con tipo incorrecto omitida."
      });
      return;
    }
    const flat = flattenEntity(entry);
    const source = resolveEndpointId(
      firstValue(flat, ["source", "from", "start", "startNode", "sourceId", "source_id", "outV"])
    );
    const target = resolveEndpointId(
      firstValue(flat, ["target", "to", "end", "endNode", "targetId", "target_id", "inV"])
    );
    if (!source || !target) {
      incompleteCount += 1;
      pushWarning({
        code: "MISSING_EDGE_ENDPOINT",
        section: `edges[${index}]`,
        message: "Relación sin origen o destino válidos; se omitió."
      });
      return;
    }
    if (source === target) {
      selfLoopCount += 1;
      pushWarning({
        code: "SELF_LOOP",
        section: `edges[${index}]`,
        message: `Bucle omitido (${source} → ${target}).`
      });
      return;
    }
    if (!nodeById.has(source) || !nodeById.has(target)) {
      orphanCount += 1;
      if (orphanSample.length < limits.MAX_ORPHAN_SAMPLE) {
        orphanSample.push(`${source} → ${target}`);
      }
      return;
    }
    const relation = String(
      firstValue(flat, ["relation", "type", "label", "name", "kind"]) || "related"
    );
    const confidence = String(
      firstValue(flat, ["confidence", "certainty", "origin"]) || "EXTRACTED"
    ).toUpperCase();
    acceptedEdges.push({ source, target, relation, confidence, originalIndex: index });
    nodeById.get(source).degree += 1;
    nodeById.get(target).degree += 1;
  });
  if (orphanCount > 0) {
    pushWarning({
      code: "ORPHAN_EDGES",
      section: "edges",
      message: `${orphanCount} relación(es) huérfana(s) omitida(s). Ejemplos: ${orphanSample.join("; ") || "n/d"}.`
    });
  }
  const disposition = orphanCount || incompleteCount || selfLoopCount || warnings.length ? "partial" : "accepted";
  return {
    disposition,
    warnings,
    nodeById,
    flatNodes,
    edges: acceptedEdges,
    totalNodes: extracted.nodes.length,
    totalEdges: edgeList.length,
    stats: {
      orphanCount,
      incompleteCount,
      selfLoopCount,
      acceptedEdgeCount: acceptedEdges.length,
      uniqueNodeCount: nodeById.size
    }
  };
}
export {
  VALIDATION_LIMITS,
  asArray,
  findGraphArrays,
  firstValue,
  flattenEntity,
  isObject,
  parseJsonText,
  resolveEndpointId,
  resolveNodeId,
  validateGraphDocument
};
