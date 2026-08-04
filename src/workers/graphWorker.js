import { processGraphText } from '../graph/processGraph.js';
import { ensureNodeVisible } from '../graph/selectVisibleSubgraph.js';
import { hydrateIndexes } from '../graph/buildGraphIndexes.js';

function postProgress(value, label) {
  self.postMessage({ type: 'progress', value, label });
}

async function readIncomingFile(payload) {
  if (payload.file instanceof Blob) {
    postProgress(0.05, 'Leyendo archivo en segundo plano…');
    return payload.file.text();
  }
  if (payload.buffer instanceof ArrayBuffer) {
    postProgress(0.05, 'Decodificando buffer…');
    return new TextDecoder('utf-8').decode(payload.buffer);
  }
  if (typeof payload.text === 'string') {
    return payload.text;
  }
  throw new Error('No se recibió un archivo válido para analizar.');
}

function buildPayload(graph) {
  return graph;
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || (message.type !== 'parse' && message.type !== 'reveal-node')) return;

  try {
    if (message.type === 'reveal-node') {
      const { fullNodes, fullEdges, indexes: serialized, limits, nodeId, meta } = message;
      const fullGraph = {
        nodes: fullNodes,
        edges: fullEdges,
        directed: meta?.directed,
        multigraph: meta?.multigraph,
      };
      const indexes = hydrateIndexes(serialized, fullGraph);
      const visible = ensureNodeVisible(fullGraph, indexes, null, nodeId, limits);
      self.postMessage({
        type: 'reveal-success',
        visible: {
          nodes: visible.nodes,
          edges: visible.edges,
          totalNodes: visible.totalNodes,
          totalEdges: visible.totalEdges,
          visibleNodes: visible.visibleNodes,
          visibleEdges: visible.visibleEdges,
          hiddenNodes: visible.hiddenNodes,
          hiddenEdges: visible.hiddenEdges,
          maxAnimatedEdges: visible.maxAnimatedEdges,
        },
        nodeId,
      });
      return;
    }

    const text = await readIncomingFile(message);
    const graph = processGraphText(text, {
      sourceName: message.fileName || 'graph.json',
      limits: message.limits || {},
      onProgress: postProgress,
    });

    postProgress(1, 'Grafo listo');
    self.postMessage({ type: 'success', graph: buildPayload(graph) });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'No se pudo analizar el archivo.',
    });
  }
};
