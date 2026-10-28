/// <reference types="node" />
import { Decoder, Stream } from '@garmin/fitsdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Activity } from '../model/types';
import { gapFactor } from './gap';
import { buildCourseGrid, buildDistanceGrid, computeDelta, resampleAttempt, resampleFlags } from './grid';

/** An Activity with only the given streams; everything else is absent. */
function activity(t: ArrayLike<number>, dist: ArrayLike<number>, ele?: ArrayLike<number>): Activity {
  return {
    source: 'fit',
    fileName: 'synthetic.fit',
    startTime: 0,
    t: Float64Array.from(t),
    dist: Float64Array.from(dist),
    lat: null,
    lon: null,
    ele: ele ? Float32Array.from(ele) : null,
    hr: null,
    cad: null,
    speed: null,
    power: null,
    temp: null,
    laps: [],
    deviceSummary: { elapsed: null, distance: null, ascent: null, descent: null },
  };
}

/** Steady 3 m/s for `seconds`, sampled every second. */
function steady(seconds: number, grade = 0): Activity {
  const t = Array.from({ length: seconds + 1 }, (_, i) => i);
  return activity(
    t,
    t.map((s) => 3 * s),
    t.map((s) => 3 * s * grade),
  );
}

const onCourse = (a: Activity) => new Uint8Array(a.t.length);

/**
 * Minimal FIT decode until task 03's parser lands: t, dist, lat/lon, ele, hr and cad, with NaN
 * for a record that lacks the field (as the parser contract says).
 */
function loadFit(name: string): Activity {
  const bytes = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', name));
  const records = new Decoder(Stream.fromBuffer(bytes)).read().messages.recordMesgs as Record<string, unknown>[];
  const num = (r: Record<string, unknown>, key: string, scale = 1) => {
    const v = r[key];
    return typeof v === 'number' ? v * scale : NaN;
  };
  const start = (records[0]!.timestamp as Date).getTime();
  const semicircle = 180 / 2 ** 31;
  return {
    ...activity(
      records.map((r) => ((r.timestamp as Date).getTime() - start) / 1000),
      records.map((r) => num(r, 'distance')),
      records.map((r) => num(r, 'enhancedAltitude')),
    ),
    fileName: name,
    startTime: start,
    lat: Float64Array.from(records, (r) => num(r, 'positionLat', semicircle)),
    lon: Float64Array.from(records, (r) => num(r, 'positionLong', semicircle)),
    hr: Float32Array.from(records, (r) => num(r, 'heartRate')),
    cad: Float32Array.from(records, (r) => num(r, 'cadence', 2) + (num(r, 'fractionalCadence', 2) || 0)),
  };
}

describe('buildDistanceGrid', () => {
  it('steps from 0 and ends exactly at the length', () => {
    const grid = buildDistanceGrid(37, 10);
    expect(Array.from(grid.d)).toEqual([0, 10, 20, 30, 37]);
    expect(grid).toMatchObject({ step: 10, length: 37, ele: null, grade: null, lat: null, lon: null });
    expect(Array.from(buildDistanceGrid(30, 10).d)).toEqual([0, 10, 20, 30]);
  });
});

describe('buildCourseGrid', () => {
  it('takes elevation, grade and position from the baseline', () => {
    const base = { ...steady(400, 0.1), lat: Float64Array.from({ length: 401 }, (_, i) => 40 + i * 1e-5) };
    base.lon = base.lat.map((v) => v + 22);
    const grid = buildCourseGrid(base, 10);
    expect(grid.length).toBe(1200);
    expect(grid.d.length).toBe(121);
    expect(grid.ele![60]).toBeCloseTo(60, 3);
    expect(grid.grade![60]).toBeCloseTo(0.1, 5);
    expect(grid.lat![1]).toBeCloseTo(40 + 10 / 3e5, 10);
    expect(grid.lon![120]).toBeCloseTo(62.004, 10);
  });

  it('has no elevation or position when the baseline lacks them', () => {
    const grid = buildCourseGrid(activity([0, 1, 2], [0, 4, 9]), 10);
    expect(Array.from(grid.d)).toEqual([0, 9]);
    expect(grid).toMatchObject({ ele: null, grade: null, lat: null, lon: null });
  });
});

describe('resampleAttempt', () => {
  it('gives d/3 and a pace of 1/3 s/m at a steady 3 m/s', () => {
    const run = steady(1000);
    const grid = buildDistanceGrid(3000, 10);
    const s = resampleAttempt(run, run.dist, onCourse(run), grid);
    grid.d.forEach((d, k) => {
      expect(s.time[k]).toBeCloseTo(d / 3, 2);
      expect(s.pace[k]).toBeCloseTo(1 / 3, 5);
    });
    expect(s).toMatchObject({ hr: null, cad: null, moving: null, walking: null });
    expect(s.estimated).toEqual(new Uint8Array(grid.d.length));
  });

  it('shows a 60 s stop at 500 m as a time jump with a pace spike within ±50 m', () => {
    // 3 m/s with a 60 s stop once 500 m is reached (at t = 500/3 s).
    const t = Array.from({ length: 600 }, (_, i) => i);
    const stopped = (s: number) => Math.min(Math.max(s - 500 / 3, 0), 60);
    const run = activity(
      t,
      t.map((s) => 3 * (s - stopped(s))),
    );
    const grid = buildDistanceGrid(1200, 10);
    const s = resampleAttempt(run, run.dist, onCourse(run), grid);

    expect(s.time[51]! - s.time[50]! - 10 / 3).toBeCloseTo(60, 0);
    expect(s.time[50]! - s.time[49]!).toBeCloseTo(10 / 3, 0);
    grid.d.forEach((d, k) => {
      if (d > 450 && d <= 550) expect(s.pace[k]).toBeGreaterThan(0.9);
      else expect(s.pace[k]).toBeCloseTo(1 / 3, 2);
    });
  });

  it('adjusts pace with the grid grade on a 10 % climb', () => {
    const run = steady(1000, 0.1);
    const grid = buildCourseGrid(run, 10);
    const s = resampleAttempt(run, run.dist, onCourse(run), grid);
    for (let k = 10; k < grid.d.length - 10; k++) {
      expect(s.gap![k]).toBeCloseTo(s.pace[k]! / 1.659, 3);
    }
    expect(s.ele![150]).toBeCloseTo(150, 0);
  });

  it('falls back to its own grade on a distance grid, and has no gap without elevation', () => {
    const run = steady(1000, 0.1);
    const grid = buildDistanceGrid(3000, 10);
    const s = resampleAttempt(run, run.dist, onCourse(run), grid);
    expect(s.gap![150]).toBeCloseTo(s.pace[150]! / gapFactor(0.1), 5);

    const flat = { ...run, ele: null };
    expect(resampleAttempt(flat, flat.dist, onCourse(flat), grid).gap).toBeNull();
  });

  it('smooths HR over 5 s and samples it at the arrival time', () => {
    const run = { ...steady(20), hr: Float32Array.from({ length: 21 }, (_, i) => (i % 2 ? 150 : 140)) };
    const s = resampleAttempt(run, run.dist, onCourse(run), buildDistanceGrid(60, 10));
    // Samples 1–5 around arrival at 10 m (t = 10/3): three 140s and two 150s, then interpolated.
    expect(s.hr![1]).toBeGreaterThan(143);
    expect(s.hr![1]).toBeLessThan(147);
  });

  it('flags a cell off-course when any of its samples is', () => {
    const run = activity([0, 1, 2, 3, 4, 5, 6], [0, 4, 8, 12, 16, 25, 50]);
    const off = Uint8Array.from([0, 0, 0, 1, 0, 1, 1]);
    // Cells around 0, 10, 20, 30 m hold [0,0] [0,1] [0] [1] (25 m is a tie, so it goes to 30 m).
    // 40 m is empty and takes the flag of the 50 m sample, the first to reach it.
    const grid = buildDistanceGrid(50, 10);
    expect(Array.from(resampleAttempt(run, run.dist, off, grid).offCourse)).toEqual([0, 1, 0, 1, 1, 1]);
  });
});

describe('resampleFlags', () => {
  it('takes the majority per cell, 0 on a tie, the next sample in an empty cell', () => {
    const courseDist = Float64Array.from([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, NaN, 41]);
    const flags = Uint8Array.from([1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1]);
    // Cells around 0, 10, 20 m hold [1,1,0] [1,0,1,0,0] [1,0] (a tie); the NaN sample is ignored.
    // 30 and 40 m are empty and take the flag of the 41 m sample, which also fills the 41 m cell.
    const grid = buildDistanceGrid(41, 10);
    expect(Array.from(resampleFlags(flags, courseDist, grid))).toEqual([1, 0, 0, 1, 1, 1]);
  });
});

describe('computeDelta', () => {
  it('is attempt time minus baseline time', () => {
    const run = steady(100);
    const series = resampleAttempt(run, run.dist, onCourse(run), buildDistanceGrid(300, 100)); // 0, 33⅓, 66⅔, 100 s
    const delta = computeDelta(series, Float64Array.from([0, 30, 70, 90]));
    [0, 10 / 3, -10 / 3, 10].forEach((x, k) => expect(delta[k]).toBeCloseTo(x, 9));
  });
});

describe('on the race fixtures', () => {
  const y2024 = loadFit('trail-2024.fit');
  const y2025 = loadFit('trail-2025.fit');
  const grid = buildCourseGrid(y2024, 10);

  it('builds a 10 m grid over the 2024 course', () => {
    expect(grid.length).toBe(54126);
    expect(grid.d.length).toBe(5414);
    expect(grid.d[grid.d.length - 1]).toBe(grid.length);
    for (let k = 1; k < grid.d.length; k++) expect(grid.d[k]).toBeGreaterThan(grid.d[k - 1]!);
    expect(grid.grade!.every(Number.isFinite)).toBe(true);
    expect(grid.lat!.every(Number.isFinite)).toBe(true);
  });

  it('gives a zero delta for 2024 against itself', () => {
    const start = performance.now();
    const base = resampleAttempt(y2024, y2024.dist, onCourse(y2024), grid);
    console.log(
      `resampleAttempt: ${(performance.now() - start).toFixed(1)} ms, ${y2024.t.length} samples onto ${grid.d.length} points`,
    );
    expect(performance.now() - start).toBeLessThan(100);

    expect(computeDelta(base, base.time).every((x) => x === 0)).toBe(true);
    expect(base.time[base.time.length - 1]).toBeCloseTo(25733, 0);
  });

  it('puts 2025 ≈ +383 s behind 2024 when it reaches the finish (scaled-distance alignment stub)', () => {
    const base = resampleAttempt(y2024, y2024.dist, onCourse(y2024), grid);
    const end = y2025.dist.reduce((a, b) => (b > a ? b : a), 0);
    const courseDist = y2025.dist.map((d) => (d * grid.length) / end);
    const delta = computeDelta(resampleAttempt(y2025, courseDist, onCourse(y2025), grid), base.time);

    // 2025 reaches the finish at t = 26,116 s, then stands still until the watch stops at 26,279 s.
    // The elapsed-time difference is 545 s; first arrival at the finish gives 26,116 − 25,733.
    expect(delta[delta.length - 1]).toBeCloseTo(383, 0);
    expect(y2025.t[y2025.t.length - 1]! - y2024.t[y2024.t.length - 1]!).toBe(545);
    expect(delta.every(Number.isFinite)).toBe(true);
  });
});
