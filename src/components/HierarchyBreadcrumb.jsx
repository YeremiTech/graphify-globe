import { jsx, jsxs } from "react/jsx-runtime";
function HierarchyBreadcrumb({
  breadcrumb = [],
  active,
  onNavigate,
  onUp
}) {
  if (!active || !breadcrumb.length) return null;
  return /* @__PURE__ */ jsxs("nav", { className: "hierarchy-breadcrumb", "aria-label": "Ruta jerárquica", children: [
    /* @__PURE__ */ jsx("ol", { children: breadcrumb.map((crumb, index) => {
      const isLast = index === breadcrumb.length - 1;
      return /* @__PURE__ */ jsxs("li", { children: [
        isLast ? /* @__PURE__ */ jsx("span", { "aria-current": "page", children: crumb.name }) : /* @__PURE__ */ jsx("button", { type: "button", onClick: () => onNavigate(crumb.id ?? null), children: crumb.name }),
        !isLast && /* @__PURE__ */ jsx("span", { className: "breadcrumb-sep", "aria-hidden": "true", children: "/" })
      ] }, `${crumb.type}:${crumb.id ?? "root"}:${crumb.name}`);
    }) }),
    breadcrumb.length > 1 && /* @__PURE__ */ jsx("button", { type: "button", className: "tool-button breadcrumb-up", onClick: onUp, children: "Nivel anterior" })
  ] });
}
export {
  HierarchyBreadcrumb as default
};
