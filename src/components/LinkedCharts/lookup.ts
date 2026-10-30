/**
 * Lookups on the course grid for the charts: a stream's value at any course distance,
 * the distance where a non-decreasing stream (the baseline's time) reaches a value,
 * and the grid index nearest to a distance.
 */

/** Index of the last element of the ascending `xs` that is ≤ x, clamped to [0, n − 2]. */
function segmentIndex(xs: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** `ys` linearly interpolated at `x` on the ascending `xs`, clamped at the ends. NaN propagates. */
export function valueAt(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (n === 0 || !Number.isFinite(x)) return NaN;
  if (n === 1 || x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  const i = segmentIndex(xs, x);
  const x0 = xs[i]!;
  const x1 = xs[i + 1]!;
  const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
  return ys[i]! + t * (ys[i + 1]! - ys[i]!);
}

/** The `x` where the non-decreasing `ys` first reaches `y`, clamped at the ends: the inverse of `valueAt`. */
export function inverseAt(xs: ArrayLike<number>, ys: ArrayLike<number>, y: number): number {
  return valueAt(ys, xs, y);
}

/** Index of the grid point nearest to `x`. */
export function nearestIndex(xs: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (n <= 1 || x <= xs[0]!) return 0;
  if (x >= xs[n - 1]!) return n - 1;
  const i = segmentIndex(xs, x);
  return x - xs[i]! <= xs[i + 1]! - x ? i : i + 1;
}
