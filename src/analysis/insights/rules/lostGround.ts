/**
 * lost-ground (PLAN §5.11): a stretch of at least 3 km where the attempt's moving time is more
 * than 10 % above the baseline's on the same ground, judged on a 1 km rolling median of the
 * per-step ratio. With HR on both, the attempt's HR relative to the baseline's falling more than
 * 5 % from the 3 km before makes it a bonk (`strong`), otherwise `warn`. Up to two stretches per
 * attempt, the longest ones, reported in course order.
 */
import type { AttemptAnalysis, Insight, InsightRule } from '../../../model/types';
import {
  comparison,
  courseRange,
  insightId,
  maskUnusable,
  meanOver,
  rollingMedianOnGrid,
  runsWhere,
  stepTimes,
  timesOver,
  type IndexRange,
} from './_helpers';

const ID = 'lost-ground';
const SLOWER = 0.1;
const MIN_LENGTH = 3000; // m
const HR_LOOKBACK = 3000; // m
const HR_DROP = 0.05;
const MAX_REPORTED = 2;
/** Smooths the ratio before looking for slow stretches, so a short hill or hiccup doesn't break one. */
const SMOOTHING = 1000; // m

const lostGround: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    if (!c) return [];
    return c.attempts.flatMap((a) => attemptStretches(a, c.baseline, result.grid.d, result.grid.step));
  },
};

function attemptStretches(a: AttemptAnalysis, baseline: AttemptAnalysis, d: Float64Array, step: number): Insight[] {
  const steps = stepTimes(a.series);
  const baselineSteps = stepTimes(baseline.series);
  // Steps where either side stopped carry no pace to compare, so they drop out of the median.
  const ratio = Float32Array.from(steps, (s, k) => (s > 0 && baselineSteps[k]! > 0 ? s / baselineSteps[k]! : NaN));
  const stretches = runsWhere(rollingMedianOnGrid(ratio, step, SMOOTHING), (v) => v > 1 + SLOWER)
    .filter((r) => length(d, r) >= MIN_LENGTH)
    .sort((x, y) => length(d, y) - length(d, x))
    .slice(0, MAX_REPORTED)
    .sort((x, y) => x.start - y.start);

  const relativeHr = relativeHrOf(a, baseline);
  return stretches.map((r, index): Insight => {
    const range = courseRange(d, r);
    const times = timesOver(steps, baselineSteps, r);
    const values = {
      lost: { kind: 'delta', value: times.attempt - times.baseline },
      slower: { kind: 'percent', value: times.attempt / times.baseline - 1 },
      from: { kind: 'distance', value: range.from },
      length: { kind: 'distance', value: range.to - range.from },
    } as const;
    const base = { id: insightId(ID, a.attemptId, index), ruleId: ID, attemptId: a.attemptId, ranges: [range] };
    const text = `{slower} slower than ${baseline.label} for {length} from {from}, losing {lost}.`;

    // No HR on either side, or none in the 3 km before (a stretch right at the start), can't call a bonk.
    const hrDrop = relativeHr ? 1 - meanOver(relativeHr, r) / meanOver(relativeHr, before(d, r)) : NaN;
    if (hrDrop > HR_DROP) {
      return {
        ...base,
        severity: 'strong',
        title: 'Bonked: slower with heart rate dropping',
        template:
          `${text} Heart rate against ${baseline.label} fell {hrDrop} from the 3 km before, ` +
          'a sign of running out of fuel.',
        values: { ...values, hrDrop: { kind: 'percent', value: hrDrop } },
      };
    }
    return { ...base, severity: 'warn', title: 'Lost ground over a long stretch', template: text, values };
  });
}

/** The attempt's HR over the baseline's at each grid point both ran, or null without HR on both. */
function relativeHrOf(a: AttemptAnalysis, baseline: AttemptAnalysis): Float32Array | null {
  if (!a.series.hr || !baseline.series.hr) return null;
  const hr = maskUnusable(a.series, a.series.hr);
  const baselineHr = maskUnusable(baseline.series, baseline.series.hr);
  return hr.map((h, k) => h / baselineHr[k]!);
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

export default lostGround;
