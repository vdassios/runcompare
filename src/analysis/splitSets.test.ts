import { randomInt, randomLcg, randomUniform } from 'd3-random';
import { describe, expect, it } from 'vitest';
import { formatPace } from '../format';
import type { CourseGrid, SplitMarker, SplitSet } from '../model/types';
import { gapFactor } from './gap';
import { interpolateAt } from './interp';
import { interpolateSplitSet, parseSplitList, targetTimeSplitSet, validateSplitSet } from './splitSets';

/** A course grid `0, step, …, length` with `grade(d)` at each point, or no grade. */
function courseGrid(length: number, step = 10, grade?: (d: number) => number): CourseGrid {
  const full = Math.floor(length / step);
  const d = Float64Array.from({ length: full + 1 }, (_, k) => k * step);
  const points = length > full * step ? Float64Array.from([...d, length]) : d;
  return {
    step,
    length,
    d: points,
    ele: null,
    grade: grade ? Float32Array.from(points, grade) : null,
    lat: null,
    lon: null,
  };
}

const splitSet = (markers: SplitMarker[], interpolation: SplitSet['interpolation'] = 'gap'): SplitSet => ({
  name: 'Pro',
  markers,
  officialDistance: null,
  interpolation,
});

const hilly = courseGrid(20000, 10, (d) => 0.15 * Math.sin((2 * Math.PI * d) / 1500));

describe('interpolateSplitSet', () => {
  it('is exact at markers for random sets, in both modes', () => {
    const source = randomLcg(7);
    const count = randomInt.source(source)(1, 7);
    const cell = randomInt.source(source)(1, hilly.d.length);
    const pace = randomUniform.source(source)(0.2, 0.6);
    for (let trial = 0; trial < 20; trial++) {
      const cells = [...new Set(Array.from({ length: count() }, cell))].sort((a, b) => a - b);
      let time = 0;
      let previous = 0;
      const markers = cells.map((k) => {
        const distance = hilly.d[k]!;
        time += (distance - previous) * pace();
        previous = distance;
        return { distance, time };
      });
      for (const mode of ['gap', 'linear'] as const) {
        const { series } = interpolateSplitSet(splitSet(markers, mode), hilly);
        cells.forEach((k, i) => expect(Math.abs(series.time[k]! - markers[i]!.time)).toBeLessThanOrEqual(0.5));
        expect(series.time[0]).toBe(0);
      }
    }
  });

  it('passes through markers between grid points', () => {
    const markers = [
      { distance: 3333.3, time: 1000 },
      { distance: 7777.7, time: 2300 },
    ];
    for (const mode of ['gap', 'linear'] as const) {
      const { series } = interpolateSplitSet(splitSet(markers, mode), hilly);
      for (const m of markers) {
        expect(Math.abs(interpolateAt(hilly.d, series.time, m.distance) - m.time)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('marks only d = 0 and the grid points nearest each marker as not estimated', () => {
    const { series } = interpolateSplitSet(splitSet([{ distance: 3333.3, time: 1000 }]), hilly);
    const exact = [...series.estimated.keys()].filter((k) => series.estimated[k] === 0);
    expect(exact).toEqual([0, 333]);
  });

  it('returns a split-set series: no streams, nothing off-course', () => {
    const { series } = interpolateSplitSet(splitSet([{ distance: 20000, time: 6000 }]), hilly);
    expect(series.ele).toBeNull();
    expect(series.hr).toBeNull();
    expect(series.cad).toBeNull();
    expect(series.moving).toBeNull();
    expect(series.walking).toBeNull();
    expect(series.offCourse).toEqual(new Uint8Array(hilly.d.length));
    expect(series.gap).not.toBeNull();
    expect(interpolateSplitSet(splitSet([{ distance: 1000, time: 300 }]), courseGrid(1000)).series.gap).toBeNull();
  });

  describe('GAP vs linear', () => {
    // Flat to 1 km, a 10 % climb to 2 km, a 10 % descent to 3 km, flat to 4 km.
    const climbThenDescent = courseGrid(4000, 10, (d) =>
      d >= 1000 && d < 2000 ? 0.1 : d >= 2000 && d < 3000 ? -0.1 : 0,
    );
    const markers = [
      { distance: 1000, time: 300 },
      { distance: 3000, time: 1000 },
      { distance: 4000, time: 1300 },
    ];
    const at = (d: number) => d / 10;
    const gap = interpolateSplitSet(splitSet(markers, 'gap'), climbThenDescent).series.time;
    const linear = interpolateSplitSet(splitSet(markers, 'linear'), climbThenDescent).series.time;

    it('agree at markers', () => {
      for (const m of markers) {
        expect(gap[at(m.distance)]).toBeCloseTo(m.time, 6);
        expect(linear[at(m.distance)]).toBeCloseTo(m.time, 6);
      }
    });

    it('gives the climb half of an interval more time in GAP mode', () => {
      expect(linear[at(2000)]! - linear[at(1000)]!).toBeCloseTo(350, 6);
      const climb = gap[at(2000)]! - gap[at(1000)]!;
      // The grid stores grade as float32.
      const [up, down] = [gapFactor(Math.fround(0.1)), gapFactor(Math.fround(-0.1))];
      expect(climb).toBeCloseTo((700 * up) / (up + down), 6);
      expect(climb).toBeGreaterThan(gap[at(3000)]! - gap[at(2000)]!);
    });
  });

  it('keeps GAP constant inside each interval in GAP mode', () => {
    const markers = [
      { distance: 5000, time: 1500 },
      { distance: 12000, time: 4000 },
      { distance: 20000, time: 6500 },
    ];
    const { series } = interpolateSplitSet(splitSet(markers), hilly);
    let from = 0;
    for (const m of markers) {
      const inside = [...hilly.d.keys()].filter((k) => hilly.d[k]! > from && hilly.d[k]! < m.distance - hilly.step);
      const reference = series.gap![inside[0]!]!;
      for (const k of inside) expect(Math.abs(series.gap![k]! / reference - 1)).toBeLessThanOrEqual(0.01);
      from = m.distance;
    }
  });

  it('rescales markers by the official distance onto the course length', () => {
    const grid = courseGrid(54128);
    const set: SplitSet = {
      ...splitSet([
        { distance: 27000, time: 12000 },
        { distance: 54000, time: 25734 },
      ]),
      officialDistance: 54000,
    };
    const { series, markers, warnings } = interpolateSplitSet(set, grid);
    expect(markers[0]!.distance).toBeCloseTo((27000 * 54128) / 54000, 6);
    expect(markers[1]!.distance).toBe(54128);
    expect(series.time[grid.d.length - 1]).toBeCloseTo(25734, 6);
    expect(series.estimated[grid.d.length - 1]).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('clamps markers past the course end onto the finish and warns', () => {
    const grid = courseGrid(10000);
    const set = splitSet(
      [
        { distance: 5000, time: 1200 },
        { distance: 10050, time: 2400 },
        { distance: 10100, time: 2410 },
      ],
      'linear',
    );
    const { series, markers, warnings } = interpolateSplitSet(set, grid);
    expect(markers).toEqual([
      { distance: 5000, time: 1200 },
      { distance: 10000, time: 2410 },
    ]);
    expect(series.time[grid.d.length - 1]).toBe(2410);
    expect(warnings).toHaveLength(1);
  });

  it('extrapolates past the last marker at its pace and warns', () => {
    const grid = courseGrid(42195);
    const set = splitSet(
      [
        { distance: 20000, time: 4000 },
        { distance: 40000, time: 8400 },
      ],
      'linear',
    );
    const { series, warnings } = interpolateSplitSet(set, grid);
    const end = grid.d.length - 1;
    expect(series.time[end]).toBeCloseTo(8400 + 2195 * 0.22, 6);
    expect(series.pace[end]).toBeCloseTo(0.22, 6);
    expect(series.estimated[end]).toBe(1);
    expect(warnings.map((w) => w.code)).toEqual(['split-set-extrapolated']);
    expect(warnings[0]!.attemptId).toBeNull();
  });

  it('throws on an invalid set', () => {
    expect(() => interpolateSplitSet(splitSet([]), hilly)).toThrow(RangeError);
  });
});

describe('parseSplitList', () => {
  const parsed = (text: string, units: 'metric' | 'imperial' = 'metric') => {
    const result = parseSplitList(text, units);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.markers;
  };
  const tenAndFifteen = [
    { distance: 10000, time: 1800 },
    { distance: 15000, time: 3720 },
  ];

  it('reads comma, semicolon and newline separated lists', () => {
    expect(parsed('10 30:00, 15 1:02:00')).toEqual(tenAndFifteen);
    expect(parsed('10 30:00; 15 1:02:00')).toEqual(tenAndFifteen);
    expect(parsed('10 30:00\n\n15 1:02:00\n')).toEqual(tenAndFifteen);
    expect(parsed('10 30:00\r\n15 1:02:00')).toEqual(tenAndFifteen);
  });

  it('reads unit suffixes and arrows', () => {
    expect(parsed('10km 30:00, 15 KM 1:02:00')).toEqual(tenAndFifteen);
    expect(parsed('10 → 30:00, 15k -> 1:02:00')).toEqual(tenAndFifteen);
    expect(parsed('6.2 mi 31:00')).toEqual([{ distance: 6.2 * 1609.344, time: 1860 }]);
    expect(parsed('400m 1:05, 800 m 2:12')).toEqual([
      { distance: 400, time: 65 },
      { distance: 800, time: 132 },
    ]);
  });

  it('reads tab-separated rows pasted from a results table', () => {
    expect(parsed('1\t5 km\t15:02\t3:00 /km\n2\t10 km\t30:30\t3:06 /km')).toEqual([
      { distance: 5000, time: 902 },
      { distance: 10000, time: 1830 },
    ]);
    expect(parsed('Checkpoint, north\t12.4\t1:05:00')).toEqual([{ distance: 12400, time: 3900 }]);
  });

  it('reads unsuffixed distances in miles when imperial', () => {
    expect(parsed('6 36:00', 'imperial')[0]!.distance).toBeCloseTo(9656.064, 9);
  });

  it('lets explicit suffixes override the units', () => {
    expect(parsed('5 km 15:00\n6 36:00\n10000 m 40:00', 'imperial')).toEqual([
      { distance: 5000, time: 900 },
      { distance: 6 * 1609.344, time: 2160 },
      { distance: 10000, time: 2400 },
    ]);
  });

  it('reports decreasing times and distances with their line numbers', () => {
    const result = parseSplitList('5 15:00\n10 30:00\n15 29:00\n8 40:00', 'metric');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(result.errors[0]!.message).toMatch(/time/);
    expect(result.errors[1]!.message).toMatch(/distance/);
  });

  it('reports bad durations and unknown units with their line numbers', () => {
    expect(parseSplitList('5 15:00\n10 30:99', 'metric')).toEqual({
      ok: false,
      errors: [{ line: 2, message: expect.stringMatching(/not a time/) }],
    });
    expect(parseSplitList('10 ft 30:00', 'metric')).toEqual({
      ok: false,
      errors: [{ line: 1, message: expect.stringMatching(/unknown unit/) }],
    });
    expect(parseSplitList('5 15:00, ten 30:00', 'metric')).toEqual({
      ok: false,
      errors: [{ line: 1, message: expect.stringMatching(/expected a distance and a time/) }],
    });
  });

  it('rejects empty input', () => {
    for (const text of ['', '  \n\t\n', ', ;']) {
      expect(parseSplitList(text, 'metric')).toEqual({
        ok: false,
        errors: [{ line: 1, message: expect.any(String) }],
      });
    }
  });
});

describe('targetTimeSplitSet', () => {
  it('builds one linear marker at the finish', () => {
    expect(targetTimeSplitSet(10000, 2400)).toEqual({
      name: 'Target 40:00',
      markers: [{ distance: 10000, time: 2400 }],
      officialDistance: 10000,
      interpolation: 'linear',
    });
    expect(targetTimeSplitSet(10000, 2400, 'Sub 40').name).toBe('Sub 40');
  });

  it('interpolates to an even 4:00/km, even on a hilly grid', () => {
    for (const grid of [courseGrid(10000), courseGrid(10000, 10, (d) => 0.1 * Math.sin(d / 300))]) {
      const { series, warnings } = interpolateSplitSet(targetTimeSplitSet(10000, 2400), grid);
      expect(warnings).toEqual([]);
      series.time.forEach((t, k) => expect(t).toBeCloseTo(grid.d[k]! * 0.24, 6));
      for (const p of series.pace) expect(formatPace(p, 'metric')).toBe('4:00 /km');
    }
  });
});

describe('validateSplitSet', () => {
  it('accepts a valid set', () => {
    expect(validateSplitSet(splitSet([{ distance: 5000, time: 1200 }]))).toEqual([]);
  });

  it('explains what is wrong', () => {
    expect(validateSplitSet({ ...splitSet([]), name: ' ' })).toHaveLength(2);
    expect(validateSplitSet({ ...splitSet([{ distance: 5000, time: 1200 }]), officialDistance: 0 })).toHaveLength(1);
    expect(
      validateSplitSet(
        splitSet([
          { distance: 5000, time: 1200 },
          { distance: 5000, time: 1100 },
          { distance: NaN, time: 3000 },
        ]),
      ),
    ).toEqual([
      'Split 2 must be further than split 1.',
      'Split 2 must be later than split 1.',
      'Split 3 needs a distance and a time.',
    ]);
  });
});
