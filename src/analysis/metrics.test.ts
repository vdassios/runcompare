/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Decoder, Stream } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Activity } from '../model/types';
import { gapPace } from './gap';
import { computeMetrics, gradePerSample, movementFlags } from './metrics';

/** A 1 Hz activity of `seconds` s; `speed(k)` m/s at each sample sets the distance too. */
function activity(seconds: number, speed: (k: number) => number, streams: Partial<Activity> = {}): Activity {
  const n = seconds + 1;
  const v = Float32Array.from({ length: n }, (_, k) => speed(k));
  const dist = new Float64Array(n);
  for (let k = 1; k < n; k++) dist[k] = dist[k - 1]! + v[k]!;
  return {
    source: 'fit',
    fileName: 'synthetic.fit',
    startTime: 0,
    t: Float64Array.from({ length: n }, (_, k) => k),
    dist,
    lat: null,
    lon: null,
    ele: null,
    hr: null,
    cad: null,
    speed: v,
    power: null,
    temp: null,
    laps: [],
    deviceSummary: { elapsed: null, distance: null, ascent: null, descent: null },
    ...streams,
  };
}

const perSample = (a: Activity, value: (k: number) => number): Float32Array =>
  Float32Array.from({ length: a.t.length }, (_, k) => value(k));

const inRange = (k: number, from: number, to: number): boolean => k >= from && k < to;

// 2 h at 3 m/s with two 5-minute stops and two short dips (5 s and 9 s).
const withStops = (k: number): number => {
  if (inRange(k, 1001, 1301) || inRange(k, 4001, 4301)) return 0;
  if (inRange(k, 2000, 2005) || inRange(k, 3000, 3009)) return 0.2;
  return 3;
};

describe('movementFlags and stopped time', () => {
  it('counts two 5-minute stops and ignores dips under 10 s', () => {
    const a = activity(7200, withStops);
    const m = computeMetrics(a, movementFlags(a, null, DEFAULT_SETTINGS), null);
    expect(m.elapsed).toBe(7200);
    expect(m.stopped).toBe(600);
    expect(m.moving).toBe(6600);
    expect(m.distance).toBe(a.dist[7200]);
  });

  it('derives speed from distance and time when the device has none', () => {
    const a = { ...activity(7200, withStops), speed: null };
    const m = computeMetrics(a, movementFlags(a, null, DEFAULT_SETTINGS), null);
    expect(Math.abs(m.stopped - 600)).toBeLessThan(10);
  });

  it('counts a 20-minute stretch at 110 spm as walking', () => {
    const base = activity(7200, () => 3);
    const a = { ...base, cad: perSample(base, (k) => (inRange(k, 3001, 4201) ? 110 : 170)) };
    const flags = movementFlags(a, null, DEFAULT_SETTINGS);
    expect(flags.walkingEstimated).toBe(false);
    expect(computeMetrics(a, flags, null).walkingShare).toBeCloseTo(1200 / 7200, 9);
  });

  it('estimates walking without cadence: 1.2 m/s on a 15 % grade, not on the flat', () => {
    const a = activity(600, () => 1.2);
    const steep = movementFlags(
      a,
      perSample(a, () => 0.15),
      DEFAULT_SETTINGS,
    );
    expect(steep.walkingEstimated).toBe(true);
    expect(computeMetrics(a, steep, null).walkingShare).toBe(1);
    const flat = movementFlags(
      a,
      perSample(a, () => 0),
      DEFAULT_SETTINGS,
    );
    expect(computeMetrics(a, flat, null).walkingShare).toBe(0);
  });

  it('has no walking with neither cadence nor grade', () => {
    const a = activity(600, () => 3);
    const flags = movementFlags(a, null, DEFAULT_SETTINGS);
    expect(flags.walking).toBeNull();
    expect(computeMetrics(a, flags, null).walkingShare).toBeNull();
  });
});

describe('computeMetrics', () => {
  it('averages HR over moving time only', () => {
    const base = activity(7200, withStops);
    const a = { ...base, hr: perSample(base, (k) => (base.speed![k]! === 0 ? 90 : 150)) };
    expect(computeMetrics(a, movementFlags(a, null, DEFAULT_SETTINGS), null).avgHr).toBeCloseTo(150, 9);
  });

  it('gives ≈ 0.09 decoupling when HR rises 10 % in the second half at constant GAP', () => {
    const a = activity(7200, () => 3);
    const flags = movementFlags(a, null, DEFAULT_SETTINGS);
    const gap = perSample(a, () => 1 / 3);
    const rising = { ...a, hr: perSample(a, (k) => (k <= 3600 ? 150 : 165)) };
    expect(computeMetrics(rising, flags, gap).decoupling).toBeCloseTo(0.09, 2);
    const steady = { ...a, hr: perSample(a, () => 150) };
    expect(computeMetrics(steady, flags, gap).decoupling).toBeCloseTo(0, 9);
    expect(computeMetrics(steady, flags, null).decoupling).toBeNull();
    expect(computeMetrics(a, flags, gap).decoupling).toBeNull();
  });

  it('measures cadence fade over running samples, last quarter against the first', () => {
    const base = activity(7200, () => 3);
    const cad = (k: number): number => {
      if (inRange(k, 6000, 6600)) return 100; // walking, left out
      return k <= 1800 ? 180 : 171;
    };
    const a = { ...base, cad: perSample(base, cad) };
    const m = computeMetrics(a, movementFlags(a, null, DEFAULT_SETTINGS), null);
    expect(m.cadenceFade).toBeCloseTo(0.05, 6);
    expect(computeMetrics(base, movementFlags(base, null, DEFAULT_SETTINGS), null).cadenceFade).toBeNull();
  });

  it('takes ascent and descent from its own elevation, null without it', () => {
    const base = activity(2500, () => 2);
    // Flat, up 100 m, flat, down 40 m, flat.
    const profile = (x: number): number =>
      200 + 0.05 * Math.min(2000, Math.max(0, x - 500)) - 0.04 * Math.min(1000, Math.max(0, x - 3000));
    const a = { ...base, ele: Float32Array.from(base.dist, profile) };
    const m = computeMetrics(a, movementFlags(a, null, DEFAULT_SETTINGS), null);
    expect(m.ascent).toBeCloseTo(100, 0);
    expect(m.descent).toBeCloseTo(40, 0);
    const none = computeMetrics(base, movementFlags(base, null, DEFAULT_SETTINGS), null);
    expect(none.ascent).toBeNull();
    expect(none.descent).toBeNull();
    expect(none.avgHr).toBeNull();
  });
});

describe('gradePerSample', () => {
  it('maps the smoothed grade back onto the samples', () => {
    const base = activity(1000, () => 2);
    const grade = gradePerSample({ ...base, ele: Float32Array.from(base.dist, (x) => 300 + x * 0.08) })!;
    expect(grade).toHaveLength(base.t.length);
    for (const g of grade.subarray(50, 950)) expect(g).toBeCloseTo(0.08, 5);
    expect(gradePerSample(base)).toBeNull();
  });
});

/** Decodes a fixture FIT into an Activity, the way task 03's parser will (PLAN §5.1). */
function loadFit(name: string): Activity {
  const bytes = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', name));
  const { messages } = new Decoder(Stream.fromBuffer(bytes)).read();
  const session = messages.sessionMesgs?.[0];
  const records = (messages.recordMesgs ?? []).filter((r) => r.timestamp instanceof Date);
  const start = (records[0]!.timestamp as Date).getTime();

  const t: number[] = [];
  const dist: number[] = [];
  const ele: number[] = [];
  const hr: number[] = [];
  const cad: number[] = [];
  const speed: number[] = [];
  for (const r of records) {
    const s = ((r.timestamp as Date).getTime() - start) / 1000;
    if (t.length > 0 && s <= t[t.length - 1]!) continue;
    t.push(s);
    dist.push(r.distance ?? dist[dist.length - 1] ?? 0);
    ele.push(r.enhancedAltitude ?? r.altitude ?? NaN);
    hr.push(r.heartRate ?? NaN);
    cad.push(r.cadence === undefined ? NaN : (r.cadence + (r.fractionalCadence ?? 0)) * 2);
    speed.push(r.enhancedSpeed ?? r.speed ?? NaN);
  }
  const stream = (xs: number[]): Float32Array | null => (xs.some(Number.isFinite) ? Float32Array.from(xs) : null);

  return {
    source: 'fit',
    fileName: name,
    startTime: start,
    t: Float64Array.from(t),
    dist: Float64Array.from(dist),
    lat: null,
    lon: null,
    ele: stream(ele),
    hr: stream(hr),
    cad: stream(cad),
    speed: stream(speed),
    power: null,
    temp: null,
    laps: [],
    deviceSummary: {
      elapsed: session?.totalElapsedTime ?? null,
      distance: session?.totalDistance ?? null,
      ascent: session?.totalAscent ?? null,
      descent: session?.totalDescent ?? null,
    },
  };
}

describe('fixtures', () => {
  const races = ['trail-2024.fit', 'trail-2025.fit'].map((name) => {
    const a = loadFit(name);
    const grade = gradePerSample(a);
    const flags = movementFlags(a, grade, DEFAULT_SETTINGS);
    const gap =
      a.speed && grade
        ? gapPace(
            a.speed.map((v) => 1 / v),
            grade,
          )
        : null;
    const metrics = computeMetrics(a, flags, gap);
    console.log(
      `${name}: moving ${((100 * metrics.moving) / metrics.elapsed).toFixed(1)} %, ` +
        `stopped ${((100 * metrics.stopped) / metrics.elapsed).toFixed(1)} %, ` +
        `walking ${(100 * metrics.walkingShare!).toFixed(1)} % of moving`,
      metrics,
    );
    return { a, metrics };
  });
  const [r2024, r2025] = races;

  it('trail-2024 ascent is within 10 % of the device summary', () => {
    const device = r2024!.a.deviceSummary.ascent ?? 2780;
    expect(Math.abs(r2024!.metrics.ascent! - device) / device).toBeLessThan(0.1);
  });

  it('trail-2025 elapsed is 26,279 s', () => {
    expect(r2025!.metrics.elapsed).toBe(26279);
  });

  it('has every metric for a FIT race with all streams', () => {
    for (const { metrics } of races) {
      expect(metrics.walkingEstimated).toBe(false);
      for (const v of [metrics.avgHr, metrics.walkingShare, metrics.decoupling, metrics.cadenceFade]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
