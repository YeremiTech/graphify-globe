import { GRAPH_FORMAT } from './constants.js';
import { asArray, isObject } from './utils.js';

/**
 * Detect Graphify JSON shape without mutating input.
 * @param {unknown} raw
 * @returns {'graphify-native' | 'graphify-legacy' | 'unknown'}
 */
export function detectGraphFormat(raw) {
  if (!raw || (!isObject(raw) && !Array.isArray(raw))) {
    return GRAPH_FORMAT.UNKNOWN;
  }

  if (isObject(raw)) {
    // Official NetworkX node-link: both nodes and links arrays present.
    if (Array.isArray(raw.nodes) && Array.isArray(raw.links)) {
      return raw.nodes.length > 0 ? GRAPH_FORMAT.NATIVE : GRAPH_FORMAT.UNKNOWN;
    }

    const nestedNodeCollections = [
      raw.nodes,
      raw.graph?.nodes,
      raw.data?.nodes,
      raw.elements?.nodes,
      raw.vertices,
      raw.entities,
      raw.items?.nodes,
    ];

    for (const collection of nestedNodeCollections) {
      if (asArray(collection).length > 0) return GRAPH_FORMAT.LEGACY;
    }
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return GRAPH_FORMAT.LEGACY;
  }

  return GRAPH_FORMAT.UNKNOWN;
}
