/**
 * fade (PLAN §5.11): a stretch of at least 3 km where GAP is more than 15 % slower than the
 * race median. With HR, a mean HR more than 5 % below the preceding 3 km makes it a bonk
 * (`strong`), otherwise a fade (`warn`); without HR it is a fade at `info`. Up to two stretches
 * per attempt, the longest ones, reported in course order.
 */
import { median } from 'd3-array';
import type { AttemptAnalysis, Insight, InsightRule } from '../../../model/types';
import {
  courseRange,
  gpsAttempts,
  insightId,
  maskUnusable,
  meanOver,
  rollingMedianOnGrid,
  runsWhere,
  type IndexRange,
} from './_helpers';

const ID = 'fade';
const SLOWER = 0.15;
const MIN_LENGTH = 3000; // m
const HR_LOOKBACK = 3000; // m
const HR_DROP = 0.05;
const MAX_REPORTED = 2;
/** Smooths GAP before looking for slow stretches, so a short hill or stop doesn't break one. */
const SMOOTHING = 1000; // m

const fade: InsightRule = {
  id: ID,
  run(result) {
    const insights: Insight[] = [];
    for (const a of gpsAttempts(result)) insights.push(...attemptFades(a, result.grid.d, result.grid.step));
    return insights;
  },
};

function attemptFades(a: AttemptAnalysis, d: Float64Array, step: number): Insight[] {
  if (!a.series.gap) return [];
  const gap = maskUnusable(a.series, a.series.gap);
  const raceMedian = median(gap);
  if (raceMedian === undefined || !(raceMedian > 0)) return [];

  const smoothed = rollingMedianOnGrid(gap, step, SMOOTHING);
  const stretches = runsWhere(smoothed, (v) => v > raceMedian * (1 + SLOWER))
    .filter((r) => length(d, r) >= MIN_LENGTH)
    .sort((x, y) => length(d, y) - length(d, x))
    .slice(0, MAX_REPORTED)
    .sort((x, y) => x.start - y.start);

  const hr = a.series.hr && maskUnusable(a.series, a.series.hr);
  return stretches.map((r, index): Insight => {
    const range = courseRange(d, r);
    const stretchGap = meanOver(gap, r);
    const values = {
      gap: { kind: 'pace', value: stretchGap },
      median: { kind: 'pace', value: raceMedian },
      slower: { kind: 'percent', value: stretchGap / raceMedian - 1 },
      from: { kind: 'distance', value: range.from },
      length: { kind: 'distance', value: range.to - range.from },
    } as const;
    const base = { id: insightId(ID, a.attemptId, index), ruleId: ID, attemptId: a.attemptId, ranges: [range] };
    const fadeText = 'GAP {gap} for {length} from {from}, {slower} slower than the race median {median}.';

    // No HR, or none in the 3 km before (a stretch right at the start), reads as a plain fade.
    const hrDrop = hr ? 1 - meanOver(hr, r) / meanOver(hr, before(d, r)) : NaN;
    if (!Number.isFinite(hrDrop)) {
      return { ...base, severity: 'info', title: 'Faded over a long stretch', template: fadeText, values };
    }
    if (hrDrop > HR_DROP) {
      return {
        ...base,
        severity: 'strong',
        title: 'Bonked: pace and heart rate dropped',
        template: `${fadeText} Heart rate fell {hrDrop} against the stretch before, a sign of running out of fuel.`,
        values: { ...values, hrDrop: { kind: 'percent', value: hrDrop } },
      };
    }
    return { ...base, severity: 'warn', title: 'Faded over a long stretch', template: fadeText, values };
  });
}

function length(d: Float64Array, r: IndexRange): number {
  const { from, to } = courseRange(d, r);
  return to - from;
}

/** The grid points in the {@link HR_LOOKBACK} metres before a stretch. */
function before(d: Float64Array, r: IndexRange): IndexRange {
  const from = d[r.start]! - HR_LOOKBACK;
  let start = r.start;
  while (start > 0 && d[start - 1]! >= from) start--;
  return { start, end: r.start };
}

export default fade;
