/**
 * Helpers for the comparison rules (task 32) on top of `_helpers`: course stretches as grid
 * ranges, the attempts compared with a baseline of either kind, and placeholder lists for
 * templates that name several places.
 */
import { bisectLeft } from 'd3-array';
import type { AlignedSeries, AttemptAnalysis, CourseSegment, Quantity, QuantityKind } from '../../../model/types';
import type { IndexRange, RuleInput } from './_helpers';

/** Index of the grid point at course distance `x`, or the first one after it. */
export function gridIndex(d: Float64Array, x: number): number {
  return Math.min(bisectLeft(d, x - 1e-6), d.length - 1);
}

/** The grid steps from course metre `from` to `to`, as `_helpers` ranges: steps start…end − 1. */
export function gridRange(d: Float64Array, from: number, to: number): IndexRange {
  return { start: gridIndex(d, from), end: gridIndex(d, to) };
}

export function segmentRange(d: Float64Array, seg: CourseSegment): IndexRange {
  return gridRange(d, seg.from, seg.to);
}

/** Whether any grid point of the stretch, both ends included, is off-course. */
export function touchesOffCourse(series: AlignedSeries, r: IndexRange): boolean {
  return series.offCourse.subarray(r.start, r.end + 1).includes(1);
}

/**
 * The baseline, of either kind, and every GPS attempt but it: for rules that only need the
 * baseline's time at each grid point, which a split set has too.
 */
export function anyComparison(result: RuleInput): { baseline: AttemptAnalysis; attempts: AttemptAnalysis[] } | null {
  const baseline = result.attempts.find((a) => a.attemptId === result.baseline.attemptId);
  if (!baseline) return null;
  return { baseline, attempts: result.attempts.filter((a) => a.kind === 'gps' && a !== baseline) };
}

/** `{a}`, `{a} and {b}`, `{a}, {b} and {c}`: placeholders joined as a sentence lists them. */
export function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/** `{ from0: …, from1: … }`: one numbered value per listed place, for templates built with {@link listOf}. */
export function numbered(name: string, kind: QuantityKind, values: number[]): Record<string, Quantity> {
  return Object.fromEntries(values.map((value, i) => [`${name}${i}`, { kind, value }]));
}
