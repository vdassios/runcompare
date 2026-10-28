/**
 * The shared course grid and resampling of aligned attempts onto it (PLAN §5.6), so attempts can
 * be compared point by point, plus the ghost delta. Pure functions on typed arrays.
 */
import { bisectLeft, max, median } from 'd3-array';
import type { Activity, AlignedSeries, CourseGrid } from '../model/types';
import { gapPace } from './gap';
import { interpolateAt, resampleOnto, rollingMean } from './interp';
import { gradeFromElevation, smoothElevationByDistance } from './smoothing';

/** Pace is measured over ±`PACE_HALF_SPAN` metres of course. */
const PACE_HALF_SPAN = 50;
/** HR, cadence and elevation are averaged over this many seconds before sampling. */
const STREAM_SMOOTHING = 5;

/**
 * Grid over the baseline's own course: `length` is its last watch distance, elevation and grade
 * come from PLAN §5.2 smoothing, and lat/lon are its position at each grid point.
 */
export function buildCourseGrid(baseline: Activity, step: number): CourseGrid {
  // The last finite distance: a parser may leave NaN on a trailing sample without distance.
  const grid = buildDistanceGrid(Math.max(0, max(baseline.dist) ?? 0), step);
  const { d } = grid;

  if (baseline.ele) {
    const smoothed = smoothElevationByDistance(baseline.dist, baseline.ele, { step });
    grid.ele = resampleOnto(smoothed.d, smoothed.ele, d);
    grid.grade = gradeFromElevation(grid.ele, step);
  }
  if (baseline.lat && baseline.lon) {
    grid.lat = sampleAt(baseline.dist, baseline.lat, d);
    grid.lon = sampleAt(baseline.dist, baseline.lon, d);
  }
  return grid;
}

/** Grid `0, step, 2·step, …, length` with no elevation or position (distance baselines). */
export function buildDistanceGrid(length: number, step: number): CourseGrid {
  if (!(step > 0)) throw new RangeError(`step must be positive, got ${step}`);
  if (!(length >= 0)) throw new RangeError(`length must be non-negative, got ${length}`);
  const full = Math.floor(length / step);
  // Same rule as smoothElevationByDistance: drop a sub-millimetre tail so float error adds no near-duplicate.
  const hasTail = length - full * step > 1e-3;
  const d = new Float64Array(full + 1 + (hasTail ? 1 : 0));
  for (let k = 0; k <= full; k++) d[k] = k * step;
  d[d.length - 1] = length;
  return { step, length, d, ele: null, grade: null, lat: null, lon: null };
}

/**
 * Resamples an attempt onto `grid` given its course distance per sample (from alignment).
 * `moving` and `walking` stay null: the pipeline fills them with {@link resampleFlags}.
 */
export function resampleAttempt(
  activity: Activity,
  courseDist: Float64Array,
  offCourse: Uint8Array,
  grid: CourseGrid,
): AlignedSeries {
  const n = activity.t.length;
  if (courseDist.length !== n || offCourse.length !== n) {
    throw new RangeError(`courseDist (${courseDist.length}) and offCourse (${offCourse.length}) must match t (${n})`);
  }
  const { d } = grid;
  const on = finiteIndices(courseDist);
  const cd = pick(courseDist, on);
  const ct = pick(activity.t, on);
  const timeAt = (x: number): number => interpolateAt(cd, ct, x);

  const time = new Float64Array(d.length);
  for (let k = 0; k < d.length; k++) time[k] = timeAt(d[k]!);

  const pace = new Float32Array(d.length);
  const span = Math.min(2 * PACE_HALF_SPAN, grid.length);
  for (let k = 0; k < d.length; k++) {
    // Near the ends the full span shifts inward, so the pace stays one-sided over 100 m.
    const lo = Math.min(Math.max(d[k]! - PACE_HALF_SPAN, 0), grid.length - span);
    pace[k] = span > 0 ? (timeAt(lo + span) - timeAt(lo)) / span : NaN;
  }

  const window = STREAM_SMOOTHING / medianInterval(activity.t);
  const atTime = (ys: Float32Array | null): Float32Array | null =>
    ys && resampleOnto(activity.t, rollingMean(ys, window), time);

  const grade = grid.grade ?? ownGrade(activity, courseDist, grid);

  return {
    time,
    ele: atTime(activity.ele),
    hr: atTime(activity.hr),
    cad: atTime(activity.cad),
    pace,
    gap: grade && gapPace(pace, grade),
    moving: null,
    walking: null,
    offCourse: perCell(offCourse, courseDist, on, grid, 'any'),
    estimated: new Uint8Array(d.length),
  };
}

/** Ghost delta per grid point: attempt time − baseline time, positive means behind. */
export function computeDelta(series: AlignedSeries, baselineTime: Float64Array): Float64Array {
  const { time } = series;
  if (time.length !== baselineTime.length) {
    throw new RangeError(`time and baselineTime differ in length (${time.length} vs ${baselineTime.length})`);
  }
  const out = new Float64Array(time.length);
  for (let k = 0; k < out.length; k++) out[k] = time[k]! - baselineTime[k]!;
  return out;
}

/**
 * Per-sample flags (moving, walking) onto the grid by majority vote of the samples in each cell;
 * a tie gives 0. See {@link perCell} for what a cell is.
 */
export function resampleFlags(flags: Uint8Array, courseDist: Float64Array, grid: CourseGrid): Uint8Array {
  if (flags.length !== courseDist.length) {
    throw new RangeError(`flags and courseDist differ in length (${flags.length} vs ${courseDist.length})`);
  }
  return perCell(flags, courseDist, finiteIndices(courseDist), grid, 'majority');
}

/**
 * Reduces per-sample flags to one per grid point. Cell k holds the samples nearest to d_k,
 * `[d_k − step/2, d_k + step/2)`. A cell with no sample (sparse GPX, a jump in alignment) takes
 * the flag of the first sample to reach d_k, the same sample that gives `time(d_k)`.
 */
function perCell(
  flags: Uint8Array,
  courseDist: Float64Array,
  on: Uint32Array,
  grid: CourseGrid,
  rule: 'any' | 'majority',
): Uint8Array {
  const { d } = grid;
  const ones = new Uint32Array(d.length);
  const count = new Uint32Array(d.length);
  for (const i of on) {
    const k = nearest(d, courseDist[i]!);
    count[k] = count[k]! + 1;
    if (flags[i]) ones[k] = ones[k]! + 1;
  }

  const cd = pick(courseDist, on);
  const out = new Uint8Array(d.length);
  for (let k = 0; k < d.length; k++) {
    const c = count[k]!;
    if (c > 0) {
      out[k] = (rule === 'any' ? ones[k]! > 0 : 2 * ones[k]! > c) ? 1 : 0;
    } else if (on.length > 0) {
      const j = Math.min(bisectLeft(cd, d[k]!), on.length - 1);
      out[k] = flags[on[j]!] ? 1 : 0;
    }
  }
  return out;
}

/** The attempt's own grade on the grid (distance baselines); null without elevation. */
function ownGrade(activity: Activity, courseDist: Float64Array, grid: CourseGrid): Float32Array | null {
  if (!activity.ele) return null;
  const smoothed = smoothElevationByDistance(courseDist, activity.ele, { step: grid.step });
  return gradeFromElevation(resampleOnto(smoothed.d, smoothed.ele, grid.d), grid.step);
}

/** Index of the grid point nearest to `x`; ties go to the later point. */
function nearest(d: Float64Array, x: number): number {
  const i = bisectLeft(d, x);
  if (i === 0) return 0;
  if (i === d.length) return i - 1;
  return x - d[i - 1]! < d[i]! - x ? i - 1 : i;
}

/** Interpolates `ys` over `xs` at each target, in double precision (lat/lon need it). */
function sampleAt(xs: ArrayLike<number>, ys: ArrayLike<number>, targets: Float64Array): Float64Array {
  const on = finiteIndices(xs);
  const fx = pick(xs, on);
  const fy = pick(ys, on);
  const out = new Float64Array(targets.length);
  for (let k = 0; k < out.length; k++) out[k] = interpolateAt(fx, fy, targets[k]!);
  return out;
}

function finiteIndices(xs: ArrayLike<number>): Uint32Array {
  const idx = new Uint32Array(xs.length);
  let m = 0;
  for (let i = 0; i < xs.length; i++) if (Number.isFinite(xs[i]!)) idx[m++] = i;
  return idx.subarray(0, m);
}

function pick(xs: ArrayLike<number>, idx: Uint32Array): Float64Array {
  const out = new Float64Array(idx.length);
  for (let j = 0; j < idx.length; j++) out[j] = xs[idx[j]!]!;
  return out;
}

/** Typical sampling interval in seconds, robust to pauses; 1 s when there are too few samples. */
function medianInterval(t: Float64Array): number {
  if (t.length < 2) return 1;
  const dt = new Float64Array(t.length - 1);
  for (let i = 1; i < t.length; i++) dt[i - 1] = t[i]! - t[i - 1]!;
  return median(dt) ?? 1;
}
