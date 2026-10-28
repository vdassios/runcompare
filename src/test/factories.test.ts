import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttemptAnalysis } from '../model/types';
import { SCENARIOS, createRng, makeActivity, makeAnalysisResult, makeSplitSet, profileSegments } from './factories';

afterEach(() => vi.restoreAllMocks());

function isIncreasing(values: ArrayLike<number>, strict: boolean): boolean {
  for (let i = 1; i < values.length; i++) {
    if (strict ? !(values[i]! > values[i - 1]!) : !(values[i]! >= values[i - 1]!)) return false;
  }
  return true;
}

function gridArrays(a: AttemptAnalysis) {
  const s = a.series;
  return {
    time: s.time,
    ele: s.ele,
    hr: s.hr,
    cad: s.cad,
    pace: s.pace,
    gap: s.gap,
    moving: s.moving,
    walking: s.walking,
    offCourse: s.offCourse,
    estimated: s.estimated,
    delta: a.delta,
  };
}

describe('createRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const values = Array.from({ length: 1000 }, () => a());
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createRng(43)()).not.toBe(values[0]);
  });
});

describe.each(SCENARIOS.map((s) => [s.name, s] as const))('%s', (name, scenario) => {
  const data = scenario.build();
  const { analysis, attempts, baseline } = data;
  const n = analysis.grid.d.length;

  it('never uses Math.random and is deterministic', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random used');
    });
    expect(makeAnalysisResult(name)).toEqual(data);
  });

  it('has a grid from 0 to its length in steps', () => {
    const { d, step, length } = analysis.grid;
    expect(d[0]).toBe(0);
    expect(d[n - 1]).toBe(length);
    expect(isIncreasing(d, true)).toBe(true);
    for (let i = 1; i < n - 1; i++) expect(d[i]! - d[i - 1]!).toBeCloseTo(step, 9);
    for (const key of ['ele', 'grade', 'lat', 'lon'] as const) {
      const arr = analysis.grid[key];
      if (arr) expect(arr.length, key).toBe(n);
    }
  });

  it('gives every grid array the grid length', () => {
    for (const a of analysis.attempts) {
      for (const [key, arr] of Object.entries(gridArrays(a))) {
        if (arr) expect(arr.length, `${a.attemptId}.${key}`).toBe(n);
      }
    }
  });

  it('has a null delta only for the baseline', () => {
    for (const a of analysis.attempts) {
      if (a.attemptId === baseline.attemptId) expect(a.delta).toBeNull();
      else expect(a.delta).not.toBeNull();
    }
    expect(analysis.attempts.some((a) => a.attemptId === baseline.attemptId)).toBe(true);
  });

  it('has monotonic time arrays', () => {
    for (const a of analysis.attempts) {
      expect(a.series.time[0]).toBe(0);
      expect(isIncreasing(a.series.time, true), a.attemptId).toBe(true);
    }
    for (const a of attempts) {
      if (a.kind === 'gps') {
        expect(isIncreasing(a.activity.t, true)).toBe(true);
        expect(isIncreasing(a.activity.dist, false)).toBe(true);
      } else {
        expect(
          isIncreasing(
            a.splitSet.markers.map((m) => m.time),
            true,
          ),
        ).toBe(true);
        expect(
          isIncreasing(
            a.splitSet.markers.map((m) => m.distance),
            true,
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps attempts, analysis and baseline consistent', () => {
    expect(analysis.baseline).toEqual(baseline);
    expect(analysis.attempts.map((a) => [a.attemptId, a.label, a.color, a.kind])).toEqual(
      attempts.map((a) => [a.id, a.label, a.color, a.kind]),
    );
    const ids = new Set(attempts.map((a) => a.id));
    for (const insight of analysis.insights) expect(ids.has(insight.attemptId)).toBe(true);
    for (const w of analysis.warnings) if (w.attemptId) expect(ids.has(w.attemptId)).toBe(true);
    for (const a of analysis.attempts) {
      for (let i = 0; i < n; i++) {
        if (a.delta && !Number.isNaN(a.delta[i]!)) {
          const base = analysis.attempts.find((b) => b.attemptId === baseline.attemptId)!;
          expect(a.delta[i]).toBeCloseTo(a.series.time[i]! - base.series.time[i]!, 6);
        }
      }
    }
  });
});

describe('synthetic-two-attempts', () => {
  const { analysis, attempts } = makeAnalysisResult('synthetic-two-attempts');
  const second = analysis.attempts[1]!;

  it('has two FIT attempts with every stream on 12 km', () => {
    expect(analysis.grid.length).toBe(12_000);
    expect(attempts).toHaveLength(2);
    for (const a of attempts) {
      if (a.kind !== 'gps') throw new Error('expected GPS attempts');
      expect(a.activity.source).toBe('fit');
      for (const key of ['lat', 'lon', 'ele', 'hr', 'cad', 'speed', 'power', 'temp'] as const) {
        expect(a.activity[key], key).not.toBeNull();
      }
    }
  });

  it('puts the second attempt 3:20 behind at the finish', () => {
    expect(second.delta![second.delta!.length - 1]).toBeCloseTo(200, 6);
    expect(second.metrics!.elapsed - analysis.attempts[0]!.metrics!.elapsed).toBeCloseTo(200, 6);
  });

  it('has a lap every km', () => {
    for (const a of analysis.attempts) {
      expect(a.laps.map((l) => [l.from, l.to])).toEqual(
        Array.from({ length: 12 }, (_, k) => [k * 1000, (k + 1) * 1000]),
      );
      expect(a.laps.at(-1)!.trigger).toBe('session_end');
    }
  });

  it('has two climbs and one descent', () => {
    expect(analysis.segments.map((s) => [s.kind, s.from, s.to])).toEqual([
      ['climb', 2000, 4000],
      ['descent', 5000, 6500],
      ['climb', 8000, 9500],
    ]);
    for (const s of analysis.segments) {
      expect(s.avgGrade).toBeCloseTo(s.elevationChange / (s.to - s.from), 9);
      const ele = analysis.grid.ele!;
      expect(ele[s.to / 10]! - ele[s.from / 10]!).toBeCloseTo(s.elevationChange, 3);
    }
  });

  it('has one insight per severity', () => {
    expect(analysis.insights.map((i) => i.severity).sort()).toEqual(['info', 'strong', 'warn']);
    for (const insight of analysis.insights) {
      if (insight.values.delta) expect(insight.values.delta.value, insight.ruleId).toBeGreaterThan(0);
      for (const key of insight.template.match(/\{(\w+)\}/g) ?? [])
        expect(insight.values).toHaveProperty(key.slice(1, -1));
    }
  });

  it('has full overlap and no off-course points', () => {
    for (const a of analysis.attempts) {
      expect(a.overlap).toBe(1);
      expect(a.series.offCourse.every((v) => v === 0)).toBe(true);
    }
  });
});

describe('synthetic-gpx', () => {
  const { analysis, attempts } = makeAnalysisResult('synthetic-gpx');

  it('has no cadence, power or temperature, and estimated walking', () => {
    for (const a of attempts) {
      if (a.kind !== 'gps') throw new Error('expected GPS attempts');
      expect(a.activity.source).toBe('gpx');
      expect([a.activity.cad, a.activity.power, a.activity.temp]).toEqual([null, null, null]);
    }
    for (const a of analysis.attempts) {
      expect(a.series.cad).toBeNull();
      expect(a.metrics!.walkingEstimated).toBe(true);
      expect(a.metrics!.cadenceFade).toBeNull();
      expect(a.metrics!.walkingShare).toBeGreaterThan(0);
    }
  });
});

describe('synthetic-splits-only', () => {
  const { analysis, baseline } = makeAnalysisResult('synthetic-splits-only');

  it('uses a 10K distance baseline with two split-set attempts', () => {
    expect(baseline).toMatchObject({ kind: 'distance', preset: '10k', distance: 10_000 });
    expect(analysis.attempts.map((a) => a.kind)).toEqual(['splits', 'splits']);
    expect(analysis.grid).toMatchObject({ length: 10_000, ele: null, grade: null, lat: null, lon: null });
    for (const a of analysis.attempts) {
      expect(a.track).toBeNull();
      expect(a.metrics).toBeNull();
      expect(a.markers).not.toBeNull();
      expect(a.series.time.at(-1)).toBe(a.markers!.at(-1)!.time);
    }
  });
});

describe('synthetic-off-course', () => {
  const { analysis, attempts } = makeAnalysisResult('synthetic-off-course');
  const second = analysis.attempts[1]!;

  it('flags 600 m off course at 5 km with overlap 0.95', () => {
    expect(second.overlap).toBeCloseTo(0.95, 9);
    const d = analysis.grid.d;
    const flagged = d.filter((_, i) => second.series.offCourse[i] === 1);
    expect(flagged[0]).toBe(5000);
    expect(flagged.at(-1)).toBe(5600);
    expect(analysis.warnings.map((w) => [w.code, w.attemptId])).toEqual([['off-course', 'a2']]);
  });

  it('has NaN delta only on the off-course stretch, and a continuous time series', () => {
    second.delta!.forEach((v, i) => expect(Number.isNaN(v)).toBe(second.series.offCourse[i] === 1));
    expect(second.series.time.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('moves the track away from the course on that stretch', () => {
    const a = attempts[1]!;
    if (a.kind !== 'gps') throw new Error('expected GPS attempt');
    const i = a.activity.dist.findIndex((d) => d >= 5300);
    const g = 530;
    const grid = analysis.grid;
    const dLat = (a.activity.lat![i]! - grid.lat![g]!) * 111_320;
    expect(Math.abs(dLat)).toBeGreaterThan(50);
  });
});

describe('makeActivity', () => {
  it('honours the streams option and ends exactly at the length', () => {
    const a = makeActivity({ length: 3000, streams: { hr: false, power: false, latlon: false } });
    expect(a.dist[a.dist.length - 1]).toBe(3000);
    expect([a.hr, a.power, a.lat, a.lon]).toEqual([null, null, null, null]);
    expect(a.cad).not.toBeNull();
    expect(a.t.length).toBe(a.dist.length);
  });

  it('slows down in a fast-start profile', () => {
    const a = makeActivity({ length: 8000, pace: 'fast-start', seed: 3 });
    const half = a.dist.findIndex((d) => d >= 4000);
    const firstHalf = a.t[half]!;
    const secondHalf = a.t[a.t.length - 1]! - firstHalf;
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  it('builds the climbs of each profile', () => {
    expect(profileSegments('flat', 10_000)).toEqual([]);
    expect(profileSegments('one-climb', 10_000).map((s) => s.kind)).toEqual(['climb']);
  });
});

describe('makeSplitSet', () => {
  it('places markers every interval up to the distance', () => {
    const s = makeSplitSet({ distance: 5000, every: 1000, pace: 0.3, jitter: 0 });
    expect(s.markers).toEqual([1, 2, 3, 4, 5].map((k) => ({ distance: k * 1000, time: k * 300 })));
    expect(s).toMatchObject({ officialDistance: null, interpolation: 'linear' });
  });

  it('adds a final short marker when the distance is not a multiple', () => {
    const s = makeSplitSet({ distance: 21_097.5, every: 5000 });
    expect(s.markers.map((m) => m.distance)).toEqual([5000, 10_000, 15_000, 20_000, 21_097.5]);
  });
});
