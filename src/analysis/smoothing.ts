/**
 * Elevation smoothing, grade, and ascent/descent (PLAN §5.2). Pure functions on typed arrays.
 */
import { max } from 'd3-array';
import { bridgeNaN, resampleOnto, rollingMean, rollingMedian } from './interp';

/** Steepest grade the analysis believes, as a fraction. Anything steeper is noise. */
export const MAX_GRADE = 0.45;

export interface SmoothElevationOptions {
  /** Median filter length in samples (default 5). */
  medianWindow?: number;
  /** Distance step of the output, m (default 10). */
  step?: number;
  /** Moving-average span, m (default 50). */
  averageOver?: number;
}

/**
 * Smooths raw elevation against cumulative distance: a median filter over samples (removes
 * spikes), linear resampling onto `0, step, 2·step, …, L` with `L` the largest distance (the
 * last gap may be shorter), then a centred moving average over `averageOver` metres.
 *
 * NaN distances or elevations are skipped and bridged. With no finite distance the result is
 * empty; with no finite elevation `ele` is all NaN.
 */
export function smoothElevationByDistance(
  dist: ArrayLike<number> & Iterable<number>,
  ele: ArrayLike<number>,
  opts: SmoothElevationOptions = {},
): { d: Float64Array; ele: Float32Array } {
  const { medianWindow = 5, step = 10, averageOver = 50 } = opts;
  if (!(step > 0)) throw new RangeError(`step must be positive, got ${step}`);

  const furthest = max(dist); // skips NaN
  if (furthest === undefined) return { d: new Float64Array(0), ele: new Float32Array(0) };
  const length = Math.max(0, furthest);

  const d = distanceGrid(length, step);
  const median = rollingMedian(ele, medianWindow);
  const resampled = resampleOnto(dist, median, d);
  return { d, ele: rollingMean(resampled, oddWindow(averageOver / step)) };
}

/** `0, step, 2·step, …, length`; the last point is exactly `length`. */
function distanceGrid(length: number, step: number): Float64Array {
  const full = Math.floor(length / step);
  // Drop a final fragment shorter than a millimetre so float error can't add a near-duplicate point.
  const hasTail = length - full * step > 1e-3;
  const d = new Float64Array(full + 1 + (hasTail ? 1 : 0));
  for (let k = 0; k <= full; k++) d[k] = k * step;
  d[d.length - 1] = length;
  return d;
}

/** Rounds a window in samples to the nearest odd integer ≥ 1, so it stays centred. */
function oddWindow(samples: number): number {
  const w = Math.max(1, Math.round(samples));
  return w % 2 === 1 ? w : w + 1;
}

/**
 * Grade (fraction) from elevation sampled every `step` metres: the central difference over
 * ±`window`/2 metres, clamped to ±{@link MAX_GRADE}. Fractional offsets are interpolated, so the
 * span is exactly `window`. Near the ends the full span is shifted inward (one-sided difference).
 *
 * NaN elevations are bridged for the neighbours' sake, but the grade at a NaN sample is NaN.
 */
export function gradeFromElevation(ele: ArrayLike<number>, step: number, window = 50): Float32Array {
  if (!(step > 0)) throw new RangeError(`step must be positive, got ${step}`);
  const n = ele.length;
  const out = new Float32Array(n);
  if (n === 0) return out;

  const filled = bridgeNaN(ele);
  const last = n - 1;
  const at = (x: number): number => {
    const k = Math.floor(x);
    if (k >= last) return filled[last]!; // also absorbs float error just past the end
    const f = x - k;
    return f === 0 ? filled[k]! : filled[k]! + (filled[k + 1]! - filled[k]!) * f;
  };

  const half = Math.max(window, 0) / 2 / step; // in samples, may be fractional
  const span = Math.min(2 * half, last);
  for (let k = 0; k < n; k++) {
    if (!Number.isFinite(ele[k]!) || span === 0) {
      out[k] = NaN;
      continue;
    }
    const lo = Math.min(Math.max(k - half, 0), last - span);
    const hi = lo + span;
    const g = (at(hi) - at(lo)) / (span * step);
    out[k] = Math.min(MAX_GRADE, Math.max(-MAX_GRADE, g));
  }
  return out;
}

/**
 * Total ascent and descent (m) with a dead band: a change of direction only counts once the
 * elevation has moved `hysteresis` metres back from the running extreme, so noise smaller than
 * that adds nothing. The final leg counts up to its extreme. NaN samples are skipped.
 */
export function ascentDescent(ele: ArrayLike<number>, hysteresis = 3): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  let dir = 0; // 0 = not yet known, 1 = climbing, -1 = descending
  let anchor = NaN; // last confirmed turning point
  let ext = NaN; // running extreme of the current leg
  let min = NaN; // range seen while the direction is unknown
  let max = NaN;

  for (let k = 0; k < ele.length; k++) {
    const v = ele[k]!;
    if (!Number.isFinite(v)) continue;
    if (dir === 0) {
      if (Number.isNaN(min) || v < min) min = v;
      if (Number.isNaN(max) || v > max) max = v;
      if (v - min >= hysteresis) {
        dir = 1;
        anchor = min;
        ext = v;
      } else if (max - v >= hysteresis) {
        dir = -1;
        anchor = max;
        ext = v;
      }
    } else if (dir === 1) {
      if (v > ext) ext = v;
      else if (ext - v >= hysteresis) {
        ascent += ext - anchor;
        anchor = ext;
        dir = -1;
        ext = v;
      }
    } else {
      if (v < ext) ext = v;
      else if (v - ext >= hysteresis) {
        descent += anchor - ext;
        anchor = ext;
        dir = 1;
        ext = v;
      }
    }
  }
  if (dir === 1) ascent += ext - anchor;
  else if (dir === -1) descent += anchor - ext;
  return { ascent, descent };
}
