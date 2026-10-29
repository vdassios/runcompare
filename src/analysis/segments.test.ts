import { describe, expect, it } from 'vitest';
import type { AlignedSeries, CourseGrid } from '../model/types';
import { loadFixture } from '../test/fixtures';
import { buildDistanceGrid } from './grid';
import { detectSegments, segmentStats } from './segments';
import { ascentDescent } from './smoothing';

const STEP = 10;

/** A grid whose elevation is piecewise linear through `[distance, elevation]` knots. */
function profileGrid(knots: [number, number][]): CourseGrid {
  const grid = buildDistanceGrid(knots[knots.length - 1]![0], STEP);
  grid.ele = Float32Array.from(grid.d, (x) => {
    const k = Math.max(
      1,
      knots.findIndex(([kx]) => kx >= x),
    );
    const [x0, y0] = knots[k - 1]!;
    const [x1, y1] = knots[k]!;
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  });
  return grid;
}

/** An attempt moving through the grid at `speed` m/s, on course everywhere. */
function steadySeries(grid: CourseGrid, speed: number): AlignedSeries {
  const n = grid.d.length;
  return {
    time: grid.d.map((x) => x / speed),
    ele: null,
    hr: null,
    cad: null,
    pace: new Float32Array(n).fill(1 / speed),
    gap: null,
    moving: null,
    walking: null,
    offCourse: new Uint8Array(n),
    estimated: new Uint8Array(n),
  };
}

describe('detectSegments', () => {
  it('finds a 300 m climb and a 200 m descent with trimmed ends and ignores a 30 m bump', () => {
    const grid = profileGrid([
      [0, 100],
      [1000, 100],
      [6000, 400], // 300 m at 6 %
      [7000, 400],
      [11000, 200], // 200 m at 5 %
      [12000, 200],
      [12300, 230], // 30 m bump
      [12600, 200],
      [13600, 200],
    ]);
    const segments = detectSegments(grid);
    expect(segments.map((s) => s.kind)).toEqual(['climb', 'descent']);
    const [climb, descent] = segments;
    expect(Math.abs(climb!.from - 1000)).toBeLessThanOrEqual(20);
    expect(Math.abs(climb!.to - 6000)).toBeLessThanOrEqual(20);
    expect(Math.abs(climb!.elevationChange - 300)).toBeLessThanOrEqual(5);
    expect(climb!.avgGrade).toBeCloseTo(0.06, 3);
    expect(Math.abs(descent!.from - 7000)).toBeLessThanOrEqual(20);
    expect(Math.abs(descent!.to - 11000)).toBeLessThanOrEqual(20);
    expect(Math.abs(descent!.elevationChange + 200)).toBeLessThanOrEqual(5);
    expect(descent!.avgGrade).toBeCloseTo(-0.05, 3);
  });

  it('keeps a climb with a 6 m dip whole and splits one with a 15 m dip in two', () => {
    const withDip = (dip: number) =>
      detectSegments(
        profileGrid([
          [0, 0],
          [1000, 100],
          [1100, 100 - dip],
          [2100, 200 - dip],
        ]),
      );
    expect(withDip(6)).toEqual([{ kind: 'climb', from: 0, to: 2100, elevationChange: 194, avgGrade: 194 / 2100 }]);
    expect(withDip(15).map(({ kind, from, to }) => ({ kind, from, to }))).toEqual([
      { kind: 'climb', from: 0, to: 1000 },
      { kind: 'climb', from: 1100, to: 2100 },
    ]);
  });

  it('starts a climb where the steep part starts, after a gentle run-in', () => {
    const grid = profileGrid([
      [0, 0],
      [2000, 30], // 1.5 %
      [3000, 130], // 10 %
    ]);
    const [climb, ...rest] = detectSegments(grid);
    expect(rest).toEqual([]);
    expect(Math.abs(climb!.from - 2000)).toBeLessThanOrEqual(20);
    expect(climb!.to).toBe(3000);
    expect(Math.abs(climb!.elevationChange - 100)).toBeLessThanOrEqual(5);
  });

  it('splits a climb at a 1 km flat in the middle but not at a 300 m one', () => {
    const withFlat = (flat: number) =>
      detectSegments(
        profileGrid([
          [0, 0],
          [1000, 100],
          [1000 + flat, 100],
          [2000 + flat, 200],
        ]),
      ).map(({ kind, from, to }) => ({ kind, from, to }));
    expect(withFlat(1000)).toEqual([
      { kind: 'climb', from: 0, to: 1000 },
      { kind: 'climb', from: 2000, to: 3000 },
    ]);
    expect(withFlat(300)).toEqual([{ kind: 'climb', from: 0, to: 2300 }]);
  });

  it('splits a descent at a flat the same way', () => {
    const grid = profileGrid([
      [0, 200],
      [1000, 100],
      [2000, 100],
      [3000, 0],
    ]);
    expect(detectSegments(grid).map(({ kind, from, to }) => ({ kind, from, to }))).toEqual([
      { kind: 'descent', from: 0, to: 1000 },
      { kind: 'descent', from: 2000, to: 3000 },
    ]);
  });

  it('takes its thresholds from the options', () => {
    const grid = profileGrid([
      [0, 0],
      [1000, 100],
      [2000, 100],
      [3000, 200],
    ]);
    expect(detectSegments(grid, { flatLength: 1500 })).toHaveLength(1);
    expect(detectSegments(grid, { minChange: 150 })).toEqual([]);
  });

  it('drops runs that are too small or too gentle', () => {
    const small = profileGrid([
      [0, 0],
      [400, 40],
    ]);
    const gentle = profileGrid([
      [0, 0],
      [3000, 90], // 3 %
    ]);
    expect(detectSegments(small)).toEqual([]);
    expect(detectSegments(gentle)).toEqual([]);
  });

  it('returns [] without elevation', () => {
    expect(detectSegments(buildDistanceGrid(5000, STEP))).toEqual([]);
  });

  it('finds the main climbs of the 2024 course', () => {
    const { analysis, attempts } = loadFixture('fit-two-attempts');
    const segments = detectSegments(analysis.grid);
    const climbs = segments.filter((s) => s.kind === 'climb');
    const gain = climbs.reduce((sum, s) => sum + s.elevationChange, 0);
    const courseAscent = attempts[0]!.activity.deviceSummary.ascent ?? ascentDescent(analysis.grid.ele!).ascent;
    console.log(
      `2024 course: ${climbs.length} climbs, ${Math.round(gain)} m gain of ${courseAscent} m D+`,
      segments.map((s) => `${s.kind} ${Math.round(s.from)}–${Math.round(s.to)} m ${Math.round(s.elevationChange)} m`),
    );
    expect(Math.abs(gain - courseAscent) / courseAscent).toBeLessThanOrEqual(0.25);
    for (let k = 1; k < segments.length; k++) expect(segments[k]!.from).toBeGreaterThanOrEqual(segments[k - 1]!.to);
  });
});

describe('segmentStats', () => {
  const grid = profileGrid([
    [0, 0],
    [1000, 0],
    [6000, 500], // 500 m at 10 %
    [7000, 500],
    [10000, 200], // 300 m at 10 %
  ]);
  const [climb, descent] = detectSegments(grid);

  it('gives VAM on a climb: 500 m in 50 minutes is 600 m/h', () => {
    const series = steadySeries(grid, 5000 / 3000);
    const stats = segmentStats(climb!, grid, series, null);
    expect(stats.time).toBeCloseTo(3000, 6);
    expect(stats.vam).toBeCloseTo(600, 6);
    expect(stats).toMatchObject({ delta: null, descentRate: null, offCourse: false });
  });

  it('gives the descent rate, the change in delta and the off-course flag on a descent', () => {
    const series = steadySeries(grid, 3);
    series.offCourse[grid.d.indexOf(descent!.to)] = 1;
    const delta = grid.d.map((x) => x / 100); // falls 1 s behind every 100 m
    const stats = segmentStats(descent!, grid, series, delta);
    expect(stats.time).toBeCloseTo(1000, 6);
    expect(stats.descentRate).toBeCloseTo(1080, 6);
    expect(stats.delta).toBeCloseTo(30, 6);
    expect(stats).toMatchObject({ vam: null, offCourse: true });
  });
});
