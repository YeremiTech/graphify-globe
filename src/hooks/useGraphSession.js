import { useCallback, useEffect, useRef, useState } from "react";
import { GraphError } from "../lib/graphErrors.js";
import { assessImportFile, formatBytes } from "../lib/importLimits.js";
import { isBusyState, LOAD_STATE_LABELS, LOAD_STATES } from "../lib/loadStates.js";
const QUALITY_LIMITS = {
  ligero: { maxNodes: 450, maxEdges: 1e3, maxAnimatedEdges: 24 },
  equilibrado: { maxNodes: 900, maxEdges: 2400, maxAnimatedEdges: 42 },
  detallado: { maxNodes: 1800, maxEdges: 6e3, maxAnimatedEdges: 64 },
  automatico: { maxNodes: 900, maxEdges: 2400, maxAnimatedEdges: 42 }
};
function createJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function createRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function useGraphSession() {
  const [hasSession, setHasSession] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [stats, setStats] = useState(null);
  const [view, setView] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedConnections, setSelectedConnections] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [quality, setQuality] = useState("equilibrado");
  const [autoRotate, setAutoRotate] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [loadState, setLoadState] = useState(LOAD_STATES.IDLE);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(LOAD_STATE_LABELS[LOAD_STATES.IDLE]);
  const [error, setError] = useState("");
  const [warningNote, setWarningNote] = useState("");
  const [resetToken, setResetToken] = useState(0);
  const [pendingImport, setPendingImport] = useState(null);
  const [canRestoreView, setCanRestoreView] = useState(false);
  const workerRef = useRef(null);
  const activeJobRef = useRef(null);
  const mountedRef = useRef(true);
  const qualityRef = useRef(quality);
  const pendingRequestsRef = useRef(/* @__PURE__ */ new Map());
  const activeSearchIdRef = useRef(null);
  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);
  const settleRequest = useCallback((requestId, payload) => {
    const pending = pendingRequestsRef.current.get(requestId);
    if (!pending) return;
    pendingRequestsRef.current.delete(requestId);
    if (typeof pending === "function") pending(payload);
    else pending.resolve?.(payload);
  }, []);
  const notifyPartial = useCallback((requestId, payload) => {
    const pending = pendingRequestsRef.current.get(requestId);
    if (!pending || typeof pending === "function") return;
    pending.onPartial?.(payload);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    const worker = new Worker(new URL("../workers/graphWorker.js", import.meta.url), {
      type: "module"
    });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const message = event.data;
      if (!message || !mountedRef.current) return;
      if (message.jobId != null && message.jobId !== activeJobRef.current) {
        return;
      }
      if (message.type === "progress") {
        const percent = Math.round(Math.min(99, Math.max(1, message.value * 100)));
        setProgress(percent);
        if (message.phase === "reading") setLoadState(LOAD_STATES.READING);
        else if (message.phase === "validating") setLoadState(LOAD_STATES.VALIDATING);
        else if (message.phase === "processing") setLoadState(LOAD_STATES.PROCESSING);
        else if (message.phase === "indexing") setLoadState(LOAD_STATES.INDEXING);
        else if (message.phase === "preparing") setLoadState(LOAD_STATES.PREPARING);
        setStatus(message.label || LOAD_STATE_LABELS[LOAD_STATES.PROCESSING]);
        return;
      }
      if (message.type === "ready") {
        activeJobRef.current = null;
        setHasSession(true);
        setSourceName(message.sourceName || "graph.json");
        setStats(message.stats);
        setView(message.view);
        setSelectedNode(null);
        setSelectedConnections([]);
        setHoveredNode(null);
        setCanRestoreView(false);
        setProgress(100);
        setLoadState(LOAD_STATES.COMPLETED);
        setError("");
        const partial = message.disposition === "partial" || (message.warnings || []).length > 0;
        const warningText = partial ? ` Procesado parcialmente (${(message.warnings || []).length} aviso(s)).` : "";
        setWarningNote(warningText.trim());
        const s = message.stats;
        const tierLabel = message.nav?.tier ? ` · ${message.nav.tier}` : "";
        const importMeta = message.importMeta;
        const formatHint = importMeta?.streamingParse ? " · JSONL progresivo" : importMeta ? " · JSON completo en memoria" : "";
        setStatus(
          `Proyecto: ${s.foundNodes.toLocaleString("es")} nodos · Indexados: ${s.indexedNodes.toLocaleString("es")} · Vista: ${s.visibleNodes.toLocaleString("es")}${tierLabel}${formatHint}.${warningText}`
        );
        return;
      }
      if (message.type === "view") {
        settleRequest(message.requestId, message);
        if (message.error) return;
        setStats(message.stats);
        setView(message.view);
        if (typeof message.canRestoreView === "boolean") {
          setCanRestoreView(message.canRestoreView);
        }
        if (message.restored) {
          setSelectedNode(null);
          setSelectedConnections([]);
        } else if (message.detail?.node) {
          setSelectedNode(message.detail.node);
          setSelectedConnections(message.detail.connections || []);
        }
        return;
      }
      if (message.type === "search-partial") {
        notifyPartial(message.requestId, message);
        return;
      }
      if (message.type === "search-results" || message.type === "search-cancelled") {
        settleRequest(message.requestId, message);
        return;
      }
      if (message.type === "node-detail") {
        settleRequest(message.requestId, message);
        return;
      }
      if (message.type === "released") {
        return;
      }
      if (message.type === "cancelled") {
        activeJobRef.current = null;
        setProgress(0);
        setLoadState(LOAD_STATES.CANCELLED);
        setError("");
        setWarningNote("");
        setStatus(LOAD_STATE_LABELS[LOAD_STATES.CANCELLED]);
        return;
      }
      if (message.type === "error") {
        activeJobRef.current = null;
        setHasSession(false);
        setView(null);
        setStats(null);
        setProgress(0);
        setLoadState(LOAD_STATES.ERROR);
        setWarningNote("");
        setError(message.message || "El archivo no tiene un formato de grafo reconocido.");
        setStatus(LOAD_STATE_LABELS[LOAD_STATES.ERROR]);
      }
    };
    worker.onerror = (event) => {
      if (!mountedRef.current) return;
      activeJobRef.current = null;
      setProgress(0);
      setLoadState(LOAD_STATES.ERROR);
      setError(event.message || "Falló el proceso de análisis del JSON.");
      setStatus(LOAD_STATE_LABELS[LOAD_STATES.ERROR]);
    };
    return () => {
      mountedRef.current = false;
      const jobId = activeJobRef.current;
      try {
        if (jobId) worker.postMessage({ type: "cancel", jobId });
        worker.postMessage({ type: "release" });
      } catch {
      }
      worker.terminate();
      workerRef.current = null;
      activeJobRef.current = null;
      pendingRequestsRef.current.clear();
    };
  }, [settleRequest, notifyPartial]);
  const requestWorker = useCallback((payload, extras = {}) => new Promise((resolve) => {
    const requestId = createRequestId();
    if (extras.onPartial) {
      pendingRequestsRef.current.set(requestId, { resolve, onPartial: extras.onPartial });
    } else {
      pendingRequestsRef.current.set(requestId, resolve);
    }
    try {
      workerRef.current?.postMessage({ ...payload, requestId });
    } catch (error2) {
      pendingRequestsRef.current.delete(requestId);
      resolve({ error: error2 instanceof Error ? error2.message : "Worker no disponible" });
    }
  }), []);
  const cancelImport = useCallback(() => {
    const jobId = activeJobRef.current;
    if (!jobId) return;
    try {
      workerRef.current?.postMessage({ type: "cancel", jobId });
    } catch {
    }
    activeJobRef.current = null;
    if (!mountedRef.current) return;
    setProgress(0);
    setLoadState(LOAD_STATES.CANCELLED);
    setError("");
    setWarningNote("");
    setStatus(LOAD_STATE_LABELS[LOAD_STATES.CANCELLED]);
  }, []);
  const clearSession = useCallback(() => {
    if (activeJobRef.current) cancelImport();
    try {
      workerRef.current?.postMessage({ type: "release" });
    } catch {
    }
    setHasSession(false);
    setSourceName("");
    setStats(null);
    setView(null);
    setSelectedNode(null);
    setSelectedConnections([]);
    setHoveredNode(null);
    setError("");
    setWarningNote("");
    setPendingImport(null);
    setCanRestoreView(false);
    setProgress(0);
    setLoadState(LOAD_STATES.IDLE);
    setStatus(LOAD_STATE_LABELS[LOAD_STATES.IDLE]);
  }, [cancelImport]);
  const startParseJob = useCallback((file, assessment) => {
    if (activeJobRef.current) {
      try {
        workerRef.current?.postMessage({ type: "cancel", jobId: activeJobRef.current });
      } catch {
      }
    }
    try {
      workerRef.current?.postMessage({ type: "release" });
    } catch {
    }
    const jobId = createJobId();
    activeJobRef.current = jobId;
    setPendingImport(null);
    setHasSession(false);
    setView(null);
    setStats(null);
    setSelectedNode(null);
    setSelectedConnections([]);
    setHoveredNode(null);
    setError("");
    setWarningNote(
      assessment?.streaming ? "Formato JSONL: lectura progresiva por líneas. El índice completo permanece en memoria." : assessment?.honestNote || ""
    );
    setLoadState(LOAD_STATES.READING);
    setProgress(1);
    setStatus(
      assessment?.streaming ? "Leyendo JSONL de forma progresiva…" : "Leyendo GRAPHIFY.json completo en memoria…"
    );
    try {
      workerRef.current?.postMessage({
        type: "parse",
        jobId,
        file,
        fileName: file.name,
        limits: QUALITY_LIMITS[qualityRef.current],
        importFormat: assessment?.formatKind
      });
    } catch (postError) {
      activeJobRef.current = null;
      setLoadState(LOAD_STATES.ERROR);
      setProgress(0);
      setError(
        new GraphError({
          what: postError instanceof Error ? postError.message : "No se pudo enviar el archivo al analizador.",
          section: "worker",
          action: "Recarga la página e inténtalo de nuevo.",
          disposition: "rejected",
          code: "WORKER_POST_FAILED"
        }).message
      );
      setStatus(LOAD_STATE_LABELS[LOAD_STATES.ERROR]);
    }
  }, []);
  const dismissPendingImport = useCallback(() => {
    setPendingImport(null);
    setLoadState(LOAD_STATES.IDLE);
    setStatus(LOAD_STATE_LABELS[LOAD_STATES.IDLE]);
  }, []);
  const confirmPendingImport = useCallback(() => {
    if (!pendingImport?.file) return;
    startParseJob(pendingImport.file, pendingImport.assessment);
  }, [pendingImport, startParseJob]);
  const importFile = useCallback((file) => {
    if (!file) return;
    const assessment = assessImportFile(file);
    if (assessment.decision === "reject") {
      setPendingImport(null);
      setLoadState(LOAD_STATES.ERROR);
      setError(
        new GraphError({
          what: assessment.reasons.join(" "),
          section: "archivo",
          action: assessment.recommendations.join(" ") || "Reduce el grafo o usa .jsonl.",
          disposition: "rejected",
          code: assessment.code || "FILE_REJECTED"
        }).message
      );
      setStatus(LOAD_STATE_LABELS[LOAD_STATES.ERROR]);
      return;
    }
    if (assessment.decision === "confirm") {
      setError("");
      setWarningNote("");
      setPendingImport({ file, assessment });
      setLoadState(LOAD_STATES.IDLE);
      setStatus(
        `Confirmación requerida: ${formatBytes(assessment.fileSize)} · pico estimado ≈ ${formatBytes(assessment.estimatedPeakBytes)}`
      );
      return;
    }
    startParseJob(file, assessment);
  }, [startParseJob]);
  const cancelSearch = useCallback((searchId) => {
    const id = searchId || activeSearchIdRef.current;
    activeSearchIdRef.current = null;
    try {
      workerRef.current?.postMessage({ type: "cancel-search", searchId: id });
    } catch {
    }
  }, []);
  const searchNodes = useCallback(async (query, options = {}) => {
    const searchId = `search-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (activeSearchIdRef.current) {
      cancelSearch(activeSearchIdRef.current);
    }
    activeSearchIdRef.current = searchId;
    const response = await requestWorker(
      {
        type: "search",
        query,
        searchId,
        limit: options.limit || 18
      },
      {
        onPartial: (partial) => {
          if (activeSearchIdRef.current !== searchId) return;
          options.onPartial?.(partial.results || [], {
            totalMatched: partial.totalMatched,
            scanned: partial.scanned,
            total: partial.total,
            done: false,
            searchId
          });
        }
      }
    );
    if (activeSearchIdRef.current === searchId) {
      activeSearchIdRef.current = null;
    }
    if (response?.type === "search-cancelled" || response?.cancelled) {
      return { results: [], cancelled: true, searchId };
    }
    return {
      results: response.results || [],
      totalMatched: response.totalMatched ?? (response.results || []).length,
      cancelled: false,
      searchId,
      done: true
    };
  }, [requestWorker, cancelSearch]);
  const selectNodeByRef = useCallback(async (ref, options = {}) => {
    if (!ref) {
      setSelectedNode(null);
      setSelectedConnections([]);
      return;
    }
    if (ref.isGroup || ref.groupId) {
      const detailResponse = await requestWorker({ type: "node-detail", ref });
      if (detailResponse.detail?.node) {
        setSelectedNode(detailResponse.detail.node);
        setSelectedConnections(detailResponse.detail.connections || []);
      }
      return;
    }
    const tryDetailOnly = ref.inView === true || ref.inView !== false && Number.isInteger(ref.index) && ref.index >= 0;
    if (tryDetailOnly) {
      const detailResponse = await requestWorker({ type: "node-detail", ref });
      const detailNode = detailResponse.detail?.node;
      if (detailNode && detailNode.inView !== false && detailNode.index >= 0) {
        setSelectedNode({
          ...detailNode,
          index: Number.isInteger(ref.index) && ref.index >= 0 ? ref.index : detailNode.index,
          lat: ref.lat ?? detailNode.lat,
          lon: ref.lon ?? detailNode.lon
        });
        setSelectedConnections(detailResponse.detail.connections || []);
        return;
      }
    }
    const viewResponse = await requestWorker({
      type: "reveal-node",
      limits: QUALITY_LIMITS[qualityRef.current],
      ref,
      pushHistory: options.pushHistory !== false,
      fromSearch: Boolean(options.fromSearch)
    });
    if (viewResponse.error) {
      setError(viewResponse.error);
      return;
    }
    if (typeof viewResponse.canRestoreView === "boolean") {
      setCanRestoreView(viewResponse.canRestoreView);
    }
    if (viewResponse.detail?.node) {
      setSelectedNode(viewResponse.detail.node);
      setSelectedConnections(viewResponse.detail.connections || []);
    }
  }, [requestWorker]);
  const restorePreviousView = useCallback(async () => {
    const response = await requestWorker({ type: "restore-view" });
    if (response.error) {
      setError(response.error);
      setCanRestoreView(false);
      return;
    }
    if (typeof response.canRestoreView === "boolean") {
      setCanRestoreView(response.canRestoreView);
    }
    setSelectedNode(null);
    setSelectedConnections([]);
  }, [requestWorker]);
  const expandGroup = useCallback(async (groupId) => {
    if (!groupId) return;
    const response = await requestWorker({ type: "expand-group", groupId });
    if (response.error) setError(response.error);
  }, [requestWorker]);
  const collapseGroup = useCallback(async () => {
    const response = await requestWorker({ type: "navigate-up" });
    if (response.error) setError(response.error);
    else {
      setSelectedNode(null);
      setSelectedConnections([]);
    }
  }, [requestWorker]);
  const navigateBreadcrumb = useCallback(async (groupId) => {
    const response = await requestWorker({ type: "navigate-breadcrumb", groupId: groupId ?? null });
    if (response.error) setError(response.error);
    else {
      setSelectedNode(null);
      setSelectedConnections([]);
    }
  }, [requestWorker]);
  const clearSelection = useCallback(() => {
    setSelectedNode(null);
    setSelectedConnections([]);
  }, []);
  return {
    hasSession,
    sourceName,
    stats,
    view,
    breadcrumb: view?.breadcrumb || [],
    hierarchyActive: Boolean(view?.hierarchyActive),
    selectedNode,
    selectedConnections,
    hoveredNode,
    setHoveredNode,
    pointer,
    setPointer,
    quality,
    setQuality,
    autoRotate,
    setAutoRotate,
    loadState,
    progress,
    status,
    error,
    warningNote,
    pendingImport,
    canRestoreView,
    resetToken,
    setResetToken,
    loading: isBusyState(loadState),
    importFile,
    confirmPendingImport,
    dismissPendingImport,
    cancelImport,
    clearSession,
    searchNodes,
    cancelSearch,
    selectNodeByRef,
    restorePreviousView,
    expandGroup,
    collapseGroup,
    navigateBreadcrumb,
    clearSelection
  };
}
export {
  QUALITY_LIMITS,
  useGraphSession
};
