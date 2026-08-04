const FORMAT_KINDS = Object.freeze({
  TRADITIONAL_JSON: "traditional-json",
  JSONL: "jsonl",
  BUNDLE_MANIFEST: "bundle-manifest",
  UNKNOWN: "unknown"
});
const ABSOLUTE_MAX_TRADITIONAL_BYTES = 64 * 1024 * 1024;
const ABSOLUTE_MAX_JSONL_BYTES = 96 * 1024 * 1024;
const TRADITIONAL_FORMAT_LIMITS = Object.freeze({
  root: "Objeto o arreglo JSON",
  nodesLocations: [
    "nodes",
    "graph.nodes",
    "data.nodes",
    "elements.nodes",
    "vertices",
    "entities",
    "items.nodes",
    "arreglo raíz (ítems sin source/target)"
  ],
  edgesLocations: [
    "edges",
    "links",
    "relationships",
    "relations",
    "graph.edges|links|relationships",
    "data.edges|links",
    "elements.edges|relationships",
    "items.edges",
    "arreglo raíz (ítems con source/target)"
  ],
  fieldOrderGuaranteed: false,
  progressiveArrayReadSafe: false,
  sectionDependencies: "Las aristas requieren el conjunto completo de IDs de nodos para validar huérfanos; IDs duplicados requieren ver toda la colección de nodos.",
  streamingParserCompatible: "No de forma segura sin contrato estricto (nodos antes que aristas, única ruta de arrays). El contrato actual es multi-ruta y agnóstico al orden.",
  peakMemoryModel: "≈ tamaño_archivo (Blob) + texto UTF-16 (~2× bytes) + objeto parseado + índice tipado. Factor empírico orientativo 3.5–6× el tamaño del archivo."
});
function readDeviceSignals() {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  return {
    deviceMemoryGb: typeof nav?.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    saveData: Boolean(nav?.connection?.saveData),
    userAgent: typeof nav?.userAgent === "string" ? nav.userAgent : ""
  };
}
function getDeviceImportBudgets(signals = readDeviceSignals()) {
  const mem = signals.deviceMemoryGb;
  const saveData = signals.saveData;
  let softWarnBytes = 6 * 1024 * 1024;
  let hardMaxTraditional = 24 * 1024 * 1024;
  let hardMaxJsonl = 40 * 1024 * 1024;
  let profile = "desconocido";
  if (typeof mem === "number") {
    if (mem <= 2) {
      profile = "bajo";
      softWarnBytes = 2 * 1024 * 1024;
      hardMaxTraditional = 8 * 1024 * 1024;
      hardMaxJsonl = 16 * 1024 * 1024;
    } else if (mem <= 4) {
      profile = "medio";
      softWarnBytes = 5 * 1024 * 1024;
      hardMaxTraditional = 16 * 1024 * 1024;
      hardMaxJsonl = 32 * 1024 * 1024;
    } else if (mem <= 8) {
      profile = "alto";
      softWarnBytes = 10 * 1024 * 1024;
      hardMaxTraditional = 32 * 1024 * 1024;
      hardMaxJsonl = 64 * 1024 * 1024;
    } else {
      profile = "muy-alto";
      softWarnBytes = 16 * 1024 * 1024;
      hardMaxTraditional = 48 * 1024 * 1024;
      hardMaxJsonl = 80 * 1024 * 1024;
    }
  }
  if (saveData) {
    softWarnBytes = Math.floor(softWarnBytes * 0.6);
    hardMaxTraditional = Math.floor(hardMaxTraditional * 0.7);
    hardMaxJsonl = Math.floor(hardMaxJsonl * 0.75);
  }
  hardMaxTraditional = Math.min(hardMaxTraditional, ABSOLUTE_MAX_TRADITIONAL_BYTES);
  hardMaxJsonl = Math.min(hardMaxJsonl, ABSOLUTE_MAX_JSONL_BYTES);
  return {
    profile,
    softWarnBytes,
    hardMaxTraditional,
    hardMaxJsonl,
    signals: {
      deviceMemoryGb: mem,
      hardwareConcurrency: signals.hardwareConcurrency,
      saveData
    }
  };
}
function detectImportFormat(fileName = "", mimeType = "") {
  const name = String(fileName || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (name.endsWith(".jsonl") || name.endsWith(".ndjson") || mime.includes("jsonl")) {
    return FORMAT_KINDS.JSONL;
  }
  if (name.endsWith(".graphify-manifest.json") || name.endsWith(".manifest.json")) {
    return FORMAT_KINDS.BUNDLE_MANIFEST;
  }
  if (name.endsWith(".json") || mime.includes("json")) {
    return FORMAT_KINDS.TRADITIONAL_JSON;
  }
  return FORMAT_KINDS.UNKNOWN;
}
function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function estimatePeakMemoryBytes(fileSize, formatKind) {
  if (formatKind === FORMAT_KINDS.JSONL) {
    return Math.ceil(fileSize * 2.8);
  }
  return Math.ceil(fileSize * 4.5);
}
function assessImportFile(file, options = {}) {
  const budgets = options.budgets || getDeviceImportBudgets(options.signals);
  const fileName = file?.name || "";
  const fileSize = Number(file?.size) || 0;
  const formatKind = detectImportFormat(fileName, file?.type);
  const reasons = [];
  const recommendations = [];
  if (!file) {
    return {
      decision: "reject",
      formatKind: FORMAT_KINDS.UNKNOWN,
      fileSize: 0,
      budgets,
      reasons: ["No se recibió archivo."],
      recommendations: ["Selecciona un GRAPHIFY.json o un .jsonl."],
      code: "MISSING_FILE"
    };
  }
  if (formatKind === FORMAT_KINDS.UNKNOWN) {
    return {
      decision: "reject",
      formatKind,
      fileSize,
      budgets,
      reasons: ["Extensión no reconocida."],
      recommendations: [
        "Usa .json (GRAPHIFY tradicional) para proyectos pequeños/medianos.",
        "Usa .jsonl (Graphify Globe Lines) para grafos grandes con lectura progresiva."
      ],
      code: "BAD_EXTENSION"
    };
  }
  if (formatKind === FORMAT_KINDS.BUNDLE_MANIFEST) {
    return {
      decision: "reject",
      formatKind,
      fileSize,
      budgets,
      reasons: [
        "El manifiesto fragmentado está documentado, pero esta build solo importa un archivo a la vez."
      ],
      recommendations: [
        "Convierte el bundle a un único .jsonl con el preprocesador, o importa GRAPHIFY.json si cabe en los límites.",
        "Ver docs/IMPORT_LARGE_FILES.md."
      ],
      code: "MANIFEST_NOT_INLINE"
    };
  }
  const hardMax = formatKind === FORMAT_KINDS.JSONL ? budgets.hardMaxJsonl : budgets.hardMaxTraditional;
  const estimatedPeak = estimatePeakMemoryBytes(fileSize, formatKind);
  if (fileSize > hardMax) {
    reasons.push(
      `El archivo pesa ${formatBytes(fileSize)} y el límite para este dispositivo (${budgets.profile}) es ${formatBytes(hardMax)}.`
    );
    if (formatKind === FORMAT_KINDS.TRADITIONAL_JSON) {
      reasons.push(
        "GRAPHIFY.json se parsea completo en memoria (no hay streaming JSON seguro con el formato actual)."
      );
      recommendations.push(
        "Exporta o convierte a Graphify Globe Lines (.jsonl) para lectura progresiva por líneas."
      );
      recommendations.push(
        "O reduce el grafo en Graphify / fragmenta por módulo antes de importar."
      );
    } else {
      recommendations.push(
        "Reduce el grafo o aumenta recursos del dispositivo. El índice completo sigue residiendo en RAM."
      );
    }
    return {
      decision: "reject",
      formatKind,
      fileSize,
      hardMax,
      softWarnBytes: budgets.softWarnBytes,
      estimatedPeakBytes: estimatedPeak,
      budgets,
      reasons,
      recommendations,
      code: "FILE_TOO_LARGE",
      streaming: formatKind === FORMAT_KINDS.JSONL
    };
  }
  let decision = "allow";
  if (fileSize >= budgets.softWarnBytes) {
    decision = "confirm";
    reasons.push(
      `Archivo grande (${formatBytes(fileSize)}). Pico estimado orientativo ≈ ${formatBytes(estimatedPeak)}.`
    );
    if (formatKind === FORMAT_KINDS.TRADITIONAL_JSON) {
      reasons.push(
        "El JSON tradicional se carga entero: texto + parse + índice. Puede congelar o agotar memoria."
      );
      recommendations.push("Preferible convertir a .jsonl si el grafo sigue creciendo.");
    } else {
      reasons.push(
        "JSONL lee y libera chunks de texto, pero el índice de nodos/aristas permanece en memoria."
      );
    }
    recommendations.push("Puedes cancelar en cualquier momento durante la importación.");
  }
  return {
    decision,
    formatKind,
    fileSize,
    hardMax,
    softWarnBytes: budgets.softWarnBytes,
    estimatedPeakBytes: estimatedPeak,
    budgets,
    reasons,
    recommendations,
    code: decision === "confirm" ? "NEEDS_CONFIRMATION" : "OK",
    streaming: formatKind === FORMAT_KINDS.JSONL,
    honestNote: formatKind === FORMAT_KINDS.TRADITIONAL_JSON ? "Sin parsing incremental: JSON.parse sobre el documento completo." : "Lectura progresiva por líneas (JSONL); no es JSON monolítico stream-parseado."
  };
}
function isMemoryPressureError(error) {
  if (!error) return false;
  const message = String(error.message || error || "").toLowerCase();
  return error.name === "RangeError" || message.includes("out of memory") || message.includes("allocation failed") || message.includes("array buffer allocation") || message.includes("invalid string length") || message.includes("exceeded memory");
}
export {
  ABSOLUTE_MAX_JSONL_BYTES,
  ABSOLUTE_MAX_TRADITIONAL_BYTES,
  FORMAT_KINDS,
  TRADITIONAL_FORMAT_LIMITS,
  assessImportFile,
  detectImportFormat,
  estimatePeakMemoryBytes,
  formatBytes,
  getDeviceImportBudgets,
  isMemoryPressureError
};
