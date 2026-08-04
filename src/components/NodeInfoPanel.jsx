import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import GraphSearch from "./GraphSearch.jsx";
function safeValue(value) {
  if (value === null || value === void 0 || value === "") return "—";
  return String(value);
}
function NodeInfoPanel({
  id = "explorer-panel",
  active,
  node,
  connections = [],
  onClose,
  onSelectNode,
  onSearch,
  onCancelSearch,
  onQueryChange,
  onExpandGroup,
  onCollapseGroup,
  canRestoreView = false,
  onRestoreView
}) {
  if (!active) return null;
  return /* @__PURE__ */ jsxs(
    "aside",
    {
      id,
      className: `node-panel ${node ? "has-selection" : "is-empty"}`,
      "aria-label": "Explorador del grafo",
      "aria-labelledby": node ? "node-panel-title" : void 0,
      children: [
        /* @__PURE__ */ jsx("div", { className: "node-panel-search", children: /* @__PURE__ */ jsx(
          GraphSearch,
          {
            onSearch,
            onSelectNode: (result) => onSelectNode(result, { fromSearch: true }),
            onCancelSearch,
            onQueryChange
          }
        ) }),
        canRestoreView && /* @__PURE__ */ jsx("div", { className: "view-restore-bar", children: /* @__PURE__ */ jsx("button", { type: "button", className: "tool-button", onClick: onRestoreView, children: "Volver a la vista anterior" }) }),
        /* @__PURE__ */ jsx("div", { className: "node-panel-scroll", children: !node ? /* @__PURE__ */ jsxs("div", { className: "node-empty-state", children: [
          /* @__PURE__ */ jsx("span", { className: "empty-orbit", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx("strong", { children: "Explora el grafo" }),
          /* @__PURE__ */ jsx("p", { children: "La búsqueda cubre el índice completo (también nodos agrupados u omitidos por LOD). Selecciona un resultado para expandir su jerarquía y enfocarlo." }),
          /* @__PURE__ */ jsxs("div", { className: "connection-legend empty-legend", "aria-label": "Leyenda de colores", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "selected-point", "aria-hidden": "true" }),
              "Seleccionado"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "outgoing-point", "aria-hidden": "true" }),
              "Destino saliente"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "incoming-point", "aria-hidden": "true" }),
              "Origen entrante"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "bidirectional-point", "aria-hidden": "true" }),
              "Doble dirección"
            ] })
          ] })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { className: "node-panel-header", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("span", { children: node.isGroup ? "GRAPHIFY · GROUP INFO" : "GRAPHIFY · NODE INFO" }),
              /* @__PURE__ */ jsx("h2", { id: "node-panel-title", children: node.label })
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", onClick: onClose, "aria-label": "Limpiar selección", children: /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "×" }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "node-type-row", children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                className: "kind-dot",
                style: { background: node.color, color: node.color },
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ jsx("b", { children: node.kind }),
            /* @__PURE__ */ jsx("small", { children: node.group })
          ] }),
          node.isGroup && /* @__PURE__ */ jsxs("div", { className: "group-actions", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                className: "primary-button group-expand",
                onClick: () => onExpandGroup?.(node.groupId || node.id),
                children: "Expandir grupo"
              }
            ),
            node.parentId && /* @__PURE__ */ jsx("button", { type: "button", className: "tool-button", onClick: () => onCollapseGroup?.(), children: "Subir nivel" })
          ] }),
          !node.isGroup && node.inView === false && /* @__PURE__ */ jsx("p", { className: "node-view-hint", children: "Este nodo estaba indexado pero no visible; se expandieron sus grupos padres." }),
          /* @__PURE__ */ jsxs("div", { className: "focus-legend", "aria-label": "Leyenda de conexiones destacadas", children: [
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "selected-point", "aria-hidden": "true" }),
              "Nodo seleccionado"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "outgoing-point", "aria-hidden": "true" }),
              "Saliente"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "incoming-point", "aria-hidden": "true" }),
              "Entrante"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("i", { className: "bidirectional-point", "aria-hidden": "true" }),
              "Bidireccional"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("dl", { className: "node-fields", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("dt", { children: "ID" }),
              /* @__PURE__ */ jsx("dd", { children: safeValue(node.id) })
            ] }),
            node.isGroup ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsxs("div", { className: "node-field-grid", children: [
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Nodos" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.nodeCount || 0).toLocaleString("es") })
                ] }),
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Internas" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.internalEdges || 0).toLocaleString("es") })
                ] }),
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Externas" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.externalEdges || 0).toLocaleString("es") })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "node-field-grid", children: [
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Nivel" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.level || 0).toLocaleString("es") })
                ] }),
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Importancia" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.importance || node.degree || 0).toLocaleString("es") })
                ] })
              ] })
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("dt", { children: "Archivo" }),
                /* @__PURE__ */ jsx("dd", { children: safeValue(node.file) })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("dt", { children: "Ubicación" }),
                /* @__PURE__ */ jsx("dd", { children: safeValue(node.location) })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "node-field-grid", children: [
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Entrantes" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.incoming || 0).toLocaleString("es") })
                ] }),
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Salientes" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.outgoing || 0).toLocaleString("es") })
                ] }),
                /* @__PURE__ */ jsxs("span", { children: [
                  /* @__PURE__ */ jsx("dt", { children: "Grado" }),
                  /* @__PURE__ */ jsx("dd", { children: Number(node.degree || 0).toLocaleString("es") })
                ] })
              ] })
            ] })
          ] }),
          node.metadata && Object.keys(node.metadata).length > 0 && !node.isGroup && /* @__PURE__ */ jsxs("section", { className: "metadata-section", children: [
            /* @__PURE__ */ jsx("h3", { children: "Metadatos" }),
            /* @__PURE__ */ jsx("dl", { children: Object.entries(node.metadata).slice(0, 12).map(([key, value]) => /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("dt", { children: key }),
              /* @__PURE__ */ jsx("dd", { children: safeValue(value) })
            ] }, key)) })
          ] }),
          /* @__PURE__ */ jsxs("section", { className: "connections-section", children: [
            /* @__PURE__ */ jsx("h3", { children: node.isGroup ? "Relaciones agregadas" : "Conexiones indexadas" }),
            /* @__PURE__ */ jsxs("div", { className: "connection-legend", "aria-label": "Leyenda de conexiones", children: [
              /* @__PURE__ */ jsxs("span", { children: [
                /* @__PURE__ */ jsx("i", { className: "outgoing", "aria-hidden": "true" }),
                "Salientes"
              ] }),
              /* @__PURE__ */ jsxs("span", { children: [
                /* @__PURE__ */ jsx("i", { className: "incoming", "aria-hidden": "true" }),
                "Entrantes"
              ] })
            ] }),
            connections.length === 0 ? /* @__PURE__ */ jsx("p", { children: node.isGroup ? "No hay relaciones agregadas visibles." : "No hay relaciones indexadas para este nodo." }) : /* @__PURE__ */ jsx("div", { className: "connection-list", role: "list", children: connections.map((connection, index) => /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                role: "listitem",
                className: connection.direction,
                onClick: () => onSelectNode(connection.node),
                "aria-label": `${connection.direction === "saliente" ? "Relación saliente" : "Relación entrante"} ${connection.relation} hacia ${connection.node.label}`,
                children: [
                  /* @__PURE__ */ jsx("span", { className: `direction ${connection.direction}`, "aria-hidden": "true", children: connection.direction === "saliente" ? "→" : "←" }),
                  /* @__PURE__ */ jsxs("span", { className: "connection-copy", children: [
                    /* @__PURE__ */ jsx("strong", { children: connection.node.label }),
                    /* @__PURE__ */ jsxs("small", { children: [
                      connection.direction,
                      " · ",
                      connection.relation,
                      " · ",
                      connection.confidence,
                      connection.node.isGroup ? " · grupo" : "",
                      connection.node.inView === false ? " · no visible" : ""
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx("span", { className: `connection-point ${connection.direction}`, "aria-hidden": "true" })
                ]
              },
              `${connection.node.id}-${connection.relation}-${index}`
            )) })
          ] })
        ] }) })
      ]
    }
  );
}
export {
  NodeInfoPanel as default
};
