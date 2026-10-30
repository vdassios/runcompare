import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import cardiacDrift from './cardiacDrift';

/** The GPX fixtures with the decoupling of the 2024 baseline and the 2025 attempt set. */
function withDecoupling(baseline: number | null, attempt: number | null) {
  const { analysis } = loadFixture('gpx-two-attempts');
  const [b, a] = analysis.attempts;
  return {
    ...analysis,
    attempts: [
      { ...b!, metrics: { ...b!.metrics!, decoupling: baseline } },
      { ...a!, metrics: { ...a!.metrics!, decoupling: attempt } },
    ],
  };
}
const severities = (baseline: number | null, attempt: number | null) =>
  cardiacDrift.run(withDecoupling(baseline, attempt), DEFAULT_SETTINGS).map((i) => i.severity);

describe('cardiac-drift', () => {
  it('is warn 5 points above the baseline, strong above 10, and quiet below', () => {
    expect(severities(0.1, 0.17)).toEqual(['warn']);
    expect(severities(0.1, 0.22)).toEqual(['strong']);
    expect(severities(0.1, 0.13)).toEqual([]);
    expect(severities(0.2, 0.15)).toEqual([]);
    expect(severities(null, 0.3)).toEqual([]);
    expect(severities(0.1, null)).toEqual([]);
  });

  it('cites both decouplings and covers the second half of moving time', () => {
    const result = withDecoupling(0.1, 0.17);
    const [insight] = cardiacDrift.run(result, DEFAULT_SETTINGS);
    expect(insight).toMatchObject({
      id: 'cardiac-drift:trail-2025:0',
      values: {
        decoupling: { kind: 'percent', value: 0.17 },
        baselineDecoupling: { kind: 'percent', value: 0.1 },
      },
    });
    expect(insight!.template).toContain(result.attempts[0]!.label);
    const [range] = insight!.ranges;
    expect(range!.from).toBeGreaterThan(0);
    expect(range!.to).toBe(result.grid.length);
  });
});
