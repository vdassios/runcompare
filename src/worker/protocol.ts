/**
 * Messages between the app and the analysis worker, and the transfer list that moves the typed
 * arrays of a reply instead of copying them.
 */
import type { Activity, AnalysisInput, AnalysisResult } from '../model/types';

export type WorkerJob =
  { type: 'parse'; fileName: string; bytes: ArrayBuffer } | { type: 'analyze'; input: AnalysisInput };

export type WorkerRequest = WorkerJob & { id: number };

export interface JobResults {
  parse: Activity;
  analyze: AnalysisResult;
}

export type WorkerResponse =
  | { id: number; ok: true; result: JobResults[WorkerJob['type']] }
  | { id: number; ok: false; error: { name: string; message: string } };

/** Every distinct buffer behind a typed array in `value`; a buffer listed twice would throw. */
export function transferables(value: unknown, found = new Set<ArrayBuffer>()): ArrayBuffer[] {
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) found.add(value.buffer);
  } else if (value instanceof ArrayBuffer) {
    found.add(value);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) transferables(v, found);
  }
  return [...found];
}
