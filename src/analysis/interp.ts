/**
 * Shared numeric helpers on typed arrays. Pure, DOM-free, and NaN-tolerant: a NaN sample is
 * skipped (or bridged by its finite neighbours), never spread across the whole output.
 */

/**
 * First index `i` in `[lo, hi)` with `xs[i] >= x`, or `hi` when there is none. `xs` must be
 * non-decreasing over the range.
 */
function lowerBound(xs: ArrayLike<number>, x: number, lo: number, hi: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Linear interpolation of `ys` over `xs` at `x`. `xs` is non-decreasing and finite.
 * - On a plateau (repeated x) it returns the value at the **first** sample that reaches x.
 * - Outside `[xs[0], xs[end]]` it clamps to the nearest end value.
 * - Samples whose y is NaN are skipped: x is interpolated between the nearest finite
 *   neighbours. NaN only when `x` is NaN or `ys` has no finite value.
 */
export function interpolateAt(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = Math.min(xs.length, ys.length);
  if (n === 0 || Number.isNaN(x)) return NaN;
  const i = lowerBound(xs, x, 0, n);

  // Nearest usable sample at or after i, and strictly before i (so xs[before] < x).
  let after = i;
  while (after < n && !Number.isFinite(ys[after]!)) after++;
  let before = i - 1;
  while (before >= 0 && !Number.isFinite(ys[before]!)) before--;

  if (after === n) return before >= 0 ? ys[before]! : NaN;
  const xa = xs[after]!;
  const ya = ys[after]!;
  if (before < 0 || xa === x) return ya;
  const xb = xs[before]!;
  const yb = ys[before]!;
  return yb + ((ya - yb) * (x - xb)) / (xa - xb);
}

/**
 * {@link interpolateAt} for every target in `targetXs`. Samples where x or y is NaN are
 * dropped first, so gaps are bridged linearly; a NaN target gives NaN.
 */
export function resampleOnto(xs: ArrayLike<number>, ys: ArrayLike<number>, targetXs: ArrayLike<number>): Float32Array {
  const n = Math.min(xs.length, ys.length);
  // Compact the finite pairs once so each lookup is a plain binary search.
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  let m = 0;
  for (let k = 0; k < n; k++) {
    const x = xs[k]!;
    const y = ys[k]!;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      cx[m] = x;
      cy[m] = y;
      m++;
    }
  }
  const fx = cx.subarray(0, m);
  const fy = cy.subarray(0, m);

  const out = new Float32Array(targetXs.length);
  for (let k = 0; k < out.length; k++) out[k] = interpolateAt(fx, fy, targetXs[k]!);
  return out;
}

/** Normalises a window length in samples to an integer ≥ 1. */
function windowSize(window: number): number {
  return Number.isFinite(window) ? Math.max(1, Math.round(window)) : 1;
}

/**
 * Centred rolling mean over `window` samples (rounded to an integer). An even window has one
 * more sample after the centre than before it. The window is truncated at the ends, NaN samples
 * are ignored, and a position whose whole window is NaN gives NaN.
 */
export function rollingMean(ys: ArrayLike<number>, window: number): Float32Array {
  const n = ys.length;
  const w = windowSize(window);
  const back = (w - 1) >> 1;
  const ahead = w - 1 - back;

  // Prefix sums of finite values and of their count: O(n) for any window.
  const sum = new Float64Array(n + 1);
  const count = new Uint32Array(n + 1);
  for (let k = 0; k < n; k++) {
    const y = ys[k]!;
    const ok = Number.isFinite(y);
    sum[k + 1] = sum[k]! + (ok ? y : 0);
    count[k + 1] = count[k]! + (ok ? 1 : 0);
  }

  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const lo = Math.max(0, k - back);
    const hi = Math.min(n, k + ahead + 1);
    const c = count[hi]! - count[lo]!;
    out[k] = c > 0 ? (sum[hi]! - sum[lo]!) / c : NaN;
  }
  return out;
}

/**
 * Centred rolling median over `window` samples, with the same window rules as
 * {@link rollingMean}. With an even number of finite values it takes the mean of the middle two.
 */
export function rollingMedian(ys: ArrayLike<number>, window: number): Float32Array {
  const n = ys.length;
  const w = windowSize(window);
  const back = (w - 1) >> 1;
  const ahead = w - 1 - back;
  const buf = new Float64Array(w);

  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const lo = Math.max(0, k - back);
    const hi = Math.min(n, k + ahead + 1);
    // Insertion sort of the finite values: windows are small (5 samples for elevation).
    let c = 0;
    for (let j = lo; j < hi; j++) {
      const y = ys[j]!;
      if (!Number.isFinite(y)) continue;
      let p = c++;
      while (p > 0 && buf[p - 1]! > y) {
        buf[p] = buf[p - 1]!;
        p--;
      }
      buf[p] = y;
    }
    if (c === 0) out[k] = NaN;
    else if (c % 2 === 1) out[k] = buf[c >> 1]!;
    else out[k] = (buf[c / 2 - 1]! + buf[c / 2]!) / 2;
  }
  return out;
}

/**
 * Fills NaN samples: internal gaps linearly between their finite neighbours (by index),
 * leading and trailing gaps with the nearest finite value. All-NaN input stays all NaN.
 */
export function bridgeNaN(ys: ArrayLike<number>): Float32Array {
  const n = ys.length;
  const out = Float32Array.from(ys);
  let prev = -1; // last finite index
  for (let k = 0; k < n; k++) {
    const y = out[k]!;
    if (!Number.isFinite(y)) continue;
    if (prev === -1) {
      out.fill(y, 0, k); // leading gap
    } else if (k - prev > 1) {
      const y0 = out[prev]!;
      const span = k - prev;
      for (let j = prev + 1; j < k; j++) out[j] = y0 + ((y - y0) * (j - prev)) / span;
    }
    prev = k;
  }
  if (prev !== -1) out.fill(out[prev]!, prev + 1); // trailing gap
  return out;
}
