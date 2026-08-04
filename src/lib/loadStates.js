const LOAD_STATES = Object.freeze({
  IDLE: "idle",
  READING: "reading",
  VALIDATING: "validating",
  PROCESSING: "processing",
  INDEXING: "indexing",
  PREPARING: "preparing",
  CANCELLED: "cancelled",
  ERROR: "error",
  COMPLETED: "completed"
});
const LOAD_STATE_LABELS = Object.freeze({
  [LOAD_STATES.IDLE]: "Importa un graph.json para comenzar",
  [LOAD_STATES.READING]: "Leyendo el archivo local…",
  [LOAD_STATES.VALIDATING]: "Validando GRAPHIFY.json…",
  [LOAD_STATES.PROCESSING]: "Procesando nodos y relaciones…",
  [LOAD_STATES.INDEXING]: "Indexando identificadores…",
  [LOAD_STATES.PREPARING]: "Preparando visualización…",
  [LOAD_STATES.CANCELLED]: "Importación cancelada",
  [LOAD_STATES.ERROR]: "No se pudo cargar el grafo",
  [LOAD_STATES.COMPLETED]: "Grafo listo"
});
function isBusyState(state) {
  return state === LOAD_STATES.READING || state === LOAD_STATES.VALIDATING || state === LOAD_STATES.PROCESSING || state === LOAD_STATES.INDEXING || state === LOAD_STATES.PREPARING;
}
export {
  LOAD_STATES,
  LOAD_STATE_LABELS,
  isBusyState
};
