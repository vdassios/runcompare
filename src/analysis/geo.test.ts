import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS, haversine, makeLocalProjection, projectOntoSegment } from './geo';

describe('haversine', () => {
  it('is R·π/180 for one degree of latitude', () => {
    expect(haversine(40, 22, 41, 22)).toBeCloseTo((EARTH_RADIUS * Math.PI) / 180, 6);
  });

  it('is zero for the same point and symmetric', () => {
    expect(haversine(39.99, 22.57, 39.99, 22.57)).toBe(0);
    expect(haversine(39.99, 22.57, 40.01, 22.6)).toBeCloseTo(haversine(40.01, 22.6, 39.99, 22.57), 9);
  });

  it('shrinks east-west distances by cos(latitude)', () => {
    expect(haversine(60, 0, 60, 0.001)).toBeCloseTo(haversine(0, 0, 0, 0.001) / 2, 3);
  });
});

describe('makeLocalProjection', () => {
  const project = makeLocalProjection(40, 22.5);

  it('puts the centre at the origin, x east and y north', () => {
    expect(project(40, 22.5)).toEqual([0, 0]);
    const [x, y] = project(40.001, 22.501);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeCloseTo((EARTH_RADIUS * Math.PI) / 180 / 1000, 6);
    expect(x).toBeCloseTo(y * Math.cos((40 * Math.PI) / 180), 6);
  });

  it('agrees with haversine to 0.1 % within a few kilometres', () => {
    const [x, y] = project(40.02, 22.53);
    expect(Math.hypot(x, y) / haversine(40, 22.5, 40.02, 22.53)).toBeCloseTo(1, 3);
  });
});

describe('projectOntoSegment', () => {
  it('drops a perpendicular inside the segment', () => {
    expect(projectOntoSegment([3, 4], [0, 0], [10, 0])).toEqual({ t: 0.3, dist: 4 });
  });

  it('clamps to the end points', () => {
    expect(projectOntoSegment([-3, 4], [0, 0], [10, 0])).toEqual({ t: 0, dist: 5 });
    expect(projectOntoSegment([13, -4], [0, 0], [10, 0])).toEqual({ t: 1, dist: 5 });
  });

  it('projects onto the start of a zero-length segment', () => {
    expect(projectOntoSegment([3, 4], [0, 0], [0, 0])).toEqual({ t: 0, dist: 5 });
  });
});
