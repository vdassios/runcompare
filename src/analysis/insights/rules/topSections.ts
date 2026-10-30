/**
 * top-sections (PLAN §5.11): per GPS attempt, the 5 non-overlapping 1 km windows of the grid
 * where it lost the most moving time on the baseline, and the 5 where it gained the most, as one
 * `info` each. A window with an off-course point is never picked. Works on either kind of
 * baseline: it only needs the baseline's time at each grid point.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { courseRange, insightId, stepTimes, type IndexRange } from './_helpers';
import { anyComparison, listOf, numbered } from './_compareHelpers';

const ID = 'top-sections';
const WINDOW = 1000; // m
const MAX_REPORTED = 5;

const topSections: InsightRule = {
  id: ID,
  run(result) {
    const c = anyComparison(result);
    if (!c) return [];
    const { d, step } = result.grid;
    const baselineSteps = stepTimes(c.baseline.series);

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      const windows = windowDeltas(stepTimes(a.series), baselineSteps, Math.round(WINDOW / step));
      const lost = pickApart(windows.filter((w) => w.delta > 0).sort((x, y) => y.delta - x.delta));
      const gained = pickApart(windows.filter((w) => w.delta < 0).sort((x, y) => x.delta - y.delta));

      const sections = (list: Window[], index: number, verb: string, title: string): Insight => ({
        id: insightId(ID, a.attemptId, index),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: 'info',
        title,
        template:
          `Most time ${verb} against ${c.baseline.label}, per kilometre: ` +
          `${listOf(list.map((_, i) => `{delta${i}} from {from${i}}`))}.`,
        values: {
          ...numbered(
            'delta',
            'delta',
            list.map((w) => w.delta),
          ),
          ...numbered(
            'from',
            'distance',
            list.map((w) => courseRange(d, w).from),
          ),
        },
        ranges: list.map((w) => courseRange(d, w)),
      });
      if (lost.length > 0) insights.push(sections(lost, 0, 'lost', 'Where you lost the most time'));
      if (gained.length > 0) insights.push(sections(gained, 1, 'gained', 'Where you gained the most time'));
    }
    return insights;
  },
};

interface Window extends IndexRange {
  delta: number; // attempt − baseline moving time over the window, s
}

/** Every window of `width` grid steps, rolling one step at a time, except those with an off-course step. */
function windowDeltas(steps: Float64Array, baselineSteps: Float64Array, width: number): Window[] {
  // Prefix sums of the per-step difference and of the unusable steps, so a window's is a subtraction.
  const sum = new Float64Array(steps.length + 1);
  const unusable = new Uint32Array(steps.length + 1);
  for (let k = 0; k < steps.length; k++) {
    const diff = steps[k]! - baselineSteps[k]!;
    sum[k + 1] = sum[k]! + (Number.isFinite(diff) ? diff : 0);
    unusable[k + 1] = unusable[k]! + (Number.isFinite(diff) ? 0 : 1);
  }
  const windows: Window[] = [];
  // The last point has no step after it, so there are steps.length − 1 steps.
  for (let start = 0; start + width <= steps.length - 1; start++) {
    const end = start + width;
    if (unusable[end] === unusable[start]) windows.push({ start, end, delta: sum[end]! - sum[start]! });
  }
  return windows;
}

/** Greedily the first windows, in the given order, that overlap none picked before them. */
function pickApart(sorted: Window[]): Window[] {
  const picked: Window[] = [];
  for (const w of sorted) {
    if (picked.length === MAX_REPORTED) break;
    if (picked.every((p) => w.end <= p.start || w.start >= p.end)) picked.push(w);
  }
  return picked;
}

export default topSections;
