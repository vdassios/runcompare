import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type CourseSegment } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import climbs from './climbs';

const STEP = 10;
const LENGTH = 10_000;
const segment = (kind: CourseSegment['kind'], from: number): CourseSegment => ({
  kind,
  from,
  to: from + 1000,
  elevationChange: kind === 'climb' ? 100 : -100,
  avgGrade: kind === 'climb' ? 0.1 : -0.1,
});
/** Four 1 km climbs at 0, 2, 4 and 6 km and a descent at 8 km. */
const SEGMENTS = [0, 2000, 4000, 6000].map((from) => segment('climb', from)).concat(segment('descent', 8000));

/** The 2024 baseline runs 10 km at 8:20/km, the 2025 attempt `paceAt(d)` s/m. */
function race(paceAt: (d: number) => number, offCourse: (d: number) => boolean = () => false): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const series = (pace: (d: number) => number, off: (d: number) => boolean) => {
    const time = new Float64Array(d.length);
    for (let k = 1; k < d.length; k++) time[k] = time[k - 1]! + pace(d[k - 1]!) * STEP;
    return {
      time,
      ele: null,
      hr: null,
      cad: null,
      pace: Float32Array.from(d, pace),
      gap: null,
      moving: new Uint8Array(d.length).fill(1),
      walking: null,
      offCourse: Uint8Array.from(d, (x) => (off(x) ? 1 : 0)),
      estimated: new Uint8Array(d.length),
    };
  };
  const [b, a] = analysis.attempts;
  return {
    ...analysis,
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    segments: SEGMENTS,
    attempts: [
      {
        ...b!,
        series: series(
          () => 0.5,
          () => false,
        ),
      },
      { ...a!, series: series(paceAt, offCourse) },
    ],
  };
}

/** The baseline's pace, times `factor` on the kilometre starting at each listed metre. */
const paces =
  (factors: Record<number, number>) =>
  (d: number): number =>
    0.5 * (factors[Math.floor(d / 1000) * 1000] ?? 1);
const run = (paceAt: (d: number) => number, offCourse?: (d: number) => boolean) =>
  climbs.run(race(paceAt, offCourse), DEFAULT_SETTINGS);

describe('climbs', () => {
  it('gives the climbs gained and lost on, largest first, with time and relative pace', () => {
    const result = race(paces({ 0: 0.9, 2000: 1.2, 4000: 0.8, 6000: 1.1, 8000: 2 }));
    const [gained, lost, ...rest] = climbs.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(gained).toMatchObject({
      id: 'climbs:trail-2025:0',
      severity: 'info',
      ranges: [
        { from: 4000, to: 5000 },
        { from: 0, to: 1000 },
      ],
    });
    expect(gained!.template).toContain(`{faster0} faster than ${result.attempts[0]!.label}, {gained0} gained`);
    expect(gained!.values.faster0!.value).toBeCloseTo(0.2, 9);
    expect(gained!.values.gained0).toMatchObject({ kind: 'delta' });
    expect(gained!.values.gained0!.value).toBeCloseTo(-100, 9);
    expect(gained!.values.from1).toEqual({ kind: 'distance', value: 0 });

    // The descent lost the most of all, but it isn't a climb.
    expect(lost).toMatchObject({ id: 'climbs:trail-2025:1', severity: 'info' });
    expect(lost!.ranges.map((r) => r.from)).toEqual([2000, 6000]);
    expect(lost!.values.slower0!.value).toBeCloseTo(0.2, 9);
    expect(lost!.values.lost0!.value).toBeCloseTo(100, 9);
    expect(lost!.values.lost1!.value).toBeCloseTo(50, 9);
  });

  it('lists at most 3 of each', () => {
    const insights = run(paces({ 0: 1.1, 2000: 1.2, 4000: 1.3, 6000: 1.4 }));
    expect(insights).toHaveLength(1);
    expect(insights[0]!.id).toBe('climbs:trail-2025:1');
    expect(insights[0]!.ranges.map((r) => r.from)).toEqual([6000, 4000, 2000]);
  });

  it('says nothing when every climb was run in the baseline time', () => {
    expect(run(paces({ 8000: 2 }))).toEqual([]);
  });

  it('leaves out a climb touching an off-course point', () => {
    const insights = run(paces({ 2000: 1.2, 6000: 1.1 }), (d) => d === 3000);
    expect(insights.map((i) => i.ranges)).toEqual([[{ from: 6000, to: 7000 }]]);
  });

  it('runs on the FIT fixtures', () => {
    const { analysis } = loadFixture('fit-two-attempts');
    const insights = climbs.run(analysis, DEFAULT_SETTINGS);
    console.log('climbs, 2025 against 2024:', JSON.stringify(insights, null, 2));
    expect(insights.map((i) => i.id)).toEqual(['climbs:trail-2025:0', 'climbs:trail-2025:1']);
    expect(insights.map((i) => i.ranges.length)).toEqual([2, 3]);
  });
});
