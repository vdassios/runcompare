import { describe, expect, it } from 'vitest';
import { gapFactor, gapPace, minettiCost } from './gap';

describe('minettiCost', () => {
  it('is 3.6 J/kg/m on the flat', () => {
    expect(minettiCost(0)).toBe(3.6);
  });

  it('matches the polynomial', () => {
    const i = 0.2;
    const expected = 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
    expect(minettiCost(i)).toBeCloseTo(expected, 12);
  });

  it('is unclamped', () => {
    expect(minettiCost(0.6)).not.toBeCloseTo(minettiCost(0.45), 3);
  });
});

describe('gapFactor', () => {
  it('matches the PLAN reference values', () => {
    expect(gapFactor(0)).toBe(1);
    expect(gapFactor(0.1)).toBeCloseTo(1.659, 2);
    expect(Math.abs(gapFactor(0.1) - 1.659)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(gapFactor(-0.1) - 0.598)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(gapFactor(-0.2) - 0.5)).toBeLessThanOrEqual(0.005);
  });

  it('clamps the grade to ±0.45', () => {
    expect(gapFactor(0.6)).toBe(gapFactor(0.45));
    expect(gapFactor(5)).toBe(gapFactor(0.45));
    expect(gapFactor(-0.6)).toBe(gapFactor(-0.45));
    expect(gapFactor(0.45)).toBe(minettiCost(0.45) / 3.6);
  });

  it('is NaN for a NaN grade', () => {
    expect(gapFactor(NaN)).toBeNaN();
  });
});

describe('gapPace', () => {
  it('divides pace by the factor element-wise', () => {
    const pace = [0.3, 0.3, 0.6];
    const out = gapPace(pace, [0, 0.1, -0.2]);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out[0]).toBeCloseTo(0.3, 6);
    expect(out[1]).toBeCloseTo(0.3 / gapFactor(0.1), 6);
    expect(out[2]).toBeCloseTo(0.6 / gapFactor(-0.2), 6);
  });

  it('makes a slow climb a faster flat-equivalent pace', () => {
    const [flatEquivalent] = gapPace([0.5], [0.15]);
    expect(flatEquivalent).toBeLessThan(0.5);
  });

  it('keeps NaN local to its sample', () => {
    const out = gapPace([0.3, NaN, 0.3, 0.3], [0, 0, NaN, 0]);
    expect(out[0]).toBeCloseTo(0.3, 6);
    expect(out[1]).toBeNaN();
    expect(out[2]).toBeNaN();
    expect(out[3]).toBeCloseTo(0.3, 6);
  });

  it('rejects mismatched lengths', () => {
    expect(() => gapPace([1, 2], [0])).toThrow(RangeError);
  });

  it('is fast on 30,000 samples', () => {
    const pace = Float32Array.from({ length: 30_000 }, (_, k) => 0.3 + 0.1 * Math.sin(k / 50));
    const grade = Float32Array.from({ length: 30_000 }, (_, k) => 0.3 * Math.sin(k / 400));
    const start = performance.now();
    const out = gapPace(pace, grade);
    console.log(`gapPace: ${(performance.now() - start).toFixed(1)} ms for 30000 samples`);
    expect(out.length).toBe(30_000);
  });
});
