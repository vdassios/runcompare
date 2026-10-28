import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import wentOutTooHard from './wentOutTooHard';

const STEP = 10;

/** A flat 30 km course with the fixture's 2025 attempt running `gapAt(d)` s/m on it. */
function race(gapAt: (d: number) => number): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: 30_000 / STEP + 1 }, (_, k) => k * STEP);
  const gap = Float32Array.from(d, gapAt);
  const time = new Float64Array(d.length);
  for (let k = 1; k < d.length; k++) time[k] = time[k - 1]! + gap[k]! * STEP;
  const n = d.length;
  const attempt = analysis.attempts[1]!;
  return {
    ...analysis,
    grid: { step: STEP, length: 30_000, d, ele: null, grade: null, lat: null, lon: null },
    attempts: [
      {
        ...attempt,
        series: {
          time,
          ele: null,
          hr: null,
          cad: null,
          pace: gap,
          gap,
          moving: new Uint8Array(n).fill(1),
          walking: null,
          offCourse: new Uint8Array(n),
          estimated: new Uint8Array(n),
        },
      },
    ],
  };
}

const run = (gapAt: (d: number) => number) => wentOutTooHard.run(race(gapAt), DEFAULT_SETTINGS);
/** 4:30/km for the first 10 km, 5:00/km for the next 10, then `finish` s/m. */
const fastStart = (finish: number) => (d: number) => (d < 10_000 ? 0.27 : d < 20_000 ? 0.3 : finish);

describe('went-out-too-hard', () => {
  it('fires on a fast start and a slow finish, citing both thirds', () => {
    const [insight, ...rest] = run(fastStart(0.34));
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'went-out-too-hard:trail-2025:0',
      severity: 'warn',
      values: { firstGap: { kind: 'pace' }, avgGap: { kind: 'pace' }, lastGap: { kind: 'pace' } },
    });
    expect(insight!.title.split(' ').length).toBeLessThanOrEqual(8);
    expect(insight!.values.lastSlower!.value).toBeGreaterThan(0.08);
    const [first, last] = insight!.ranges;
    expect(first!.from).toBe(0);
    expect(first!.to).toBeGreaterThan(10_000); // a third of the time covers more than a third of the course
    expect(last!.to).toBe(30_000);
  });

  it('is strong when the last third is more than 15 % slower', () => {
    expect(run(fastStart(0.38)).map((i) => i.severity)).toEqual(['strong']);
  });

  it('stays quiet on an even pace, and on a fast start that holds', () => {
    expect(run(() => 0.3)).toEqual([]);
    expect(run(fastStart(0.3))).toEqual([]);
  });
});
