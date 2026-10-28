/**
 * went-out-too-hard (PLAN §5.11): the first third of moving time was run more than 5 % faster
 * than the whole-race average GAP and the last third more than 8 % slower; `strong` past 15 %.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { courseRange, gpsAttempts, insightId, maskUnusable, meanOver, splitByMovingTime } from './_helpers';

const ID = 'went-out-too-hard';
const FIRST_FASTER = 0.05;
const LAST_SLOWER = 0.08;
const LAST_SLOWER_STRONG = 0.15;

const wentOutTooHard: InsightRule = {
  id: ID,
  run(result) {
    const insights: Insight[] = [];
    const { d } = result.grid;
    for (const a of gpsAttempts(result)) {
      if (!a.series.gap) continue;
      const gap = maskUnusable(a.series, a.series.gap);
      const [first, , last] = splitByMovingTime(a.series, 3);
      if (!first || !last) continue;

      const avgGap = meanOver(gap, { start: 0, end: gap.length });
      const firstGap = meanOver(gap, first);
      const lastGap = meanOver(gap, last);
      // Pace is s/m, so faster is a smaller number.
      const firstFaster = 1 - firstGap / avgGap;
      const lastSlower = lastGap / avgGap - 1;
      if (!(firstFaster > FIRST_FASTER && lastSlower > LAST_SLOWER)) continue;

      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: lastSlower > LAST_SLOWER_STRONG ? 'strong' : 'warn',
        title: 'Went out too hard',
        template:
          'First third {firstGap} GAP vs {avgGap} average ({firstFaster} faster); ' +
          'last third {lastGap} ({lastSlower} slower).',
        values: {
          firstGap: { kind: 'pace', value: firstGap },
          avgGap: { kind: 'pace', value: avgGap },
          lastGap: { kind: 'pace', value: lastGap },
          firstFaster: { kind: 'percent', value: firstFaster },
          lastSlower: { kind: 'percent', value: lastSlower },
        },
        ranges: [courseRange(d, first), courseRange(d, last)],
      });
    }
    return insights;
  },
};

export default wentOutTooHard;
