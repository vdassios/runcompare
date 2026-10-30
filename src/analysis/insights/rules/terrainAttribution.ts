/**
 * terrain-attribution (PLAN §5.11): the attempt's delta split into what changed on the climbs, on
 * the descents and everywhere else, naming the terrain that explains most of it. `info`, `warn`
 * when one terrain explains more than 60 % of a total over 2 minutes either way. Steps touching
 * an off-course point count nowhere, so the three parts always add up to the total reported.
 */
import type { CourseSegment, Insight, InsightRule } from '../../../model/types';
import { comparison, insightId } from './_helpers';
import { segmentRange } from './_compareHelpers';

const ID = 'terrain-attribution';
const SHARE = 0.6;
const TOTAL = 120; // s

type Terrain = 'climbs' | 'descents' | 'flats';
const TERRAINS: readonly Terrain[] = ['climbs', 'descents', 'flats'];
const NAMES: Record<Terrain, string> = { climbs: 'climbs', descents: 'descents', flats: 'flat and rolling ground' };

const terrainAttribution: InsightRule = {
  id: ID,
  run(result) {
    const c = comparison(result);
    if (!c || result.segments.length === 0) return [];
    const { d } = result.grid;
    const terrain = terrainOfSteps(d, result.segments);

    const insights: Insight[] = [];
    for (const a of c.attempts) {
      if (!a.delta) continue;
      const { offCourse } = a.series;
      const parts: Record<Terrain, number> = { climbs: 0, descents: 0, flats: 0 };
      for (let k = 0; k < d.length - 1; k++) {
        const change = a.delta[k + 1]! - a.delta[k]!;
        if (offCourse[k] === 1 || offCourse[k + 1] === 1 || !Number.isFinite(change)) continue;
        parts[terrain[k]!] += change;
      }
      const total = parts.climbs + parts.descents + parts.flats;
      if (total === 0) continue;
      // The terrain that pushed the total furthest its own way: the most lost when behind overall.
      const top = TERRAINS.reduce((x, y) => (parts[y] * Math.sign(total) > parts[x] * Math.sign(total) ? y : x));
      const share = parts[top] / total;

      insights.push({
        id: insightId(ID, a.attemptId, 0),
        ruleId: ID,
        attemptId: a.attemptId,
        severity: share > SHARE && Math.abs(total) > TOTAL ? 'warn' : 'info',
        title: `Most time ${total > 0 ? 'lost' : 'gained'} on the ${NAMES[top]}`,
        template:
          `{share} of the {total} against ${c.baseline.label} came on the ${NAMES[top]}: ` +
          'climbs {climbs}, descents {descents}, flat and rolling ground {flats}.',
        values: {
          share: { kind: 'percent', value: share },
          total: { kind: 'delta', value: total },
          climbs: { kind: 'delta', value: parts.climbs },
          descents: { kind: 'delta', value: parts.descents },
          flats: { kind: 'delta', value: parts.flats },
        },
        ranges: rangesOf(top, terrain, d),
      });
    }
    return insights;
  },
};

/** The terrain each grid step k → k + 1 is on; segments never overlap (task 30). */
function terrainOfSteps(d: Float64Array, segments: CourseSegment[]): Terrain[] {
  const terrain = new Array<Terrain>(Math.max(d.length - 1, 0)).fill('flats');
  for (const s of segments) {
    const r = segmentRange(d, s);
    for (let k = r.start; k < r.end; k++) terrain[k] = s.kind === 'climb' ? 'climbs' : 'descents';
  }
  return terrain;
}

/** The stretches of one terrain, in course order. */
function rangesOf(top: Terrain, terrain: Terrain[], d: Float64Array): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  for (let k = 0; k < terrain.length; k++) {
    if (terrain[k] !== top) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.to === d[k]) last.to = d[k + 1]!;
    else ranges.push({ from: d[k]!, to: d[k + 1]! });
  }
  return ranges;
}

export default terrainAttribution;
