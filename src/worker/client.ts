/**
 * Promise API over one shared analysis worker, started on first use. A failure inside the worker
 * rejects with an Error that keeps the original `name` (e.g. `UnsupportedFileError`) and message.
 */
import type { Activity, AnalysisInput, AnalysisResult } from '../model/types';
import type { JobResults, WorkerJob, WorkerResponse } from './protocol';

interface Pending {
  resolve(result: JobResults[WorkerJob['type']]): void;
  reject(error: Error): void;
}

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) {
      p.resolve(res.result);
    } else {
      p.reject(Object.assign(new Error(res.error.message), { name: res.error.name }));
    }
  };
  // The worker failed to load or crashed: fail what's in flight and start afresh next time.
  w.onerror = (event) => {
    event.preventDefault();
    for (const p of pending.values()) p.reject(new Error(`Analysis worker failed: ${event.message}`));
    pending.clear();
    w.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

function run<J extends WorkerJob>(job: J, transfer: Transferable[] = []): Promise<JobResults[J['type']]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as Pending['resolve'], reject });
    getWorker().postMessage({ ...job, id }, transfer);
  });
}

export async function parseInWorker(file: File): Promise<Activity> {
  const bytes = await file.arrayBuffer();
  return run({ type: 'parse', fileName: file.name, bytes }, [bytes]);
}

export function analyzeInWorker(input: AnalysisInput): Promise<AnalysisResult> {
  return run({ type: 'analyze', input });
}
