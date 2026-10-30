import { describe, expect, it } from 'vitest';
import type { CourseGrid } from '../../model/types';
import { NEUTRAL_BAND, mixHex, pieceColor, routePieces } from './pieces';

/** A 10 m grid with one 100 m piece per entry of `perPiece` (s gained or lost over that piece). */
function course(perPiece: number[]): { grid: CourseGrid; delta: Float64Array; offCourse: Uint8Array } {
  const n = perPiece.length * 10 + 1;
  const d = Float64Array.from({ length: n }, (_, i) => i * 10);
  const delta = new Float64Array(n);
  for (let i = 1; i < n; i++) delta[i] = delta[i - 1]! + perPiece[Math.floor((i - 1) / 10)]! / 10;
  const grid: CourseGrid = { step: 10, length: d[n - 1]!, d, ele: null, grade: null, lat: null, lon: null };
  return { grid, delta, offCourse: new Uint8Array(n) };
}

describe('routePieces', () => {
  it('cuts the grid into 100 m pieces sharing their end points', () => {
    const { grid, delta, offCourse } = course([5, 5, 5]);
    const { pieces } = routePieces(grid, delta, offCourse, 100);
    expect(pieces.map((p) => [p.from, p.to])).toEqual([
      [0, 10],
      [10, 20],
      [20, 30],
    ]);
  });

  it('scores time lost as positive (behind) and time gained as negative (ahead)', () => {
    const { grid, delta, offCourse } = course([8, -8]);
    const { pieces } = routePieces(grid, delta, offCourse, 100);
    expect(pieces[0]!.value).toBeCloseTo(8);
    expect(pieces[0]!.intensity).toBeGreaterThan(0);
    expect(pieces[1]!.value).toBeCloseTo(-8);
    expect(pieces[1]!.intensity).toBeLessThan(0);
  });

  it('leaves changes within ±1 s neutral', () => {
    const { grid, delta, offCourse } = course([0.9, -0.9, 0, 5]);
    const { pieces } = routePieces(grid, delta, offCourse, 100);
    expect(pieces.slice(0, 3).map((p) => p.intensity)).toEqual([0, 0, 0]);
    expect(pieces[3]!.intensity).toBe(1);
  });

  it('clips at the 95th percentile of |value|', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i % 2 ? -1 : 1) * (i + 1));
    const { grid, delta, offCourse } = course(values);
    const { pieces, clip } = routePieces(grid, delta, offCourse, 100);
    // d3's linear quantile of 1…20 at 0.95: 19 + 0.05 · (20 − 19).
    expect(clip).toBeCloseTo(19.05);
    expect(pieces[19]!.intensity).toBe(-1); // −20, beyond the clip
    expect(pieces[9]!.intensity).toBeCloseTo(-10 / 19.05);
    expect(pieces[18]!.intensity).toBeCloseTo(19 / 19.05);
  });

  it('never clips below the neutral band', () => {
    const { grid, delta, offCourse } = course([0.2, 0.4]);
    expect(routePieces(grid, delta, offCourse, 100).clip).toBe(NEUTRAL_BAND);
  });

  it('marks a piece off course when any of its points is flagged or its delta is missing', () => {
    const { grid, delta, offCourse } = course([50, 2, 2, 2]);
    offCourse[5] = 1;
    delta[30] = NaN;
    const { pieces, clip } = routePieces(grid, delta, offCourse, 100);
    expect(pieces.map((p) => p.offCourse)).toEqual([true, false, true, true]);
    expect(pieces[0]!.value).toBeNaN();
    expect(pieces[0]!.intensity).toBe(0);
    // The off-course 50 s piece doesn't set the clip.
    expect(clip).toBeCloseTo(2);
    expect(pieces[1]!.intensity).toBeCloseTo(1);
  });

  it('scales a short last piece to a full piece', () => {
    const { grid, delta, offCourse } = course([4]);
    const short = { ...grid, d: grid.d.slice(0, 6), length: 50 };
    const { pieces } = routePieces(short, delta.slice(0, 6), offCourse.slice(0, 6), 100);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.value).toBeCloseTo(4);
  });
});

describe('pieceColor', () => {
  const colors = { neutral: '#808080', ahead: '#0000ff', behind: '#ff8000' };

  it('is neutral at 0 and the full colour at ±1', () => {
    expect(pieceColor(0, colors)).toBe('#808080');
    expect(pieceColor(-1, colors)).toBe('#0000ff');
    expect(pieceColor(1, colors)).toBe('#ff8000');
  });

  it('tints even a small change away from neutral', () => {
    expect(pieceColor(0.01, colors)).not.toBe('#808080');
  });
});

describe('mixHex', () => {
  it('blends channel by channel', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030');
  });
});
