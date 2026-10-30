import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import lostGround from './lostGround';

const STEP = 10;
const LENGTH = 30_000;

interface Run {
  pace: (d: number) => number; // s/m
  hr?: (d: number) => number;
  offCourse?: (d: number) => boolean;
}

/** A flat 30 km course with the fixture's 2024 baseline and 2025 attempt on it. */
function race(baseline: Run, attempt: Run): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const series = (r: Run) => {
    const time = new Float64Array(d.length);
    for (let k = 1; k < d.length; k++) time[k] = time[k - 1]! + r.pace(d[k - 1]!) * STEP;
    return {
      time,
      ele: null,
      hr: r.hr ? Float32Array.from(d, r.hr) : null,
      cad: null,
      pace: Float32Array.from(d, r.pace),
      gap: null,
      moving: new Uint8Array(d.length).fill(1),
      walking: null,
      offCourse: Uint8Array.from(d, (x) => (r.offCourse?.(x) ? 1 : 0)),
      estimated: new Uint8Array(d.length),
    };
  };
  const [b, a] = analysis.attempts;
  return {
    ...analysis,
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    attempts: [
      { ...b!, series: series(baseline) },
      { ...a!, series: series(attempt) },
    ],
  };
}

const inside = (from: number, to: number) => (d: number) => d >= from && d < to;
/** 5:00/km, with a 6:40/km slowdown over [from, to). */
const slowdown = (from: number, to: number) => (d: number) => (inside(from, to)(d) ? 0.4 : 0.3);
const even: Run = { pace: () => 0.3, hr: () => 150 };
const run = (baseline: Run, attempt: Run) => lostGround.run(race(baseline, attempt), DEFAULT_SETTINGS);

describe('lost-ground', () => {
  it('calls a 5 km slowdown with HR dropping against the baseline a strong bonk, over the stretch', () => {
    const insights = run(even, { pace: slowdown(20_000, 25_000), hr: (d) => (inside(20_000, 25_000)(d) ? 135 : 150) });
    expect(insights).toHaveLength(1);
    const [bonk] = insights;
    expect(bonk).toMatchObject({
      id: 'lost-ground:trail-2025:0',
      severity: 'strong',
      ranges: [{ from: 20_000, to: 25_000 }],
    });
    expect(bonk!.values.hrDrop!.value).toBeCloseTo(0.1, 6);
    expect(bonk!.values.slower!.value).toBeCloseTo(1 / 3, 6);
    expect(bonk!.values.lost!.value).toBeCloseTo(500, 6);
    expect(bonk!.title.split(' ').length).toBeLessThanOrEqual(8);
  });

  it('calls it a warn when HR tracks the baseline, or without HR', () => {
    const steady = run(even, { pace: slowdown(20_000, 25_000), hr: () => 150 });
    expect(steady.map((i) => i.severity)).toEqual(['warn']);
    expect(steady[0]!.values.hrDrop).toBeUndefined();
    // HR falls on both sides alike: the attempt held its effort against the baseline.
    const bothDrop = (d: number) => (inside(20_000, 25_000)(d) ? 135 : 150);
    expect(run({ ...even, hr: bothDrop }, { pace: slowdown(20_000, 25_000), hr: bothDrop })[0]!.severity).toBe('warn');
    expect(run({ pace: () => 0.3 }, { pace: slowdown(20_000, 25_000) }).map((i) => i.severity)).toEqual(['warn']);
  });

  it('compares with the baseline, not the attempt itself', () => {
    // Both slow down over the same 5 km: nothing was lost there.
    expect(run({ pace: slowdown(20_000, 25_000) }, { pace: slowdown(20_000, 25_000) })).toEqual([]);
  });

  it('ignores a 2 km slowdown', () => {
    expect(run(even, { pace: slowdown(20_000, 22_000), hr: () => 150 })).toEqual([]);
  });

  it('reports at most the two longest stretches, in course order', () => {
    const pace = (d: number): number =>
      inside(2_000, 5_500)(d) || inside(10_000, 16_000)(d) || inside(20_000, 24_000)(d) ? 0.4 : 0.3;
    const insights = run(even, { pace });
    expect(insights.map((i) => i.ranges[0])).toEqual([
      { from: 10_000, to: 16_000 },
      { from: 20_000, to: 24_000 },
    ]);
    expect(insights.map((i) => i.id)).toEqual(['lost-ground:trail-2025:0', 'lost-ground:trail-2025:1']);
  });

  it('ignores off-course points inside a slow stretch', () => {
    // 800 m off-course inside the slowdown, where the alignment glitch reads as a sprint at high HR.
    const glitch = inside(22_000, 22_800);
    const attempt: Run = {
      pace: (d) => (glitch(d) ? 0.2 : slowdown(20_000, 25_000)(d)),
      hr: (d) => (glitch(d) ? 190 : inside(20_000, 25_000)(d) ? 135 : 150),
    };
    expect(run(even, attempt)).toEqual([]);
    const [bonk] = run(even, { ...attempt, offCourse: glitch });
    expect(bonk).toMatchObject({ severity: 'strong', ranges: [{ from: 20_000, to: 25_000 }] });
    expect(bonk!.values.slower!.value).toBeCloseTo(1 / 3, 6);
  });
});
