import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type GpsAttempt } from '../model/types';
import { loadFixture } from '../test/fixtures';
import { analyze } from './pipeline';

describe('analyze on the FIT fixtures, 2024 as the baseline', () => {
  const { analysis } = loadFixture('fit-two-attempts');
  const [a2024, a2025] = analysis.attempts;

  it('keeps both attempts and gives 2025 the known ghost delta and elapsed difference', () => {
    expect(analysis.attempts.map((a) => a.attemptId)).toEqual(['trail-2024', 'trail-2025']);
    expect(analysis.warnings.filter((w) => w.code === 'low-overlap')).toEqual([]);
    expect(a2024!.delta).toBeNull();
    const delta = a2025!.delta!;
    expect(Math.abs(delta[delta.length - 1]! - 383)).toBeLessThanOrEqual(3);
    expect(a2025!.metrics!.elapsed - a2024!.metrics!.elapsed).toBe(545);
  });

  it('fills every series, metric and track the FIT streams support', () => {
    for (const a of analysis.attempts) {
      const { series, metrics } = a;
      expect(series.hr && series.cad && series.ele && series.gap && series.moving && series.walking).toBeTruthy();
      expect(metrics).toMatchObject({ walkingEstimated: false });
      for (const key of ['ascent', 'descent', 'avgHr', 'walkingShare', 'decoupling', 'cadenceFade'] as const) {
        expect(metrics![key], key).not.toBeNull();
      }
      expect(a.track!.d.length).toBe(a.track!.lat.length);
      expect(a.overlap).toBeGreaterThan(0.95);
    }
    expect(analysis.grid.ele && analysis.grid.grade).toBeTruthy();
    expect(analysis.warnings.filter((w) => w.code === 'missing-stream')).toEqual([]);
  });
});

describe('analyze on the GPX heads', () => {
  const { attempts, baseline } = loadFixture('gpx-two-attempts');

  it('rejects an attempt on another course with low-overlap and keeps the rest valid', () => {
    // 2 km due east, 1 sample/s at 3 m/s, about 100 km from the race.
    const n = 667;
    const t = Float64Array.from({ length: n }, (_, i) => i);
    const elsewhere: GpsAttempt = {
      id: 'elsewhere',
      kind: 'gps',
      label: 'Elsewhere',
      color: '#000000',
      activity: {
        source: 'gpx',
        fileName: 'elsewhere.gpx',
        startTime: 0,
        t,
        dist: t.map((s) => 3 * s),
        lat: t.map(() => 41),
        lon: t.map((s) => 22 + (3 * s) / 84_000),
        ele: null,
        hr: null,
        cad: null,
        speed: null,
        power: null,
        temp: null,
        laps: [],
        deviceSummary: { elapsed: null, distance: null, ascent: null, descent: null },
      },
    };
    const result = analyze({ attempts: [...attempts, elsewhere], baseline, settings: DEFAULT_SETTINGS });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'low-overlap', attemptId: 'elsewhere' }));
    expect(result.attempts.map((a) => a.attemptId)).toEqual(['trail-2024', 'trail-2025']);
    expect(result.attempts[1]!.delta!.length).toBe(result.grid.d.length);
  });

  it('returns an empty grid with invalid-baseline when the baseline is not a GPS attempt', () => {
    const result = analyze({ attempts, baseline: { kind: 'course', attemptId: 'nope' }, settings: DEFAULT_SETTINGS });
    expect(result.grid.d.length).toBe(0);
    expect(result.attempts).toEqual([]);
    expect(result.warnings.map((w) => w.code)).toEqual(['invalid-baseline']);
  });
});
