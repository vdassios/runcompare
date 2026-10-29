import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import pacing from './pacing';

const STEP = 10;
const LENGTH = 30_000;

/** A flat 30 km course: the 2024 baseline runs 5:00/km, the 2025 attempt `paceAt(d)` s/m. */
function race(paceAt: (d: number) => number): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const series = (pace: (d: number) => number) => {
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
      offCourse: new Uint8Array(d.length),
      estimated: new Uint8Array(d.length),
    };
  };
  const [baseline, attempt] = analysis.attempts;
  return {
    ...analysis,
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    attempts: [
      { ...baseline!, series: series(() => 0.3) },
      { ...attempt!, series: series(paceAt) },
    ],
  };
}

const run = (paceAt: (d: number) => number) => pacing.run(race(paceAt), DEFAULT_SETTINGS);
/** 4:40/km for the first 10 km, the baseline's 5:00/km for the next 10, then `finish` s/m. */
const fastStart = (finish: number) => (d: number) => (d < 10_000 ? 0.28 : d < 20_000 ? 0.3 : finish);

describe('pacing', () => {
  it('fires on a start faster than the baseline and a finish slower, citing both thirds', () => {
    const result = race(fastStart(0.32));
    const [insight, ...rest] = pacing.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'pacing:trail-2025:0',
      attemptId: 'trail-2025',
      severity: 'warn',
      ranges: [
        { from: 0, to: 10_000 },
        { from: 20_000, to: 30_000 },
      ],
    });
    expect(insight!.template).toContain(result.attempts[0]!.label);
    expect(insight!.title.split(' ').length).toBeLessThanOrEqual(8);
    expect(insight!.values.firstFaster!.value).toBeCloseTo(1 / 15, 6);
    expect(insight!.values.firstGain).toMatchObject({ kind: 'delta' });
    expect(insight!.values.firstGain!.value).toBeCloseTo(-200, 6);
    expect(insight!.values.lastLoss!.value).toBeCloseTo(200, 6);
  });

  it('is strong when the last third is more than 10 % slower', () => {
    expect(run(fastStart(0.34)).map((i) => i.severity)).toEqual(['strong']);
  });

  it('stays quiet on the baseline pace, a uniformly slower one, and a fast start that holds', () => {
    expect(run(() => 0.3)).toEqual([]);
    expect(run(() => 0.33)).toEqual([]);
    expect(run(fastStart(0.3))).toEqual([]);
  });

  it('counts moving time, so a stop in the last third is not a slow finish', () => {
    const result = race(fastStart(0.3));
    const a = result.attempts[1]!.series;
    // A 5 minute stop at 25 km.
    for (let k = 2501; k < a.time.length; k++) a.time[k]! += 300;
    a.moving![2501] = 0;
    expect(pacing.run(result, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('gives the baseline no insight, and says nothing on a split-set baseline', () => {
    const result = race(fastStart(0.34));
    expect(pacing.run(result, DEFAULT_SETTINGS).map((i) => i.attemptId)).toEqual(['trail-2025']);
    // With 2025 as the baseline, its fast start and slow finish are what 2024 is measured against.
    const flipped = { ...result, baseline: { kind: 'course' as const, attemptId: 'trail-2025' } };
    expect(pacing.run(flipped, DEFAULT_SETTINGS)).toEqual([]);
    const onDistance = {
      ...result,
      baseline: { kind: 'distance' as const, attemptId: 'trail-2024', preset: 'custom' as const, distance: LENGTH },
    };
    expect(pacing.run(onDistance, DEFAULT_SETTINGS)).toEqual([]);
  });
});
