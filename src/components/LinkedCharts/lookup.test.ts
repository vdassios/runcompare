import { expect, it } from 'vitest';
import { inverseAt, nearestIndex, valueAt } from './lookup';

const d = Float64Array.from([0, 10, 20, 25]); // the last grid gap is shorter
const t = Float64Array.from([0, 4, 10, 12]);

it('interpolates a stream at any distance, clamped at the ends', () => {
  expect(valueAt(d, t, 15)).toBe(7);
  expect(valueAt(d, t, 22.5)).toBe(11);
  expect(valueAt(d, t, -5)).toBe(0);
  expect(valueAt(d, t, 99)).toBe(12);
});

it('finds where a non-decreasing stream reaches a value', () => {
  expect(inverseAt(d, t, 7)).toBe(15);
  expect(inverseAt(d, t, 11)).toBe(22.5);
});

it('finds the nearest grid point', () => {
  expect(nearestIndex(d, 14)).toBe(1);
  expect(nearestIndex(d, 16)).toBe(2);
  expect(nearestIndex(d, 23)).toBe(3);
  expect(nearestIndex(d, -1)).toBe(0);
});
