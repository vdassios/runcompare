import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Activity, type GpsAttempt, type SplitsAttempt } from '../model/types';
import { PRO_SPLIT_SET, loadFixture } from '../test/fixtures';
import { interpolateAt } from './interp';
import { analyze } from './pipeline';
import { targetTimeSplitSet } from './splitSets';

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

describe('analyze with a pro split set on the 2024 course (fit-vs-pro)', () => {
  const { attempts, analysis } = loadFixture('fit-vs-pro');
  const m1 = loadFixture('fit-two-attempts').analysis;
  const pro = analysis.attempts.find((a) => a.attemptId === 'pro')!;

  it('puts the pro on the course at the marker times, at the rescaled marker positions', () => {
    const { grid } = analysis;
    const scale = grid.length / PRO_SPLIT_SET.officialDistance!;
    expect(pro.markers!.map((m) => m.time)).toEqual(PRO_SPLIT_SET.markers.map((m) => m.time));
    pro.markers!.forEach((m, i) => {
      expect(m.distance).toBeCloseTo(PRO_SPLIT_SET.markers[i]!.distance * scale, 6);
      // A marker inside a grid cell is a kink the grid can't resolve: the pace changes there.
      expect(Math.abs(interpolateAt(grid.d, pro.series.time, m.distance) - m.time)).toBeLessThan(0.5);
    });
    expect(pro.series.time[pro.series.time.length - 1]).toBe(5.5 * 3600);
    expect(pro).toMatchObject({ kind: 'splits', metrics: null, track: null, laps: [], overlap: null });
    expect(pro.series.gap).not.toBeNull();
    expect(pro.delta!.length).toBe(grid.d.length);
  });

  it('leaves the 2024 baseline and the 2025 attempt as they were in M1', () => {
    expect(analysis.attempts.map((a) => a.attemptId)).toEqual(['trail-2024', 'trail-2025', 'pro']);
    expect(analysis.grid).toEqual(m1.grid);
    for (const [i, a] of m1.attempts.entries()) {
      expect(analysis.attempts[i]!.series).toEqual(a.series);
      expect(analysis.attempts[i]!.delta).toEqual(a.delta);
    }
    expect(analysis.warnings).toEqual(m1.warnings);
  });

  it('rejects a course baseline that points to the split set', () => {
    const result = analyze({ attempts, baseline: { kind: 'course', attemptId: 'pro' }, settings: DEFAULT_SETTINGS });
    expect(result.grid.d.length).toBe(0);
    expect(result.attempts).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'invalid-baseline', attemptId: 'pro' })]);
  });

  it('rejects a distance baseline that points to a GPS attempt', () => {
    const baseline = { kind: 'distance', attemptId: 'trail-2024', preset: 'custom', distance: 54_000 } as const;
    const result = analyze({ attempts, baseline, settings: DEFAULT_SETTINGS });
    expect(result.grid.d.length).toBe(0);
    expect(result.warnings.map((w) => w.code)).toEqual(['invalid-baseline']);
  });
});

describe('analyze on a distance baseline', () => {
  it('scales a GPS attempt to finish exactly at the distance, with its own grade', () => {
    const a2024 = loadFixture('fit-two-attempts').attempts[0]!;
    const cut: GpsAttempt = { ...a2024, id: 'cut', activity: cutTo(a2024.activity, 10_000) };
    const target: SplitsAttempt = {
      id: 'target',
      kind: 'splits',
      label: 'Target',
      color: '#009e73',
      splitSet: targetTimeSplitSet(10_000, 3600),
    };
    const result = analyze({
      attempts: [target, cut],
      baseline: { kind: 'distance', attemptId: 'target', preset: '10k', distance: 10_000 },
      settings: DEFAULT_SETTINGS,
    });

    expect(result.warnings).toEqual([expect.objectContaining({ code: 'distance-scaling', attemptId: 'cut' })]);
    expect(result.grid).toMatchObject({ length: 10_000, ele: null, grade: null, lat: null, lon: null });
    const [baseline, attempt] = result.attempts;
    expect(baseline!.delta).toBeNull();
    const d = attempt!.track!.d;
    expect(d[d.length - 1]).toBe(10_000);
    expect(attempt!.overlap).toBe(1);
    expect(attempt!.series.gap).not.toBeNull();
    expect(attempt!.metrics).not.toBeNull();
    const finish = cut.activity.t[cut.activity.t.length - 1]!;
    const last = attempt!.series.time.length - 1;
    expect(attempt!.series.time[last]).toBe(finish);
    expect(attempt!.delta![last]).toBe(finish - 3600);
  });

  it('compares split sets alone on a flat grid, interpolated linearly', () => {
    const { analysis } = loadFixture('splits-only-10k');
    expect(analysis.warnings).toEqual([]);
    expect(analysis.attempts.map((a) => a.attemptId)).toEqual(['target', 'pro']);
    const pro = analysis.attempts[1]!;
    const { d } = analysis.grid;
    expect(pro.series.gap).toBeNull();
    expect(pro.series.time[d.indexOf(2500)]).toBeCloseTo(850 / 2, 9);
    expect(pro.series.time[d.indexOf(5000)]).toBeCloseTo(850, 9);
    expect(pro.delta![d.length - 1]).toBeCloseTo(1710 - 2400, 9);
  });
});

/** The activity up to `metres` of its own distance, as if the watch had stopped there. */
function cutTo(activity: Activity, metres: number): Activity {
  const n = activity.dist.findIndex((x) => x > metres);
  const head = <T extends Float32Array | Float64Array>(xs: T): T => xs.slice(0, n) as T;
  const optional = <T extends Float32Array | Float64Array>(xs: T | null): T | null => xs && head(xs);
  return {
    ...activity,
    t: head(activity.t),
    dist: head(activity.dist),
    lat: optional(activity.lat),
    lon: optional(activity.lon),
    ele: optional(activity.ele),
    hr: optional(activity.hr),
    cad: optional(activity.cad),
    speed: optional(activity.speed),
    power: optional(activity.power),
    temp: optional(activity.temp),
    laps: [],
  };
}
