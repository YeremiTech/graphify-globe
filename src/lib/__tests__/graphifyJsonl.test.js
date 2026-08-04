import { describe, expect, it } from 'vitest';
import {
  classifyJsonlRecord,
  ingestJsonlBlob,
  splitCompleteLines,
  traditionalToJsonlText,
} from '../graphifyJsonl.js';
import { ingestValidatedRaw } from '../parseGraph.js';

describe('graphifyJsonl', () => {
  it('clasifica registros node/edge', () => {
    expect(classifyJsonlRecord({ type: 'node', id: 'a' })).toBe('node');
    expect(classifyJsonlRecord({ t: 'edge', source: 'a', target: 'b' })).toBe('edge');
    expect(classifyJsonlRecord({ source: 'a', target: 'b' })).toBe('edge');
    expect(classifyJsonlRecord({ id: 'x', label: 'X' })).toBe('node');
  });

  it('parte líneas completas y conserva resto multibyte/parcial', () => {
    const { lines, remainder } = splitCompleteLines('{"a":1}\n{"b":');
    expect(lines).toEqual(['{"a":1}']);
    expect(remainder).toBe('{"b":');
  });

  it('ingiere Blob JSONL por stream sin JSON.parse del archivo entero', async () => {
    const text = traditionalToJsonlText({
      nodes: [
        { id: 'a', label: 'A', type: 'class' },
        { id: 'b', label: 'B', type: 'class' },
      ],
      edges: [{ source: 'a', target: 'b', relation: 'calls', confidence: 'EXTRACTED' }],
    });
    const file = new Blob([text], { type: 'application/x-ndjson' });
    Object.defineProperty(file, 'size', { value: text.length });

    const result = await ingestJsonlBlob(file, {
      batchSize: 1,
      onProgress: () => {},
    });

    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(result.document.nodes[0].id).toBe('a');

    const ingested = ingestValidatedRaw(result.document, 't.jsonl', {
      maxNodes: 100,
      maxEdges: 100,
      maxAnimatedEdges: 10,
    });
    expect(ingested.stats.indexedNodes).toBe(2);
  });

  it('rechaza JSON truncado al final', async () => {
    const file = new Blob(['{"type":"node","id":"a"}\n{"type":"node","id":']);
    await expect(ingestJsonlBlob(file)).rejects.toMatchObject({ code: 'JSONL_TRUNCATED' });
  });

  it('rechaza buffer sin saltos de línea demasiado largo', async () => {
    const huge = `{"type":"node","id":"${'x'.repeat(2 * 1024 * 1024)}"}`;
    const file = new Blob([huge]);
    await expect(ingestJsonlBlob(file, { maxPendingChars: 1024 })).rejects.toMatchObject({
      code: 'JSONL_LINE_TOO_LONG',
    });
  });
});
