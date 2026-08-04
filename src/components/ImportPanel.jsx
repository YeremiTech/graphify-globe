import React, { useEffect, useId, useRef, useState } from 'react';

const QUALITY_OPTIONS = [
  { value: 'ligero', label: 'Ligero', hint: 'equipos modestos' },
  { value: 'equilibrado', label: 'Equilibrado', hint: 'recomendado' },
  { value: 'detallado', label: 'Detallado', hint: 'equipos potentes' },
];

export default function ImportPanel({
  quality,
  onQualityChange,
  onImport,
  loading,
  progress,
  error,
}) {
  const listId = useId();
  const fieldRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = QUALITY_OPTIONS.find((option) => option.value === quality) || QUALITY_OPTIONS[1];

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (loading) setOpen(false);
  }, [loading]);

  const chooseQuality = (value) => {
    onQualityChange(value);
    setOpen(false);
  };

  return (
    <section className="import-panel" aria-labelledby="import-title">
      <div className="import-kicker">GRAPHIFY · JSON IMPORT</div>
      <h1 id="import-title">Arquitectura sobre un globo 3D</h1>
      <p>
        Selecciona <code>graph.json</code>. El globo permanece vacío hasta que
        importes el archivo; los datos no se envían a ningún servidor.
      </p>

      <div className={`quality-field ${open ? 'is-open' : ''}`} ref={fieldRef}>
        <span className="quality-label" id={`${listId}-label`}>
          Nivel de detalle
        </span>
        <button
          type="button"
          id="quality"
          className="quality-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={`${listId}-label quality`}
          disabled={loading}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="quality-trigger-text">
            <strong>{selected.label}</strong>
            <small>{selected.hint}</small>
          </span>
          <span className="quality-chevron" aria-hidden="true" />
        </button>

        {open && (
          <ul
            id={listId}
            className="quality-menu"
            role="listbox"
            aria-labelledby={`${listId}-label`}
          >
            {QUALITY_OPTIONS.map((option) => {
              const isActive = option.value === quality;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`quality-option ${isActive ? 'is-active' : ''}`}
                    onClick={() => chooseQuality(option.value)}
                  >
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.hint}</small>
                    </span>
                    {isActive && <span className="quality-check" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button type="button" className="primary-button" onClick={onImport} disabled={loading}>
        {loading ? 'Procesando…' : 'Importar graph.json'}
      </button>

      <div className="drop-hint">También puedes arrastrar el archivo a cualquier zona</div>

      {loading && (
        <div className="progress-block" aria-label={`Carga ${progress}%`}>
          <div className="progress-track">
            <span style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
          <small>{progress}%</small>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </section>
  );
}
