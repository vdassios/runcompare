/**
 * cadence-fade (PLAN §5.11): the attempt's running cadence fell from the first to the last
 * quarter of moving time more than 5 points further than the baseline's did, at `warn`.
 * `metrics.cadenceFade` is (first − last) / first, positive when cadence dropped, and null when
 * walking was estimated without cadence, so either side estimated means no insight.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { comparison, courseRange, insightId, splitByMovingTime } from './_helpers';

const ID = 'cadence-fade';
const MORE = 0.05;

const cadenceFade: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    const b = c?.baseline.metrics;
    if (!c || !b || b.walkingEstimated || b.cadenceFade == null) return [];

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      const m = a.metrics;
      if (!m || m.walkingEstimated || m.cadenceFade == null || !(m.cadenceFade - b.cadenceFade > MORE)) continue;
      const lastQuarter = splitByMovingTime(a.series, 4)[3];
      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: 'warn',
        title: 'Cadence faded more late on',
        template: `Running cadence fell {fade} from the first quarter to the last, against {baselineFade} on ${c.baseline.label}.`,
        values: {
          fade: { kind: 'percent', value: m.cadenceFade },
          baselineFade: { kind: 'percent', value: b.cadenceFade },
        },
        ranges: lastQuarter ? [courseRange(result.grid.d, lastQuarter)] : [],
      });
    }
    return insights;
  },
};

export default cadenceFade;
