/**
 * cardiac-drift (PLAN §5.11): the attempt's aerobic decoupling (`metrics.decoupling`, HR up
 * relative to GAP from the first to the second half of moving time) more than 5 points above the
 * baseline's is `warn`, more than 10 points `strong`.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { comparison, courseRange, insightId, splitByMovingTime } from './_helpers';

const ID = 'cardiac-drift';
const WARN = 0.05;
const STRONG = 0.1;

const cardiacDrift: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    const baselineDecoupling = c?.baseline.metrics?.decoupling;
    if (!c || baselineDecoupling == null) return [];

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      const decoupling = a.metrics?.decoupling;
      if (decoupling == null) continue;
      const more = decoupling - baselineDecoupling;
      if (!(more > WARN)) continue;
      const [, secondHalf] = splitByMovingTime(a.series, 2);
      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: more > STRONG ? 'strong' : 'warn',
        title: 'Heart rate drifted up more',
        template: `Heart rate rose {decoupling} relative to GAP from the first half to the second, against {baselineDecoupling} on ${c.baseline.label}.`,
        values: {
          decoupling: { kind: 'percent', value: decoupling },
          baselineDecoupling: { kind: 'percent', value: baselineDecoupling },
        },
        ranges: secondHalf ? [courseRange(result.grid.d, secondHalf)] : [],
      });
    }
    return insights;
  },
};

export default cardiacDrift;
