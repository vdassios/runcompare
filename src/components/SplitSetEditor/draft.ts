/**
 * The editor's draft: everything typed into the "Add a split set" form, in one object so it can be
 * reset, loaded from a saved set or an attempt, and turned into a `SplitSet` with its problems.
 */
import { parseSplitList, targetTimeSplitSet, validateSplitSet, type ParseResult } from '../../analysis/splitSets';
import { parseDuration } from '../../format';
import type { SplitSet, UnitSystem } from '../../model/types';
import { choiceDistance, choiceFor, timeText, type DistanceChoice } from './fields';

export type EditorMode = 'rows' | 'paste' | 'target';

export interface RowDraft {
  key: number; // React key; rows can be reordered
  distance: number; // m, NaN until valid
  time: string;
}

export interface EditorDraft {
  mode: EditorMode;
  name: string;
  official: DistanceChoice | null;
  interpolation: SplitSet['interpolation'];
  rows: RowDraft[];
  /** `units` is the system the text was typed in: switching units must not re-read it. */
  paste: { text: string; units: UnitSystem };
  target: { distance: DistanceChoice; time: string };
}

export interface BuiltDraft {
  set: SplitSet;
  problems: string[];
  /** Paste mode only. */
  parsed: ParseResult | null;
  ok: boolean;
}

let rowKey = 0;

export function emptyRow(): RowDraft {
  return { key: ++rowKey, distance: NaN, time: '' };
}

export function emptyDraft(units: UnitSystem, interpolation: SplitSet['interpolation']): EditorDraft {
  return {
    mode: 'rows',
    name: '',
    official: null,
    interpolation,
    rows: [emptyRow()],
    paste: { text: '', units },
    target: { distance: { preset: '10k', custom: NaN }, time: '' },
  };
}

/** `draft` with `set` loaded into the rows tab. */
export function loadDraft(draft: EditorDraft, set: SplitSet): EditorDraft {
  return {
    ...draft,
    mode: 'rows',
    name: set.name,
    official: set.officialDistance === null ? null : choiceFor(set.officialDistance),
    interpolation: set.interpolation,
    rows: set.markers.map((m) => ({ key: ++rowKey, distance: m.distance, time: timeText(m.time) })),
  };
}

export function buildSplitSet(draft: EditorDraft): BuiltDraft {
  const name = draft.name.trim();
  if (draft.mode === 'target') {
    const distance = choiceDistance(draft.target.distance);
    const time = parseDuration(draft.target.time) ?? NaN;
    const set = { ...targetTimeSplitSet(distance, time, name || undefined), interpolation: draft.interpolation };
    const problems: string[] = [];
    if (!(distance > 0)) problems.push('Enter the target distance.');
    if (!(time > 0)) problems.push('Enter a target time, like 40:00.');
    if (problems.length === 0) problems.push(...validateSplitSet(set));
    return { set, problems, parsed: null, ok: problems.length === 0 };
  }

  const parsed = draft.mode === 'paste' ? parseSplitList(draft.paste.text, draft.paste.units) : null;
  const markers = parsed
    ? parsed.ok
      ? parsed.markers
      : []
    : draft.rows.map((r) => ({ distance: r.distance, time: parseDuration(r.time) ?? NaN }));
  const set: SplitSet = {
    name,
    markers,
    officialDistance: draft.official && choiceDistance(draft.official),
    interpolation: draft.interpolation,
  };
  let problems = validateSplitSet(set);
  // The paste errors already say what is wrong with the splits.
  if (parsed && !parsed.ok) problems = problems.filter((p) => !p.startsWith('Add at least one split'));
  return { set, problems, parsed, ok: problems.length === 0 && (parsed?.ok ?? true) };
}
