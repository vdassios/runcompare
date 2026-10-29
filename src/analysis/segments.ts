/**
 * Climbs and descents on the course grid (PLAN §5.10), and each attempt's time, delta, VAM and
 * descent rate on them. Pure functions on the grid's typed arrays.
 */
import { bisectLeft } from 'd3-array';
import type { AlignedSeries, CourseGrid, CourseSegment } from '../model/types';

export interface SegmentOptions {
  /** A reversal at least this big (m) ends a climb or a descent; smaller dips stay inside it. */
  reversal: number;
  /** A segment needs at least this much elevation change (m)… */
  minChange: number;
  /** …and at least this average grade (fraction). */
  minGrade: number;
  /** A stretch at least this long (m)… */
  flatLength: number;
  /** …whose average |grade| (fraction) is below this is flat, and ends a climb or a descent. */
  flatGrade: number;
}

export const DEFAULT_SEGMENT_OPTIONS: Readonly<SegmentOptions> = {
  reversal: 10,
  minChange: 50,
  minGrade: 0.04,
  flatLength: 500,
  flatGrade: 0.02,
};

export interface SegmentStats {
  time: number; // s between the ends
  delta: number | null; // change in delta between the ends; null for the baseline
  vam: number | null; // m/h, climbs only
  descentRate: number | null; // m/h, descents only
  offCourse: boolean; // any grid point from `from` to `to` is off-course
}

/**
 * Splits the profile into alternating runs at every reversal of `reversal` m or more, cuts each
 * run at the flat stretches inside it, trims each piece to its own low and high points, then keeps
 * the pieces big and steep enough. Pieces are disjoint and in course order, so the segments never
 * overlap and come out ordered by `from`.
 */
export function detectSegments(grid: CourseGrid, options: Partial<SegmentOptions> = {}): CourseSegment[] {
  const { ele, d } = grid;
  if (!ele) return [];
  const o = { ...DEFAULT_SEGMENT_OPTIONS, ...options };

  const segments: CourseSegment[] = [];
  const turns = turningPoints(ele, o.reversal);
  const flats = flatStretches(ele, d, o.flatLength, o.flatGrade);
  for (let k = 1; k < turns.length; k++) {
    const a = turns[k - 1]!;
    const b = turns[k]!;
    const direction = ele[b]! > ele[a]! ? 1 : -1;
    for (const [s, e] of cutAtFlats(a, b, flats)) {
      const [from, to] = trimToEnds(ele, s, e, direction);
      const elevationChange = ele[to]! - ele[from]!;
      const avgGrade = elevationChange / (d[to]! - d[from]!);
      if (!(Math.abs(elevationChange) >= o.minChange && Math.abs(avgGrade) >= o.minGrade)) continue;
      segments.push({
        kind: elevationChange > 0 ? 'climb' : 'descent',
        from: d[from]!,
        to: d[to]!,
        elevationChange,
        avgGrade,
      });
    }
  }
  return segments;
}

/** One attempt on one segment, from its resampled time and delta at the segment's ends. */
export function segmentStats(
  seg: CourseSegment,
  grid: CourseGrid,
  series: AlignedSeries,
  delta: Float64Array | null,
): SegmentStats {
  const i = gridIndex(grid, seg.from);
  const j = gridIndex(grid, seg.to);
  const time = series.time[j]! - series.time[i]!;
  const rate = time > 0 ? (Math.abs(seg.elevationChange) / time) * 3600 : null;
  return {
    time,
    delta: delta ? delta[j]! - delta[i]! : null,
    vam: seg.kind === 'climb' ? rate : null,
    descentRate: seg.kind === 'descent' ? rate : null,
    offCourse: series.offCourse.subarray(i, j + 1).includes(1),
  };
}

/**
 * Grid indices of the profile's turning points: the first and last extremes, plus every high or
 * low followed by a reversal of at least `reversal` m. NaN samples are skipped. Between two
 * turning points the profile stays within their elevations.
 */
function turningPoints(ele: Float32Array, reversal: number): number[] {
  const turns: number[] = [];
  let trend: 1 | -1 | 0 = 0;
  let lo = -1; // while trend is 0: the lowest and highest points so far
  let hi = -1;
  let extreme = -1; // while trending: the highest (up) or lowest (down) point of the current run

  for (let i = 0; i < ele.length; i++) {
    const e = ele[i]!;
    if (Number.isNaN(e)) continue;
    if (trend === 0) {
      if (lo < 0 || e < ele[lo]!) lo = i;
      if (hi < 0 || e > ele[hi]!) hi = i;
      if (e - ele[lo]! >= reversal) [trend, extreme] = [1, i];
      else if (ele[hi]! - e >= reversal) [trend, extreme] = [-1, i];
      if (trend !== 0) turns.push(trend === 1 ? lo : hi);
    } else if ((e - ele[extreme]!) * trend > 0) {
      extreme = i;
    } else if ((ele[extreme]! - e) * trend >= reversal) {
      turns.push(extreme);
      trend = trend === 1 ? -1 : 1;
      extreme = i;
    }
  }
  if (extreme >= 0) turns.push(extreme);
  return turns;
}

/**
 * Grid index ranges `[from, to]` of the flat stretches, in course order: the union of every window
 * of at least `length` m whose average |grade| is below `grade`. A window may reach a little into
 * the slope beside it, so each stretch is then pulled in to where the profile is actually flat.
 */
function flatStretches(ele: Float32Array, d: Float64Array, length: number, grade: number): [number, number][] {
  const n = ele.length;
  // Total |elevation change| from the start to each point, so a window's is a difference.
  const variation = new Float64Array(n);
  for (let k = 1; k < n; k++) variation[k] = variation[k - 1]! + (Math.abs(ele[k]! - ele[k - 1]!) || 0);
  const steep = (k: number) => Math.abs(ele[k + 1]! - ele[k]!) >= grade * (d[k + 1]! - d[k]!);

  const flats: [number, number][] = [];
  for (let i = 0, j = 0; i < n; i++) {
    while (j < n && d[j]! - d[i]! < length) j++;
    if (j === n) break;
    if (variation[j]! - variation[i]! >= grade * (d[j]! - d[i]!)) continue;
    const last = flats[flats.length - 1];
    if (last && i <= last[1]) last[1] = j;
    else flats.push([i, j]);
  }
  for (const flat of flats) {
    while (flat[0] < flat[1] && steep(flat[0])) flat[0]++;
    while (flat[1] > flat[0] && steep(flat[1] - 1)) flat[1]--;
  }
  return flats;
}

/** The parts of the run `[a, b]` outside the interiors of the flat stretches. */
function cutAtFlats(a: number, b: number, flats: [number, number][]): [number, number][] {
  const pieces: [number, number][] = [];
  let start = a;
  for (const [from, to] of flats) {
    if (to <= start || from >= b) continue;
    if (from > start) pieces.push([start, from]);
    start = to;
  }
  if (start < b) pieces.push([start, b]);
  return pieces;
}

/**
 * The stretch of `[s, e]` from its last lowest point to the first highest point after it (for a
 * descent, `direction` −1, the other way round), so a plateau at either end belongs to neither side.
 */
function trimToEnds(ele: Float32Array, s: number, e: number, direction: 1 | -1): [number, number] {
  let from = s;
  for (let i = s; i <= e; i++) if (direction * ele[i]! <= direction * ele[from]! || Number.isNaN(ele[from]!)) from = i;
  let to = from;
  for (let i = from; i <= e; i++) if (direction * ele[i]! > direction * ele[to]!) to = i;
  return [from, to];
}

/** Index of the grid point at course distance `x`; segment ends always sit on grid points. */
function gridIndex(grid: CourseGrid, x: number): number {
  return Math.min(bisectLeft(grid.d, x - 1e-6), grid.d.length - 1);
}
