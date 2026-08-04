class GraphError extends Error {
  constructor({
    what,
    section,
    action,
    disposition = "rejected",
    code = "GRAPH_ERROR",
    details = null
  }) {
    const dispositionText = disposition === "partial" ? "El archivo se procesó parcialmente." : "El archivo fue rechazado completamente.";
    const message = [
      what,
      section ? `Sección: ${section}.` : null,
      action ? `Qué puedes hacer: ${action}` : null,
      dispositionText
    ].filter(Boolean).join(" ");
    super(message);
    this.name = "GraphError";
    this.what = what;
    this.section = section || "";
    this.action = action || "";
    this.disposition = disposition;
    this.code = code;
    this.details = details;
  }
  toMessagePayload() {
    return {
      message: this.message,
      what: this.what,
      section: this.section,
      action: this.action,
      disposition: this.disposition,
      code: this.code,
      details: this.details
    };
  }
}
class CancelledError extends Error {
  constructor(message = "Importación cancelada por el usuario.") {
    super(message);
    this.name = "CancelledError";
    this.code = "CANCELLED";
  }
}
function formatUnknownError(error, section = "procesamiento") {
  if (error instanceof GraphError) return error;
  if (error instanceof CancelledError) return error;
  const raw = error instanceof Error ? error.message : String(error || "Error desconocido");
  return new GraphError({
    what: raw,
    section,
    action: "Revisa el archivo GRAPHIFY.json e inténtalo de nuevo.",
    disposition: "rejected",
    code: "UNKNOWN"
  });
}
export {
  CancelledError,
  GraphError,
  formatUnknownError
};
