import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import { analyze } from '../../pipeline';
import type { RuleInput } from './_helpers';
import vsSplitSet from './vsSplitSet';

const STEP = 10;
const LENGTH = 10_000;
/** A 10 km split set at an even 4:10/km, with markers at 2, 5, 8 and 10 km. */
const MARKERS = [2000, 5000, 8000, 10_000].map((distance) => ({ distance, time: distance * 0.25 }));

/**
 * 2024 as a split-set distance baseline and 2025 running `stepSeconds(d)` on each 10 m step from
 * d, off-course where `offCourse` says.
 */
function race(stepSeconds: (d: number) => number, offCourse: (d: number) => boolean = () => false): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const time = new Float64Array(d.length);
  for (let k = 1; k < d.length; k++) time[k] = time[k - 1]! + stepSeconds(d[k - 1]!);
  const [b, a] = analysis.attempts;
  return {
    ...analysis,
    baseline: { kind: 'distance', attemptId: b!.attemptId, preset: '10k', distance: LENGTH },
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    segments: [],
    attempts: [
      { ...b!, kind: 'splits', metrics: null, markers: MARKERS },
      {
        ...a!,
        series: {
          ...a!.series,
          time,
          moving: new Uint8Array(d.length).fill(1),
          offCourse: Uint8Array.from(d, (x) => (offCourse(x) ? 1 : 0)),
        },
      },
    ],
  };
}

/** The split set's 2.5 s per step, times `factor` on the interval starting at each listed metre. */
const steps = (factors: Record<number, number>) => (d: number) => {
  const from = [0, ...MARKERS.map((m) => m.distance)].findLast((x) => x <= d)!;
  return 2.5 * (factors[from] ?? 1);
};
const run = (stepSeconds: (d: number) => number, offCourse?: (d: number) => boolean) =>
  vsSplitSet.run(race(stepSeconds, offCourse), DEFAULT_SETTINGS);

describe('vs-split-set', () => {
  it('warns on the intervals furthest behind the split set, worst first', () => {
    const result = race(steps({ 0: 1.05, 2000: 1.25, 5000: 0.9, 8000: 1.125 }));
    const [insight, ...rest] = vsSplitSet.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'vs-split-set:trail-2025:0',
      attemptId: 'trail-2025',
      severity: 'warn',
      values: {
        slower0: { kind: 'percent', value: 0.25 },
        from0: { kind: 'distance', value: 2000 },
        to0: { kind: 'distance', value: 5000 },
        slower1: { kind: 'percent', value: 0.125 },
      },
      ranges: [
        { from: 2000, to: 5000 },
        { from: 8000, to: 10_000 },
        { from: 0, to: 2000 },
      ],
    });
    expect(insight!.values.slower2!.value).toBeCloseTo(0.05, 9);
    expect(insight!.template).toContain(result.attempts[0]!.label);
  });

  it('is info at exactly 10 % slower, and says nothing when never behind', () => {
    expect(run(steps({ 2000: 1.1 })).map((i) => i.severity)).toEqual(['info']);
    expect(run(steps({ 2000: 1.125 })).map((i) => i.severity)).toEqual(['warn']);
    expect(run(steps({ 2000: 0.9 }))).toEqual([]);
  });

  it('leaves out an interval touching an off-course point', () => {
    const [insight] = run(steps({ 2000: 1.25, 8000: 1.05 }), (d) => d === 3000);
    expect(insight).toMatchObject({ severity: 'info', ranges: [{ from: 8000, to: 10_000 }] });
  });

  it('says nothing on a course baseline, like the fit-vs-pro fixture', () => {
    expect(vsSplitSet.run(loadFixture('fit-vs-pro').analysis, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('runs on fit-vs-pro with the pro as the baseline', () => {
    const { attempts } = loadFixture('fit-vs-pro');
    const baseline = { kind: 'distance', attemptId: 'pro', preset: 'custom', distance: 54_000 } as const;
    const result = analyze({ attempts, baseline, settings: DEFAULT_SETTINGS });
    const insights = vsSplitSet.run(result, DEFAULT_SETTINGS);
    console.log('vs-split-set, both FIT attempts against Pro:', JSON.stringify(insights, null, 2));
    expect(insights.map((i) => i.attemptId)).toEqual(['trail-2024', 'trail-2025']);
    // A 5:30 pro: both attempts are far behind on every interval.
    expect(insights.every((i) => i.severity === 'warn' && i.ranges.length === 3)).toBe(true);
  });
});
