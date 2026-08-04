import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import BrandMark from "./components/BrandMark.jsx";
import GlobeScene from "./components/GlobeScene.jsx";
import HierarchyBreadcrumb from "./components/HierarchyBreadcrumb.jsx";
import ImportPanel from "./components/ImportPanel.jsx";
import NodeInfoPanel from "./components/NodeInfoPanel.jsx";
import { useGraphSession } from "./hooks/useGraphSession.js";
function formatCount(value) {
  return Number(value || 0).toLocaleString("es");
}
function selectedIndexFrom(selectedNode, view) {
  if (!selectedNode || !view?.nodes) return -1;
  if (Number.isInteger(selectedNode.index) && selectedNode.index >= 0) {
    const byIndex = view.nodes[selectedNode.index];
    if (byIndex) {
      if (selectedNode.isGroup && byIndex.groupId === selectedNode.groupId) return selectedNode.index;
      if (!selectedNode.isGroup && byIndex.numericId === selectedNode.numericId) return selectedNode.index;
    }
  }
  if (selectedNode.isGroup && selectedNode.groupId) {
    return view.nodes.findIndex((node) => node.isGroup && node.groupId === selectedNode.groupId);
  }
  if (selectedNode.numericId == null) return -1;
  return view.nodes.findIndex((node) => node.numericId === selectedNode.numericId);
}
function App() {
  const inputRef = useRef(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [renderInfo, setRenderInfo] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchIds, setSearchIds] = useState(null);
  const session = useGraphSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    const onKeyDown = (event) => {
      const current = sessionRef.current;
      if (event.key === "Escape") {
        if (current.selectedNode) {
          current.clearSelection();
          return;
        }
        if (current.canRestoreView) {
          current.restorePreviousView();
          return;
        }
        if (current.hierarchyActive && current.breadcrumb.length > 1) {
          current.collapseGroup();
        }
        return;
      }
      if (event.key === "Enter" && current.selectedNode?.isGroup) {
        event.preventDefault();
        current.expandGroup(current.selectedNode.groupId || current.selectedNode.id);
        return;
      }
      if ((event.key === "Backspace" || event.key === "ArrowLeft") && event.altKey) {
        if (current.hierarchyActive) {
          event.preventDefault();
          current.collapseGroup();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (!session.hasSession) {
      setRenderInfo(null);
      setSearchActive(false);
      setSearchIds(null);
    }
  }, [session.hasSession]);
  const openPicker = () => inputRef.current?.click();
  const onInputChange = (event) => {
    const [file] = event.target.files || [];
    session.importFile(file);
    event.target.value = "";
  };
  const dropHandlers = useMemo(
    () => ({
      onDragEnter: (event) => {
        event.preventDefault();
        setDraggingFile(true);
      },
      onDragOver: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (event) => {
        if (event.currentTarget === event.target) setDraggingFile(false);
      },
      onDrop: (event) => {
        event.preventDefault();
        setDraggingFile(false);
        const [file] = event.dataTransfer.files || [];
        session.importFile(file);
      }
    }),
    [session.importFile]
  );
  const selectedIndex = selectedIndexFrom(session.selectedNode, session.view);
  const stats = session.stats;
  const statusText = (() => {
    if (session.loading || session.error) return session.status;
    if (renderInfo?.progressive && renderInfo.message) return renderInfo.message;
    if (renderInfo?.simplified && renderInfo.message) {
      return `${session.status} · ${renderInfo.message}`;
    }
    return session.status;
  })();
  return /* @__PURE__ */ jsxs(
    "main",
    {
      className: `app-shell ${session.hasSession ? "has-graph" : "is-empty"} ${session.selectedNode ? "has-selection" : "no-selection"}`,
      ...dropHandlers,
      children: [
        /* @__PURE__ */ jsx("a", { className: "skip-link", href: session.hasSession ? "#explorer-panel" : "#import-panel", children: "Saltar al panel principal" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            ref: inputRef,
            id: "graph-file-input",
            className: "sr-only",
            type: "file",
            accept: "application/json,.json,.jsonl,.ndjson",
            onChange: onInputChange,
            "aria-label": "Seleccionar archivo GRAPHIFY.json o JSONL"
          }
        ),
        /* @__PURE__ */ jsx(
          GlobeScene,
          {
            graph: session.view,
            autoRotate: session.autoRotate,
            selectedIndex,
            resetToken: session.resetToken,
            quality: session.quality,
            searchActive,
            searchIds,
            onRenderInfo: (info) => setRenderInfo(info),
            onNodeSelect: (node) => {
              if (!node) {
                session.clearSelection();
                return;
              }
              session.selectNodeByRef(node);
            },
            onNodeHover: (node, screenPoint) => {
              session.setHoveredNode(node);
              if (screenPoint) session.setPointer(screenPoint);
            }
          }
        ),
        /* @__PURE__ */ jsxs("header", { className: "topbar", children: [
          /* @__PURE__ */ jsxs("div", { className: "brand-block", children: [
            /* @__PURE__ */ jsx(BrandMark, {}),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("strong", { children: "GRAPHIFY GLOBE" }),
              /* @__PURE__ */ jsx("small", { children: session.sourceName || "VISUALIZADOR LOCAL" })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "toolbar", role: "toolbar", "aria-label": "Controles del globo", children: session.hasSession && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: "tool-button import-other",
                onClick: openPicker,
                "aria-label": "Importar otro archivo",
                children: "Importar otro"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: `icon-button ${session.autoRotate ? "is-active" : ""}`,
                onClick: () => session.setAutoRotate((value) => !value),
                "aria-label": session.autoRotate ? "Pausar rotación" : "Activar rotación",
                "aria-pressed": session.autoRotate,
                title: session.autoRotate ? "Pausar rotación" : "Activar rotación",
                children: /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: session.autoRotate ? "Ⅱ" : "▶" })
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: "icon-button",
                onClick: () => session.setResetToken((value) => value + 1),
                "aria-label": "Restablecer cámara",
                title: "Restablecer cámara",
                children: /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "↻" })
              }
            ),
            session.canRestoreView && /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: "tool-button view-restore-compact",
                onClick: session.restorePreviousView,
                "aria-label": "Volver a la vista anterior",
                title: "Volver a la vista anterior",
                children: "← Vista"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: "icon-button danger",
                onClick: session.clearSession,
                "aria-label": "Cerrar grafo",
                title: "Cerrar grafo",
                children: /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "×" })
              }
            )
          ] }) })
        ] }),
        !session.hasSession && /* @__PURE__ */ jsx(
          ImportPanel,
          {
            quality: session.quality,
            onQualityChange: session.setQuality,
            onImport: openPicker,
            onCancel: session.cancelImport,
            loading: session.loading,
            loadState: session.loadState,
            progress: session.progress,
            error: session.error,
            warningNote: session.warningNote,
            pendingImport: session.pendingImport,
            onConfirmImport: session.confirmPendingImport,
            onDismissImport: session.dismissPendingImport
          }
        ),
        session.hasSession && /* @__PURE__ */ jsx(
          HierarchyBreadcrumb,
          {
            active: session.hierarchyActive,
            breadcrumb: session.breadcrumb,
            onNavigate: session.navigateBreadcrumb,
            onUp: session.collapseGroup
          }
        ),
        session.hasSession && stats && /* @__PURE__ */ jsxs("section", { className: "graph-summary", "aria-label": "Resumen del grafo", children: [
          /* @__PURE__ */ jsxs("span", { title: "Nodos y relaciones encontrados en el archivo", children: [
            "Proyecto: ",
            /* @__PURE__ */ jsx("b", { children: formatCount(stats.foundNodes) }),
            " nodos · ",
            /* @__PURE__ */ jsx("b", { children: formatCount(stats.foundEdges) }),
            " rel."
          ] }),
          /* @__PURE__ */ jsxs("span", { title: "Nodos válidos indexados en el worker", children: [
            "Indexados: ",
            /* @__PURE__ */ jsx("b", { children: formatCount(stats.indexedNodes) })
          ] }),
          /* @__PURE__ */ jsxs("span", { title: "Entidades en la vista actual (grupos o nodos)", children: [
            "Vista: ",
            /* @__PURE__ */ jsx("b", { children: formatCount(stats.visibleNodes) }),
            " · ",
            /* @__PURE__ */ jsx("b", { children: formatCount(stats.visibleEdges) })
          ] }),
          /* @__PURE__ */ jsxs("span", { title: "Nodos indexados no dibujados individualmente", className: "summary-muted", children: [
            "Agrupados: ",
            /* @__PURE__ */ jsx("b", { children: formatCount(stats.groupedNodes) })
          ] }),
          stats.tier && /* @__PURE__ */ jsxs("span", { className: "summary-muted", title: "Estrategia de agrupamiento", children: [
            "Modo: ",
            /* @__PURE__ */ jsx("b", { children: stats.tier })
          ] }),
          renderInfo && /* @__PURE__ */ jsxs(
            "span",
            {
              className: "summary-muted",
              title: renderInfo.reasons?.join(" · ") || "Nivel de detalle de la escena 3D",
              children: [
                "Escena: ",
                /* @__PURE__ */ jsx("b", { children: formatCount(renderInfo.renderNodeCount) }),
                typeof renderInfo.viewNodeCount === "number" && renderInfo.renderNodeCount < renderInfo.viewNodeCount ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  " de ",
                  /* @__PURE__ */ jsx("b", { children: formatCount(renderInfo.viewNodeCount) })
                ] }) : null,
                " ",
                "· LOD ",
                /* @__PURE__ */ jsx("b", { children: renderInfo.lodLevel }),
                renderInfo.profile ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  " · ",
                  renderInfo.profile
                ] }) : null
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "status-line", role: "status", "aria-live": "polite", "aria-atomic": "true", children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: `status-dot ${session.loading || renderInfo?.progressive ? "is-loading" : ""}`,
              "aria-hidden": "true"
            }
          ),
          statusText
        ] }),
        session.hoveredNode && !session.selectedNode && /* @__PURE__ */ jsxs(
          "div",
          {
            className: "node-tooltip",
            style: { left: session.pointer.x + 16, top: session.pointer.y + 16 },
            role: "status",
            children: [
              /* @__PURE__ */ jsx("strong", { children: session.hoveredNode.label }),
              /* @__PURE__ */ jsx("span", { children: session.hoveredNode.isGroup ? `${session.hoveredNode.kind} · ${formatCount(session.hoveredNode.nodeCount)} nodos` : session.hoveredNode.kind })
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          NodeInfoPanel,
          {
            id: "explorer-panel",
            active: session.hasSession,
            node: session.selectedNode,
            connections: session.selectedConnections,
            onClose: session.clearSelection,
            onSelectNode: (node, options) => session.selectNodeByRef(node, options),
            onSearch: async (query, options) => {
              const response = await session.searchNodes(query, options);
              const results = response?.results || [];
              setSearchActive(Boolean(String(query || "").trim()));
              setSearchIds(new Set(results.map((item) => item.numericId ?? item.id).filter((id) => id != null)));
              return response;
            },
            onCancelSearch: session.cancelSearch,
            onQueryChange: (term) => {
              setSearchActive(Boolean(term));
              if (!term) setSearchIds(null);
            },
            onExpandGroup: session.expandGroup,
            onCollapseGroup: session.collapseGroup,
            canRestoreView: session.canRestoreView,
            onRestoreView: session.restorePreviousView
          }
        ),
        draggingFile && /* @__PURE__ */ jsx("div", { className: "drop-overlay", role: "status", "aria-live": "assertive", children: /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("strong", { children: "Suelta graph.json" }),
          /* @__PURE__ */ jsx("span", { children: "El archivo se procesa localmente en tu navegador" })
        ] }) })
      ]
    }
  );
}
export {
  App as default
};
