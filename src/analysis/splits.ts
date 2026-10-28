/**
 * Splits along the course (PLAN §5.9): boundary positions from a split length, the baseline's
 * laps or climb segments, and each split's time and delta read off an attempt's grid series.
 * Split deltas are differences of the delta curve, so they always add up to the total delta.
 */
import { bisectLeft, bisectRight } from 'd3-array';
import type { AlignedSeries, CourseGrid, CourseLap, CourseSegment } from '../model/types';
import { interpolateAt } from './interp';

export interface Split {
  from: number; // course m
  to: number;
  time: number; // s spent in the split
  delta: number | null; // s lost (positive) or gained in the split; null for the baseline
  offCourse: boolean; // touches an off-course grid point: not comparable
  estimated: boolean; // touches an interpolated grid point (split sets)
}

/** Boundaries closer than this (m) are one boundary, so float error can't add a sliver split. */
const SAME = 1e-3;

/** `0, splitLength, 2·splitLength, …, length`; the last split is the remainder. */
export function distanceBoundaries(length: number, splitLength: number): number[] {
  if (!(splitLength > 0)) throw new RangeError(`splitLength must be positive, got ${splitLength}`);
  const out: number[] = [];
  for (let k = 0; k * splitLength < length - SAME; k++) out.push(k * splitLength);
  out.push(Math.max(0, length));
  return out;
}

/** `0`, every lap edge strictly inside the course (sorted, duplicates merged), then `length`. */
export function lapBoundaries(laps: CourseLap[], length: number): number[] {
  const inside = laps
    .flatMap((lap) => [lap.from, lap.to])
    .filter((d) => d > SAME && d < length - SAME)
    .sort((x, y) => x - y);
  const out = [0];
  for (const d of inside) if (d - out[out.length - 1]! > SAME) out.push(d);
  if (length > SAME) out.push(length);
  return out;
}

/** One `[from, to]` pair per segment; segments aren't contiguous, so each is split on its own. */
export function segmentBoundaries(segments: CourseSegment[]): number[][] {
  return segments.map((s) => [s.from, s.to]);
}

/** True when any flag in `flags[lo, hi)` is set. */
function anySet(flags: Uint8Array, lo: number, hi: number): boolean {
  for (let k = lo; k < hi; k++) if (flags[k]) return true;
  return false;
}

/**
 * One split per consecutive pair of `boundaries` (course m, increasing). Time and delta are
 * interpolated on `grid.d` at both ends; a split is off-course or estimated when any grid point
 * in `[from, to]` is flagged.
 */
export function computeSplits(
  grid: CourseGrid,
  series: AlignedSeries,
  delta: Float64Array | null,
  boundaries: number[],
): Split[] {
  const timeAt = boundaries.map((b) => interpolateAt(grid.d, series.time, b));
  const deltaAt = delta ? boundaries.map((b) => interpolateAt(grid.d, delta, b)) : null;

  const splits: Split[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const from = boundaries[i - 1]!;
    const to = boundaries[i]!;
    const lo = bisectLeft(grid.d, from);
    const hi = bisectRight(grid.d, to);
    splits.push({
      from,
      to,
      time: timeAt[i]! - timeAt[i - 1]!,
      delta: deltaAt ? deltaAt[i]! - deltaAt[i - 1]! : null,
      offCourse: anySet(series.offCourse, lo, hi),
      estimated: anySet(series.estimated, lo, hi),
    });
  }
  return splits;
}
