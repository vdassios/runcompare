import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import fade from './fade';

const STEP = 10;
const LENGTH = 30_000;

interface Course {
  gap: (d: number) => number;
  hr?: (d: number) => number;
  offCourse?: (d: number) => boolean;
}

/** A flat 30 km course with the fixture's 2025 attempt on it, its GAP (s/m) and HR given per metre. */
function race(c: Course): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const gap = Float32Array.from(d, c.gap);
  const time = new Float64Array(d.length);
  for (let k = 1; k < d.length; k++) time[k] = time[k - 1]! + gap[k]! * STEP;
  const n = d.length;
  const attempt = analysis.attempts[1]!;
  return {
    ...analysis,
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    attempts: [
      {
        ...attempt,
        series: {
          time,
          ele: null,
          hr: c.hr ? Float32Array.from(d, c.hr) : null,
          cad: null,
          pace: gap,
          gap,
          moving: new Uint8Array(n).fill(1),
          walking: null,
          offCourse: Uint8Array.from(d, (x) => (c.offCourse?.(x) ? 1 : 0)),
          estimated: new Uint8Array(n),
        },
      },
    ],
  };
}

const inside = (from: number, to: number) => (d: number) => d >= from && d < to;
/** 5:00/km, with a 6:40/km slowdown over [from, to). */
const slowdown = (from: number, to: number) => (d: number) => (inside(from, to)(d) ? 0.4 : 0.3);

describe('fade', () => {
  it('calls a 5 km slowdown with HR dropping a strong bonk, over the slow stretch', () => {
    const insights = fade.run(
      race({ gap: slowdown(20_000, 25_000), hr: (d) => (inside(20_000, 25_000)(d) ? 135 : 150) }),
      DEFAULT_SETTINGS,
    );
    expect(insights).toHaveLength(1);
    const [bonk] = insights;
    expect(bonk).toMatchObject({ id: 'fade:trail-2025:0', severity: 'strong', ranges: [{ from: 20_000, to: 25_000 }] });
    expect(bonk!.values.hrDrop!.value).toBeCloseTo(0.1, 6);
    expect(bonk!.values.slower!.value).toBeCloseTo(1 / 3, 2);
    expect(bonk!.title.split(' ').length).toBeLessThanOrEqual(8);
  });

  it('calls a 5 km slowdown with HR steady a warn fade, and without HR an info fade', () => {
    const steady = fade.run(race({ gap: slowdown(20_000, 25_000), hr: () => 150 }), DEFAULT_SETTINGS);
    expect(steady.map((i) => i.severity)).toEqual(['warn']);
    expect(steady[0]!.values.hrDrop).toBeUndefined();
    expect(fade.run(race({ gap: slowdown(20_000, 25_000) }), DEFAULT_SETTINGS).map((i) => i.severity)).toEqual([
      'info',
    ]);
  });

  it('ignores a 2 km slowdown', () => {
    expect(fade.run(race({ gap: slowdown(20_000, 22_000), hr: () => 150 }), DEFAULT_SETTINGS)).toEqual([]);
  });

  it('reports at most the two longest stretches, in course order', () => {
    const gap = (d: number): number =>
      inside(2_000, 5_500)(d) || inside(10_000, 16_000)(d) || inside(20_000, 24_000)(d) ? 0.4 : 0.3;
    const insights = fade.run(race({ gap }), DEFAULT_SETTINGS);
    expect(insights.map((i) => i.ranges[0])).toEqual([
      { from: 10_000, to: 16_000 },
      { from: 20_000, to: 24_000 },
    ]);
    expect(insights.map((i) => i.id)).toEqual(['fade:trail-2025:0', 'fade:trail-2025:1']);
  });

  it('ignores off-course points inside a slow stretch', () => {
    // 800 m off-course inside the slowdown, where the alignment glitch reads as a sprint at high HR.
    const glitch = inside(22_000, 22_800);
    const course: Course = {
      gap: (d) => (glitch(d) ? 0.2 : slowdown(20_000, 25_000)(d)),
      hr: (d) => (glitch(d) ? 190 : inside(20_000, 25_000)(d) ? 135 : 150),
    };
    expect(fade.run(race(course), DEFAULT_SETTINGS)).toEqual([]);
    const [bonk] = fade.run(race({ ...course, offCourse: glitch }), DEFAULT_SETTINGS);
    expect(bonk).toMatchObject({ severity: 'strong', ranges: [{ from: 20_000, to: 25_000 }] });
    expect(bonk!.values.gap!.value).toBeCloseTo(0.4, 6);
  });
});
