import { CancelledError, formatUnknownError, GraphError } from "../lib/graphErrors.js";
import { ingestJsonlBlob } from "../lib/graphifyJsonl.js";
import { detectImportFormat, FORMAT_KINDS, isMemoryPressureError } from "../lib/importLimits.js";
import {
  buildStats,
  getNodeDetail,
  releaseIndexedGraph,
  resolveNumericId,
  searchIndexedProgressive
} from "../lib/indexedGraph.js";
import {
  collapseNav,
  expandNavToGroup,
  getGroupDetail,
  navigateToBreadcrumb,
  releaseHierarchy,
  revealLeafInNav,
  selectSceneView
} from "../lib/hierarchy.js";
import { ingestGraphDocument, ingestValidatedRaw } from "../lib/parseGraph.js";
const session = {
  activeJobId: null,
  cancelled: false,
  text: null,
  file: null,
  indexed: null,
  hierarchy: null,
  nav: null,
  sourceName: "",
  limits: null,
  visibleSet: /* @__PURE__ */ new Set(),
  viewIndexByNumeric: /* @__PURE__ */ new Map(),
  viewIndexByGroup: /* @__PURE__ */ new Map(),
  currentView: null,
  viewVersion: 0,
  activeSearchId: null,
  viewStack: []
};
function postProgress(jobId, value, label, phase) {
  if (session.cancelled || session.activeJobId !== jobId) return;
  self.postMessage({ type: "progress", jobId, value, label, phase });
}
function releaseTransient() {
  session.text = null;
  session.file = null;
}
function releaseIndexed() {
  releaseHierarchy(session.hierarchy);
  releaseIndexedGraph(session.indexed);
  session.indexed = null;
  session.hierarchy = null;
  session.nav = null;
  session.sourceName = "";
  session.limits = null;
  session.visibleSet = /* @__PURE__ */ new Set();
  session.viewIndexByNumeric = /* @__PURE__ */ new Map();
  session.viewIndexByGroup = /* @__PURE__ */ new Map();
  session.currentView = null;
  session.viewVersion += 1;
  session.activeSearchId = null;
  session.viewStack = [];
}
function isJobCancelled(jobId) {
  return session.cancelled || session.activeJobId !== jobId;
}
function syncVisibleSet(view) {
  session.currentView = view;
  session.visibleSet = new Set(view.visibleNumericIds || []);
  session.viewIndexByNumeric = new Map(
    (view.nodes || []).filter((node) => !node.isGroup && Number.isInteger(node.numericId)).map((node) => [node.numericId, node.index])
  );
  session.viewIndexByGroup = new Map(
    (view.nodes || []).filter((node) => node.isGroup).map((node) => [node.groupId, node.index])
  );
}
function viewPayload(view, stats) {
  return {
    nodes: view.nodes,
    edges: view.edges,
    maxAnimatedEdges: view.maxAnimatedEdges,
    version: session.viewVersion,
    stats,
    mode: view.mode,
    tier: view.tier,
    breadcrumb: view.breadcrumb || [],
    contextGroupId: view.contextGroupId ?? null,
    hierarchyActive: Boolean(view.hierarchyActive)
  };
}
function rebuildView(extra = {}) {
  const view = selectSceneView(
    session.indexed,
    session.hierarchy,
    session.nav,
    session.limits || {},
    extra
  );
  session.viewVersion += 1;
  syncVisibleSet(view);
  const stats = buildStats(session.indexed, view);
  return { view, stats };
}
async function readTraditionalJsonText(file, jobId) {
  if (!file) {
    throw new GraphError({
      what: "No se recibió el archivo para analizar.",
      section: "importación",
      action: "Vuelve a seleccionar el GRAPHIFY.json.",
      disposition: "rejected",
      code: "MISSING_FILE"
    });
  }
  if (typeof file.stream === "function" && file.size > 0) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let text2 = "";
    let received = 0;
    const total = Math.max(1, file.size);
    try {
      while (true) {
        if (isJobCancelled(jobId)) {
          try {
            await reader.cancel();
          } catch {
          }
          throw new CancelledError();
        }
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        text2 += decoder.decode(value, { stream: true });
        postProgress(
          jobId,
          Math.min(1, received / total) * 0.4,
          `Leyendo JSON completo… ${Math.round(received / total * 100)}% (sin streaming de parse)`,
          "reading"
        );
      }
      text2 += decoder.decode();
    } finally {
      reader.releaseLock?.();
    }
    return text2;
  }
  postProgress(jobId, 0.2, "Leyendo JSON completo… (sin streaming de parse)", "reading");
  if (isJobCancelled(jobId)) throw new CancelledError();
  const text = await file.text();
  if (isJobCancelled(jobId)) throw new CancelledError();
  return text;
}
function postReady(jobId, result, message) {
  self.postMessage({
    type: "ready",
    jobId,
    sourceName: result.sourceName,
    disposition: result.disposition,
    warnings: result.warnings || [],
    stats: result.stats,
    view: viewPayload(result.view, result.stats),
    nav: {
      tier: result.nav.tier,
      mode: result.nav.mode,
      contextGroupId: result.nav.contextGroupId,
      breadcrumb: result.view.breadcrumb
    },
    importMeta: {
      format: message.importFormat || FORMAT_KINDS.TRADITIONAL_JSON,
      streamingParse: Boolean(message.streamingParse),
      honestNote: message.honestNote || ""
    }
  });
}
async function handleParse(message) {
  const jobId = message.jobId;
  session.activeJobId = jobId;
  session.cancelled = false;
  session.file = message.file || null;
  session.text = null;
  releaseIndexed();
  const fileName = message.fileName || message.file?.name || "graph.json";
  const formatKind = message.importFormat || detectImportFormat(fileName, message.file?.type);
  try {
    const signal = {
      get cancelled() {
        return isJobCancelled(jobId);
      }
    };
    let result;
    if (formatKind === FORMAT_KINDS.JSONL && message.file) {
      postProgress(jobId, 0.02, "Importando JSONL con lectura progresiva…", "reading");
      const jsonl = await ingestJsonlBlob(message.file, {
        signal,
        onProgress: (value, label, phase) => {
          postProgress(jobId, value * 0.55, label, phase);
        }
      });
      if (isJobCancelled(jobId)) throw new CancelledError();
      result = ingestValidatedRaw(jsonl.document, fileName, message.limits, {
        signal,
        onProgress: (value, label, phase) => {
          postProgress(jobId, 0.55 + value * 0.45, label, phase);
        },
        progressBase: 0
      });
      message.streamingParse = true;
      message.honestNote = "JSONL: lectura por líneas; el índice completo sigue en memoria.";
      message.importFormat = FORMAT_KINDS.JSONL;
    } else {
      let text = message.text;
      if (message.file) {
        text = await readTraditionalJsonText(message.file, jobId);
      }
      if (text == null) {
        throw new GraphError({
          what: "No hay contenido para analizar.",
          section: "archivo",
          action: "Selecciona un GRAPHIFY.json válido.",
          disposition: "rejected",
          code: "EMPTY_FILE"
        });
      }
      session.text = text;
      if (isJobCancelled(jobId)) throw new CancelledError();
      try {
        result = ingestGraphDocument(text, fileName, message.limits, {
          signal,
          onProgress: (value, label, phase) => {
            postProgress(jobId, 0.4 + value * 0.6, label, phase);
          }
        });
      } catch (parseError) {
        if (isMemoryPressureError(parseError)) {
          throw new GraphError({
            what: "El navegador se quedó sin memoria al cargar el JSON completo.",
            section: "JSON.parse / indexado",
            action: "Convierte a .jsonl, reduce el grafo, o usa un equipo con más RAM. GRAPHIFY.json no admite parse incremental seguro.",
            disposition: "rejected",
            code: "OUT_OF_MEMORY",
            details: { original: String(parseError.message || parseError) }
          });
        }
        throw parseError;
      }
      message.streamingParse = false;
      message.honestNote = "JSON tradicional: documento completo en memoria (texto + parse + índice).";
      message.importFormat = FORMAT_KINDS.TRADITIONAL_JSON;
    }
    if (isJobCancelled(jobId)) throw new CancelledError();
    session.indexed = result.indexed;
    session.hierarchy = result.hierarchy;
    session.nav = result.nav;
    session.sourceName = result.sourceName;
    session.limits = message.limits || null;
    session.viewVersion += 1;
    syncVisibleSet(result.view);
    releaseTransient();
    if (isJobCancelled(jobId)) throw new CancelledError();
    postReady(jobId, result, message);
  } catch (error) {
    releaseTransient();
    const ownsSession = session.activeJobId === jobId;
    if (error instanceof CancelledError || isJobCancelled(jobId)) {
      if (ownsSession) releaseIndexed();
      self.postMessage({ type: "cancelled", jobId });
      return;
    }
    if (ownsSession) releaseIndexed();
    let graphError;
    if (error instanceof GraphError) {
      graphError = error;
    } else if (isMemoryPressureError(error)) {
      graphError = new GraphError({
        what: "Memoria insuficiente durante la importación.",
        section: "worker",
        action: "Usa .jsonl, reduce el archivo o cierra otras pestañas.",
        disposition: "rejected",
        code: "OUT_OF_MEMORY"
      });
    } else {
      graphError = formatUnknownError(error, "worker");
    }
    self.postMessage({
      type: "error",
      jobId,
      ...graphError.toMessagePayload()
    });
  } finally {
    if (session.activeJobId === jobId) {
      session.activeJobId = null;
      session.cancelled = false;
    }
  }
}
function snapshotNav() {
  if (!session.nav) return null;
  return {
    mode: session.nav.mode,
    tier: session.nav.tier,
    contextGroupId: session.nav.contextGroupId ?? null,
    breadcrumb: (session.nav.breadcrumb || []).map((item) => ({ ...item }))
  };
}
function applyNavSnapshot(snap) {
  if (!snap || !session.nav) return;
  session.nav = {
    ...session.nav,
    mode: snap.mode,
    tier: snap.tier,
    contextGroupId: snap.contextGroupId,
    breadcrumb: snap.breadcrumb || []
  };
}
async function handleSearch(message) {
  const { requestId, query, searchId, limit } = message;
  if (!session.indexed) {
    self.postMessage({
      type: "search-results",
      requestId,
      searchId,
      results: [],
      totalMatched: 0,
      done: true
    });
    return;
  }
  session.activeSearchId = searchId ?? requestId;
  const signal = {
    get cancelled() {
      return session.activeSearchId !== (searchId ?? requestId);
    }
  };
  const outcome = await searchIndexedProgressive(session.indexed, query, {
    limit: limit || 18,
    visibleSet: session.visibleSet,
    signal,
    onPartial: (results, meta) => {
      if (signal.cancelled) return;
      self.postMessage({
        type: "search-partial",
        requestId,
        searchId,
        results,
        totalMatched: meta.totalMatched,
        scanned: meta.scanned,
        total: meta.total,
        done: false
      });
    }
  });
  if (outcome.cancelled || signal.cancelled) {
    self.postMessage({
      type: "search-cancelled",
      requestId,
      searchId
    });
    return;
  }
  self.postMessage({
    type: "search-results",
    requestId,
    searchId,
    results: outcome.results,
    totalMatched: outcome.totalMatched,
    scanned: outcome.scanned,
    done: true
  });
}
function handleCancelSearch(message) {
  if (message.searchId && session.activeSearchId === message.searchId) {
    session.activeSearchId = null;
  } else if (!message.searchId) {
    session.activeSearchId = null;
  }
}
function handleNodeDetail(message) {
  const { requestId } = message;
  const ref = message.ref ?? message.numericId ?? message.nodeId ?? message.groupId;
  if (!session.indexed) {
    self.postMessage({ type: "node-detail", requestId, detail: null });
    return;
  }
  if (ref && (ref.isGroup || ref.groupId || typeof ref === "string" && ref.includes(":"))) {
    const groupId = ref.groupId || ref.id || ref;
    const detail2 = getGroupDetail(session.hierarchy, groupId, session.currentView?.nodes || []);
    if (detail2 && session.currentView) {
      const index = detail2.node.index;
      const connections = [];
      if (index >= 0) {
        for (const edge of session.currentView.edges) {
          if (edge.source !== index && edge.target !== index) continue;
          const other = edge.source === index ? session.currentView.nodes[edge.target] : session.currentView.nodes[edge.source];
          connections.push({
            direction: edge.source === index ? "saliente" : "entrante",
            relation: edge.relation,
            confidence: edge.confidence,
            node: other
          });
          if (connections.length >= 24) break;
        }
      }
      detail2.connections = connections;
    }
    self.postMessage({ type: "node-detail", requestId, detail: detail2 });
    return;
  }
  const numericId = resolveNumericId(session.indexed, ref);
  const detail = getNodeDetail(session.indexed, numericId, {
    visibleSet: session.visibleSet
  });
  if (detail) {
    const viewIndex = session.viewIndexByNumeric.get(numericId);
    if (viewIndex !== void 0) {
      detail.node.index = viewIndex;
      detail.node.inView = true;
      const viewNode = session.currentView?.nodes?.[viewIndex];
      if (viewNode) {
        detail.node.lat = viewNode.lat;
        detail.node.lon = viewNode.lon;
      }
    }
  }
  self.postMessage({ type: "node-detail", requestId, detail });
}
function emitView(requestId, detail = null) {
  try {
    const { view, stats } = rebuildView();
    self.postMessage({
      type: "view",
      requestId,
      sourceName: session.sourceName,
      stats,
      view: viewPayload(view, stats),
      detail,
      nav: {
        tier: session.nav.tier,
        mode: session.nav.mode,
        contextGroupId: session.nav.contextGroupId,
        breadcrumb: view.breadcrumb
      }
    });
  } catch (error) {
    self.postMessage({
      type: "view",
      requestId,
      error: error instanceof Error ? error.message : "No se pudo construir la vista."
    });
  }
}
function handleRequestView(message) {
  const { requestId } = message;
  if (!session.indexed || !session.hierarchy || !session.nav) {
    self.postMessage({ type: "view", requestId, error: "No hay grafo indexado." });
    return;
  }
  session.limits = message.limits || session.limits || {};
  const focusNumericId = resolveNumericId(
    session.indexed,
    message.focusRef ?? message.focusNumericId ?? message.focusNodeId
  );
  let detail = null;
  if (focusNumericId >= 0 && session.nav.mode === "hierarchy") {
    const revealed = revealLeafInNav(session.nav, session.hierarchy, focusNumericId);
    session.nav = revealed.nav;
    const { view, stats } = rebuildView({ focusNumericId });
    detail = getNodeDetail(session.indexed, focusNumericId, {
      visibleSet: session.visibleSet
    });
    if (detail) {
      const indexInView = view.nodes.findIndex((node) => node.numericId === focusNumericId);
      if (indexInView >= 0) {
        detail.node.index = indexInView;
        detail.node.lat = view.nodes[indexInView].lat;
        detail.node.lon = view.nodes[indexInView].lon;
        detail.node.inView = true;
      }
    }
    self.postMessage({
      type: "view",
      requestId,
      sourceName: session.sourceName,
      stats,
      view: viewPayload(view, stats),
      detail,
      nav: {
        tier: session.nav.tier,
        mode: session.nav.mode,
        contextGroupId: session.nav.contextGroupId,
        breadcrumb: view.breadcrumb
      }
    });
    return;
  }
  if (focusNumericId >= 0) {
    const { view, stats } = rebuildView({ focusNumericId });
    detail = getNodeDetail(session.indexed, focusNumericId, {
      visibleSet: session.visibleSet
    });
    if (detail) {
      const indexInView = view.nodes.findIndex((node) => node.numericId === focusNumericId);
      if (indexInView >= 0) {
        detail.node.index = indexInView;
        detail.node.lat = view.nodes[indexInView].lat;
        detail.node.lon = view.nodes[indexInView].lon;
        detail.node.inView = true;
      }
    }
    self.postMessage({
      type: "view",
      requestId,
      sourceName: session.sourceName,
      stats,
      view: viewPayload(view, stats),
      detail,
      nav: {
        tier: session.nav.tier,
        mode: session.nav.mode,
        contextGroupId: session.nav.contextGroupId,
        breadcrumb: view.breadcrumb
      }
    });
    return;
  }
  emitView(requestId);
}
function handleExpandGroup(message) {
  const { requestId, groupId } = message;
  if (!session.hierarchy || !session.nav) {
    self.postMessage({ type: "view", requestId, error: "No hay jerarquía." });
    return;
  }
  session.nav = expandNavToGroup(session.nav, session.hierarchy, groupId);
  try {
    const { view, stats } = rebuildView();
    const detail = getGroupDetail(session.hierarchy, groupId, view.nodes);
    if (detail) detail.node.expanded = true;
    self.postMessage({
      type: "view",
      requestId,
      sourceName: session.sourceName,
      stats,
      view: viewPayload(view, stats),
      detail,
      nav: {
        tier: session.nav.tier,
        mode: session.nav.mode,
        contextGroupId: session.nav.contextGroupId,
        breadcrumb: view.breadcrumb
      }
    });
  } catch (error) {
    self.postMessage({
      type: "view",
      requestId,
      error: error instanceof Error ? error.message : "No se pudo expandir el grupo."
    });
  }
}
function handleCollapse(message) {
  const { requestId } = message;
  if (!session.hierarchy || !session.nav) {
    self.postMessage({ type: "view", requestId, error: "No hay jerarquía." });
    return;
  }
  session.nav = collapseNav(session.nav, session.hierarchy);
  emitView(requestId);
}
function handleBreadcrumb(message) {
  const { requestId, groupId } = message;
  if (!session.hierarchy || !session.nav) {
    self.postMessage({ type: "view", requestId, error: "No hay jerarquía." });
    return;
  }
  session.nav = navigateToBreadcrumb(session.nav, session.hierarchy, groupId ?? null);
  emitView(requestId);
}
function handleRevealNode(message) {
  const { requestId } = message;
  if (!session.indexed || !session.hierarchy || !session.nav) {
    self.postMessage({ type: "view", requestId, error: "No hay grafo indexado." });
    return;
  }
  const numericId = resolveNumericId(session.indexed, message.ref ?? message.numericId);
  if (numericId < 0) {
    self.postMessage({ type: "view", requestId, error: "Nodo no encontrado en el índice." });
    return;
  }
  if (message.pushHistory !== false) {
    session.viewStack.push({
      nav: snapshotNav(),
      focusNumericId: session.currentView?.focusNumericId ?? -1
    });
    if (session.viewStack.length > 12) session.viewStack.shift();
  }
  if (session.nav.mode === "hierarchy") {
    const revealed = revealLeafInNav(session.nav, session.hierarchy, numericId);
    session.nav = revealed.nav;
  }
  if (message.limits) session.limits = message.limits;
  const { view, stats } = rebuildView({ focusNumericId: numericId });
  const detail = getNodeDetail(session.indexed, numericId, {
    visibleSet: session.visibleSet
  });
  if (detail) {
    const indexInView = view.nodes.findIndex((node) => node.numericId === numericId);
    if (indexInView >= 0) {
      detail.node.index = indexInView;
      detail.node.lat = view.nodes[indexInView].lat;
      detail.node.lon = view.nodes[indexInView].lon;
      detail.node.inView = true;
    } else {
      detail.node.inView = false;
    }
  }
  self.postMessage({
    type: "view",
    requestId,
    sourceName: session.sourceName,
    stats,
    view: viewPayload(view, stats),
    detail,
    canRestoreView: session.viewStack.length > 0,
    revealedFromSearch: Boolean(message.fromSearch),
    nav: {
      tier: session.nav.tier,
      mode: session.nav.mode,
      contextGroupId: session.nav.contextGroupId,
      breadcrumb: view.breadcrumb
    }
  });
}
function handleRestoreView(message) {
  const { requestId } = message;
  const snap = session.viewStack.pop();
  if (!snap?.nav || !session.nav) {
    self.postMessage({
      type: "view",
      requestId,
      error: "No hay vista anterior para restaurar.",
      canRestoreView: false
    });
    return;
  }
  applyNavSnapshot(snap.nav);
  const { view, stats } = rebuildView({
    focusNumericId: Number.isInteger(snap.focusNumericId) ? snap.focusNumericId : -1
  });
  self.postMessage({
    type: "view",
    requestId,
    sourceName: session.sourceName,
    stats,
    view: viewPayload(view, stats),
    detail: null,
    canRestoreView: session.viewStack.length > 0,
    restored: true,
    nav: {
      tier: session.nav.tier,
      mode: session.nav.mode,
      contextGroupId: session.nav.contextGroupId,
      breadcrumb: view.breadcrumb
    }
  });
}
function handleRelease() {
  releaseTransient();
  releaseIndexed();
  self.postMessage({ type: "released" });
}
self.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "cancel") {
    if (session.activeJobId === message.jobId || message.jobId == null) {
      session.cancelled = true;
      releaseTransient();
    }
    return;
  }
  if (message.type === "release") {
    handleRelease();
    return;
  }
  if (message.type === "parse") {
    handleParse(message);
    return;
  }
  if (message.type === "search") {
    handleSearch(message);
    return;
  }
  if (message.type === "cancel-search") {
    handleCancelSearch(message);
    return;
  }
  if (message.type === "node-detail") {
    handleNodeDetail(message);
    return;
  }
  if (message.type === "request-view") {
    handleRequestView(message);
    return;
  }
  if (message.type === "expand-group") {
    handleExpandGroup(message);
    return;
  }
  if (message.type === "collapse-group" || message.type === "navigate-up") {
    handleCollapse(message);
    return;
  }
  if (message.type === "navigate-breadcrumb") {
    handleBreadcrumb(message);
    return;
  }
  if (message.type === "reveal-node") {
    handleRevealNode(message);
    return;
  }
  if (message.type === "restore-view") {
    handleRestoreView(message);
  }
};
