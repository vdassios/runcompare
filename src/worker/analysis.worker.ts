/**
 * Web Worker that parses files and runs `analyze()` off the main thread. One reply per request,
 * with the result's typed arrays transferred, not copied.
 */
import { analyze } from '../analysis/pipeline';
import { parseFile } from '../parsers';
import { transferables, type WorkerRequest, type WorkerResponse } from './protocol';

function reply(response: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(response, { transfer });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const result = req.type === 'parse' ? parseFile(req.bytes, req.fileName) : analyze(req.input);
    reply({ id: req.id, ok: true, result }, transferables(result));
  } catch (error) {
    const { name, message } = error instanceof Error ? error : { name: 'Error', message: String(error) };
    reply({ id: req.id, ok: false, error: { name, message } });
  }
};
