import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import type { RuleInput } from './_helpers';
import stoppedTime from './stoppedTime';

const STEP = 10;
const LENGTH = 10_000;

/**
 * 2024 stopped `baseline` s and 2025 `attempt` s; 2025 is flagged not moving at the grid points
 * in `still`, and off-course in `offCourse`.
 */
function race(baseline: number, attempt: number, still: number[] = [], offCourse: number[] = []): RuleInput {
  const { analysis } = loadFixture('gpx-two-attempts');
  const d = Float64Array.from({ length: LENGTH / STEP + 1 }, (_, k) => k * STEP);
  const [b, a] = analysis.attempts;
  const withStops = (x: typeof a, stopped: number, points: number[]) => ({
    ...x!,
    metrics: { ...x!.metrics!, stopped },
    series: {
      ...x!.series,
      time: Float64Array.from(d, (v) => v * 0.3),
      moving: Uint8Array.from(d, (v) => (points.includes(v) ? 0 : 1)),
      offCourse: Uint8Array.from(d, (v) => (offCourse.includes(v) ? 1 : 0)),
    },
  });
  return {
    ...analysis,
    grid: { step: STEP, length: LENGTH, d, ele: null, grade: null, lat: null, lon: null },
    attempts: [withStops(b, baseline, []), withStops(a, attempt, still)],
  };
}

const run = (...args: Parameters<typeof race>) => stoppedTime.run(race(...args), DEFAULT_SETTINGS);

describe('stopped-time', () => {
  it('fires on 2 minutes more stopped than the baseline, over where the attempt stood still', () => {
    const result = race(60, 300, [2000, 2010, 2020, 5000]);
    const [insight, ...rest] = stoppedTime.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'stopped-time:trail-2025:0',
      attemptId: 'trail-2025',
      severity: 'info',
      title: 'Stopped for longer',
      values: {
        stopped: { kind: 'duration', value: 300 },
        baselineStopped: { kind: 'duration', value: 60 },
        difference: { kind: 'delta', value: 240 },
      },
      ranges: [
        { from: 1990, to: 2030 },
        { from: 4990, to: 5010 },
      ],
    });
    expect(insight!.template).toContain(result.attempts[0]!.label);
  });

  it('fires on stopping less, too', () => {
    expect(run(400, 100)).toMatchObject([{ title: 'Stopped for less time', values: { difference: { value: -300 } } }]);
  });

  it('does not fire at exactly 2 minutes', () => {
    expect(run(60, 180)).toEqual([]);
    expect(run(180, 60)).toEqual([]);
    expect(run(60, 181)).toHaveLength(1);
  });

  it('leaves off-course points out of the ranges', () => {
    expect(run(0, 300, [2000, 5000], [5000])[0]!.ranges).toEqual([{ from: 1990, to: 2010 }]);
  });

  it('gives the baseline nothing of its own', () => {
    const result = race(500, 0);
    expect(stoppedTime.run(result, DEFAULT_SETTINGS).map((i) => i.attemptId)).toEqual(['trail-2025']);
  });
});
