import { randomLcg, randomUniform } from 'd3-random';
import { describe, expect, it } from 'vitest';
import type { AlignedSeries, CourseGrid } from '../model/types';
import { computeSplits, distanceBoundaries, lapBoundaries, segmentBoundaries } from './splits';

const MILE = 1609.344;

/** A 10 m grid over the 2024 course length, an uneven time curve and a wavy delta. */
const length = 54128;
const n = Math.ceil(length / 10) + 1;
const d = Float64Array.from({ length: n }, (_, k) => Math.min(k * 10, length));
const grid: CourseGrid = { step: 10, length, d, ele: null, grade: null, lat: null, lon: null };
const time = d.map((x) => 0.475 * x + 40 * Math.sin(x / 900));
const delta = d.map((x) => (545 * x) / length + 25 * Math.sin(x / 300) - 3);
const series: AlignedSeries = {
  time,
  ele: null,
  hr: null,
  cad: null,
  pace: new Float32Array(n),
  gap: null,
  moving: null,
  walking: null,
  offCourse: new Uint8Array(n),
  estimated: new Uint8Array(n),
};

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('distanceBoundaries', () => {
  it('gives 55 kilometre splits for 54,128 m, the last one 128 m', () => {
    const b = distanceBoundaries(length, 1000);
    expect(b).toHaveLength(56);
    expect(b.slice(0, 3)).toEqual([0, 1000, 2000]);
    expect(b[55]! - b[54]!).toBeCloseTo(128, 9);
  });

  it('gives 34 mile splits for 54,128 m', () => {
    expect(distanceBoundaries(length, MILE)).toHaveLength(35);
  });

  it('adds no sliver split when the length is a multiple of the split length', () => {
    expect(distanceBoundaries(3000, 1000)).toEqual([0, 1000, 2000, 3000]);
    expect(distanceBoundaries(0, 1000)).toEqual([0]);
    expect(() => distanceBoundaries(1000, 0)).toThrow(RangeError);
  });
});

describe('lapBoundaries', () => {
  it('uses the lap edges inside the course, merged and sorted, plus 0 and the length', () => {
    const laps = [
      { from: 0, to: 4200, trigger: 'manual' as const },
      { from: 4200, to: 4200, trigger: 'manual' as const },
      { from: 4200, to: 9800.5, trigger: 'manual' as const },
      { from: 9800.5, to: 10000, trigger: 'session_end' as const },
    ];
    expect(lapBoundaries(laps, 10000)).toEqual([0, 4200, 9800.5, 10000]);
    expect(lapBoundaries([], 10000)).toEqual([0, 10000]);
  });
});

describe('segmentBoundaries', () => {
  it('gives one [from, to] pair per segment', () => {
    const segments = [
      { kind: 'climb' as const, from: 1000, to: 3500, elevationChange: 400, avgGrade: 0.16 },
      { kind: 'descent' as const, from: 5000, to: 6000, elevationChange: -120, avgGrade: -0.12 },
    ];
    expect(segmentBoundaries(segments)).toEqual([
      [1000, 3500],
      [5000, 6000],
    ]);
  });
});

describe('computeSplits', () => {
  const uniform = randomUniform.source(randomLcg(8))(0, length);
  const random = [0, ...Array.from({ length: 30 }, uniform).sort((a, b) => a - b), length];
  const laps = [0, 3333.3, 3333.4, 17005, 41999.99, length];

  it.each([
    ['kilometres', distanceBoundaries(length, 1000)],
    ['miles', distanceBoundaries(length, MILE)],
    ['laps', laps],
    ['random', random],
  ])('adds up to the total time and delta (%s)', (_, boundaries) => {
    const splits = computeSplits(grid, series, delta, boundaries);
    expect(splits).toHaveLength(boundaries.length - 1);
    expect(Math.abs(sum(splits.map((s) => s.delta!)) - (delta[n - 1]! - delta[0]!))).toBeLessThan(1e-6);
    expect(Math.abs(sum(splits.map((s) => s.time)) - time[n - 1]!)).toBeLessThan(1e-6);
  });

  it('interpolates time and delta between grid points', () => {
    const [split] = computeSplits(grid, series, delta, [5, 25]);
    // 5 m and 25 m sit halfway between grid points 0–1 and 2–3.
    expect(split!.time).toBeCloseTo((time[2]! + time[3]!) / 2 - (time[0]! + time[1]!) / 2, 9);
    expect(split!.delta).toBeCloseTo((delta[2]! + delta[3]!) / 2 - (delta[0]! + delta[1]!) / 2, 9);
    expect(split).toMatchObject({ from: 5, to: 25, offCourse: false, estimated: false });
  });

  it('has a null delta for the baseline', () => {
    expect(computeSplits(grid, series, null, [0, 1000]).map((s) => s.delta)).toEqual([null]);
  });

  it('flags splits that touch an off-course or estimated grid point, ends included', () => {
    const offCourse = new Uint8Array(n);
    offCourse[200] = 1; // 2,000 m, a boundary
    const estimated = new Uint8Array(n);
    estimated[350] = 1; // 3,500 m
    const splits = computeSplits(grid, { ...series, offCourse, estimated }, delta, distanceBoundaries(5000, 1000));
    expect(splits.map((s) => s.offCourse)).toEqual([false, true, true, false, false]);
    expect(splits.map((s) => s.estimated)).toEqual([false, false, false, true, false]);
  });
});
