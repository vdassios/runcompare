import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type CourseSegment } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import terrainAttribution from './terrainAttribution';

const STEP = 10;
const LENGTH = 5000;
const SEGMENTS: CourseSegment[] = [
  { kind: 'climb', from: 0, to: 1200, elevationChange: 120, avgGrade: 0.1 },
  { kind: 'descent', from: 1200, to: 2400, elevationChange: -120, avgGrade: -0.1 },
];

/**
 * A 5 km course, climbing to 1.2 km and descending to 2.4 km, then flat. 2025's delta on 2024
 * grows by `perStep(d)` s on each 10 m step from d.
 */
function race(perStep: (d: number) => number, offCourse: (d: number) => boolean = () => false): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const delta = new Float64Array(d.length);
  for (let k = 1; k < d.length; k++) delta[k] = delta[k - 1]! + perStep(d[k - 1]!);
  const [b, a] = analysis.attempts;
  return {
    ...analysis,
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    segments: SEGMENTS,
    attempts: [
      b!,
      { ...a!, delta, series: { ...a!.series, offCourse: Uint8Array.from(d, (x) => (offCourse(x) ? 1 : 0)) } },
    ],
  };
}

/** `climb`, `descent` and `flat` s lost per step on each. */
const losing = (climb: number, descent: number, flat: number) => (d: number) =>
  d < 1200 ? climb : d < 2400 ? descent : flat;
const run = (perStep: (d: number) => number, offCourse?: (d: number) => boolean) =>
  terrainAttribution.run(race(perStep, offCourse), DEFAULT_SETTINGS);

describe('terrain-attribution', () => {
  it('warns when the climbs explain most of a delta over 2 minutes, over the climbs', () => {
    const result = race(losing(2, -0.5, 0.25));
    const [insight, ...rest] = terrainAttribution.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'terrain-attribution:trail-2025:0',
      severity: 'warn',
      title: 'Most time lost on the climbs',
      values: {
        climbs: { kind: 'delta', value: 240 },
        descents: { kind: 'delta', value: -60 },
        flats: { kind: 'delta', value: 65 },
        total: { kind: 'delta', value: 245 },
      },
      ranges: [{ from: 0, to: 1200 }],
    });
    expect(insight!.values.share!.value).toBeCloseTo(240 / 245, 9);
    expect(insight!.template).toContain(result.attempts[0]!.label);
  });

  it('names the terrain that gained the most when ahead overall', () => {
    const [insight] = run(losing(0.1, -1, 0));
    expect(insight).toMatchObject({ severity: 'info', title: 'Most time gained on the descents' });
    expect(insight!.ranges).toEqual([{ from: 1200, to: 2400 }]);
  });

  it('stays at info right at the thresholds', () => {
    // 60 % exactly: 90 of 150 s on the climbs.
    const sixty = run(losing(0.75, 0.5, 0));
    expect(sixty[0]!.values.share!.value).toBe(0.6);
    expect(sixty[0]!.severity).toBe('info');
    // All of it on the climbs, but exactly 2 minutes.
    expect(run(losing(1, 0, 0))).toMatchObject([{ severity: 'info', values: { total: { value: 120 } } }]);
    expect(run(losing(1.25, 0, 0))[0]!.severity).toBe('warn');
  });

  it('gives the flat stretches as ranges when they dominate', () => {
    expect(run(losing(0, 0, 0.5))[0]!.ranges).toEqual([{ from: 2400, to: 5000 }]);
  });

  it('says nothing without a delta or without segments', () => {
    expect(run(() => 0)).toEqual([]);
    const result = race(losing(1, 0, 0));
    expect(terrainAttribution.run({ ...result, segments: [] }, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('leaves out off-course steps, and its parts still add up to its total', () => {
    const [insight] = run(losing(2, 0, 0), (d) => d >= 500 && d < 700);
    expect(insight!.values.climbs!.value).toBeCloseTo(2 * 99, 9);
    expect(insight!.values.total!.value).toBeCloseTo(2 * 99, 9);
  });

  it('splits the fixture delta into parts that add up to the total delta', () => {
    const { analysis } = loadFixture('fit-two-attempts');
    const [insight, ...rest] = terrainAttribution.run(analysis, DEFAULT_SETTINGS);
    console.log('terrain-attribution, 2025 against 2024:', JSON.stringify(insight, null, 2));
    expect(rest).toEqual([]);
    const { climbs, descents, flats, total } = insight!.values;
    expect(climbs!.value + descents!.value + flats!.value).toBeCloseTo(total!.value, 6);
    // The ghost delta at the finish (PLAN §7), with no off-course step on this fixture to leave out.
    const delta = analysis.attempts[1]!.delta!;
    expect(Math.abs(total!.value - delta[delta.length - 1]!)).toBeLessThanOrEqual(1);
    expect(total!.value).toBeCloseTo(383, 0);
  });
});
