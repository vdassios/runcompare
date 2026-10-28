/**
 * Places every sample of an attempt on the baseline course (PLAN §5.4, §5.5): a monotonic
 * course distance per sample, off-course flags, and the on-course share of the attempt.
 *
 * Course alignment walks the attempt once, matching each sample against a small window of the
 * reference polyline just ahead of the last match, so it is linear in the samples × window size.
 */
import { bisectLeft, bisectRight } from 'd3-array';
import type { Activity, AnalysisSettings } from '../model/types';
import { makeLocalProjection, segmentParameter } from './geo';

export interface Reference {
  /** Vertex positions on the local plane, m. */
  x: Float64Array;
  y: Float64Array;
  /** Course distance of each vertex: the baseline's own watch distance. */
  d: Float64Array;
  /** Course length: the baseline's final watch distance. */
  length: number;
  project(lat: number, lon: number): [number, number];
}

export interface AlignmentResult {
  courseDist: Float64Array; // m along the course, non-decreasing, within [0, length]
  offCourse: Uint8Array; // 1 = farther than the off-course threshold from the course
  overlap: number; // on-course share of the attempt's distance
}

const MIN_VERTEX_SPACING = 1; // m
const START_SEARCH = 1000; // m of course searched for the first fix
const WINDOW_BEHIND = 100; // m
const WINDOW_AHEAD = 400; // m
const REACQUIRE_BEHIND = 200; // m
const REACQUIRE_AHEAD = 3000; // m
/**
 * Passes of the course this much farther than the nearest one still compete, and being close to
 * where the runner should be by now can make up the difference. Pure nearest leaves the two legs
 * of an out-and-back (a few metres apart) or neighbouring switchbacks to GPS noise, and since
 * `courseDist` never goes back, a wrong pick ahead sticks.
 */
const TIE_TOLERANCE = 15; // m
/** Sideways metres one metre along the course is worth when passes compete. */
const ALONG_COURSE_COST = 0.25;
/** Segments per bounding box, so wide re-acquire windows skip whole stretches of course cheaply. */
const BLOCK = 32;

export function buildReference(baseline: Activity): Reference {
  const { lat, lon, dist } = baseline;
  if (lat === null || lon === null) throw new Error(`${baseline.fileName} has no positions to build a course from`);
  const n = Math.min(lat.length, lon.length, dist.length);
  const positioned: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(lat[i]!) && Number.isFinite(lon[i]!) && Number.isFinite(dist[i]!)) positioned.push(i);
  }
  if (positioned.length < 2) throw new Error(`${baseline.fileName} has fewer than two positions`);

  const first = positioned[0]!;
  const project = makeLocalProjection(lat[first]!, lon[first]!);
  const xs: number[] = [];
  const ys: number[] = [];
  const ds: number[] = [];
  const last = positioned[positioned.length - 1]!;
  for (const i of positioned) {
    const [x, y] = project(lat[i]!, lon[i]!);
    const k = xs.length - 1;
    // The last fix is always kept so the final vertex sits at the finish.
    if (k >= 0 && i !== last && Math.hypot(x - xs[k]!, y - ys[k]!) < MIN_VERTEX_SPACING) continue;
    xs.push(x);
    ys.push(y);
    ds.push(dist[i]!);
  }
  return {
    x: Float64Array.from(xs),
    y: Float64Array.from(ys),
    d: Float64Array.from(ds),
    length: dist[n - 1]!,
    project,
  };
}

/** Linear scaling of the attempt's own distance onto a course of `length` metres. */
export function alignToDistance(attempt: Activity, length: number): AlignmentResult {
  const { dist } = attempt;
  const n = dist.length;
  const courseDist = new Float64Array(n);
  const total = n > 0 ? dist[n - 1]! : 0;
  if (total > 0) {
    const scale = length / total;
    for (let i = 0; i < n; i++) courseDist[i] = Math.min(length, Math.max(0, dist[i]! * scale));
    courseDist[n - 1] = length;
  }
  return { courseDist, offCourse: new Uint8Array(n), overlap: 1 };
}

export function alignToCourse(attempt: Activity, ref: Reference, settings: AnalysisSettings): AlignmentResult {
  const { lat, lon, dist } = attempt;
  if (lat === null || lon === null) return { ...alignToDistance(attempt, ref.length), overlap: 0 };

  const n = dist.length;
  const courseDist = new Float64Array(n);
  const offCourse = new Uint8Array(n);
  const threshold = settings.offCourseThreshold;
  const total = n > 0 ? dist[n - 1]! : 0;
  const scale = total > 0 ? ref.length / total : 1;
  const matcher = makeMatcher(ref, threshold);

  // `anchor` is the furthest course distance matched on-course; windows hang off it. `out` is the
  // output, which also advances by dead reckoning while off-course and so can run ahead of `anchor`
  // until the runner catches up. Keeping them apart lets a detour that is longer than the course it
  // skips re-acquire behind the dead-reckoned position instead of chasing it forever.
  let anchor = 0;
  let anchorDist = 0; // the attempt's own distance when `anchor` was last matched
  let out = 0;
  let acquired = false;
  let flag = 0;
  let offDistance = 0;
  for (let i = 0; i < n; i++) {
    const inc = i > 0 ? Math.max(0, dist[i]! - dist[i - 1]!) || 0 : 0;
    const la = lat[i]!;
    const lo = lon[i]!;
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      // No fix: keep going at the attempt's own pace and keep the current on/off-course state.
      out += inc * scale;
    } else {
      const [px, py] = ref.project(la, lo);
      let d: number;
      if (acquired) {
        d = matcher(px, py, anchor - WINDOW_BEHIND, anchor + WINDOW_AHEAD, anchor + (dist[i]! - anchorDist) * scale);
        if (Number.isNaN(d)) {
          const expected = out + inc * scale;
          d = matcher(px, py, anchor - REACQUIRE_BEHIND, expected + REACQUIRE_AHEAD, expected);
        }
      } else {
        d = matcher(px, py, ref.d[0]!, ref.d[0]! + START_SEARCH, out);
        if (Number.isNaN(d)) d = matcher(px, py, out - REACQUIRE_BEHIND, out + REACQUIRE_AHEAD, out);
      }
      if (Number.isNaN(d)) {
        flag = 1;
        // Before the first fix on the course (say, walking to the start) there is nothing to reckon from.
        if (acquired) out += inc * scale;
      } else {
        flag = 0;
        // Strictly ahead: re-matching the same foot (running across a corner) must not reset the
        // dead-reckoning base, or `expected` stalls there and keeps favouring the stale pass.
        if (!acquired || d > anchor) {
          anchor = d;
          anchorDist = dist[i]!;
        }
        acquired = true;
        out = Math.max(out, anchor);
      }
    }
    out = Math.min(out, ref.length);
    courseDist[i] = out;
    offCourse[i] = flag;
    if (flag) offDistance += inc;
  }

  const overlap = total > 0 ? 1 - offDistance / total : offCourse.includes(1) ? 0 : 1;
  return { courseDist, offCourse, overlap };
}

/**
 * Returns `match(px, py, from, to, expected)`: the course distance where the point projects onto
 * the reference within `[from, to]`, or NaN when nothing there is within `threshold`.
 *
 * Each pass of the course near the point is one local minimum of the perpendicular distance along
 * the segment sequence. Passes within {@link TIE_TOLERANCE} of the nearest compete on perpendicular
 * distance plus {@link ALONG_COURSE_COST} × their distance from `expected`. Comparing whole passes,
 * not segments, matters: the neighbouring segments of the right pass are always within a few
 * metres too, and letting them compete would pull every match towards dead reckoning.
 */
function makeMatcher(ref: Reference, threshold: number) {
  const { x, y, d } = ref;
  const segments = x.length - 1;
  const blocks = Math.ceil(segments / BLOCK);
  const minX = new Float64Array(blocks).fill(Infinity);
  const maxX = new Float64Array(blocks).fill(-Infinity);
  const minY = new Float64Array(blocks).fill(Infinity);
  const maxY = new Float64Array(blocks).fill(-Infinity);
  for (let b = 0; b < blocks; b++) {
    for (let v = b * BLOCK; v <= Math.min((b + 1) * BLOCK, segments); v++) {
      minX[b] = Math.min(minX[b]!, x[v]!);
      maxX[b] = Math.max(maxX[b]!, x[v]!);
      minY[b] = Math.min(minY[b]!, y[v]!);
      maxY[b] = Math.max(maxY[b]!, y[v]!);
    }
  }
  const margin = threshold + TIE_TOLERANCE;
  const passD = new Float64Array(segments);
  const passP = new Float64Array(segments);

  return (px: number, py: number, from: number, to: number, expected: number): number => {
    const lo = Math.max(0, bisectLeft(d, from) - 1);
    const hi = Math.min(segments - 1, bisectRight(d, to) - 1);
    let passes = 0;
    let nearest = Infinity;
    // Perpendicular distances of the previous two segments and the projection on the previous one.
    let p2 = Infinity;
    let p1 = Infinity;
    let d1 = NaN;
    const visit = (p: number, dp: number) => {
      if (p1 <= p2 && p1 <= p && p1 <= margin) {
        passD[passes] = d1;
        passP[passes] = p1;
        passes++;
        if (p1 < nearest) nearest = p1;
      }
      p2 = p1;
      p1 = p;
      d1 = dp;
    };
    for (let b = Math.floor(lo / BLOCK); b <= Math.floor(hi / BLOCK); b++) {
      if (px < minX[b]! - margin || px > maxX[b]! + margin || py < minY[b]! - margin || py > maxY[b]! + margin) {
        visit(Infinity, NaN);
        continue;
      }
      const end = Math.min(hi, b * BLOCK + BLOCK - 1);
      for (let s = Math.max(lo, b * BLOCK); s <= end; s++) {
        const ax = x[s]!;
        const ay = y[s]!;
        const bx = x[s + 1]!;
        const by = y[s + 1]!;
        const t = segmentParameter(px, py, ax, ay, bx, by);
        visit(Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))), d[s]! + t * (d[s + 1]! - d[s]!));
      }
    }
    visit(Infinity, NaN);
    if (nearest > threshold) return NaN;

    let best = NaN;
    let bestCost = Infinity;
    for (let k = 0; k < passes; k++) {
      if (passP[k]! > nearest + TIE_TOLERANCE) continue;
      const cost = passP[k]! + ALONG_COURSE_COST * Math.abs(passD[k]! - expected);
      if (cost < bestCost) {
        bestCost = cost;
        best = passD[k]!;
      }
    }
    return best;
  };
}
