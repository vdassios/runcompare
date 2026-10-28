/**
 * Climbs and descents on the course grid (PLAN §5.10), and each attempt's time, delta, VAM and
 * descent rate on them. Pure functions on the grid's typed arrays.
 */
import { bisectLeft } from 'd3-array';
import type { AlignedSeries, CourseGrid, CourseSegment } from '../model/types';

/** A reversal at least this big (m) ends a climb or a descent; smaller dips stay inside it. */
const REVERSAL = 10;
/** A segment needs at least this much elevation change (m)… */
const MIN_CHANGE = 50;
/** …and at least this average grade (fraction). */
const MIN_GRADE = 0.04;

export interface SegmentStats {
  time: number; // s between the ends
  delta: number | null; // change in delta between the ends; null for the baseline
  vam: number | null; // m/h, climbs only
  descentRate: number | null; // m/h, descents only
  offCourse: boolean; // any grid point from `from` to `to` is off-course
}

/**
 * Splits the profile into alternating runs at every reversal of `REVERSAL` m or more, trims each
 * run to its actual low and high points, then keeps the runs big and steep enough. Runs are
 * consecutive, so the segments never overlap and come out ordered by `from`.
 */
export function detectSegments(grid: CourseGrid): CourseSegment[] {
  const { ele, d } = grid;
  if (!ele) return [];

  const segments: CourseSegment[] = [];
  const turns = turningPoints(ele);
  for (let k = 1; k < turns.length; k++) {
    const b = turns[k]!;
    // A run leaves the last point of a flat at its start: a plateau belongs to neither side.
    let a = turns[k - 1]!;
    for (let i = a + 1; i < b; i++) if (ele[i] === ele[a]) a = i;
    const elevationChange = ele[b]! - ele[a]!;
    const avgGrade = elevationChange / (d[b]! - d[a]!);
    if (Math.abs(elevationChange) < MIN_CHANGE || Math.abs(avgGrade) < MIN_GRADE) continue;
    segments.push({
      kind: elevationChange > 0 ? 'climb' : 'descent',
      from: d[a]!,
      to: d[b]!,
      elevationChange,
      avgGrade,
    });
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
 * low followed by a reversal of at least `REVERSAL` m. NaN samples are skipped. Ties keep the
 * first point, so a run ends where it first reaches its high or low.
 * Between two turning points the profile stays within their elevations.
 */
function turningPoints(ele: Float32Array): number[] {
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
      if (e - ele[lo]! >= REVERSAL) [trend, extreme] = [1, i];
      else if (ele[hi]! - e >= REVERSAL) [trend, extreme] = [-1, i];
      if (trend !== 0) turns.push(trend === 1 ? lo : hi);
    } else if ((e - ele[extreme]!) * trend > 0) {
      extreme = i;
    } else if ((ele[extreme]! - e) * trend >= REVERSAL) {
      turns.push(extreme);
      trend = trend === 1 ? -1 : 1;
      extreme = i;
    }
  }
  if (extreme >= 0) turns.push(extreme);
  return turns;
}

/** Index of the grid point at course distance `x`; segment ends always sit on grid points. */
function gridIndex(grid: CourseGrid, x: number): number {
  return Math.min(bisectLeft(grid.d, x - 1e-6), grid.d.length - 1);
}
