import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Insight } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import topSections from './topSections';

const STEP = 10;
const LENGTH = 10_000;

/** A flat 10 km: 2024 takes 3 s per 10 m step, 2025 `stepSeconds(d)` on the step from d. */
function race(stepSeconds: (d: number) => number, offCourse: (d: number) => boolean = () => false): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const series = (seconds: (d: number) => number, off: (d: number) => boolean) => {
    const time = new Float64Array(d.length);
    for (let k = 1; k < d.length; k++) time[k] = time[k - 1]! + seconds(d[k - 1]!);
    return {
      time,
      ele: null,
      hr: null,
      cad: null,
      pace: new Float32Array(d.length).fill(0.3),
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
    attempts: [
      {
        ...b!,
        series: series(
          () => 3,
          () => false,
        ),
      },
      { ...a!, series: series(stepSeconds, offCourse) },
    ],
  };
}

const inside = (from: number, to: number) => (d: number) => d >= from && d < to;
const run = (stepSeconds: (d: number) => number, offCourse?: (d: number) => boolean) =>
  topSections.run(race(stepSeconds, offCourse), DEFAULT_SETTINGS);

function expectApart(insight: Insight): void {
  const ranges = [...insight.ranges].sort((x, y) => x.from - y.from);
  for (let i = 1; i < ranges.length; i++) expect(ranges[i]!.from).toBeGreaterThanOrEqual(ranges[i - 1]!.to);
}

describe('top-sections', () => {
  it('finds the kilometre lost and the kilometre gained', () => {
    const result = race((d) => (inside(2000, 3000)(d) ? 4 : inside(6000, 7000)(d) ? 2.5 : 3));
    const [lost, gained, ...rest] = topSections.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(lost).toMatchObject({
      id: 'top-sections:trail-2025:0',
      severity: 'info',
      values: { delta0: { kind: 'delta', value: 100 }, from0: { kind: 'distance', value: 2000 } },
      ranges: [{ from: 2000, to: 3000 }],
    });
    expect(lost!.template).toContain(result.attempts[0]!.label);
    expect(gained).toMatchObject({
      id: 'top-sections:trail-2025:1',
      values: { delta0: { kind: 'delta', value: -50 } },
      ranges: [{ from: 6000, to: 7000 }],
    });
  });

  it('gives at most 5 windows, largest first, that never overlap', () => {
    const insights = run((d) => 3 + Math.sin(d / 700));
    expect(insights).toHaveLength(2);
    for (const insight of insights) {
      expect(insight.ranges.length).toBeGreaterThan(1);
      expect(insight.ranges.length).toBeLessThanOrEqual(5);
      expectApart(insight);
      const deltas = insight.ranges.map((_, i) => Math.abs(insight.values[`delta${i}`]!.value));
      expect(deltas).toEqual([...deltas].sort((x, y) => y - x));
    }
  });

  it('never picks a window with an off-course point', () => {
    // The worst kilometre is off-course in its middle: no window may cross 2500 m.
    const insights = run(
      (d) => (inside(2000, 3000)(d) ? 5 : inside(4000, 4500)(d) ? 3.5 : 3),
      (d) => d === 2500,
    );
    const [lost] = insights;
    expect(lost!.ranges.length).toBeGreaterThan(0);
    for (const r of lost!.ranges) expect(r.to <= 2490 || r.from >= 2510).toBe(true);
  });

  it('says nothing for an attempt run in the baseline time throughout', () => {
    expect(run(() => 3)).toEqual([]);
  });

  it('runs on the FIT fixtures with windows that never overlap', () => {
    const { analysis } = loadFixture('fit-two-attempts');
    const insights = topSections.run(analysis, DEFAULT_SETTINGS);
    console.log('top-sections, 2025 against 2024:', JSON.stringify(insights, null, 2));
    expect(insights.map((i) => i.ranges.length)).toEqual([5, 5]);
    insights.forEach(expectApart);
  });
});
