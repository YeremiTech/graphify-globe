import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
import { LOAD_STATE_LABELS, LOAD_STATES } from "../lib/loadStates.js";
const QUALITY_OPTIONS = [
  { value: "ligero", label: "Ligero", hint: "equipos modestos" },
  { value: "equilibrado", label: "Equilibrado", hint: "recomendado" },
  { value: "detallado", label: "Detallado", hint: "equipos potentes" },
  { value: "automatico", label: "Automático", hint: "adapta al dispositivo" }
];
const PHASE_HINTS = {
  [LOAD_STATES.READING]: "Leyendo archivo",
  [LOAD_STATES.VALIDATING]: "Validando",
  [LOAD_STATES.PROCESSING]: "Procesando",
  [LOAD_STATES.INDEXING]: "Indexando",
  [LOAD_STATES.PREPARING]: "Preparando visualización"
};
function ImportPanel({
  quality,
  onQualityChange,
  onImport,
  onCancel,
  loading,
  loadState,
  progress,
  error,
  warningNote,
  pendingImport = null,
  onConfirmImport,
  onDismissImport
}) {
  const listId = useId();
  const confirmDescId = useId();
  const fieldRef = useRef(null);
  const confirmRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = QUALITY_OPTIONS.find((option) => option.value === quality) || QUALITY_OPTIONS[1];
  const phaseHint = PHASE_HINTS[loadState] || (loading ? "Procesando" : null);
  const assessment = pendingImport?.assessment;
  useEffect(() => {
    if (!open) return void 0;
    const onPointerDown = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  useEffect(() => {
    if (loading) setOpen(false);
  }, [loading]);
  useEffect(() => {
    if (!assessment) return void 0;
    const dialog = confirmRef.current;
    const focusTarget = dialog?.querySelector("button");
    focusTarget?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissImport?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [assessment, onDismissImport]);
  const chooseQuality = (value) => {
    onQualityChange(value);
    setOpen(false);
  };
  const onQualityKeyDown = (event) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    const index = QUALITY_OPTIONS.findIndex((option) => option.value === quality);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = QUALITY_OPTIONS[Math.min(index + 1, QUALITY_OPTIONS.length - 1)];
      if (next) onQualityChange(next.value);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = QUALITY_OPTIONS[Math.max(index - 1, 0)];
      if (prev) onQualityChange(prev.value);
    } else if (event.key === "Home") {
      event.preventDefault();
      onQualityChange(QUALITY_OPTIONS[0].value);
    } else if (event.key === "End") {
      event.preventDefault();
      onQualityChange(QUALITY_OPTIONS[QUALITY_OPTIONS.length - 1].value);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(false);
    }
  };
  return /* @__PURE__ */ jsxs("section", { id: "import-panel", className: "import-panel", "aria-labelledby": "import-title", tabIndex: -1, children: [
    /* @__PURE__ */ jsx("div", { className: "import-kicker", children: "GRAPHIFY · JSON IMPORT" }),
    /* @__PURE__ */ jsx("h1", { id: "import-title", children: "Arquitectura sobre un globo 3D" }),
    /* @__PURE__ */ jsxs("p", { children: [
      "Selecciona ",
      /* @__PURE__ */ jsx("code", { children: "graph.json" }),
      " / ",
      /* @__PURE__ */ jsx("code", { children: "GRAPHIFY.json" }),
      " (proyectos pequeños/medianos) o ",
      /* @__PURE__ */ jsx("code", { children: ".jsonl" }),
      " (grafos grandes, lectura por líneas). Los datos no se envían a ningún servidor. El JSON tradicional se carga completo en memoria; no hay parsing incremental seguro con ese formato."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: `quality-field ${open ? "is-open" : ""}`, ref: fieldRef, children: [
      /* @__PURE__ */ jsx("span", { className: "quality-label", id: `${listId}-label`, children: "Nivel de detalle" }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          id: "quality",
          className: "quality-trigger",
          "aria-haspopup": "listbox",
          "aria-expanded": open,
          "aria-controls": listId,
          "aria-labelledby": `${listId}-label quality`,
          disabled: loading,
          onClick: () => setOpen((value) => !value),
          onKeyDown: onQualityKeyDown,
          children: [
            /* @__PURE__ */ jsxs("span", { className: "quality-trigger-text", children: [
              /* @__PURE__ */ jsx("strong", { children: selected.label }),
              /* @__PURE__ */ jsx("small", { children: selected.hint })
            ] }),
            /* @__PURE__ */ jsx("span", { className: "quality-chevron", "aria-hidden": "true" })
          ]
        }
      ),
      open && /* @__PURE__ */ jsx(
        "ul",
        {
          id: listId,
          className: "quality-menu",
          role: "listbox",
          "aria-labelledby": `${listId}-label`,
          children: QUALITY_OPTIONS.map((option) => {
            const isActive = option.value === quality;
            return /* @__PURE__ */ jsx("li", { role: "presentation", children: /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                role: "option",
                "aria-selected": isActive,
                className: `quality-option ${isActive ? "is-active" : ""}`,
                onClick: () => chooseQuality(option.value),
                children: [
                  /* @__PURE__ */ jsxs("span", { children: [
                    /* @__PURE__ */ jsx("strong", { children: option.label }),
                    /* @__PURE__ */ jsx("small", { children: option.hint })
                  ] }),
                  isActive && /* @__PURE__ */ jsx("span", { className: "quality-check", "aria-hidden": "true" })
                ]
              }
            ) }, option.value);
          })
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "import-actions", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: "primary-button", onClick: onImport, disabled: loading || Boolean(assessment), children: loading ? "Procesando…" : "Importar archivo" }),
      loading && /* @__PURE__ */ jsx("button", { type: "button", className: "tool-button cancel-import", onClick: onCancel, children: "Cancelar" })
    ] }),
    assessment && /* @__PURE__ */ jsxs(
      "div",
      {
        ref: confirmRef,
        className: "import-confirm",
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": "import-confirm-title",
        "aria-describedby": confirmDescId,
        children: [
          /* @__PURE__ */ jsx("strong", { id: "import-confirm-title", children: "Archivo grande — confirmación" }),
          /* @__PURE__ */ jsxs("div", { id: confirmDescId, children: [
            /* @__PURE__ */ jsxs("p", { children: [
              /* @__PURE__ */ jsx("code", { children: pendingImport.file?.name }),
              " · ",
              (assessment.fileSize / (1024 * 1024)).toFixed(1),
              " MB",
              assessment.streaming ? " · JSONL progresivo" : " · JSON completo en memoria"
            ] }),
            /* @__PURE__ */ jsx("ul", { children: assessment.reasons.map((reason) => /* @__PURE__ */ jsx("li", { children: reason }, reason)) }),
            assessment.recommendations?.length > 0 && /* @__PURE__ */ jsx("ul", { className: "import-confirm-recs", children: assessment.recommendations.map((item) => /* @__PURE__ */ jsx("li", { children: item }, item)) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "import-confirm-actions", children: [
            /* @__PURE__ */ jsx("button", { type: "button", className: "primary-button", onClick: onConfirmImport, children: "Continuar de todos modos" }),
            /* @__PURE__ */ jsx("button", { type: "button", className: "tool-button", onClick: onDismissImport, children: "Cancelar" })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "drop-hint", children: "También puedes arrastrar .json o .jsonl a cualquier zona" }),
    /* @__PURE__ */ jsx("div", { className: "sr-only", "aria-live": "polite", "aria-atomic": "true", children: loading ? `${phaseHint || "Procesando"}: ${progress}%` : loadState === LOAD_STATES.CANCELLED ? LOAD_STATE_LABELS[LOAD_STATES.CANCELLED] : loadState === LOAD_STATES.ERROR ? error : "" }),
    loading && /* @__PURE__ */ jsxs(
      "div",
      {
        className: "progress-block",
        role: "progressbar",
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": progress,
        "aria-label": `${phaseHint || "Carga"} ${progress}%`,
        children: [
          /* @__PURE__ */ jsx("div", { className: "progress-track", children: /* @__PURE__ */ jsx("span", { style: { width: `${Math.max(2, progress)}%` } }) }),
          /* @__PURE__ */ jsxs("small", { children: [
            phaseHint ? `${phaseHint} · ` : "",
            progress,
            "%"
          ] })
        ]
      }
    ),
    error && /* @__PURE__ */ jsx("div", { className: "error-message", role: "alert", children: error }),
    !error && warningNote && /* @__PURE__ */ jsx("div", { className: "error-message", role: "status", children: warningNote }),
    loadState === LOAD_STATES.CANCELLED && !error && /* @__PURE__ */ jsx("div", { className: "error-message", role: "status", children: LOAD_STATE_LABELS[LOAD_STATES.CANCELLED] })
  ] });
}
export {
  ImportPanel as default
};
