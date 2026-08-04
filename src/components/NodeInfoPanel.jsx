import React, { useEffect, useMemo, useRef, useState } from 'react';
import GraphSearch from './GraphSearch.jsx';
import { CONNECTION_PAGE_SIZE } from '../graph/constants.js';

const EMPTY = [];
/** Umbral en px para cerrar/abrir el panel con un gesto horizontal. */
const SWIPE_THRESHOLD = 72;
/** Zona desde el borde izquierdo donde un swipe abre el panel oculto. */
const EDGE_OPEN_WIDTH = 28;

function safeValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function buildConnections(node, graph, indexes) {
  if (!node || !graph?.allEdges?.length) return EMPTY;

  const fullIndex = node.fullIndex ?? indexes?.nodeIndexById?.get?.(node.id) ?? node.index;
  const edgeIndexes = indexes?.connectedEdgeIndexesByNode?.get?.(fullIndex)
    || indexes?.connectedEdgeIndexesByNode?.get?.(Number(fullIndex))
    || [];

  const directed = graph.directed !== false;
  const output = [];
  const pairState = new Map();

  for (const edgeIndex of edgeIndexes) {
    const edge = graph.allEdges[edgeIndex];
    if (!edge) continue;

    const isOutgoing = edge.sourceId === node.id || edge.source === fullIndex;
    const relatedId = isOutgoing ? edge.targetId : edge.sourceId;
    const relatedNode = indexes?.nodeById?.get?.(relatedId)
      || graph.allNodes?.find((item) => item.id === relatedId);
    if (!relatedNode) continue;

    let direction;
    if (!directed) {
      direction = 'conectado';
    } else if (edge.isSelfLoop) {
      direction = 'self';
    } else {
      direction = isOutgoing ? 'saliente' : 'entrante';
    }

    const key = relatedId;
    const state = pairState.get(key) || { incoming: false, outgoing: false };
    if (direction === 'saliente') state.outgoing = true;
    if (direction === 'entrante') state.incoming = true;
    pairState.set(key, state);

    output.push({
      direction,
      relation: edge.relation,
      confidence: edge.confidence,
      confidenceScore: edge.confidenceScore,
      node: relatedNode,
      edgeIndex,
    });
  }

  if (directed) {
    for (const connection of output) {
      const state = pairState.get(connection.node.id);
      if (state?.incoming && state?.outgoing && connection.direction !== 'self') {
        connection.bidirectional = true;
      }
    }
  }

  return output;
}

export default function NodeInfoPanel({
  node,
  graph,
  indexes,
  searchNodes,
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
    locked: null,
  });
  const [visibleCount, setVisibleCount] = useState(CONNECTION_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(CONNECTION_PAGE_SIZE);
  }, [node?.id]);

  const connections = useMemo(
    () => buildConnections(node, graph, indexes),
    [node, graph, indexes],
  );

  const visibleConnections = connections.slice(0, visibleCount);
  const hasMore = connections.length > visibleCount;

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

      if (!swipe.fromEdge && swipe.locked === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        swipe.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }

      if (swipe.locked === 'y') return;

      event.preventDefault();
      swipe.lastX = touch.clientX;

      if (!panel) return;

      if (isOpen) {
        const offset = Math.min(0, dx);
        panel.style.transform = `translateX(${offset}px)`;
      } else if (swipe.fromEdge) {
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

  const directed = graph.directed !== false;
  const fullNode = node
    ? (indexes?.nodeById?.get?.(node.id) || graph.allNodes?.find((item) => item.id === node.id) || node)
    : null;

  return (
    <>
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
        className={`node-panel ${fullNode ? 'has-selection' : 'is-empty'} ${isOpen ? 'is-open' : 'is-collapsed'}`}
        aria-label="Explorador del grafo"
        aria-hidden={!isOpen}
      >
        <div className="node-panel-search">
          <div className="panel-drag-hint" aria-hidden="true">
            <span />
          </div>
          <GraphSearch nodes={searchNodes || graph.allNodes || graph.nodes} onSelectNode={onSelectNode} />
        </div>

        <div className="node-panel-scroll">
          {!fullNode ? (
            <div className="node-empty-state">
              <span className="empty-orbit" aria-hidden="true" />
              <strong>Explora el grafo</strong>
              <p>Busca por nombre, archivo, paquete o ID, o selecciona un punto directamente en el globo.</p>
              <div className="connection-legend empty-legend" aria-label="Leyenda de colores">
                <span><i className="selected-point" />Seleccionado</span>
                {directed ? (
                  <>
                    <span><i className="outgoing-point" />Destino saliente</span>
                    <span><i className="incoming-point" />Origen entrante</span>
                    <span><i className="bidirectional-point" />Doble dirección</span>
                  </>
                ) : (
                  <span><i className="bidirectional-point" />Conectado</span>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="node-panel-header">
                <div>
                  <span>GRAPHIFY · NODE INFO</span>
                  <h2>{fullNode.label}</h2>
                </div>
                <button type="button" onClick={onClose} aria-label="Limpiar selección">
                  ×
                </button>
              </div>

              <div className="node-type-row">
                <span className="kind-dot" style={{ background: fullNode.color, color: fullNode.color }} />
                <b>{fullNode.metadata?.originalKind || fullNode.kind}</b>
                <small>{fullNode.communityName || fullNode.group}</small>
              </div>

              <div className="focus-legend" aria-label="Leyenda de conexiones destacadas">
                <span><i className="selected-point" />Nodo seleccionado</span>
                {directed ? (
                  <>
                    <span><i className="outgoing-point" />Saliente</span>
                    <span><i className="incoming-point" />Entrante</span>
                    <span><i className="bidirectional-point" />Bidireccional</span>
                  </>
                ) : (
                  <span><i className="bidirectional-point" />Conectado</span>
                )}
              </div>

              <dl className="node-fields">
                <div>
                  <dt>ID</dt>
                  <dd>{safeValue(fullNode.id)}</dd>
                </div>
                <div>
                  <dt>Archivo</dt>
                  <dd>{safeValue(fullNode.file)}</dd>
                </div>
                <div>
                  <dt>Ubicación</dt>
                  <dd>{safeValue(fullNode.location)}</dd>
                </div>
                {fullNode.fileType ? (
                  <div>
                    <dt>File type</dt>
                    <dd>{safeValue(fullNode.fileType)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Comunidad</dt>
                  <dd>{safeValue(fullNode.communityName || fullNode.group)}</dd>
                </div>
                <div className="node-field-grid">
                  {directed ? (
                    <>
                      <span>
                        <dt>Entrantes</dt>
                        <dd>{fullNode.incoming.toLocaleString('es')}</dd>
                      </span>
                      <span>
                        <dt>Salientes</dt>
                        <dd>{fullNode.outgoing.toLocaleString('es')}</dd>
                      </span>
                    </>
                  ) : (
                    <span>
                      <dt>Conectados</dt>
                      <dd>{fullNode.degree.toLocaleString('es')}</dd>
                    </span>
                  )}
                  <span>
                    <dt>Grado</dt>
                    <dd>{fullNode.degree.toLocaleString('es')}</dd>
                  </span>
                </div>
              </dl>

              {fullNode.metadata && Object.keys(fullNode.metadata).length > 0 && (
                <section className="metadata-section">
                  <h3>Metadatos</h3>
                  <dl>
                    {Object.entries(fullNode.metadata).slice(0, 12).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{safeValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              <section className="connections-section">
                <h3>Conexiones</h3>
                {connections.length > 0 && (
                  <p className="connections-count">
                    Mostrando {visibleConnections.length.toLocaleString('es')} de{' '}
                    {connections.length.toLocaleString('es')} conexiones
                  </p>
                )}
                <div className="connection-legend" aria-label="Leyenda de conexiones">
                  {directed ? (
                    <>
                      <span><i className="outgoing" />Salientes animadas</span>
                      <span><i className="incoming" />Entrantes animadas</span>
                    </>
                  ) : (
                    <span><i className="bidirectional-point" />Conexiones</span>
                  )}
                </div>
                {connections.length === 0 ? (
                  <p>No hay relaciones para este nodo.</p>
                ) : (
                  <>
                    <div className="connection-list">
                      {visibleConnections.map((connection, index) => {
                        const directionClass = directed
                          ? (connection.bidirectional ? 'bidirectional' : connection.direction)
                          : 'conectado';
                        const arrow = !directed
                          ? '↔'
                          : connection.direction === 'saliente'
                            ? '→'
                            : connection.direction === 'entrante'
                              ? '←'
                              : '↺';
                        return (
                          <button
                            type="button"
                            key={`${connection.node.id}-${connection.relation}-${connection.edgeIndex}-${index}`}
                            className={directionClass === 'conectado' ? 'saliente' : directionClass}
                            onClick={() => onSelectNode(connection.node)}
                          >
                            <span className={`direction ${connection.direction === 'conectado' ? 'saliente' : connection.direction}`}>
                              {arrow}
                            </span>
                            <span className="connection-copy">
                              <strong>{connection.node.label}</strong>
                              <small>
                                {connection.relation} · {connection.confidence}
                                {connection.bidirectional ? ' · bidireccional' : ''}
                              </small>
                            </span>
                            <span className={`connection-point ${connection.direction === 'entrante' ? 'incoming' : 'outgoing'}`} />
                          </button>
                        );
                      })}
                    </div>
                    {hasMore && (
                      <button
                        type="button"
                        className="tool-button connections-more"
                        onClick={() => setVisibleCount((value) => value + CONNECTION_PAGE_SIZE)}
                      >
                        Mostrar más
                      </button>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
