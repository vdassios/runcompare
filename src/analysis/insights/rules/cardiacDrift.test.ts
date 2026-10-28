import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import cardiacDrift from './cardiacDrift';

/** The GPX fixture with the 2025 attempt alone, its decoupling set to `decoupling`. */
function withDecoupling(decoupling: number | null) {
  const { analysis } = loadFixture('gpx-two-attempts');
  const a = analysis.attempts[1]!;
  return { ...analysis, attempts: [{ ...a, metrics: { ...a.metrics!, decoupling } }] };
}

describe('cardiac-drift', () => {
  it('is warn above 5 %, strong above 10 %, and quiet below', () => {
    expect(cardiacDrift.run(withDecoupling(0.07), DEFAULT_SETTINGS).map((i) => i.severity)).toEqual(['warn']);
    expect(cardiacDrift.run(withDecoupling(0.12), DEFAULT_SETTINGS).map((i) => i.severity)).toEqual(['strong']);
    expect(cardiacDrift.run(withDecoupling(0.03), DEFAULT_SETTINGS)).toEqual([]);
    expect(cardiacDrift.run(withDecoupling(null), DEFAULT_SETTINGS)).toEqual([]);
  });

  it('cites the decoupling and covers the second half of moving time', () => {
    const result = withDecoupling(0.07);
    const [insight] = cardiacDrift.run(result, DEFAULT_SETTINGS);
    expect(insight).toMatchObject({
      id: 'cardiac-drift:trail-2025:0',
      values: { decoupling: { kind: 'percent', value: 0.07 } },
    });
    const [range] = insight!.ranges;
    expect(range!.from).toBeGreaterThan(0);
    expect(range!.from).toBeLessThan(result.grid.length);
    expect(range!.to).toBe(result.grid.length);
  });
});
