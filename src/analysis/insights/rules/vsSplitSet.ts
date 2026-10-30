/**
 * vs-split-set (PLAN §5.11), for a split-set baseline only: per GPS attempt, the 3 marker
 * intervals where its moving pace was furthest behind the split set's, as relative pace. One
 * insight per attempt, `warn` when the worst is more than 10 % slower, otherwise `info`. Intervals
 * that touch an off-course point, and the extrapolated stretch after the last marker, are left out.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { courseRange, insightId, stepTimes } from './_helpers';
import { anyComparison, gridRange, listOf, numbered, touchesOffCourse } from './_compareHelpers';

const ID = 'vs-split-set';
const WARN = 0.1;
const MAX_REPORTED = 3;

const vsSplitSet: InsightRule = {
  id: ID,
  run(result) {
    const c = anyComparison(result);
    const markers = c?.baseline.markers;
    if (!c || c.baseline.kind !== 'splits' || !markers) return [];
    const { d } = result.grid;
    const intervals = markers.map((m, i) => {
      const prev = markers[i - 1] ?? { distance: 0, time: 0 };
      const r = gridRange(d, prev.distance, m.distance);
      return { r, time: m.time - prev.time, distance: m.distance - prev.distance };
    });

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      const steps = stepTimes(a.series);
      const deficits = intervals
        .filter(({ r }) => r.end > r.start && !touchesOffCourse(a.series, r))
        .map((interval) => {
          let time = 0;
          for (let k = interval.r.start; k < interval.r.end; k++) time += steps[k]!;
          const range = courseRange(d, interval.r);
          // Attempt pace over split-set pace, as one division so a ratio of exactly 1.1 stays one.
          const ratio = (time * interval.distance) / (interval.time * (range.to - range.from));
          return { range, ratio };
        })
        .filter((x) => x.ratio > 1)
        .sort((x, y) => y.ratio - x.ratio)
        .slice(0, MAX_REPORTED);
      if (deficits.length === 0) continue;

      const worst = deficits[0]!.ratio;
      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: worst > 1 + WARN ? 'warn' : 'info',
        title: `Furthest behind ${c.baseline.label}`,
        template:
          `Against ${c.baseline.label}'s splits: ` +
          `${listOf(deficits.map((_, i) => `{slower${i}} slower from {from${i}} to {to${i}}`))}.`,
        values: {
          ...numbered(
            'slower',
            'percent',
            deficits.map((x) => x.ratio - 1),
          ),
          ...numbered(
            'from',
            'distance',
            deficits.map((x) => x.range.from),
          ),
          ...numbered(
            'to',
            'distance',
            deficits.map((x) => x.range.to),
          ),
        },
        ranges: deficits.map((x) => x.range),
      });
    }
    return insights;
  },
};

export default vsSplitSet;
