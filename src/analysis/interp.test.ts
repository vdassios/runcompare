import { describe, expect, it } from 'vitest';
import { bridgeNaN, interpolateAt, resampleOnto, rollingMean, rollingMedian } from './interp';

const N = 30_000;

function timed<T>(label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  console.log(`${label}: ${(performance.now() - start).toFixed(1)} ms for ${N} samples`);
  return result;
}

describe('interpolateAt', () => {
  const xs = [0, 10, 20, 40];
  const ys = [0, 1, 3, 7];

  it('interpolates linearly and hits samples exactly', () => {
    expect(interpolateAt(xs, ys, 5)).toBe(0.5);
    expect(interpolateAt(xs, ys, 10)).toBe(1);
    expect(interpolateAt(xs, ys, 30)).toBe(5);
    expect(interpolateAt(xs, ys, 40)).toBe(7);
  });

  it('clamps outside the range', () => {
    expect(interpolateAt(xs, ys, -5)).toBe(0);
    expect(interpolateAt(xs, ys, 100)).toBe(7);
  });

  it('returns the first sample that reaches a plateau', () => {
    expect(interpolateAt([0, 10, 10, 20], [0, 1, 5, 6], 10)).toBe(1);
    // Past the plateau, interpolation starts from its last sample.
    expect(interpolateAt([0, 10, 10, 20], [0, 1, 5, 6], 15)).toBe(5.5);
    // A plateau at the very end still returns its first sample.
    expect(interpolateAt([0, 10, 10], [0, 1, 5], 10)).toBe(1);
    expect(interpolateAt([0, 0, 10], [2, 4, 6], 0)).toBe(2);
  });

  it('handles empty and single-sample input', () => {
    expect(interpolateAt([], [], 1)).toBeNaN();
    expect(interpolateAt([5], [3], 0)).toBe(3);
    expect(interpolateAt([5], [3], 9)).toBe(3);
  });

  it('skips NaN ys and bridges across them', () => {
    const y = [0, NaN, NaN, 6];
    const x = [0, 1, 2, 3];
    expect(interpolateAt(x, y, 1)).toBe(2);
    expect(interpolateAt(x, y, 1.5)).toBe(3);
    expect(interpolateAt([0, 1, 2], [NaN, 4, NaN], 0)).toBe(4);
    expect(interpolateAt([0, 1, 2], [NaN, 4, NaN], 2)).toBe(4);
    expect(interpolateAt([0, 10, 10, 20], [0, NaN, 5, 6], 10)).toBe(5);
  });

  it('returns NaN for a NaN x or an all-NaN ys', () => {
    expect(interpolateAt(xs, ys, NaN)).toBeNaN();
    expect(interpolateAt([0, 1], [NaN, NaN], 0.5)).toBeNaN();
  });
});

describe('resampleOnto', () => {
  it('resamples onto any targets, including out-of-range and unsorted ones', () => {
    const out = resampleOnto([0, 10, 20], [0, 10, 40], [20, -1, 5, 15, 25]);
    expect(out).toBeInstanceOf(Float32Array);
    expect(Array.from(out)).toEqual([40, 0, 5, 25, 40]);
  });

  it('keeps the plateau rule', () => {
    expect(Array.from(resampleOnto([0, 10, 10, 20], [0, 1, 5, 6], [10]))).toEqual([1]);
  });

  it('drops samples with NaN x or y and bridges the gap', () => {
    const out = resampleOnto([0, NaN, 2, 3, 4], [0, 100, NaN, 3, 4], [1, 2, 4, NaN]);
    expect(Array.from(out.subarray(0, 3))).toEqual([1, 2, 4]);
    expect(out[3]).toBeNaN();
  });

  it('gives NaN everywhere only when no sample is usable', () => {
    const out = resampleOnto([0, 1], [NaN, NaN], [0, 1]);
    expect(Array.from(out).every(Number.isNaN)).toBe(true);
    expect(resampleOnto([], [], [1, 2]).length).toBe(2);
  });

  it('is fast on 30,000 samples', () => {
    const xs = Float64Array.from({ length: N }, (_, k) => k * 1.8);
    const ys = Float32Array.from({ length: N }, (_, k) => Math.sin(k / 100));
    const targets = Float64Array.from({ length: Math.ceil((N * 1.8) / 10) }, (_, k) => k * 10);
    const out = timed('resampleOnto', () => resampleOnto(xs, ys, targets));
    expect(out.length).toBe(targets.length);
  });
});

describe('rollingMean', () => {
  it('averages a centred window, truncated at the ends', () => {
    expect(Array.from(rollingMean([1, 2, 3, 4, 5], 3))).toEqual([1.5, 2, 3, 4, 4.5]);
    expect(Array.from(rollingMean([1, 2, 3], 1))).toEqual([1, 2, 3]);
  });

  it('puts the extra sample of an even window after the centre', () => {
    expect(Array.from(rollingMean([0, 2, 4, 6], 2))).toEqual([1, 3, 5, 6]);
  });

  it('ignores NaN and fills NaN positions from their neighbours', () => {
    const out = rollingMean([1, NaN, 3, NaN, NaN, NaN, 7], 3);
    expect(Array.from(out.subarray(0, 4))).toEqual([1, 2, 3, 3]);
    expect(out[4]).toBeNaN();
    expect(Array.from(out.subarray(5))).toEqual([7, 7]);
  });

  it('is fast on 30,000 samples', () => {
    const ys = Float32Array.from({ length: N }, (_, k) => (k % 7 === 0 ? NaN : k));
    const out = timed('rollingMean', () => rollingMean(ys, 5));
    expect(out.length).toBe(N);
  });
});

describe('rollingMedian', () => {
  it('removes a single spike', () => {
    expect(Array.from(rollingMedian([1, 1, 50, 1, 1], 5))).toEqual([1, 1, 1, 1, 1]);
    expect(Array.from(rollingMedian([1, 2, 3, 4, 5], 3))).toEqual([1.5, 2, 3, 4, 4.5]);
  });

  it('ignores NaN, averaging the middle two of an even count', () => {
    const out = rollingMedian([1, NaN, 3, 10, NaN], 3);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(2);
    expect(out[2]).toBe(6.5);
    expect(out[3]).toBe(6.5);
    expect(out[4]).toBe(10);
    expect(rollingMedian([NaN, NaN], 3)[0]).toBeNaN();
  });

  it('is fast on 30,000 samples', () => {
    const ys = Float32Array.from({ length: N }, (_, k) => (k % 11 === 0 ? NaN : Math.sin(k)));
    const out = timed('rollingMedian', () => rollingMedian(ys, 5));
    expect(out.length).toBe(N);
  });
});

describe('bridgeNaN', () => {
  it('fills internal gaps linearly and end gaps with the nearest value', () => {
    expect(Array.from(bridgeNaN([NaN, NaN, 2, NaN, NaN, 8, NaN]))).toEqual([2, 2, 2, 4, 6, 8, 8]);
  });

  it('leaves clean input unchanged and does not mutate it', () => {
    const input = [1, NaN, 3];
    expect(Array.from(bridgeNaN([1, 2, 3]))).toEqual([1, 2, 3]);
    bridgeNaN(input);
    expect(input[1]).toBeNaN();
  });

  it('keeps all-NaN and empty input as is', () => {
    expect(Array.from(bridgeNaN([NaN, NaN])).every(Number.isNaN)).toBe(true);
    expect(bridgeNaN([]).length).toBe(0);
  });

  it('is fast on 30,000 samples', () => {
    const ys = Float32Array.from({ length: N }, (_, k) => (k % 100 < 30 ? NaN : k));
    const out = timed('bridgeNaN', () => bridgeNaN(ys));
    expect(out.some(Number.isNaN)).toBe(false);
  });
});
