import { describe, expect, it } from 'vitest';
import {
  assessImportFile,
  detectImportFormat,
  estimatePeakMemoryBytes,
  FORMAT_KINDS,
  getDeviceImportBudgets,
  isMemoryPressureError,
  TRADITIONAL_FORMAT_LIMITS,
} from '../importLimits.js';

describe('traditional format limits documentation', () => {
  it('declara que el JSON monolítico no es streaming-safe', () => {
    expect(TRADITIONAL_FORMAT_LIMITS.fieldOrderGuaranteed).toBe(false);
    expect(TRADITIONAL_FORMAT_LIMITS.progressiveArrayReadSafe).toBe(false);
    expect(TRADITIONAL_FORMAT_LIMITS.streamingParserCompatible).toMatch(/No de forma segura/);
  });
});

describe('detectImportFormat', () => {
  it('distingue json, jsonl y manifiesto', () => {
    expect(detectImportFormat('GRAPHIFY.json')).toBe(FORMAT_KINDS.TRADITIONAL_JSON);
    expect(detectImportFormat('graph.sample.jsonl')).toBe(FORMAT_KINDS.JSONL);
    expect(detectImportFormat('project.manifest.json')).toBe(FORMAT_KINDS.BUNDLE_MANIFEST);
    expect(detectImportFormat('notes.txt')).toBe(FORMAT_KINDS.UNKNOWN);
  });
});

describe('assessImportFile', () => {
  const budgets = getDeviceImportBudgets({
    deviceMemoryGb: 4,
    hardwareConcurrency: 8,
    saveData: false,
  });

  it('permite JSON pequeño sin confirmación', () => {
    const file = { name: 'small.json', size: 50_000, type: 'application/json' };
    const result = assessImportFile(file, { budgets });
    expect(result.decision).toBe('allow');
    expect(result.streaming).toBe(false);
    expect(result.honestNote).toMatch(/Sin parsing incremental/i);
  });

  it('pide confirmación para JSON por encima del umbral suave', () => {
    const file = { name: 'big.json', size: budgets.softWarnBytes + 1, type: 'application/json' };
    const result = assessImportFile(file, { budgets });
    expect(result.decision).toBe('confirm');
    expect(result.reasons.some((r) => /memoria/i.test(r) || /grande/i.test(r))).toBe(true);
  });

  it('rechaza por encima del techo duro y recomienda jsonl', () => {
    const file = { name: 'huge.json', size: budgets.hardMaxTraditional + 1, type: 'application/json' };
    const result = assessImportFile(file, { budgets });
    expect(result.decision).toBe('reject');
    expect(result.code).toBe('FILE_TOO_LARGE');
    expect(result.recommendations.join(' ')).toMatch(/jsonl/i);
  });

  it('acepta jsonl bajo el techo jsonl', () => {
    const file = { name: 'graph.jsonl', size: Math.min(budgets.hardMaxJsonl - 1, budgets.softWarnBytes - 1) };
    const result = assessImportFile(file, { budgets });
    expect(result.decision).toBe('allow');
    expect(result.streaming).toBe(true);
  });

  it('estima mayor pico para JSON tradicional que para JSONL', () => {
    const size = 10 * 1024 * 1024;
    expect(estimatePeakMemoryBytes(size, FORMAT_KINDS.TRADITIONAL_JSON))
      .toBeGreaterThan(estimatePeakMemoryBytes(size, FORMAT_KINDS.JSONL));
  });
});

describe('isMemoryPressureError', () => {
  it('detecta RangeError y mensajes de OOM', () => {
    expect(isMemoryPressureError(new RangeError('Invalid string length'))).toBe(true);
    expect(isMemoryPressureError(new Error('Array buffer allocation failed'))).toBe(true);
    expect(isMemoryPressureError(new Error('syntax error'))).toBe(false);
  });
});
