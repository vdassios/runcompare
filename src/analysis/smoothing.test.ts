import { describe, expect, it } from 'vitest';
import { MAX_GRADE, ascentDescent, gradeFromElevation, smoothElevationByDistance } from './smoothing';

/** Deterministic PRNG (mulberry32), so the noisy profiles are the same on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Samples every `spacing` metres over `length`, elevation `profile(d)` plus uniform ±`noise` m. */
function track(length: number, spacing: number, noise: number, profile: (d: number) => number, seed = 1) {
  const random = rng(seed);
  const n = Math.floor(length / spacing) + 1;
  const dist = new Float64Array(n);
  const ele = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const d = k * spacing;
    dist[k] = d;
    ele[k] = profile(d) + (random() * 2 - 1) * noise;
  }
  return { dist, ele };
}

function median(values: ArrayLike<number>): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// 500 m flat at 200 m, a 1,000 m climb of exactly 100 m, then 500 m flat at 300 m.
const climb = (d: number): number => 200 + Math.min(100, Math.max(0, d - 500) * 0.1);

describe('smoothElevationByDistance', () => {
  it('resamples onto 0, step, …, L with the last point exactly L', () => {
    const { d, ele } = smoothElevationByDistance([0, 12, 25, 37], [5, 5, 5, 5]);
    expect(Array.from(d)).toEqual([0, 10, 20, 30, 37]);
    expect(Array.from(ele)).toEqual([5, 5, 5, 5, 5]);
    expect(d).toBeInstanceOf(Float64Array);
    expect(ele).toBeInstanceOf(Float32Array);
  });

  it('does not add a near-duplicate last point when L is a multiple of the step', () => {
    const { d } = smoothElevationByDistance([0, 15, 30.0000001], [0, 0, 0]);
    expect(Array.from(d)).toEqual([0, 10, 20, 30.0000001]);
    expect(Array.from(smoothElevationByDistance([0, 20], [0, 0]).d)).toEqual([0, 10, 20]);
  });

  it('honours the step option', () => {
    const { d } = smoothElevationByDistance([0, 100], [0, 10], { step: 25 });
    expect(Array.from(d)).toEqual([0, 25, 50, 75, 100]);
    expect(() => smoothElevationByDistance([0, 1], [0, 0], { step: 0 })).toThrow(RangeError);
  });

  it('removes a single-sample spike', () => {
    const { dist, ele } = track(500, 2, 0, () => 100);
    ele[100] = 400;
    const out = smoothElevationByDistance(dist, ele);
    expect(Math.max(...out.ele)).toBe(100);
  });

  it('bridges NaN distance and elevation samples', () => {
    const { dist, ele } = track(1000, 2, 0, (d) => d * 0.05);
    ele.fill(NaN, 200, 260);
    dist[300] = NaN;
    const out = smoothElevationByDistance(dist, ele);
    expect(out.ele.some(Number.isNaN)).toBe(false);
    // The gap (400–520 m) is bridged on (almost) the same line; the median skews its edges slightly.
    expect(out.ele[46]).toBeCloseTo(23, 1);
  });

  it('handles empty, all-NaN and single-sample input', () => {
    expect(smoothElevationByDistance([], []).d.length).toBe(0);
    expect(smoothElevationByDistance([NaN], [1]).d.length).toBe(0);
    const allNaN = smoothElevationByDistance([0, 50], [NaN, NaN]);
    expect(allNaN.d.length).toBe(6);
    expect(Array.from(allNaN.ele).every(Number.isNaN)).toBe(true);
    expect(Array.from(smoothElevationByDistance([0], [7]).ele)).toEqual([7]);
  });

  it('is fast on 30,000 samples', () => {
    const { dist, ele } = track(54_000, 1.8, 2, (d) => 500 + 400 * Math.sin(d / 3000));
    const start = performance.now();
    const out = smoothElevationByDistance(dist, ele);
    console.log(`smoothElevationByDistance: ${(performance.now() - start).toFixed(1)} ms for ${dist.length} samples`);
    expect(out.d.length).toBe(5401);
  });
});

describe('a noisy 1,000 m climb of 100 m', () => {
  const { dist, ele } = track(2000, 2, 2, climb);
  const smooth = smoothElevationByDistance(dist, ele);
  const grade = gradeFromElevation(smooth.ele, 10);

  it('ascends 100 m ±5 and barely descends', () => {
    const { ascent, descent } = ascentDescent(smooth.ele);
    expect(ascent).toBeGreaterThan(95);
    expect(ascent).toBeLessThan(105);
    expect(descent).toBeLessThan(5);
  });

  it('has a median grade of 0.10 in the middle of the climb', () => {
    // Grid points 70–130 are 700–1,300 m, well inside the 500–1,500 m climb.
    expect(median(grade.subarray(70, 131))).toBeCloseTo(0.1, 2);
    expect(Math.abs(median(grade.subarray(0, 40)))).toBeLessThan(0.01);
  });
});

describe('gradeFromElevation', () => {
  it('is the slope of a straight line, including at the ends', () => {
    const ele = Float32Array.from({ length: 30 }, (_, k) => k * 10 * 0.08);
    for (const g of gradeFromElevation(ele, 10)) expect(g).toBeCloseTo(0.08, 5);
  });

  it('differences over exactly the window, interpolating fractional offsets', () => {
    // e(x) = x²/1000 m: a 50 m central difference gives exactly e'(x) = 0.002·x, and the
    // interpolation error at ±2.5 samples cancels out, so grade[k] = 0.02·k away from the ends.
    const ele = Float32Array.from({ length: 21 }, (_, k) => (k * 10) ** 2 / 1000);
    const grade = gradeFromElevation(ele, 10, 50);
    for (let k = 3; k <= 17; k++) expect(grade[k]).toBeCloseTo(0.02 * k, 5);
    // Near the start the 0–50 m span is used: the slope at 25 m.
    expect(grade[0]).toBeCloseTo(0.05, 5);
    expect(grade[2]).toBeCloseTo(0.05, 5);
    // Near the end, 150–200 m: the slope at 175 m.
    expect(grade[20]).toBeCloseTo(0.35, 5);
  });

  it('clamps to ±0.45', () => {
    const up = Float32Array.from({ length: 20 }, (_, k) => k * 10);
    const cliff = Float32Array.from({ length: 10 }, (_, k) => (k < 5 ? 0 : 30));
    expect(gradeFromElevation(cliff, 10)[4]).toBe(Math.fround(MAX_GRADE)); // 30 m over 50 m = 0.6
    const down = up.map((v) => -v);
    expect(Math.max(...gradeFromElevation(up, 10))).toBe(Math.fround(MAX_GRADE));
    expect(Math.min(...gradeFromElevation(down, 10))).toBe(Math.fround(-MAX_GRADE));
  });

  it('is NaN at NaN samples only', () => {
    const ele = Float32Array.from({ length: 30 }, (_, k) => k);
    ele[10] = NaN;
    ele[11] = NaN;
    const grade = gradeFromElevation(ele, 10);
    expect(grade[10]).toBeNaN();
    expect(grade[11]).toBeNaN();
    expect(grade[9]).toBeCloseTo(0.1, 5);
    expect(grade[12]).toBeCloseTo(0.1, 5);
    expect(Array.from(gradeFromElevation([NaN, NaN, NaN], 10)).every(Number.isNaN)).toBe(true);
  });

  it('handles short input and a window wider than the data', () => {
    expect(gradeFromElevation([], 10).length).toBe(0);
    expect(gradeFromElevation([5], 10)[0]).toBeNaN();
    expect(Array.from(gradeFromElevation([0, 1], 10))).toEqual([Math.fround(0.1), Math.fround(0.1)]);
    expect(() => gradeFromElevation([0, 1], 0)).toThrow(RangeError);
  });

  it('works with a step that does not divide the window', () => {
    const ele = Float32Array.from({ length: 40 }, (_, k) => k * 15 * -0.12);
    for (const g of gradeFromElevation(ele, 15)) expect(g).toBeCloseTo(-0.12, 5);
  });

  it('is fast on 30,000 samples', () => {
    const ele = Float32Array.from({ length: 30_000 }, (_, k) => 400 * Math.sin(k / 300));
    const start = performance.now();
    const grade = gradeFromElevation(ele, 10);
    console.log(`gradeFromElevation: ${(performance.now() - start).toFixed(1)} ms for 30000 samples`);
    expect(grade.length).toBe(30_000);
  });
});

describe('ascentDescent', () => {
  it('counts clean climbs and descents fully', () => {
    expect(ascentDescent([0, 10, 20, 15, 5, 30])).toEqual({ ascent: 45, descent: 15 });
    expect(ascentDescent([100, 50])).toEqual({ ascent: 0, descent: 50 });
  });

  it('ignores reversals smaller than the hysteresis', () => {
    expect(ascentDescent([0, 10, 8, 20])).toEqual({ ascent: 20, descent: 0 });
    expect(ascentDescent([0, 10, 8, 20], 1)).toEqual({ ascent: 22, descent: 2 });
    expect(ascentDescent([0, 2.9, 0, 2.9, 0])).toEqual({ ascent: 0, descent: 0 });
  });

  it('starts from the lowest (or highest) point seen before the first move', () => {
    expect(ascentDescent([0, -2, 0, 5])).toEqual({ ascent: 7, descent: 0 });
  });

  it('keeps a flat profile with ±1.5 m noise under 5 m', () => {
    const { dist, ele } = track(5000, 2, 1.5, () => 300, 7);
    const smooth = smoothElevationByDistance(dist, ele);
    const result = ascentDescent(smooth.ele);
    expect(result.ascent).toBeLessThan(5);
    expect(result.descent).toBeLessThan(5);
    // Even the raw ±1.5 m noise never swings the full 3 m dead band.
    expect(ascentDescent(ele).ascent).toBeLessThan(5);
  });

  it('skips NaN samples', () => {
    expect(ascentDescent([0, NaN, 10, NaN, 4])).toEqual({ ascent: 10, descent: 6 });
    expect(ascentDescent([NaN, NaN])).toEqual({ ascent: 0, descent: 0 });
    expect(ascentDescent([])).toEqual({ ascent: 0, descent: 0 });
  });

  it('is fast on 30,000 samples', () => {
    const { ele } = track(60_000, 2, 2, (d) => 500 + 400 * Math.sin(d / 3000));
    const start = performance.now();
    ascentDescent(ele);
    console.log(`ascentDescent: ${(performance.now() - start).toFixed(1)} ms for ${ele.length} samples`);
  });
});
