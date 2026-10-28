/**
 * Per-attempt summary metrics for GPS attempts (PLAN §5.8): stopped and moving time, walking,
 * ascent and descent, average HR, aerobic decoupling and cadence fade. Pure functions on the
 * attempt's own samples; they feed the KPI cards and the insight rules.
 */
import type { Activity, AnalysisSettings, AttemptMetrics } from '../model/types';
import { resampleOnto, rollingMean } from './interp';
import { ascentDescent, gradeFromElevation, smoothElevationByDistance } from './smoothing';

/** 6 km/h: without cadence, moving slower than this on a steep climb counts as walking. */
const WALKING_SPEED = 1.667;
/** Grade (fraction) above which slow movement counts as walking when there is no cadence. */
const WALKING_GRADE = 0.1;
/** Samples in the rolling mean that smooths a speed derived from distance and time. */
const SPEED_WINDOW = 5;
/** Distance step (m) of the smoothed elevation that per-sample grade is taken from. */
const GRADE_STEP = 10;

export interface MovementFlags {
  /** Per sample: 1 = moving, 0 = inside a stop. */
  moving: Uint8Array;
  /** Per sample: 1 = walking. Null with neither cadence nor grade. */
  walking: Uint8Array | null;
  /** True when walking comes from speed and grade because the attempt has no cadence. */
  walkingEstimated: boolean;
}

/**
 * Seconds each sample accounts for: the time since the previous sample, 0 for the first. A
 * sample's speed describes the movement that led up to it, so it owns the interval before it.
 */
function sampleDurations(t: Float64Array): Float64Array {
  const dt = new Float64Array(t.length);
  for (let k = 1; k < t.length; k++) dt[k] = t[k]! - t[k - 1]!;
  return dt;
}

/** The device speed where it has one, otherwise Δdist/Δt smoothed over {@link SPEED_WINDOW} samples. */
function sampleSpeed(a: Activity): Float32Array {
  const device = a.speed;
  if (device && device.every(Number.isFinite)) return device;

  const n = a.t.length;
  const raw = new Float32Array(n).fill(NaN);
  for (let k = 1; k < n; k++) raw[k] = (a.dist[k]! - a.dist[k - 1]!) / (a.t[k]! - a.t[k - 1]!);
  const derived = rollingMean(raw, SPEED_WINDOW);
  if (!device) return derived;
  return derived.map((v, k) => (Number.isFinite(device[k]!) ? device[k]! : v));
}

/**
 * Per-sample moving and walking flags. A stop is a run of samples slower than
 * `s.stoppedSpeed` lasting at least `s.stoppedMinDuration` seconds; shorter dips stay moving.
 * Walking is moving with cadence below `s.walkingCadence`; without cadence it is estimated as
 * moving slower than 6 km/h on a grade above 10 %. NaN cadence or grade never counts as walking.
 */
export function movementFlags(a: Activity, grade: Float32Array | null, s: AnalysisSettings): MovementFlags {
  const n = a.t.length;
  const dt = sampleDurations(a.t);
  const speed = sampleSpeed(a);

  const moving = new Uint8Array(n).fill(1);
  let runStart = -1;
  let runTime = 0;
  for (let k = 0; k <= n; k++) {
    if (k < n && speed[k]! < s.stoppedSpeed) {
      if (runStart < 0) {
        runStart = k;
        runTime = 0;
      }
      runTime += dt[k]!;
      continue;
    }
    if (runStart >= 0 && runTime >= s.stoppedMinDuration) moving.fill(0, runStart, k);
    runStart = -1;
  }

  const cad = a.cad;
  if (cad) {
    const walking = moving.map((m, k) => (m && cad[k]! < s.walkingCadence ? 1 : 0));
    return { moving, walking, walkingEstimated: false };
  }
  if (grade) {
    const walking = moving.map((m, k) => (m && speed[k]! < WALKING_SPEED && grade[k]! > WALKING_GRADE ? 1 : 0));
    return { moving, walking, walkingEstimated: true };
  }
  return { moving, walking: null, walkingEstimated: false };
}

/** Time-weighted mean of `value(k)` over the samples `include(k)` accepts; NaN values are skipped. */
function meanOver(dt: Float64Array, include: (k: number) => boolean, value: (k: number) => number): number {
  let sum = 0;
  let weight = 0;
  for (let k = 0; k < dt.length; k++) {
    if (!include(k)) continue;
    const v = value(k);
    if (!Number.isFinite(v)) continue;
    sum += v * dt[k]!;
    weight += dt[k]!;
  }
  return weight > 0 ? sum / weight : NaN;
}

const orNull = (v: number): number | null => (Number.isFinite(v) ? v : null);

/**
 * Summary metrics of one GPS attempt. `gapPerSample` is grade-adjusted pace (s/m) per sample,
 * null when there is no grade.
 * - `decoupling` = (r1 − r2) / r1 with r = mean GAP speed / mean HR over the first and second
 *   half of moving time: positive means HR drifted up for the same effort.
 * - `cadenceFade` = (c1 − c4) / c1 with c the mean running cadence (moving, not walking) over
 *   the first and last quarter of moving time: positive means cadence dropped.
 * Every metric whose stream is missing is null; `cadenceFade` is also null when walking is estimated.
 */
export function computeMetrics(a: Activity, flags: MovementFlags, gapPerSample: Float32Array | null): AttemptMetrics {
  const n = a.t.length;
  const dt = sampleDurations(a.t);
  const elapsed = n > 0 ? a.t[n - 1]! : 0;
  const distance = n > 0 ? a.dist[n - 1]! : 0;

  // Moving time up to and including each sample: the clock that halves and quarters are cut on.
  const clock = new Float64Array(n);
  let movingTime = 0;
  let stopped = 0;
  for (let k = 0; k < n; k++) {
    if (flags.moving[k]) movingTime += dt[k]!;
    else stopped += dt[k]!;
    clock[k] = movingTime;
  }
  const isMoving = (k: number): boolean => flags.moving[k] === 1;
  const inShare = (k: number, from: number, to: number): boolean =>
    isMoving(k) && clock[k]! > from * movingTime && clock[k]! <= to * movingTime;

  let ascent: number | null = null;
  let descent: number | null = null;
  if (a.ele && a.ele.some(Number.isFinite)) {
    ({ ascent, descent } = ascentDescent(smoothElevationByDistance(a.dist, a.ele).ele));
  }

  const hr = a.hr;
  const avgHr = hr ? orNull(meanOver(dt, isMoving, (k) => hr[k]!)) : null;

  const walking = flags.walking;
  let walkingShare: number | null = null;
  if (walking) {
    let walkingTime = 0;
    for (let k = 0; k < n; k++) if (walking[k]) walkingTime += dt[k]!;
    walkingShare = movingTime > 0 ? walkingTime / movingTime : 0;
  }

  let decoupling: number | null = null;
  if (hr && gapPerSample) {
    const ratio = (from: number, to: number): number => {
      const both = (k: number): boolean =>
        inShare(k, from, to) && Number.isFinite(hr[k]!) && Number.isFinite(1 / gapPerSample[k]!);
      return meanOver(dt, both, (k) => 1 / gapPerSample[k]!) / meanOver(dt, both, (k) => hr[k]!);
    };
    const r1 = ratio(0, 0.5);
    const r2 = ratio(0.5, 1);
    decoupling = r1 > 0 ? orNull((r1 - r2) / r1) : null;
  }

  let cadenceFade: number | null = null;
  const cad = a.cad;
  if (cad && !flags.walkingEstimated) {
    const running = (k: number): boolean => !walking || walking[k] === 0;
    const meanCad = (from: number, to: number): number =>
      meanOver(
        dt,
        (k) => inShare(k, from, to) && running(k),
        (k) => cad[k]!,
      );
    const c1 = meanCad(0, 0.25);
    const c4 = meanCad(0.75, 1);
    cadenceFade = c1 > 0 ? orNull((c1 - c4) / c1) : null;
  }

  return {
    elapsed,
    moving: elapsed - stopped,
    stopped,
    distance,
    ascent,
    descent,
    avgHr,
    walkingShare,
    walkingEstimated: flags.walkingEstimated,
    decoupling,
    cadenceFade,
  };
}

/**
 * Grade (fraction) at each sample from the attempt's own elevation: smoothed by distance
 * (PLAN §5.2), differentiated, and interpolated back onto the sample distances. Null without
 * elevation.
 */
export function gradePerSample(a: Activity): Float32Array | null {
  if (!a.ele || !a.ele.some(Number.isFinite)) return null;
  const { d, ele } = smoothElevationByDistance(a.dist, a.ele, { step: GRADE_STEP });
  return resampleOnto(d, gradeFromElevation(ele, GRADE_STEP), a.dist);
}
