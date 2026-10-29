import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type AttemptMetrics } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import cadenceFade from './cadenceFade';

/** The GPX fixtures with the metrics of the 2024 baseline and the 2025 attempt overridden. */
function withMetrics(baseline: Partial<AttemptMetrics>, attempt: Partial<AttemptMetrics>) {
  const { analysis } = loadFixture('gpx-two-attempts');
  const [b, a] = analysis.attempts;
  return {
    ...analysis,
    attempts: [
      { ...b!, metrics: { ...b!.metrics!, walkingEstimated: false, ...baseline } },
      { ...a!, metrics: { ...a!.metrics!, walkingEstimated: false, ...attempt } },
    ],
  };
}
const run = (baseline: Partial<AttemptMetrics>, attempt: Partial<AttemptMetrics>) =>
  cadenceFade.run(withMetrics(baseline, attempt), DEFAULT_SETTINGS);

describe('cadence-fade', () => {
  it('does not fire on the GPX fixtures', () => {
    expect(cadenceFade.run(loadFixture('gpx-two-attempts').analysis, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('warns when cadence fell more than 5 points further than the baseline, over the last quarter', () => {
    // metrics.cadenceFade is (first − last) / first: 0.08 means cadence fell 8 %.
    const result = withMetrics({ cadenceFade: 0.02 }, { cadenceFade: 0.08 });
    const [insight, ...rest] = cadenceFade.run(result, DEFAULT_SETTINGS);
    expect(rest).toEqual([]);
    expect(insight).toMatchObject({
      id: 'cadence-fade:trail-2025:0',
      severity: 'warn',
      values: { fade: { kind: 'percent', value: 0.08 }, baselineFade: { kind: 'percent', value: 0.02 } },
    });
    expect(insight!.ranges[0]!.from).toBeGreaterThan(result.grid.length / 2);
    expect(insight!.ranges[0]!.to).toBe(result.grid.length);
  });

  it('stays quiet within 5 points of the baseline, or when either side is estimated', () => {
    expect(run({ cadenceFade: 0.05 }, { cadenceFade: 0.08 })).toEqual([]);
    expect(run({ cadenceFade: 0.08 }, { cadenceFade: -0.02 })).toEqual([]);
    expect(run({ cadenceFade: 0.02, walkingEstimated: true }, { cadenceFade: 0.08 })).toEqual([]);
    expect(run({ cadenceFade: 0.02 }, { cadenceFade: 0.08, walkingEstimated: true })).toEqual([]);
  });
});
