import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type AttemptMetrics } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import cadenceFade from './cadenceFade';

/** The GPX fixture with the 2025 attempt alone, its metrics overridden by `metrics`. */
function withMetrics(metrics: Partial<AttemptMetrics>) {
  const { analysis } = loadFixture('gpx-two-attempts');
  const a = analysis.attempts[1]!;
  return { ...analysis, attempts: [{ ...a, metrics: { ...a.metrics!, ...metrics } }] };
}

describe('cadence-fade', () => {
  it('does not fire on the GPX fixtures', () => {
    expect(cadenceFade.run(loadFixture('gpx-two-attempts').analysis, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('warns when running cadence dropped more than 5 %, over the last quarter', () => {
    // metrics.cadenceFade is (first − last) / first: 0.08 means cadence fell 8 %.
    const result = withMetrics({ cadenceFade: 0.08, walkingEstimated: false });
    const [insight, ...rest] = cadenceFade.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'cadence-fade:trail-2025:0',
      severity: 'warn',
      values: { drop: { kind: 'percent', value: 0.08 } },
    });
    expect(insight!.ranges[0]!.from).toBeGreaterThan(result.grid.length / 2);
    expect(insight!.ranges[0]!.to).toBe(result.grid.length);
  });

  it('stays quiet on a small drop, a rise, or estimated walking', () => {
    for (const cadence of [0.03, -0.08]) {
      expect(cadenceFade.run(withMetrics({ cadenceFade: cadence, walkingEstimated: false }), DEFAULT_SETTINGS)).toEqual(
        [],
      );
    }
    expect(cadenceFade.run(withMetrics({ cadenceFade: 0.08, walkingEstimated: true }), DEFAULT_SETTINGS)).toEqual([]);
  });
});
