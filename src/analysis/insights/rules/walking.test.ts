import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type CourseSegment } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import { analyze } from '../../pipeline';
import type { RuleInput } from './_helpers';
import walking from './walking';

const STEP = 10;
const LENGTH = 10_000;
const climb = (from: number, to: number): CourseSegment => ({
  kind: 'climb',
  from,
  to,
  elevationChange: 100,
  avgGrade: 100 / (to - from),
});
const CLIMBS = [climb(1000, 2000), climb(3000, 4000), climb(5000, 6000), climb(7000, 8000)];

interface Run {
  walks: (d: number) => boolean;
  estimated?: boolean;
  offCourse?: (d: number) => boolean;
}

/** A 10 km course with four 1 km climbs, run at an even 8:20/km by 2024 and 2025. */
function race(baseline: Run, attempt: Run): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const series = (r: Run) => ({
    time: Float64Array.from(d, (x) => x * 0.5),
    ele: null,
    hr: null,
    cad: null,
    pace: new Float32Array(d.length).fill(0.5),
    gap: null,
    moving: new Uint8Array(d.length).fill(1),
    walking: Uint8Array.from(d, (x) => (r.walks(x) ? 1 : 0)),
    offCourse: Uint8Array.from(d, (x) => (r.offCourse?.(x) ? 1 : 0)),
    estimated: new Uint8Array(d.length),
  });
  const [b, a] = analysis.attempts;
  return {
    ...analysis,
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    segments: CLIMBS,
    attempts: [b!, a!].map((x, i) => {
      const r = i === 0 ? baseline : attempt;
      return { ...x, series: series(r), metrics: { ...x.metrics!, walkingEstimated: r.estimated ?? false } };
    }),
  };
}

/** Walks the first `metres` of each listed climb. */
const walksOn =
  (metres: number, ...climbs: CourseSegment[]) =>
  (d: number) =>
    climbs.some((c) => d > c.from && d <= c.from + metres);
const never = () => false;
const run = (baseline: Run, attempt: Run) => walking.run(race(baseline, attempt), DEFAULT_SETTINGS);

describe('walking', () => {
  it('fires on a climb walked more than the baseline, naming it and the baseline', () => {
    const result = race({ walks: walksOn(200, CLIMBS[1]!) }, { walks: walksOn(600, CLIMBS[1]!) });
    const [insight, ...rest] = walking.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'walking:trail-2025:0',
      attemptId: 'trail-2025',
      severity: 'warn',
      title: 'Walked more on the climbs',
      ranges: [{ from: 3000, to: 4000 }],
    });
    expect(insight!.template).toContain(result.attempts[0]!.label);
    expect(insight!.template).toContain('the climb at {from0}');
    expect(insight!.values.share!.value).toBeCloseTo(0.6, 9);
    expect(insight!.values.shareBaseline!.value).toBeCloseTo(0.2, 9);
    expect(insight!.values.from0).toEqual({ kind: 'distance', value: 3000 });
  });

  it('does not fire at exactly 15 points more, and fires just above', () => {
    expect(run({ walks: never }, { walks: walksOn(150, CLIMBS[0]!) })).toEqual([]);
    expect(run({ walks: never }, { walks: walksOn(160, CLIMBS[0]!) })).toHaveLength(1);
  });

  it('lists the 3 climbs with the largest gap, in course order', () => {
    const walks = (d: number) =>
      walksOn(300, CLIMBS[0]!)(d) || walksOn(900, CLIMBS[1]!)(d) || walksOn(500, CLIMBS[2]!, CLIMBS[3]!)(d);
    const [insight] = run({ walks: never }, { walks });
    expect(insight!.ranges.map((r) => r.from)).toEqual([3000, 5000, 7000]);
    expect(insight!.template).toContain('the climbs at {from0}, {from1} and {from2}');
    expect(insight!.values.share!.value).toBeCloseTo(1.9 / 3, 9);
  });

  it('marks estimated walking on either side in the title', () => {
    const walked = { walks: walksOn(500, CLIMBS[0]!) };
    expect(run({ walks: never, estimated: true }, walked)[0]!.title).toBe('Walked more on the climbs (estimated)');
    expect(run({ walks: never }, { ...walked, estimated: true })[0]!.title).toBe(
      'Walked more on the climbs (estimated)',
    );
  });

  it('leaves out a climb touching an off-course point, and walking off the climbs', () => {
    expect(run({ walks: never }, { walks: walksOn(500, CLIMBS[0]!), offCourse: (d) => d === 1500 })).toEqual([]);
    expect(run({ walks: never }, { walks: (d) => d > 2000 && d < 3000 })).toEqual([]);
  });

  it('compares with the baseline, and needs walking on both sides', () => {
    const walks = walksOn(800, CLIMBS[0]!);
    expect(run({ walks }, { walks })).toEqual([]);
    const result = race({ walks: never }, { walks });
    result.attempts[0] = { ...result.attempts[0]!, series: { ...result.attempts[0]!.series, walking: null } };
    expect(walking.run(result, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('runs on the FIT fixtures, either way round', () => {
    const { analysis, attempts } = loadFixture('fit-two-attempts');
    // 2025 walked less than 2024 on every climb but one, so only 2024 against 2025 fires.
    const insights = walking.run(analysis, DEFAULT_SETTINGS);
    console.log('walking, 2025 against 2024:', JSON.stringify(insights, null, 2));
    expect(insights).toEqual([]);

    const flipped = analyze({
      attempts,
      baseline: { kind: 'course', attemptId: 'trail-2025' },
      settings: DEFAULT_SETTINGS,
    });
    const [insight, ...rest] = walking.run(flipped, DEFAULT_SETTINGS);
    console.log('walking, 2024 against 2025:', JSON.stringify(insight, null, 2));
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({ attemptId: 'trail-2024', title: 'Walked more on the climbs' });
    expect(insight!.ranges).toHaveLength(3);
    expect(insight!.values.share!.value - insight!.values.shareBaseline!.value).toBeGreaterThan(0.15);
  });
});
