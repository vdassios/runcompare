/**
 * walking (PLAN §5.11): the climbs where the attempt's walking share of moving time is more than
 * 15 points above the baseline's on the same climb, up to the 3 with the largest gap, as one
 * `warn`. "(estimated)" in the title when either side's walking comes from speed and grade.
 */
import type { AttemptAnalysis, Insight, InsightRule } from '../../../model/types';
import { comparison, insightId, stepTimes, type IndexRange } from './_helpers';
import { listOf, numbered, segmentRange, touchesOffCourse } from './_compareHelpers';

const ID = 'walking';
const MORE = 0.15;
const MAX_REPORTED = 3;

interface Share {
  walking: number; // s
  moving: number; // s
}

const walking: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    if (!c || !c.baseline.series.walking) return [];
    const { d } = result.grid;
    const climbs = result.segments.filter((s) => s.kind === 'climb').map((s) => ({ s, r: segmentRange(d, s) }));
    const baselineSteps = stepTimes(c.baseline.series);

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      if (!a.series.walking) continue;
      const steps = stepTimes(a.series);
      const walked = climbs
        .filter(({ r }) => !touchesOffCourse(a.series, r))
        .map((climb) => ({
          ...climb,
          attempt: shareOver(a, steps, baselineSteps, climb.r),
          baseline: shareOver(c.baseline, baselineSteps, steps, climb.r),
        }))
        .filter((x) => x.attempt.moving > 0 && x.baseline.moving > 0)
        .map((x) => ({ ...x, more: ratio(x.attempt) - ratio(x.baseline) }))
        .filter((x) => x.more > MORE)
        .sort((x, y) => y.more - x.more)
        .slice(0, MAX_REPORTED)
        .sort((x, y) => x.s.from - y.s.from);
      if (walked.length === 0) continue;

      const total = (side: 'attempt' | 'baseline') =>
        ratio({
          walking: walked.reduce((sum, x) => sum + x[side].walking, 0),
          moving: walked.reduce((sum, x) => sum + x[side].moving, 0),
        });
      const estimated = a.metrics?.walkingEstimated === true || c.baseline.metrics?.walkingEstimated === true;
      const places = walked.map((_, i) => `{from${i}}`);
      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: 'warn',
        title: `Walked more on the climbs${estimated ? ' (estimated)' : ''}`,
        template:
          `Walked {share} vs {shareBaseline} on ${c.baseline.label} ` +
          `on the ${walked.length === 1 ? 'climb' : 'climbs'} at ${listOf(places)}.`,
        values: {
          share: { kind: 'percent', value: total('attempt') },
          shareBaseline: { kind: 'percent', value: total('baseline') },
          ...numbered(
            'from',
            'distance',
            walked.map((x) => x.s.from),
          ),
        },
        ranges: walked.map(({ s }) => ({ from: s.from, to: s.to })),
      });
    }
    return insights;
  },
};

/** Walking and moving seconds over the steps of a climb both sides have; a step walks if its end point does. */
function shareOver(a: AttemptAnalysis, steps: Float64Array, otherSteps: Float64Array, r: IndexRange): Share {
  const share = { walking: 0, moving: 0 };
  for (let k = r.start; k < r.end; k++) {
    if (!Number.isFinite(steps[k]!) || !Number.isFinite(otherSteps[k]!)) continue;
    share.moving += steps[k]!;
    if (a.series.walking?.[k + 1] === 1) share.walking += steps[k]!;
  }
  return share;
}

function ratio(s: Share): number {
  return s.moving > 0 ? s.walking / s.moving : 0;
}

export default walking;
