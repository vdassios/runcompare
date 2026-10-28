/**
 * Parser entry point: detects the format from the file's content, never its extension, and hands
 * it to the FIT or GPX parser.
 */
import type { Activity } from '../model/types';
import { UnsupportedFileError } from './errors';
import { parseFit } from './fit';
import { parseGpx } from './gpx';

export { UnsupportedFileError } from './errors';

const FIT_SIGNATURE = '.FIT';

function isFit(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false;
  return String.fromCharCode(...new Uint8Array(bytes, 8, 4)) === FIT_SIGNATURE;
}

export function parseFile(bytes: ArrayBuffer, fileName: string): Activity {
  if (isFit(bytes)) return parseFit(bytes, fileName);
  // The decoder drops a UTF-8 BOM, so trimming whitespace is all that stands before the markup.
  const text = new TextDecoder().decode(bytes);
  const head = text.trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<gpx')) return parseGpx(text, fileName);
  throw new UnsupportedFileError(fileName);
}
