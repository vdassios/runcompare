/**
 * cadence-fade (PLAN §5.11): running cadence in the last quarter of moving time more than 5 %
 * below the first quarter, at `warn`. Never fires when walking was estimated without cadence.
 *
 * Gotcha: PLAN writes the threshold as "cadence fade < −5 %" (last vs first), but
 * `metrics.cadenceFade` is (first − last) / first, positive when cadence dropped. So the rule
 * fires when it is above +5 %.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { courseRange, gpsAttempts, insightId, splitByMovingTime } from './_helpers';

const ID = 'cadence-fade';
const DROP = 0.05;

const cadenceFade: InsightRule = {
  id: ID,
  run(result) {
    const insights: Insight[] = [];
    for (const a of gpsAttempts(result)) {
      const m = a.metrics;
      if (!m || m.walkingEstimated || m.cadenceFade == null || !(m.cadenceFade > DROP)) continue;
      const lastQuarter = splitByMovingTime(a.series, 4)[3];
      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: 'warn',
        title: 'Cadence faded late in the race',
        template: 'Running cadence in the last quarter was {drop} lower than in the first quarter.',
        values: { drop: { kind: 'percent', value: m.cadenceFade } },
        ranges: lastQuarter ? [courseRange(result.grid.d, lastQuarter)] : [],
      });
    }
    return insights;
  },
};

export default cadenceFade;
