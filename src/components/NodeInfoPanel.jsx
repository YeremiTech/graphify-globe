import React, { useEffect, useMemo, useRef } from 'react';
import GraphSearch from './GraphSearch.jsx';

const EMPTY = [];
/** Umbral en px para cerrar/abrir el panel con un gesto horizontal. */
const SWIPE_THRESHOLD = 72;
/** Zona desde el borde izquierdo donde un swipe abre el panel oculto. */
const EDGE_OPEN_WIDTH = 28;

function safeValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export default function NodeInfoPanel({
  node,
  graph,
  isOpen = true,
  onOpenChange,
  onClose,
  onSelectNode,
}) {
  const panelRef = useRef(null);
  const swipeRef = useRef({
    active: false,
    fromEdge: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    locked: null, // 'x' | 'y' | null — evita mezclar scroll vertical con swipe
  });

  const connections = useMemo(() => {
    if (!node || !graph) return EMPTY;
    const output = [];

    for (const edge of graph.edges) {
      if (edge.source === node.index) {
        const relatedNode = graph.nodes[edge.target];
        if (relatedNode) {
          output.push({
            direction: 'saliente',
            relation: edge.relation,
            confidence: edge.confidence,
            node: relatedNode,
          });
        }
      } else if (edge.target === node.index) {
        const relatedNode = graph.nodes[edge.source];
        if (relatedNode) {
          output.push({
            direction: 'entrante',
            relation: edge.relation,
            confidence: edge.confidence,
            node: relatedNode,
          });
        }
      }
      if (output.length >= 24) break;
    }
    return output;
  }, [node, graph]);

  // Gestos táctiles: deslizar a la izquierda oculta; desde el borde izquierdo muestra.
  useEffect(() => {
    if (!graph || typeof onOpenChange !== 'function') return undefined;

    const panel = panelRef.current;
    const swipe = swipeRef.current;

    const isCoarsePointer = () =>
      typeof window !== 'undefined'
      && window.matchMedia('(hover: none), (pointer: coarse), (max-width: 760px)').matches;

    const resetDragVisual = () => {
      if (!panel) return;
      panel.style.transition = '';
      panel.style.transform = '';
    };

    const onTouchStart = (event) => {
      if (!isCoarsePointer() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const fromEdge = !isOpen && touch.clientX <= EDGE_OPEN_WIDTH;
      const onPanel = isOpen && panel?.contains(event.target);

      if (!fromEdge && !onPanel) return;

      swipe.active = true;
      swipe.fromEdge = fromEdge;
      swipe.startX = touch.clientX;
      swipe.startY = touch.clientY;
      swipe.lastX = touch.clientX;
      swipe.locked = fromEdge ? 'x' : null;

      if (panel) panel.style.transition = 'none';
    };

    const onTouchMove = (event) => {
      if (!swipe.active || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - swipe.startX;
      const dy = touch.clientY - swipe.startY;

      // Dentro del panel: solo trata el gesto como swipe horizontal si supera al vertical.
      if (!swipe.fromEdge && swipe.locked === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        swipe.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }

      if (swipe.locked === 'y') return;

      event.preventDefault();
      swipe.lastX = touch.clientX;

      if (!panel) return;

      if (isOpen) {
        // Solo permitir arrastrar hacia la izquierda (ocultar).
        const offset = Math.min(0, dx);
        panel.style.transform = `translateX(${offset}px)`;
      } else if (swipe.fromEdge) {
        // Arrastre desde el borde: el panel entra desde la izquierda.
        const width = panel.offsetWidth || window.innerWidth * 0.88;
        const offset = Math.min(0, -width + Math.max(0, dx));
        panel.style.transform = `translateX(${offset}px)`;
      }
    };

    const onTouchEnd = () => {
      if (!swipe.active) return;
      const dx = swipe.lastX - swipe.startX;
      const wasEdge = swipe.fromEdge;
      const locked = swipe.locked;
      swipe.active = false;
      swipe.fromEdge = false;
      swipe.locked = null;

      if (locked === 'y') {
        resetDragVisual();
        return;
      }

      if (isOpen && dx < -SWIPE_THRESHOLD) {
        onOpenChange(false);
      } else if (!isOpen && wasEdge && dx > SWIPE_THRESHOLD) {
        onOpenChange(true);
      }

      // Vuelve a la posición CSS final (abierto/cerrado) con transición.
      requestAnimationFrame(resetDragVisual);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      resetDragVisual();
    };
  }, [graph, isOpen, onOpenChange]);

  if (!graph) return null;

  return (
    <>
      {/* Pestaña visible en el borde cuando el panel está oculto (móvil). */}
      <button
        type="button"
        className={`panel-edge-tab ${isOpen ? 'is-hidden' : ''}`}
        aria-label="Mostrar panel de información"
        onClick={() => onOpenChange?.(true)}
      >
        ☰
      </button>

      <aside
        ref={panelRef}
        className={`node-panel ${node ? 'has-selection' : 'is-empty'} ${isOpen ? 'is-open' : 'is-collapsed'}`}
        aria-label="Explorador del grafo"
        aria-hidden={!isOpen}
      >
        <div className="node-panel-search">
          <div className="panel-drag-hint" aria-hidden="true">
            <span />
          </div>
          <GraphSearch graph={graph} onSelectNode={onSelectNode} />
        </div>

        <div className="node-panel-scroll">
          {!node ? (
            <div className="node-empty-state">
              <span className="empty-orbit" aria-hidden="true" />
              <strong>Explora el grafo</strong>
              <p>Busca por nombre, archivo, paquete o ID, o selecciona un punto directamente en el globo.</p>
              <div className="connection-legend empty-legend" aria-label="Leyenda de colores">
                <span><i className="selected-point" />Seleccionado</span>
                <span><i className="outgoing-point" />Destino saliente</span>
                <span><i className="incoming-point" />Origen entrante</span>
                <span><i className="bidirectional-point" />Doble dirección</span>
              </div>
            </div>
          ) : (
            <>
              <div className="node-panel-header">
                <div>
                  <span>GRAPHIFY · NODE INFO</span>
                  <h2>{node.label}</h2>
                </div>
                <button type="button" onClick={onClose} aria-label="Limpiar selección">
                  ×
                </button>
              </div>

              <div className="node-type-row">
                <span className="kind-dot" style={{ background: node.color, color: node.color }} />
                <b>{node.kind}</b>
                <small>{node.group}</small>
              </div>

              <div className="focus-legend" aria-label="Leyenda de conexiones destacadas">
                <span><i className="selected-point" />Nodo seleccionado</span>
                <span><i className="outgoing-point" />Saliente</span>
                <span><i className="incoming-point" />Entrante</span>
                <span><i className="bidirectional-point" />Bidireccional</span>
              </div>

              <dl className="node-fields">
                <div>
                  <dt>ID</dt>
                  <dd>{safeValue(node.id)}</dd>
                </div>
                <div>
                  <dt>Archivo</dt>
                  <dd>{safeValue(node.file)}</dd>
                </div>
                <div>
                  <dt>Ubicación</dt>
                  <dd>{safeValue(node.location)}</dd>
                </div>
                <div className="node-field-grid">
                  <span>
                    <dt>Entrantes</dt>
                    <dd>{node.incoming.toLocaleString('es')}</dd>
                  </span>
                  <span>
                    <dt>Salientes</dt>
                    <dd>{node.outgoing.toLocaleString('es')}</dd>
                  </span>
                  <span>
                    <dt>Grado</dt>
                    <dd>{node.degree.toLocaleString('es')}</dd>
                  </span>
                </div>
              </dl>

              {node.metadata && Object.keys(node.metadata).length > 0 && (
                <section className="metadata-section">
                  <h3>Metadatos</h3>
                  <dl>
                    {Object.entries(node.metadata).slice(0, 12).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{safeValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              <section className="connections-section">
                <h3>Conexiones visibles</h3>
                <div className="connection-legend" aria-label="Leyenda de conexiones">
                  <span><i className="outgoing" />Salientes animadas</span>
                  <span><i className="incoming" />Entrantes animadas</span>
                </div>
                {connections.length === 0 ? (
                  <p>No hay relaciones visibles para este nodo.</p>
                ) : (
                  <div className="connection-list">
                    {connections.map((connection, index) => (
                      <button
                        type="button"
                        key={`${connection.node.id}-${connection.relation}-${index}`}
                        className={connection.direction}
                        onClick={() => onSelectNode(connection.node)}
                      >
                        <span className={`direction ${connection.direction}`}>
                          {connection.direction === 'saliente' ? '→' : '←'}
                        </span>
                        <span className="connection-copy">
                          <strong>{connection.node.label}</strong>
                          <small>{connection.relation} · {connection.confidence}</small>
                        </span>
                        <span className={`connection-point ${connection.direction}`} />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
