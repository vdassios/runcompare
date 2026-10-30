import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/fixtures';
import { GRADE_STEPS, PROFILE_HEIGHT, elevationProfile, gradeBands } from './profile';

describe('elevationProfile', () => {
  const { grid } = loadFixture('fit-two-attempts').analysis;

  it('spans the course from its lowest to its highest point', () => {
    const profile = elevationProfile(grid)!;
    const ele = Array.from(grid.ele!);
    expect(profile.length).toBe(grid.length);
    expect(profile.minEle).toBe(Math.min(...ele));
    expect(profile.maxEle).toBe(Math.max(...ele));
    expect(profile.area.startsWith(`M0 ${PROFILE_HEIGHT} L0 `)).toBe(true);
    expect(profile.area.endsWith(`L${grid.length.toFixed(0)} ${PROFILE_HEIGHT} Z`)).toBe(true);
  });

  it('shades only stretches at least as steep as their level, in course order', () => {
    const { bands } = elevationProfile(grid)!;
    expect(bands.length).toBeGreaterThan(0);
    for (const [i, b] of bands.entries()) {
      expect(b.to).toBeGreaterThan(b.from);
      if (i > 0) expect(b.from).toBeGreaterThanOrEqual(bands[i - 1]!.to);
      const first = grid.d.indexOf(b.from);
      expect(Math.abs(grid.grade![first]!)).toBeGreaterThanOrEqual(GRADE_STEPS[b.level - 1]!);
    }
  });

  it('is null without elevation', () => {
    expect(elevationProfile({ ...grid, ele: null })).toBeNull();
  });
});

describe('gradeBands', () => {
  it('merges neighbouring intervals of the same steepness and skips flat or missing grade', () => {
    const d = Float64Array.of(0, 10, 20, 30, 40, 50, 60);
    const grade = Float32Array.of(0.12, -0.15, 0.25, 0.02, NaN, 0.31, 0);
    expect(gradeBands(d, grade)).toEqual([
      { from: 0, to: 20, level: 1 },
      { from: 20, to: 30, level: 2 },
      { from: 50, to: 60, level: 3 },
    ]);
  });
});
