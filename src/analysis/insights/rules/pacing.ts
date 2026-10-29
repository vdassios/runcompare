/**
 * pacing (PLAN §5.11): over the course thirds, the attempt ran the first more than 3 % faster
 * than the baseline and the last more than 5 % slower; `strong` past 10 %. Moving time over the
 * same course metres, so a stop isn't read as slow running.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { comparison, courseRange, insightId, splitByDistance, stepTimes, timesOver } from './_helpers';

const ID = 'pacing';
const FIRST_FASTER = 0.03;
const LAST_SLOWER = 0.05;
const LAST_SLOWER_STRONG = 0.1;

const pacing: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    if (!c) return [];
    const { d } = result.grid;
    const [first, , last] = splitByDistance(d.length, 3);
    if (!first || !last) return [];
    const baselineSteps = stepTimes(c.baseline.series);

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      const steps = stepTimes(a.series);
      const firstTimes = timesOver(steps, baselineSteps, first);
      const lastTimes = timesOver(steps, baselineSteps, last);
      const firstFaster = 1 - firstTimes.attempt / firstTimes.baseline;
      const lastSlower = lastTimes.attempt / lastTimes.baseline - 1;
      if (!(firstFaster > FIRST_FASTER && lastSlower > LAST_SLOWER)) continue;

      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: lastSlower > LAST_SLOWER_STRONG ? 'strong' : 'warn',
        title: 'Started faster, finished slower',
        template:
          `First third {firstFaster} faster than ${c.baseline.label} ({firstGain}); ` +
          'last third {lastSlower} slower ({lastLoss}).',
        values: {
          firstFaster: { kind: 'percent', value: firstFaster },
          firstGain: { kind: 'delta', value: firstTimes.attempt - firstTimes.baseline },
          lastSlower: { kind: 'percent', value: lastSlower },
          lastLoss: { kind: 'delta', value: lastTimes.attempt - lastTimes.baseline },
        },
        ranges: [courseRange(d, first), courseRange(d, last)],
      });
    }
    return insights;
  },
};

export default pacing;
