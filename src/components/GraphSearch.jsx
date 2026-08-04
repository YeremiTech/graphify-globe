import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
const DEBOUNCE_MS = 200;
function GraphSearch({
  onSearch,
  onSelectNode,
  onCancelSearch,
  onQueryChange
}) {
  const listId = useId();
  const inputId = useId();
  const statusId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [searching, setSearching] = useState(false);
  const [statusText, setStatusText] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const requestSerial = useRef(0);
  const activeSearchIdRef = useRef(null);
  useEffect(() => {
    onQueryChange?.(query.trim());
  }, [query, onQueryChange]);
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      if (activeSearchIdRef.current) {
        onCancelSearch?.(activeSearchIdRef.current);
        activeSearchIdRef.current = null;
      }
      setResults([]);
      setTotalMatched(0);
      setOpen(false);
      setSearching(false);
      setStatusText("");
      return void 0;
    }
    const serial = requestSerial.current + 1;
    requestSerial.current = serial;
    setSearching(true);
    setStatusText("Buscando en el índice completo…");
    setOpen(true);
    const timer = setTimeout(async () => {
      if (activeSearchIdRef.current) {
        onCancelSearch?.(activeSearchIdRef.current);
      }
      const response = await onSearch(term, {
        onPartial: (partialResults, meta) => {
          if (requestSerial.current !== serial) return;
          setResults(partialResults || []);
          setTotalMatched(meta?.totalMatched ?? (partialResults || []).length);
          setActiveIndex(0);
          setStatusText(
            `Mostrando ${(partialResults || []).length} de ${meta?.totalMatched ?? "…"} coincidencias…`
          );
        }
      });
      if (requestSerial.current !== serial) return;
      if (response?.cancelled) {
        setSearching(false);
        setStatusText("Búsqueda cancelada");
        return;
      }
      const matches = Array.isArray(response) ? response : response?.results || [];
      const matched = Array.isArray(response) ? matches.length : response?.totalMatched ?? matches.length;
      activeSearchIdRef.current = response?.searchId || null;
      setResults(matches);
      setTotalMatched(matched);
      setActiveIndex(0);
      setOpen(true);
      setSearching(false);
      setStatusText(
        matches.length ? `${matches.length} resultado${matches.length === 1 ? "" : "s"}${matched > matches.length ? ` (de ${matched} coincidencias)` : ""}` : `Sin resultados para “${term}”`
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      if (activeSearchIdRef.current) {
        onCancelSearch?.(activeSearchIdRef.current);
        activeSearchIdRef.current = null;
      }
    };
  }, [query, onSearch, onCancelSearch]);
  useEffect(() => () => {
    if (activeSearchIdRef.current) {
      onCancelSearch?.(activeSearchIdRef.current);
      activeSearchIdRef.current = null;
    }
  }, [onCancelSearch]);
  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);
  const choose = (node) => {
    setQuery(node.label);
    setOpen(false);
    setStatusText(`Seleccionado: ${node.label}`);
    onSelectNode(node, { fromSearch: true });
  };
  const clear = () => {
    if (activeSearchIdRef.current) {
      onCancelSearch?.(activeSearchIdRef.current);
      activeSearchIdRef.current = null;
    }
    requestSerial.current += 1;
    setQuery("");
    setOpen(false);
    setResults([]);
    setTotalMatched(0);
    setStatusText("");
    inputRef.current?.focus();
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((value) => Math.min(value + 1, Math.max(0, results.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => Math.max(0, value - 1));
    } else if (event.key === "Enter") {
      if (open && results[activeIndex]) {
        event.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (open) {
        setOpen(false);
        setStatusText(query.trim() ? `${results.length} resultados (lista cerrada)` : "");
      } else if (query) {
        clear();
      }
    } else if (event.key === "Home" && open && results.length) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && open && results.length) {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    }
  };
  const activeOptionId = open && results[activeIndex] ? `${listId}-option-${activeIndex}` : void 0;
  return /* @__PURE__ */ jsxs("section", { className: "graph-search", ref: rootRef, "aria-label": "Búsqueda global de nodos", children: [
    /* @__PURE__ */ jsxs("div", { className: "search-label-row", children: [
      /* @__PURE__ */ jsx("label", { htmlFor: inputId, children: "BUSCADOR GLOBAL" }),
      query.trim() && /* @__PURE__ */ jsx("small", { id: statusId, "aria-live": "polite", "aria-atomic": "true", children: searching ? "buscando…" : `${results.length}${totalMatched > results.length ? `/${totalMatched}` : ""} resultados` })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "search-field", children: [
      /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "⌕" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          ref: inputRef,
          id: inputId,
          role: "combobox",
          value: query,
          onChange: (event) => setQuery(event.target.value),
          onFocus: () => query.trim() && setOpen(true),
          onKeyDown,
          placeholder: "ID, nombre, ruta, tipo, módulo, etiquetas…",
          autoComplete: "off",
          spellCheck: "false",
          "aria-autocomplete": "list",
          "aria-expanded": open,
          "aria-controls": listId,
          "aria-activedescendant": activeOptionId,
          "aria-describedby": query.trim() ? statusId : void 0
        }
      ),
      query && /* @__PURE__ */ jsx("button", { type: "button", onClick: clear, "aria-label": "Limpiar búsqueda", children: "×" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "sr-only", "aria-live": "polite", "aria-atomic": "true", children: statusText }),
    open && /* @__PURE__ */ jsx(
      "div",
      {
        id: listId,
        className: "search-results",
        role: "listbox",
        "aria-label": "Resultados de búsqueda",
        children: results.length ? results.map((node, index) => /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            id: `${listId}-option-${index}`,
            role: "option",
            "aria-selected": index === activeIndex,
            className: index === activeIndex ? "is-active" : "",
            onMouseEnter: () => setActiveIndex(index),
            onClick: () => choose(node),
            children: [
              /* @__PURE__ */ jsx("span", { className: "search-kind-dot", style: { background: node.color }, "aria-hidden": "true" }),
              /* @__PURE__ */ jsxs("span", { className: "search-result-copy", children: [
                /* @__PURE__ */ jsx("strong", { children: node.label }),
                /* @__PURE__ */ jsxs("small", { children: [
                  node.kind,
                  node.group ? ` · ${node.group}` : "",
                  node.file ? ` · ${node.file}` : "",
                  node.inView ? "" : " · fuera de vista"
                ] })
              ] }),
              /* @__PURE__ */ jsx("b", { "aria-label": `Grado ${node.degree}`, children: node.degree })
            ]
          },
          `${node.numericId}-${node.id}`
        )) : /* @__PURE__ */ jsx("p", { role: "status", children: searching ? "Buscando en el índice completo…" : `No se encontraron nodos para “${query}”.` })
      }
    )
  ] });
}
export {
  GraphSearch as default
};
