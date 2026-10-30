/**
 * stopped-time (PLAN §5.11): the attempt's stopped time (`metrics.stopped`) differs from the
 * baseline's by more than 2 minutes, at `info`. The ranges are where the attempt stood still on
 * the course: its on-course grid points with `moving` 0, merged into runs.
 */
import type { AttemptAnalysis, Insight, InsightRule } from '../../../model/types';
import { comparison, courseRange, insightId, runsWhere } from './_helpers';

const ID = 'stopped-time';
const DIFFERENCE = 120; // s

const stoppedTime: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    const baselineStopped = c?.baseline.metrics?.stopped;
    if (!c || baselineStopped == null) return [];

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      const stopped = a.metrics?.stopped;
      if (stopped == null) continue;
      const difference = stopped - baselineStopped;
      if (!(Math.abs(difference) > DIFFERENCE)) continue;
      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: 'info',
        title: difference > 0 ? 'Stopped for longer' : 'Stopped for less time',
        template: `Stopped for {stopped}, against {baselineStopped} on ${c.baseline.label} ({difference}).`,
        values: {
          stopped: { kind: 'duration', value: stopped },
          baselineStopped: { kind: 'duration', value: baselineStopped },
          difference: { kind: 'delta', value: difference },
        },
        ranges: stops(a, result.grid.d),
      });
    }
    return insights;
  },
};

/**
 * A stop flags the grid point nearest to it, but its jump in `time` lands on the first grid point
 * after it (PLAN §5.6), so each run is widened by one step either side to cover both.
 */
function stops(a: AttemptAnalysis, d: Float64Array): { from: number; to: number }[] {
  const { moving, offCourse } = a.series;
  if (!moving) return [];
  const still = Uint8Array.from(moving, (m, k) => (m === 0 && offCourse[k] === 0 ? 1 : 0));
  return runsWhere(still, (v) => v === 1).map((r) => courseRange(d, { start: Math.max(r.start - 1, 0), end: r.end }));
}

export default stoppedTime;
