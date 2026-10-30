/**
 * climbs (PLAN §5.11): the 3 climbs where the attempt gained the most moving time on the baseline
 * and the 3 where it lost the most, each with its relative pace, as one `info` each. Climbs that
 * touch an off-course point aren't comparable and are left out.
 */
import type { Insight, InsightRule } from '../../../model/types';
import { comparison, insightId, stepTimes, timesOver } from './_helpers';
import { numbered, segmentRange, touchesOffCourse } from './_compareHelpers';

const ID = 'climbs';
const MAX_REPORTED = 3;

const climbs: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    if (!c) return [];
    const { d } = result.grid;
    const all = result.segments.filter((s) => s.kind === 'climb').map((s) => ({ s, r: segmentRange(d, s) }));
    const baselineSteps = stepTimes(c.baseline.series);

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      const steps = stepTimes(a.series);
      const compared = all
        .filter(({ r }) => !touchesOffCourse(a.series, r))
        .map(({ s, r }) => {
          const t = timesOver(steps, baselineSteps, r);
          return { s, delta: t.attempt - t.baseline, relative: t.attempt / t.baseline - 1 };
        })
        .filter((x) => Number.isFinite(x.relative));
      const gained = compared
        .filter((x) => x.delta < 0)
        .sort((x, y) => x.delta - y.delta)
        .slice(0, MAX_REPORTED);
      const lost = compared
        .filter((x) => x.delta > 0)
        .sort((x, y) => y.delta - x.delta)
        .slice(0, MAX_REPORTED);

      const base = { ruleId: ID, attemptId: a.attemptId, severity: 'info' } as const;
      const label = c.baseline.label;
      const climbList = (list: typeof compared, pace: string, time: string) =>
        list
          .map((_, i) => `{${pace}${i}} ${pace} than ${label}, {${time}${i}} ${time}, on the climb at {from${i}}`)
          .join('; ');
      const values = (list: typeof compared, pace: string, time: string, sign: 1 | -1) => ({
        ...numbered(
          pace,
          'percent',
          list.map((x) => sign * x.relative),
        ),
        ...numbered(
          time,
          'delta',
          list.map((x) => x.delta),
        ),
        ...numbered(
          'from',
          'distance',
          list.map((x) => x.s.from),
        ),
      });

      if (gained.length > 0) {
        insights.push({
          ...base,
          id: insightId(ID, a.attemptId, 0),
          title: 'Climbs where you gained the most',
          template: `${climbList(gained, 'faster', 'gained')}.`,
          values: values(gained, 'faster', 'gained', -1),
          ranges: gained.map(({ s }) => ({ from: s.from, to: s.to })),
        });
      }
      if (lost.length > 0) {
        insights.push({
          ...base,
          id: insightId(ID, a.attemptId, 1),
          title: 'Climbs where you lost the most',
          template: `${climbList(lost, 'slower', 'lost')}.`,
          values: values(lost, 'slower', 'lost', 1),
          ranges: lost.map(({ s }) => ({ from: s.from, to: s.to })),
        });
      }
    }
    return insights;
  },
};

export default climbs;
