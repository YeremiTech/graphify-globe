import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeScene from './components/GlobeScene.jsx';
import ImportPanel from './components/ImportPanel.jsx';
import NodeInfoPanel from './components/NodeInfoPanel.jsx';

const QUALITY_LIMITS = {
  ligero: { maxNodes: 450, maxEdges: 1000, maxAnimatedEdges: 24 },
  equilibrado: { maxNodes: 900, maxEdges: 2400, maxAnimatedEdges: 42 },
  detallado: { maxNodes: 1800, maxEdges: 6000, maxAnimatedEdges: 64 },
};

function readFileAsText(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 55));
    };
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsText(file);
  });
}

export default function App() {
  const [graph, setGraph] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [quality, setQuality] = useState('equilibrado');
  const [autoRotate, setAutoRotate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Importa un graph.json para comenzar');
  const [error, setError] = useState('');
  const [draggingFile, setDraggingFile] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const inputRef = useRef(null);
  const workerRef = useRef(null);
  const pendingFileRef = useRef(null);

  useEffect(() => {
    const worker = new Worker(new URL('./workers/graphWorker.js', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'progress') {
        setProgress(55 + Math.round(message.value * 0.45));
        setStatus(message.label);
        return;
      }

      if (message.type === 'success') {
        setGraph(message.graph);
        setSelectedNode(null);
        setHoveredNode(null);
        setProgress(100);
        setLoading(false);
        setError('');
        setStatus(
          `${message.graph.nodes.length.toLocaleString('es')} nodos y ${message.graph.edges.length.toLocaleString('es')} relaciones visibles`,
        );
        pendingFileRef.current = null;
        return;
      }

      if (message.type === 'error') {
        setLoading(false);
        setProgress(0);
        setError(message.message || 'El archivo no tiene un formato de grafo reconocido.');
        setStatus('No se pudo cargar el grafo');
        pendingFileRef.current = null;
      }
    };

    worker.onerror = (event) => {
      setLoading(false);
      setProgress(0);
      setError(event.message || 'Falló el proceso de análisis del JSON.');
      setStatus('Error en el analizador');
      pendingFileRef.current = null;
    };

    return () => worker.terminate();
  }, []);

  useEffect(() => {
    const closePanel = (event) => {
      if (event.key === 'Escape') setSelectedNode(null);
    };
    window.addEventListener('keydown', closePanel);
    return () => window.removeEventListener('keydown', closePanel);
  }, []);

  const importFile = useCallback(
    async (file) => {
      if (!file || loading) return;
      setError('');

      if (!file.name.toLowerCase().endsWith('.json')) {
        setError('Selecciona un archivo con extensión .json.');
        return;
      }

      if (file.size > 120 * 1024 * 1024) {
        setError('El archivo supera 120 MB. Reduce el grafo antes de importarlo.');
        return;
      }

      setLoading(true);
      setProgress(1);
      setStatus('Leyendo el archivo local…');
      pendingFileRef.current = file.name;

      try {
        const text = await readFileAsText(file, setProgress);
        setProgress(55);
        setStatus('Analizando nodos y relaciones…');
        workerRef.current?.postMessage({
          type: 'parse',
          text,
          fileName: file.name,
          limits: QUALITY_LIMITS[quality],
        });
      } catch (readError) {
        setLoading(false);
        setProgress(0);
        setError(readError.message || 'No se pudo leer el archivo.');
        setStatus('No se pudo leer el archivo');
      }
    },
    [loading, quality],
  );

  const onInputChange = (event) => {
    const [file] = event.target.files || [];
    importFile(file);
    event.target.value = '';
  };

  const openPicker = () => inputRef.current?.click();

  const dropHandlers = useMemo(
    () => ({
      onDragEnter: (event) => {
        event.preventDefault();
        setDraggingFile(true);
      },
      onDragOver: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: (event) => {
        if (event.currentTarget === event.target) setDraggingFile(false);
      },
      onDrop: (event) => {
        event.preventDefault();
        setDraggingFile(false);
        const [file] = event.dataTransfer.files || [];
        importFile(file);
      },
    }),
    [importFile],
  );

  const clearGraph = () => {
    setGraph(null);
    setSelectedNode(null);
    setHoveredNode(null);
    setError('');
    setProgress(0);
    setStatus('Importa un graph.json para comenzar');
  };

  const selectedIndex = selectedNode?.index ?? -1;

  return (
    <main className={`app-shell ${graph ? 'has-graph' : 'is-empty'} ${selectedNode ? 'has-selection' : 'no-selection'}`} {...dropHandlers}>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={onInputChange}
      />

      <GlobeScene
        graph={graph}
        autoRotate={autoRotate}
        selectedIndex={selectedIndex}
        resetToken={resetToken}
        onNodeSelect={setSelectedNode}
        onNodeHover={(node, screenPoint) => {
          setHoveredNode(node);
          if (screenPoint) setPointer(screenPoint);
        }}
      />

      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>GRAPHIFY GLOBE</strong>
            <small>{graph?.sourceName || 'VISUALIZADOR LOCAL'}</small>
          </div>
        </div>

        <div className="toolbar">
          {graph && (
            <>
              <button type="button" className="tool-button" onClick={openPicker}>
                Importar otro
              </button>
              <button
                type="button"
                className={`icon-button ${autoRotate ? 'is-active' : ''}`}
                onClick={() => setAutoRotate((value) => !value)}
                aria-label={autoRotate ? 'Pausar rotación' : 'Activar rotación'}
                title={autoRotate ? 'Pausar rotación' : 'Activar rotación'}
              >
                {autoRotate ? 'Ⅱ' : '▶'}
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setResetToken((value) => value + 1)}
                aria-label="Restablecer cámara"
                title="Restablecer cámara"
              >
                ↻
              </button>
              <button
                type="button"
                className="icon-button danger"
                onClick={clearGraph}
                aria-label="Cerrar grafo"
                title="Cerrar grafo"
              >
                ×
              </button>
            </>
          )}
        </div>
      </header>

      {!graph && (
        <ImportPanel
          quality={quality}
          onQualityChange={setQuality}
          onImport={openPicker}
          loading={loading}
          progress={progress}
          error={error}
        />
      )}


      {graph && (
        <section className="graph-summary" aria-label="Resumen del grafo">
          <span>
            <b>{graph.nodes.length.toLocaleString('es')}</b> nodos
          </span>
          <span>
            <b>{graph.edges.length.toLocaleString('es')}</b> relaciones
          </span>
          {(graph.totalNodes > graph.nodes.length || graph.totalEdges > graph.edges.length) && (
            <span className="summary-muted">
              de {graph.totalNodes.toLocaleString('es')} / {graph.totalEdges.toLocaleString('es')}
            </span>
          )}
        </section>
      )}

      <div className="status-line">
        <span className={`status-dot ${loading ? 'is-loading' : ''}`} />
        {status}
      </div>

      {hoveredNode && !selectedNode && (
        <div
          className="node-tooltip"
          style={{ left: pointer.x + 16, top: pointer.y + 16 }}
          role="status"
        >
          <strong>{hoveredNode.label}</strong>
          <span>{hoveredNode.kind}</span>
        </div>
      )}

      <NodeInfoPanel
        node={selectedNode}
        graph={graph}
        onClose={() => setSelectedNode(null)}
        onSelectNode={setSelectedNode}
      />

      {draggingFile && (
        <div className="drop-overlay">
          <div>
            <strong>Suelta graph.json</strong>
            <span>El archivo se procesa localmente en tu navegador</span>
          </div>
        </div>
      )}
    </main>
  );
}
