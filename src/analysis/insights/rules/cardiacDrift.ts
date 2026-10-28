/**
 * cardiac-drift (PLAN §5.11): aerobic decoupling (`metrics.decoupling`, HR up relative to GAP from
 * the first to the second half of moving time) above 5 % is `warn`, above 10 % `strong`.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { courseRange, gpsAttempts, insightId, splitByMovingTime } from './_helpers';

const ID = 'cardiac-drift';
const WARN = 0.05;
const STRONG = 0.1;

const cardiacDrift: InsightRule = {
  id: ID,
  run(result) {
    const insights: Insight[] = [];
    for (const a of gpsAttempts(result)) {
      const decoupling = a.metrics?.decoupling;
      if (decoupling == null || !(decoupling > WARN)) continue;
      const [, secondHalf] = splitByMovingTime(a.series, 2);
      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: decoupling > STRONG ? 'strong' : 'warn',
        title: 'Heart rate drifted up',
        template: 'Heart rate rose {decoupling} relative to GAP from the first half to the second.',
        values: { decoupling: { kind: 'percent', value: decoupling } },
        ranges: secondHalf ? [courseRange(result.grid.d, secondHalf)] : [],
      });
    }
    return insights;
  },
};

export default cardiacDrift;
