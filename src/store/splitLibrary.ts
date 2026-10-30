/**
 * The split-set library: named split sets kept in `localStorage` so a pro's splits or a goal can be
 * reused in later sessions. Storage can be missing, full or throwing (private mode, blocked site
 * data); then the library reads as empty and writes report failure instead of throwing.
 */
import { validateSplitSet } from '../analysis/splitSets';
import type { SplitSet } from '../model/types';

export const SPLIT_LIBRARY_KEY = 'rc.splitSets.v1';
const VERSION = 1;

interface StoredLibrary {
  version: typeof VERSION;
  sets: SplitSet[];
}

/** The saved sets in the order they were first saved; unreadable entries are skipped. */
export function listSplitSets(): SplitSet[] {
  try {
    const raw = globalThis.localStorage.getItem(SPLIT_LIBRARY_KEY);
    if (raw === null) return [];
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored.version !== VERSION || !Array.isArray(stored.sets)) return [];
    return stored.sets.filter(isSplitSet);
  } catch {
    return [];
  }
}

/** Saves `set`, replacing a saved set with the same name. False when storage refused the write. */
export function saveSplitSet(set: SplitSet): boolean {
  const sets = listSplitSets();
  const index = sets.findIndex((s) => s.name === set.name);
  if (index === -1) sets.push(set);
  else sets[index] = set;
  return write(sets);
}

/** Deletes the saved set called `name`. False when storage refused the write. */
export function deleteSplitSet(name: string): boolean {
  return write(listSplitSets().filter((s) => s.name !== name));
}

function write(sets: SplitSet[]): boolean {
  const library: StoredLibrary = { version: VERSION, sets };
  try {
    globalThis.localStorage.setItem(SPLIT_LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSplitSet(value: unknown): value is SplitSet {
  if (!isRecord(value)) return false;
  const { name, markers, officialDistance, interpolation } = value;
  const shaped =
    typeof name === 'string' &&
    Array.isArray(markers) &&
    markers.every((m) => isRecord(m) && typeof m.distance === 'number' && typeof m.time === 'number') &&
    (officialDistance === null || typeof officialDistance === 'number') &&
    (interpolation === 'gap' || interpolation === 'linear');
  return shaped && validateSplitSet(value as unknown as SplitSet).length === 0;
}
