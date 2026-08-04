const KIND_ALIASES = [
  ['interface', ['interface', 'contract']],
  ['class', ['class', 'entity', 'dto', 'model', 'service', 'controller', 'repository']],
  ['method', ['method', 'member', 'constructor']],
  ['function', ['function', 'procedure', 'lambda']],
  ['package', ['package', 'namespace']],
  ['module', ['module', 'component']],
  ['table', ['table', 'database', 'schema', 'collection']],
  ['config', ['config', 'configuration', 'property']],
  ['endpoint', ['endpoint', 'route', 'api']],
  ['file', ['file', 'document', 'source']],
];

const KIND_COLORS = {
  class: '#39e97e',
  interface: '#35dcff',
  method: '#f02ba6',
  function: '#f02ba6',
  file: '#2d8cff',
  package: '#9c68ff',
  module: '#9c68ff',
  table: '#e8f12f',
  config: '#ff7a33',
  endpoint: '#ffca4b',
  default: '#b7dfcf',
};

function postProgress(value, label) {
  self.postMessage({ type: 'progress', value, label });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstValue(object, keys) {
  for (const key of keys) {
    const parts = key.split('.');
    let current = object;
    let valid = true;
    for (const part of parts) {
      if (!isObject(current) && !Array.isArray(current)) {
        valid = false;
        break;
      }
      current = current?.[part];
    }
    if (valid && current !== undefined && current !== null && current !== '') return current;
  }
  return undefined;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (isObject(value)) {
    return Object.entries(value).map(([key, item]) =>
      isObject(item) && item.id === undefined ? { ...item, id: key } : item,
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
    raw?.items?.nodes,
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
    raw?.items?.edges,
  ];

  const nodes = nodeCandidates.map(asArray).find((items) => items.length > 0) || [];
  const edges = edgeCandidates.map(asArray).find((items) => items.length > 0) || [];

  if (nodes.length) return { nodes, edges };

  if (Array.isArray(raw)) {
    const probableNodes = raw.filter((item) => {
      const flat = flattenEntity(item);
      return firstValue(flat, ['source', 'target', 'from', 'to']) === undefined;
    });
    const probableEdges = raw.filter((item) => {
      const flat = flattenEntity(item);
      return firstValue(flat, ['source', 'target', 'from', 'to']) !== undefined;
    });
    return { nodes: probableNodes, edges: probableEdges };
  }

  return { nodes: [], edges: [] };
}

function endpointId(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isObject(value)) {
    return String(
      firstValue(value, ['id', 'elementId', 'identity', 'key', 'data.id', 'properties.id', 'label']) || '',
    );
  }
  return String(value);
}

function normalizeKind(node) {
  const labels = Array.isArray(node.labels) ? node.labels.join(' ') : node.labels;
  const raw = String(
    firstValue(node, [
      'kind',
      'type',
      'category',
      'node_type',
      'entity_type',
      'label_type',
    ]) || labels || '',
  ).toLowerCase();
  const label = String(firstValue(node, ['label', 'name', 'qualified_name']) || '').toLowerCase();
  const file = String(firstValue(node, ['source_file', 'file', 'path', 'source.path']) || '').toLowerCase();
  const searchable = `${raw} ${label}`;

  for (const [kind, aliases] of KIND_ALIASES) {
    if (aliases.some((alias) => searchable.includes(alias))) return kind;
  }
  if (/\.(ya?ml|json|xml|properties|toml|ini|env)$/.test(file)) return 'config';
  if (/\.(sql|ddl)$/.test(file)) return 'table';
  if (file) return 'file';
  return 'default';
}

function normalizeFile(node) {
  return String(
    firstValue(node, [
      'source_file',
      'sourceFile',
      'file',
      'filepath',
      'file_path',
      'path',
      'source.path',
      'metadata.file',
      'metadata.path',
    ]) || '',
  ).replaceAll('\\', '/');
}

function normalizeLocation(node) {
  const value = firstValue(node, [
    'source_location',
    'sourceLocation',
    'location',
    'range',
    'line',
    'line_number',
    'source.location',
    'metadata.location',
  ]);
  if (isObject(value)) {
    const start = firstValue(value, ['start.line', 'startLine', 'start', 'line']);
    const end = firstValue(value, ['end.line', 'endLine', 'end']);
    if (start !== undefined && end !== undefined) return `L${start}-L${end}`;
    return JSON.stringify(value);
  }
  return value === undefined ? '' : String(value);
}

function groupKey(node, file) {
  const explicit = firstValue(node, ['package', 'namespace', 'module', 'group', 'metadata.package']);
  if (explicit) return String(explicit);
  const parts = file.split('/').filter(Boolean);
  if (!parts.length) return 'sin-grupo';
  const sourceIndex = Math.max(parts.lastIndexOf('java'), parts.lastIndexOf('kotlin'), parts.lastIndexOf('src'));
  if (sourceIndex >= 0 && parts.length > sourceIndex + 2) {
    return parts.slice(sourceIndex + 1, Math.min(parts.length - 1, sourceIndex + 4)).join('/');
  }
  if (parts.length === 1) return parts[0];
  return parts.slice(0, Math.min(parts.length - 1, 4)).join('/');
}

function primitiveMetadata(node) {
  const ignored = new Set([
    'id', 'label', 'name', 'type', 'kind', 'category', 'source', 'target', 'data', 'properties',
    'attributes', 'metadata', 'source_file', 'sourceFile', 'file', 'path', 'location', 'source_location',
  ]);
  const sources = [node, node.properties, node.metadata, node.data].filter(isObject);
  const output = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (ignored.has(key) || key in output) continue;
      if (['string', 'number', 'boolean'].includes(typeof value)) output[key] = value;
      if (Array.isArray(value) && value.length <= 8 && value.every((item) => typeof item !== 'object')) {
        output[key] = value.join(', ');
      }
      if (Object.keys(output).length >= 16) return output;
    }
  }
  return output;
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function wrapLongitude(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function centerOutSlots(count) {
  const center = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b,
  );
}

function createSphericalLayout(prepared, groups) {
  const total = Math.max(1, prepared.length);
  const yLimit = 0.985;
  const membersByGroup = new Map(groups.map((group) => [group, []]));
  const positions = new Map();

  for (const item of prepared) {
    const members = membersByGroup.get(item.group);
    if (members) members.push(item);
  }

  let consumed = 0;
  groups.forEach((group, groupOrder) => {
    const members = membersByGroup.get(group) || [];
    const count = members.length;
    if (!count) return;

    members.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
    const top = yLimit - (consumed / total) * yLimit * 2;
    consumed += count;
    const bottom = yLimit - (consumed / total) * yLimit * 2;
    const bandHeight = top - bottom;
    const padding = groups.length > 1 ? Math.min(0.012, bandHeight * 0.08) : 0;
    const usableTop = top - padding * 0.5;
    const usableBottom = bottom + padding * 0.5;
    const usableHeight = Math.max(0.0001, usableTop - usableBottom);
    const phase = (hashString(group) / 4294967295) * Math.PI * 2 + groupOrder * 0.73;
    const slots = centerOutSlots(count);

    members.forEach((item, rank) => {
      const slot = slots[rank];
      const fraction = (slot + 0.5) / count;
      const y = usableTop - fraction * usableHeight;
      const theta = phase + slot * GOLDEN_ANGLE + fraction * 0.55;
      positions.set(item.id, {
        lat: Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI,
        lon: wrapLongitude(theta * 180 / Math.PI),
      });
    });
  });

  return positions;
}

function parseGraph(text, fileName, limits) {
  postProgress(0.08, 'Validando JSON…');
  const raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  const extracted = findGraphArrays(raw);
  if (!extracted.nodes.length) {
    throw new Error(
      'No se encontró una colección de nodos. Revisa src/workers/graphWorker.js para adaptar el esquema exacto de tu Graphify.',
    );
  }

  postProgress(0.2, 'Normalizando identificadores…');
  const rawNodes = extracted.nodes.map(flattenEntity);
  const rawEdges = extracted.edges.map(flattenEntity);
  const nodeById = new Map();

  rawNodes.forEach((node, index) => {
    const id = String(
      firstValue(node, ['id', 'elementId', 'identity', 'key', 'uid', 'qualified_name', 'name', 'label']) ?? index,
    );
    if (!nodeById.has(id)) nodeById.set(id, { raw: node, id, originalIndex: index, degree: 0 });
  });

  const normalizedEdges = [];
  for (const edge of rawEdges) {
    const source = endpointId(
      firstValue(edge, ['source', 'from', 'start', 'startNode', 'sourceId', 'source_id', 'outV']),
    );
    const target = endpointId(
      firstValue(edge, ['target', 'to', 'end', 'endNode', 'targetId', 'target_id', 'inV']),
    );
    if (!source || !target || source === target) continue;
    const sourceNode = nodeById.get(source);
    const targetNode = nodeById.get(target);
    if (!sourceNode || !targetNode) continue;
    sourceNode.degree += 1;
    targetNode.degree += 1;
    normalizedEdges.push({
      source,
      target,
      relation: String(firstValue(edge, ['relation', 'type', 'label', 'name', 'kind']) || 'related'),
      confidence: String(firstValue(edge, ['confidence', 'certainty', 'origin']) || 'EXTRACTED').toUpperCase(),
    });
  }

  postProgress(0.38, 'Priorizando nodos relevantes…');
  const maxNodes = Math.max(50, Number(limits?.maxNodes) || 900);
  const maxEdges = Math.max(100, Number(limits?.maxEdges) || 2400);
  const ranked = [...nodeById.values()]
    .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id))
    .slice(0, maxNodes);
  const allowedIds = new Set(ranked.map((item) => item.id));

  const groupCounts = new Map();
  const prepared = ranked.map((item) => {
    const file = normalizeFile(item.raw);
    const group = groupKey(item.raw, file);
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    return { ...item, file, group };
  });
  const groups = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([group]) => group);
  const sphericalLayout = createSphericalLayout(prepared, groups);

  postProgress(0.55, 'Calculando distribución esférica…');
  const nodes = prepared.map((item, index) => {
    const node = item.raw;
    const position = sphericalLayout.get(item.id) || { lat: 0, lon: 0 };
    const kind = normalizeKind(node);
    return {
      index,
      id: item.id,
      label: String(firstValue(node, ['label', 'name', 'qualified_name', 'title']) || item.id),
      kind,
      color: KIND_COLORS[kind] || KIND_COLORS.default,
      group: item.group,
      file: item.file,
      location: normalizeLocation(node),
      degree: item.degree,
      incoming: 0,
      outgoing: 0,
      lat: position.lat,
      lon: position.lon,
      metadata: primitiveMetadata(node),
    };
  });
  const displayIndex = new Map(nodes.map((node) => [node.id, node.index]));

  postProgress(0.72, 'Filtrando relaciones visibles…');
  const edges = [];
  for (const edge of normalizedEdges) {
    if (!allowedIds.has(edge.source) || !allowedIds.has(edge.target)) continue;
    const source = displayIndex.get(edge.source);
    const target = displayIndex.get(edge.target);
    if (source === undefined || target === undefined) continue;
    nodes[source].outgoing += 1;
    nodes[target].incoming += 1;
    edges.push({ source, target, relation: edge.relation, confidence: edge.confidence });
    if (edges.length >= maxEdges) break;
  }

  postProgress(0.9, 'Preparando visualización…');
  return {
    sourceName: fileName || 'graph.json',
    nodes,
    edges,
    totalNodes: rawNodes.length,
    totalEdges: rawEdges.length,
    maxAnimatedEdges: Math.max(0, Number(limits?.maxAnimatedEdges) || 42),
  };
}

self.onmessage = (event) => {
  if (event.data?.type !== 'parse') return;
  try {
    const graph = parseGraph(event.data.text, event.data.fileName, event.data.limits);
    postProgress(1, 'Grafo listo');
    self.postMessage({ type: 'success', graph });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'No se pudo analizar el archivo.',
    });
  }
};
