import React from 'react';

export default function ImportPanel({
  quality,
  onQualityChange,
  onImport,
  loading,
  progress,
  error,
}) {
  return (
    <section className="import-panel" aria-labelledby="import-title">
      <div className="import-kicker">GRAPHIFY · JSON IMPORT</div>
      <h1 id="import-title">Arquitectura sobre un globo 3D</h1>
      <p>
        Selecciona <code>graphify-out/graph.json</code>. El globo permanece vacío hasta que
        importes el archivo; los datos no se envían a ningún servidor.
      </p>

      <div className="quality-field">
        <label htmlFor="quality">Nivel de detalle</label>
        <select
          id="quality"
          value={quality}
          onChange={(event) => onQualityChange(event.target.value)}
          disabled={loading}
        >
          <option value="ligero">Ligero · equipos modestos</option>
          <option value="equilibrado">Equilibrado · recomendado</option>
          <option value="detallado">Detallado · equipos potentes</option>
        </select>
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
