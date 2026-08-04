import React, { useMemo } from 'react';
import GraphSearch from './GraphSearch.jsx';

const EMPTY = [];

function safeValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export default function NodeInfoPanel({ node, graph, onClose, onSelectNode }) {
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

  if (!graph) return null;

  return (
    <aside className={`node-panel ${node ? 'has-selection' : 'is-empty'}`} aria-label="Explorador del grafo">
      <div className="node-panel-search">
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
  );
}
