export const GRAPH_FORMAT = {
  NATIVE: 'graphify-native',
  LEGACY: 'graphify-legacy',
  UNKNOWN: 'unknown',
};

export const KNOWN_KINDS = [
  'project',
  'module',
  'package',
  'directory',
  'file',
  'class',
  'interface',
  'function',
  'method',
  'type',
  'enum',
  'endpoint',
  'table',
  'config',
  'document',
  'image',
  'external',
  'unknown',
];

/** Aliases map to normalized kinds. Order matters for specificity. */
export const KIND_ALIASES = [
  ['interface', ['interface', 'contract']],
  ['enum', ['enum', 'enumeration']],
  ['type', ['typedef', 'typealias', 'type_alias', 'datatype']],
  ['class', ['class', 'entity', 'dto', 'model', 'service', 'controller', 'repository', 'struct']],
  ['method', ['method', 'member', 'constructor']],
  ['function', ['function', 'procedure', 'lambda', 'fn']],
  ['package', ['package', 'namespace']],
  ['module', ['module', 'component']],
  ['directory', ['directory', 'folder', 'dir']],
  ['project', ['project', 'workspace', 'repository_root', 'repo']],
  ['table', ['table', 'database', 'schema', 'collection']],
  ['config', ['config', 'configuration', 'property']],
  ['endpoint', ['endpoint', 'route', 'api']],
  ['document', ['document', 'doc', 'markdown', 'readme']],
  ['image', ['image', 'img', 'asset', 'icon']],
  ['external', ['external', 'third_party', 'dependency', 'vendor']],
  ['file', ['file', 'source']],
];

export const KIND_COLORS = {
  project: '#5ce0a8',
  module: '#9c68ff',
  package: '#9c68ff',
  directory: '#4aa3d8',
  file: '#2d8cff',
  class: '#39e97e',
  interface: '#35dcff',
  function: '#f02ba6',
  method: '#f02ba6',
  type: '#7ad4ff',
  enum: '#c4f06a',
  endpoint: '#ffca4b',
  table: '#e8f12f',
  config: '#ff7a33',
  document: '#8fd4b8',
  image: '#66c2ff',
  external: '#a0b8ad',
  unknown: '#b7dfcf',
  default: '#b7dfcf',
};

export const CONFIDENCE_SCORE_FALLBACK = {
  EXTRACTED: 1,
  INFERRED: 0.5,
  AMBIGUOUS: 0.2,
};

export const DEFAULT_GROUP = 'Sin grupo';
export const DIAGNOSTIC_SAMPLE_LIMIT = 12;
export const CONNECTION_PAGE_SIZE = 24;
export const SEARCH_RESULT_LIMIT = 18;

export const QUALITY_LIMITS = {
  ligero: { maxNodes: 450, maxEdges: 1000, maxAnimatedEdges: 24 },
  equilibrado: { maxNodes: 900, maxEdges: 2400, maxAnimatedEdges: 42 },
  detallado: { maxNodes: 1800, maxEdges: 6000, maxAnimatedEdges: 64 },
};

export const MAX_FILE_SIZE_BYTES = 120 * 1024 * 1024;
