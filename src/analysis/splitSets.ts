/**
 * Split sets (PLAN §1.2, §5.7): interpolating `(distance, time)` markers onto the course grid,
 * parsing pasted split lists, and building target-time sets. Pure functions; SI units.
 */
import { bisectLeft } from 'd3-array';
import { METRES_PER_MILE, formatDuration, parseDuration, splitLength } from '../format';
import type { AlignedSeries, AnalysisWarning, CourseGrid, SplitMarker, SplitSet, UnitSystem } from '../model/types';
import { gapFactor, gapPace } from './gap';
import { interpolateAt } from './interp';

/** Markers this close to the course end (m) are on it: absorbs float error from rescaling. */
const END_TOLERANCE = 1e-3;

/**
 * Places a split set on the course grid.
 *
 * - With `officialDistance`, markers are rescaled by `grid.length / officialDistance`. Markers past
 *   the course end collapse onto it: the last of them is kept at `grid.length` (so the set's finish
 *   time stays the finish) and the set gets a warning.
 * - `'gap'` on a grid with grade distributes each interval's time in proportion to
 *   `gapFactor(grade_k) · cellLength`, i.e. constant GAP within the interval; otherwise linear.
 * - Past the last marker, time is extrapolated at the last interval's pace (its GAP in GAP mode)
 *   and the set gets a `split-set-extrapolated` warning.
 * - `estimated` is 0 only at d = 0 and the grid point nearest each marker.
 *
 * `pace` is the forward difference of `time` over each cell (backward at the last point), so in
 * GAP mode `gap` is exactly the interval's constant away from cells that contain a marker.
 * Warnings carry `attemptId: null`; the caller knows the attempt. Throws a RangeError when
 * {@link validateSplitSet} rejects the set.
 */
export function interpolateSplitSet(
  set: SplitSet,
  grid: CourseGrid,
): { series: AlignedSeries; markers: SplitMarker[]; warnings: AnalysisWarning[] } {
  const problems = validateSplitSet(set);
  if (problems.length > 0) throw new RangeError(`invalid split set: ${problems.join(' ')}`);

  const { d, length } = grid;
  const n = d.length;
  const warnings: AnalysisWarning[] = [];

  const scale = set.officialDistance === null ? 1 : length / set.officialDistance;
  const markers: SplitMarker[] = [];
  let clamped = false;
  for (const m of set.markers) {
    const distance = m.distance * scale;
    if (distance < length - END_TOLERANCE) {
      markers.push({ distance, time: m.time });
      continue;
    }
    if (distance > length + END_TOLERANCE) clamped = true;
    const last = markers[markers.length - 1];
    if (last && last.distance === length) last.time = m.time;
    else markers.push({ distance: length, time: m.time });
  }
  if (clamped) {
    warnings.push({
      code: 'split-set-extrapolated',
      attemptId: null,
      message: `“${set.name}” has splits past the end of the course; its last split was moved to the finish.`,
    });
  }

  // Effort coordinate: cumulative cell length, weighted by the GAP factor in GAP mode. Time is
  // piecewise linear in it between markers, which is linear or constant-GAP interpolation.
  const grade = set.interpolation === 'gap' ? grid.grade : null;
  const effort = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    const factor = grade ? gapFactor(grade[k - 1]!) : 1;
    effort[k] = effort[k - 1]! + (Number.isFinite(factor) ? factor : 1) * (d[k]! - d[k - 1]!);
  }

  const knotEffort = [0, ...markers.map((m) => interpolateAt(d, effort, m.distance))];
  const knotTime = [0, ...markers.map((m) => m.time)];
  const lastEffort = knotEffort[knotEffort.length - 1]!;
  const lastTime = knotTime[knotTime.length - 1]!;
  const lastRate = (lastTime - knotTime[knotTime.length - 2]!) / (lastEffort - knotEffort[knotEffort.length - 2]!);

  const time = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const e = effort[k]!;
    time[k] = e <= lastEffort ? interpolateAt(knotEffort, knotTime, e) : lastTime + (e - lastEffort) * lastRate;
  }

  const lastMarker = markers[markers.length - 1]!;
  if (lastMarker.distance < length) {
    warnings.push({
      code: 'split-set-extrapolated',
      attemptId: null,
      message: `“${set.name}” ends before the finish; the rest is extrapolated at its last split's pace.`,
    });
  }

  const estimated = new Uint8Array(n).fill(1);
  estimated[0] = 0;
  for (const m of markers) estimated[nearestIndex(d, m.distance)] = 0;

  const pace = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = k < n - 1 ? k : k - 1;
    pace[k] = a >= 0 ? (time[a + 1]! - time[a]!) / (d[a + 1]! - d[a]!) : NaN;
  }

  return {
    series: {
      time,
      ele: null,
      hr: null,
      cad: null,
      pace,
      gap: grid.grade ? gapPace(pace, grid.grade) : null,
      moving: null,
      walking: null,
      offCourse: new Uint8Array(n),
      estimated,
    },
    markers,
    warnings,
  };
}

/** Index of the value in the sorted `xs` nearest to `x`. */
function nearestIndex(xs: Float64Array, x: number): number {
  const i = bisectLeft(xs, x);
  if (i === 0) return 0;
  if (i === xs.length) return xs.length - 1;
  return x - xs[i - 1]! <= xs[i]! - x ? i - 1 : i;
}

export type ParseResult =
  { ok: true; markers: SplitMarker[] } | { ok: false; errors: { line: number; message: string }[] };

const UNIT_METRES: Readonly<Record<string, number>> = { km: 1000, k: 1000, mi: METRES_PER_MILE, m: 1 };
const NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
/** `<number>[unit] <time>`, after arrows are turned into spaces. */
const ENTRY = new RegExp(String.raw`^${NUMBER}\s*([a-z]+)?\s+(\S+)$`, 'i');
const DISTANCE_CELL = new RegExp(String.raw`^${NUMBER}\s*([a-z]+)?$`, 'i');
const ARROW = /→|->|=>/g;

/**
 * Parses a pasted list of cumulative splits into markers, e.g. `"10 30:00, 15 1:02:00"`.
 *
 * - Entries are separated by newlines, commas or semicolons. A line with a tab is one row pasted
 *   from a results table: its time is the first cell holding an `m:ss`-style time, and its
 *   distance is the nearest cell before it that reads as a distance.
 * - Otherwise an entry is a distance, an optional unit (`km`, `k`, `mi`, `m`), an optional arrow
 *   (`→`, `->`, `=>`) and a time read by `parseDuration`. Without a unit the distance is in
 *   kilometres (metric) or miles (imperial).
 * - Distances and times must strictly increase from the implicit (0, 0). Errors carry the
 *   1-based line of the entry.
 */
export function parseSplitList(text: string, units: UnitSystem): ParseResult {
  const errors: { line: number; message: string }[] = [];
  const markers: SplitMarker[] = [];
  let previous: SplitMarker = { distance: 0, time: 0 };

  text.split(/\r?\n/).forEach((lineText, index) => {
    const line = index + 1;
    const entries = lineText.includes('\t') ? [lineText] : lineText.split(/[,;]/);
    for (const raw of entries) {
      const entry = raw.trim();
      if (entry === '') continue;
      const parsed = entry.includes('\t') ? parseRow(entry, units) : parseEntry(entry, units);
      if (typeof parsed === 'string') {
        errors.push({ line, message: parsed });
        continue;
      }
      if (parsed.distance <= previous.distance) {
        errors.push({ line, message: `“${entry}”: distance must be greater than the previous split's.` });
      } else if (parsed.time <= previous.time) {
        errors.push({ line, message: `“${entry}”: time must be later than the previous split's.` });
      } else {
        markers.push(parsed);
        previous = parsed;
      }
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  if (markers.length === 0) return { ok: false, errors: [{ line: 1, message: 'Enter at least one split.' }] };
  return { ok: true, markers };
}

/** A marker, or an error message. */
function parseEntry(entry: string, units: UnitSystem): SplitMarker | string {
  const match = ENTRY.exec(entry.replace(ARROW, ' ').trim());
  if (!match) return `“${entry}”: expected a distance and a time, like “10 30:00”.`;
  const distance = toMetres(match[1]!, match[2], units);
  if (distance === null) return `“${entry}”: unknown unit “${match[2]}”; use km, mi or m.`;
  const time = parseDuration(match[3]!);
  if (time === null) return `“${entry}”: “${match[3]}” is not a time; use h:mm:ss or m:ss.`;
  return { distance, time };
}

/** A tab-separated results-table row: the first `m:ss` cell and the nearest distance cell before it. */
function parseRow(row: string, units: UnitSystem): SplitMarker | string {
  const cells = row.split('\t').map((c) => c.trim());
  const timeAt = cells.findIndex((c) => c.includes(':') && parseDuration(c) !== null);
  if (timeAt > 0) {
    for (let i = timeAt - 1; i >= 0; i--) {
      const match = DISTANCE_CELL.exec(cells[i]!);
      const distance = match ? toMetres(match[1]!, match[2], units) : null;
      if (distance !== null) return { distance, time: parseDuration(cells[timeAt]!)! };
    }
  }
  return `“${cells.filter((c) => c !== '').join(' ')}”: expected a distance cell followed by a time cell.`;
}

/** Metres for a number and an optional unit suffix; null for an unknown unit. */
function toMetres(value: string, unit: string | undefined, units: UnitSystem): number | null {
  const perUnit = unit === undefined ? splitLength(units) : UNIT_METRES[unit.toLowerCase()];
  return perUnit === undefined ? null : Number(value) * perUnit;
}

/** A goal: one marker at the finish (rescaled onto the course), interpolated linearly. */
export function targetTimeSplitSet(distance: number, time: number, name?: string): SplitSet {
  return {
    name: name ?? `Target ${formatDuration(time)}`,
    markers: [{ distance, time }],
    officialDistance: distance,
    interpolation: 'linear',
  };
}

/** Problems with a split set as human messages, without unit-bearing numbers; [] when valid. */
export function validateSplitSet(set: SplitSet): string[] {
  const problems: string[] = [];
  if (set.name.trim() === '') problems.push('Give the split set a name.');
  if (set.markers.length === 0) problems.push('Add at least one split.');
  const official = set.officialDistance;
  if (official !== null && !(Number.isFinite(official) && official > 0)) {
    problems.push('The official distance must be a positive number.');
  }
  let previous: SplitMarker = { distance: 0, time: 0 };
  set.markers.forEach((m, i) => {
    const label = `Split ${i + 1}`;
    if (!Number.isFinite(m.distance) || !Number.isFinite(m.time)) {
      problems.push(`${label} needs a distance and a time.`);
      return;
    }
    const after = i === 0 ? 'the start' : `split ${i}`;
    if (m.distance <= previous.distance) problems.push(`${label} must be further than ${after}.`);
    if (m.time <= previous.time) problems.push(`${label} must be later than ${after}.`);
    previous = m;
  });
  return problems;
}
