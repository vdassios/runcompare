/**
 * Shared building blocks for the insight rules, which compare each GPS attempt with a course
 * baseline at the same course positions (PLAN §5.11): moving time per grid step, cuts by course
 * distance and by moving time, rolling windows in course metres, and runs of grid points.
 */
import type { AlignedSeries, AnalysisResult, AttemptAnalysis } from '../../../model/types';
import { rollingMedian } from '../../interp';

export type RuleInput = Omit<AnalysisResult, 'insights'>;

/** A stretch of grid points: `start` inclusive, `end` exclusive. */
export interface IndexRange {
  start: number;
  end: number;
}

export interface Comparison {
  baseline: AttemptAnalysis;
  /** Every GPS attempt except the baseline. */
  attempts: AttemptAnalysis[];
}

/** The course baseline and the attempts compared with it; null on a split-set baseline, which has no streams. */
export function comparison(result: RuleInput): Comparison | null {
  if (result.baseline.kind !== 'course') return null;
  const baseline = result.attempts.find((a) => a.attemptId === result.baseline.attemptId);
  if (!baseline) return null;
  return { baseline, attempts: result.attempts.filter((a) => a.kind === 'gps' && a !== baseline) };
}

export function insightId(ruleId: string, attemptId: string, index: number): string {
  return `${ruleId}:${attemptId}:${index}`;
}

/** A copy of `values` with NaN where the point is off-course or stopped, so it counts in no mean or window. */
export function maskUnusable(series: AlignedSeries, values: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(values);
  for (let k = 0; k < out.length; k++) {
    if (series.offCourse[k] === 1 || series.moving?.[k] === 0) out[k] = NaN;
  }
  return out;
}

/**
 * Moving seconds from grid point k to k + 1: 0 when stopped, so a stop isn't read as slow running,
 * and NaN off-course and after the last point. A step belongs to the stretch its start point is in.
 */
export function stepTimes(series: AlignedSeries): Float64Array {
  const { time, moving, offCourse } = series;
  const steps = new Float64Array(time.length).fill(NaN);
  for (let k = 0; k < time.length - 1; k++) {
    if (offCourse[k] === 1 || offCourse[k + 1] === 1) continue;
    const dt = time[k + 1]! - time[k]!;
    if (Number.isFinite(dt)) steps[k] = moving?.[k + 1] === 0 ? 0 : dt;
  }
  return steps;
}

/** Moving time of the attempt and the baseline over the steps of a stretch both have. */
export function timesOver(
  attempt: Float64Array,
  baseline: Float64Array,
  r: IndexRange,
): { attempt: number; baseline: number } {
  let a = 0;
  let b = 0;
  for (let k = r.start; k < r.end; k++) {
    if (!Number.isFinite(attempt[k]!) || !Number.isFinite(baseline[k]!)) continue;
    a += attempt[k]!;
    b += baseline[k]!;
  }
  return { attempt: a, baseline: b };
}

/** Cuts the grid into `parts` stretches of equal course distance, in course order. */
export function splitByDistance(n: number, parts: number): IndexRange[] {
  const bounds = Array.from({ length: parts + 1 }, (_, p) => (p === parts ? n : Math.round((p / parts) * (n - 1))));
  return bounds.slice(0, -1).map((start, p) => ({ start, end: bounds[p + 1]! }));
}

/** Moving time (s) up to each grid point: the clock that halves and quarters are cut on. */
export function movingClock(series: AlignedSeries): Float64Array {
  const { time, moving } = series;
  const clock = new Float64Array(time.length);
  for (let k = 1; k < time.length; k++) {
    const dt = time[k]! - time[k - 1]!;
    const counts = Number.isFinite(dt) && dt > 0 && moving?.[k] !== 0;
    clock[k] = clock[k - 1]! + (counts ? dt : 0);
  }
  return clock;
}

/** Cuts the grid into `parts` stretches of equal moving time, in course order. */
export function splitByMovingTime(series: AlignedSeries, parts: number): IndexRange[] {
  const clock = movingClock(series);
  const n = clock.length;
  const total = n > 0 ? clock[n - 1]! : 0;
  const bounds = [0];
  let k = 0;
  for (let p = 1; p < parts; p++) {
    while (k < n - 1 && clock[k]! < (p / parts) * total) k++;
    bounds.push(Math.max(k, bounds[p - 1]!));
  }
  bounds.push(n);
  return bounds.slice(0, -1).map((start, p) => ({ start, end: bounds[p + 1]! }));
}

/** Course metres a stretch of grid points spans, ending at the first point after it. */
export function courseRange(d: Float64Array, r: IndexRange): { from: number; to: number } {
  return { from: d[r.start]!, to: d[Math.min(r.end, d.length - 1)]! };
}

/** Mean of the finite values in a stretch; NaN when there are none. */
export function meanOver(values: ArrayLike<number>, r: IndexRange): number {
  let sum = 0;
  let count = 0;
  for (let k = r.start; k < r.end; k++) {
    const v = values[k]!;
    if (!Number.isFinite(v)) continue;
    sum += v;
    count++;
  }
  return count > 0 ? sum / count : NaN;
}

/**
 * Centred rolling median over `metres` of course. A median rather than a mean, so a short
 * hiccup can't make a whole window look slow.
 */
export function rollingMedianOnGrid(values: ArrayLike<number>, step: number, metres: number): Float32Array {
  return rollingMedian(values, Math.round(metres / step) | 1);
}

/** Maximal runs of grid points where `test` holds; a NaN value never passes. */
export function runsWhere(values: ArrayLike<number>, test: (v: number) => boolean): IndexRange[] {
  const runs: IndexRange[] = [];
  let start = -1;
  for (let k = 0; k <= values.length; k++) {
    const v = k < values.length ? values[k]! : NaN;
    const pass = Number.isFinite(v) && test(v);
    if (pass && start < 0) start = k;
    if (!pass && start >= 0) {
      runs.push({ start, end: k });
      start = -1;
    }
  }
  return runs;
}
