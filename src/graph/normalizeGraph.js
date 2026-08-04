import {
  CONFIDENCE_SCORE_FALLBACK,
  DEFAULT_GROUP,
  KIND_ALIASES,
  KIND_COLORS,
  KNOWN_KINDS,
} from './constants.js';
import { detectGraphFormat } from './detectGraphFormat.js';
import { adaptGraphifyNative } from './adapters/graphifyNativeAdapter.js';
import { adaptLegacyGraph } from './adapters/legacyGraphAdapter.js';
import { validateGraph } from './validateGraph.js';
import { firstValue, isObject, toSearchText } from './utils.js';
import { GRAPH_FORMAT } from './constants.js';

function formatLocation(value) {
  if (value === undefined || value === null || value === '') return '';
  if (isObject(value)) {
    const start = firstValue(value, ['start.line', 'startLine', 'start', 'line']);
    const end = firstValue(value, ['end.line', 'endLine', 'end']);
    if (start !== undefined && end !== undefined) return `L${start}-L${end}`;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeFilePath(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value).replaceAll('\\', '/');
}

function deriveGroupFromFile(file) {
  const parts = file.split('/').filter(Boolean);
  if (!parts.length) return DEFAULT_GROUP;
  const sourceIndex = Math.max(
    parts.lastIndexOf('java'),
    parts.lastIndexOf('kotlin'),
    parts.lastIndexOf('src'),
    parts.lastIndexOf('lib'),
    parts.lastIndexOf('app'),
  );
  if (sourceIndex >= 0 && parts.length > sourceIndex + 2) {
    return parts.slice(sourceIndex + 1, Math.min(parts.length - 1, sourceIndex + 4)).join('/');
  }
  if (parts.length === 1) return parts[0];
  return parts.slice(0, Math.min(parts.length - 1, 4)).join('/');
}

function resolveGroup(node, file) {
  if (node.communityName) return String(node.communityName);
  if (node.community !== undefined && node.community !== null && node.community !== '') {
    return `Comunidad ${node.community}`;
  }
  if (node.package) return String(node.package);
  if (node.namespace) return String(node.namespace);
  if (node.module) return String(node.module);
  if (file) return deriveGroupFromFile(file);
  return DEFAULT_GROUP;
}

function inferKindFromContext(label, file) {
  const searchable = `${label} ${file}`.toLowerCase();
  for (const [kind, aliases] of KIND_ALIASES) {
    if (aliases.some((alias) => searchable.includes(alias))) return kind;
  }
  if (/\.(ya?ml|json|xml|properties|toml|ini|env)$/i.test(file)) return 'config';
  if (/\.(sql|ddl)$/i.test(file)) return 'table';
  if (/\.(md|txt|rst|adoc)$/i.test(file)) return 'document';
  if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(file)) return 'image';
  if (file) return 'file';
  return 'unknown';
}

function normalizeKind(node, label, file, diagnostics) {
  let raw = node.kindRaw;
  if (Array.isArray(raw)) raw = raw.join(' ');
  const rawString = raw === undefined || raw === null ? '' : String(raw).trim();
  const lower = rawString.toLowerCase();

  if (lower) {
    if (KNOWN_KINDS.includes(lower)) {
      return { kind: lower, originalKind: rawString };
    }
    for (const [kind, aliases] of KIND_ALIASES) {
      if (aliases.some((alias) => lower === alias || lower.includes(alias))) {
        return { kind, originalKind: rawString };
      }
    }
    diagnostics.unknownKinds[rawString] = (diagnostics.unknownKinds[rawString] || 0) + 1;
    return { kind: 'unknown', originalKind: rawString };
  }

  const inferred = inferKindFromContext(label, file);
  return { kind: inferred, originalKind: '' };
}

function resolveConfidenceScore(confidence, explicitScore) {
  if (explicitScore !== undefined && explicitScore !== null && explicitScore !== '') {
    const numeric = Number(explicitScore);
    if (Number.isFinite(numeric)) return numeric;
  }
  const key = String(confidence || 'EXTRACTED').toUpperCase();
  return CONFIDENCE_SCORE_FALLBACK[key] ?? 1;
}

function primitiveMetadata(metadata) {
  if (!isObject(metadata)) return {};
  const output = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      output[key] = value;
    } else if (Array.isArray(value) && value.length <= 8 && value.every((item) => typeof item !== 'object')) {
      output[key] = value.join(', ');
    } else if (isObject(value)) {
      try {
        output[key] = JSON.stringify(value);
      } catch {
        output[key] = String(value);
      }
    } else if (value !== undefined && value !== null) {
      output[key] = String(value);
    }
    if (Object.keys(output).length >= 24) break;
  }
  return output;
}

/**
 * Convert either adapter output into the shared internal model.
 * No Three.js / React code.
 */
export function normalizeAdaptedGraph(validated, sourceName = 'graph.json') {
  const diagnostics = {
    ...validated.diagnostics,
    unknownKinds: { ...(validated.diagnostics?.unknownKinds || {}) },
    unnamedCommunities: [...(validated.diagnostics?.unnamedCommunities || [])],
    warnings: [...(validated.diagnostics?.warnings || [])],
  };

  const degreeMap = new Map();
  const incomingMap = new Map();
  const outgoingMap = new Map();

  for (const node of validated.nodes) {
    degreeMap.set(node.id, 0);
    incomingMap.set(node.id, 0);
    outgoingMap.set(node.id, 0);
  }

  for (const link of validated.links) {
    if (link.source === link.target) {
      degreeMap.set(link.source, (degreeMap.get(link.source) || 0) + 1);
      continue;
    }
    degreeMap.set(link.source, (degreeMap.get(link.source) || 0) + 1);
    degreeMap.set(link.target, (degreeMap.get(link.target) || 0) + 1);
    outgoingMap.set(link.source, (outgoingMap.get(link.source) || 0) + 1);
    incomingMap.set(link.target, (incomingMap.get(link.target) || 0) + 1);
    if (!validated.directed) {
      // Undirected: both ends are mutually connected for display counts.
      incomingMap.set(link.source, (incomingMap.get(link.source) || 0) + 1);
      outgoingMap.set(link.target, (outgoingMap.get(link.target) || 0) + 1);
    }
  }

  const nodes = validated.nodes.map((node, index) => {
    const file = normalizeFilePath(node.sourceFile);
    const label = String(node.label || node.id);
    const { kind, originalKind } = normalizeKind(node, label, file, diagnostics);
    const communityName = node.communityName
      ? String(node.communityName)
      : node.community !== undefined && node.community !== null && node.community !== ''
        ? `Comunidad ${node.community}`
        : '';

    if (
      (node.community !== undefined && node.community !== null && node.community !== '')
      && !node.communityName
    ) {
      diagnostics.unnamedCommunities.push(String(node.community));
    }

    const group = resolveGroup(node, file);
    const metadata = primitiveMetadata(node.metadata);
    if (originalKind && kind === 'unknown') metadata.originalKind = originalKind;
    if (node.package && !metadata.package) metadata.package = String(node.package);
    if (node.namespace && !metadata.namespace) metadata.namespace = String(node.namespace);
    if (node.module && !metadata.module) metadata.module = String(node.module);
    if (node.origin !== undefined) metadata._origin = node.origin;
    if (node.normLabel) metadata.norm_label = String(node.normLabel);

    const normalizedLabel = String(node.normLabel || label).toLocaleLowerCase('es');
    const searchText = toSearchText(
      label,
      normalizedLabel,
      node.id,
      kind,
      originalKind,
      file,
      communityName,
      group,
      node.fileType,
      metadata.package,
      metadata.namespace,
      metadata.module,
    );

    return {
      index,
      id: node.id,
      label,
      normalizedLabel,
      kind,
      role: node.role ? String(node.role) : '',
      fileType: node.fileType ? String(node.fileType) : '',
      file,
      location: formatLocation(node.sourceLocation),
      communityId: node.community ?? null,
      communityName: communityName || group,
      group,
      degree: degreeMap.get(node.id) || 0,
      incoming: incomingMap.get(node.id) || 0,
      outgoing: outgoingMap.get(node.id) || 0,
      color: KIND_COLORS[kind] || KIND_COLORS.default,
      lat: 0,
      lon: 0,
      searchText,
      metadata,
    };
  });

  const nodeIndexById = new Map(nodes.map((node) => [node.id, node.index]));

  const edges = validated.links.map((link, index) => {
    const confidence = String(link.confidence || 'EXTRACTED').toUpperCase();
    const confidenceScore = resolveConfidenceScore(link.confidence, link.confidenceScore);
    const relation = link.relation === undefined || link.relation === null || link.relation === ''
      ? 'related'
      : String(link.relation);

    const metadata = primitiveMetadata(link.metadata);
    const source = nodeIndexById.get(link.source);
    const target = nodeIndexById.get(link.target);

    return {
      index,
      sourceId: link.source,
      targetId: link.target,
      source,
      target,
      relation,
      confidence,
      confidenceScore,
      file: link.sourceFile ? normalizeFilePath(link.sourceFile) : '',
      location: formatLocation(link.sourceLocation),
      isSelfLoop: link.source === link.target,
      metadata,
    };
  });

  // Unique unnamed communities sample
  diagnostics.unnamedCommunities = [...new Set(diagnostics.unnamedCommunities)].slice(0, 12);
  if (diagnostics.unnamedCommunities.length) {
    diagnostics.warnings.push(
      `${diagnostics.unnamedCommunities.length} comunidad(es) sin nombre`,
    );
  }

  const unknownKindEntries = Object.keys(diagnostics.unknownKinds);
  if (unknownKindEntries.length) {
    diagnostics.warnings.push(
      `${unknownKindEntries.length} tipo(s) de nodo desconocido(s) conservados como unknown`,
    );
  }

  if (validated.hyperedges?.length) {
    diagnostics.warnings.push(
      `${validated.hyperedges.length} hyperedge(s) detectado(s) (no renderizados en esta versión)`,
    );
  }

  return {
    format: validated.format,
    sourceName: sourceName || 'graph.json',
    directed: Boolean(validated.directed),
    multigraph: Boolean(validated.multigraph),
    graphMetadata: validated.graphMetadata || {},
    nodes,
    edges,
    hyperedges: validated.hyperedges || [],
    diagnostics,
  };
}

/**
 * Full pipeline: detect → adapt → validate → normalize.
 */
export function normalizeGraph(raw, sourceName = 'graph.json') {
  const format = detectGraphFormat(raw);
  if (format === GRAPH_FORMAT.UNKNOWN) {
    throw new Error(
      'No se encontró una colección de nodos. El archivo no parece un grafo Graphify válido.',
    );
  }

  const adapted = format === GRAPH_FORMAT.NATIVE
    ? adaptGraphifyNative(raw)
    : adaptLegacyGraph(raw);

  const validated = validateGraph(adapted);
  return normalizeAdaptedGraph(validated, sourceName);
}
