import { GRAPH_FORMAT } from '../constants.js';
import { asArray, endpointId, firstValue, flattenEntity, isObject } from '../utils.js';

const KNOWN_NODE_KEYS = new Set([
  'id', 'elementId', 'identity', 'key', 'uid',
  'label', 'name', 'qualified_name', 'title', 'norm_label',
  'source_file', 'sourceFile', 'file', 'filepath', 'file_path', 'path',
  'source_location', 'sourceLocation', 'location', 'range', 'line', 'line_number',
  'community', 'community_name', 'package', 'namespace', 'module', 'group',
  'kind', 'node_type', 'type', 'category', 'labels', 'file_type', 'fileType',
  'role', 'data', 'properties', 'attributes', 'metadata', '_origin',
]);

const KNOWN_EDGE_KEYS = new Set([
  'source', 'target', 'relation', 'confidence', 'confidence_score', 'confidenceScore',
  'source_file', 'sourceFile', 'source_location', 'sourceLocation',
  'type', 'label', 'name', 'kind', 'metadata', 'data', 'properties', 'attributes',
  'from', 'to', 'start', 'end', 'startNode', 'endNode', 'sourceId', 'targetId',
  'source_id', 'target_id', 'outV', 'inV',
]);

function collectUnknown(entity, knownKeys) {
  if (!isObject(entity)) return {};
  const metadata = {};
  const sources = [entity, entity.metadata, entity.properties, entity.data].filter(isObject);
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (knownKeys.has(key) || key in metadata) continue;
      metadata[key] = value;
    }
  }
  return metadata;
}

/**
 * Deterministic adapter for official GRAPHIFY NetworkX node-link format.
 * Does not invent relation semantics or framework-specific heuristics.
 */
export function adaptGraphifyNative(raw) {
  const nodes = asArray(raw.nodes).map((item, originalIndex) => {
    const flat = flattenEntity(item);
    const idValue = firstValue(flat, ['id', 'elementId', 'identity', 'key', 'uid']);
    const id = idValue === undefined || idValue === null ? String(originalIndex) : String(idValue);

    return {
      id,
      originalIndex,
      label: firstValue(flat, ['label', 'name', 'qualified_name', 'title']),
      normLabel: firstValue(flat, ['norm_label', 'normalizedLabel', 'normalized_label']),
      kindRaw: firstValue(flat, ['kind', 'node_type', 'type', 'category', 'labels']),
      role: firstValue(flat, ['role']) ?? '',
      fileType: firstValue(flat, ['file_type', 'fileType']) ?? '',
      sourceFile: firstValue(flat, [
        'source_file', 'sourceFile', 'file', 'filepath', 'file_path', 'path',
        'metadata.file', 'metadata.path',
      ]),
      sourceLocation: firstValue(flat, [
        'source_location', 'sourceLocation', 'location', 'range', 'line', 'line_number',
      ]),
      community: flat.community,
      communityName: firstValue(flat, ['community_name', 'communityName']),
      package: firstValue(flat, ['package', 'metadata.package']),
      namespace: firstValue(flat, ['namespace', 'metadata.namespace']),
      module: firstValue(flat, ['module', 'metadata.module']),
      labels: flat.labels,
      origin: flat._origin,
      metadata: collectUnknown(flat, KNOWN_NODE_KEYS),
      raw: flat,
    };
  });

  const links = asArray(raw.links).map((item, originalIndex) => {
    const flat = flattenEntity(item);
    const source = endpointId(firstValue(flat, ['source']));
    const target = endpointId(firstValue(flat, ['target']));

    return {
      originalIndex,
      source,
      target,
      relation: firstValue(flat, ['relation']),
      confidence: firstValue(flat, ['confidence']),
      confidenceScore: firstValue(flat, ['confidence_score', 'confidenceScore']),
      sourceFile: firstValue(flat, ['source_file', 'sourceFile']),
      sourceLocation: firstValue(flat, ['source_location', 'sourceLocation']),
      metadata: collectUnknown(flat, KNOWN_EDGE_KEYS),
      raw: flat,
    };
  });

  return {
    format: GRAPH_FORMAT.NATIVE,
    directed: Boolean(raw.directed),
    multigraph: Boolean(raw.multigraph),
    graphMetadata: isObject(raw.graph) ? { ...raw.graph } : {},
    hyperedges: Array.isArray(raw.hyperedges) ? raw.hyperedges : [],
    nodes,
    links,
  };
}
