import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/fixtures';
import { finiteRuns, indexAtDistance, lineBounds, mapLines, nearestPointIndex, rangeRuns } from './geometry';

const line = {
  lat: Float64Array.from([40, 40.001, NaN, 40.003, 40.004]),
  lon: Float64Array.from([22, 22, 22, 22, 22]),
  d: Float64Array.from([0, 100, 200, 300, 400]),
};

describe('nearestPointIndex', () => {
  it('finds the nearest finite position', () => {
    expect(nearestPointIndex(line.lat, line.lon, 40.0012, 22.0005)).toBe(1);
    expect(nearestPointIndex(line.lat, line.lon, 40.0021, 22)).toBe(3); // index 2 is missing
  });

  it('weighs longitude by the cosine of latitude', () => {
    // At 60° N a degree of longitude is half a degree of latitude.
    const lat = Float64Array.from([60.0009, 60]);
    const lon = Float64Array.from([0, 0.0016]);
    expect(nearestPointIndex(lat, lon, 60, 0)).toBe(1);
  });

  it('returns −1 when nothing is finite', () => {
    expect(nearestPointIndex(Float64Array.from([NaN]), Float64Array.from([NaN]), 0, 0)).toBe(-1);
  });
});

describe('indexAtDistance', () => {
  it('finds the drawable point nearest a course distance', () => {
    expect(indexAtDistance(line, 140)).toBe(1);
    expect(indexAtDistance(line, 210)).toBe(3); // nearest is 200, which has no position
    expect(indexAtDistance(line, 10_000)).toBe(4);
  });
});

describe('finiteRuns and rangeRuns', () => {
  it('splits a polyline at missing positions and drops single points', () => {
    expect(finiteRuns(line.lat, line.lon)).toEqual([
      [
        [40, 22],
        [40.001, 22],
      ],
      [
        [40.003, 22],
        [40.004, 22],
      ],
    ]);
    expect(finiteRuns(line.lat, line.lon, 1, 3)).toEqual([]);
  });

  it('keeps only the points inside a course-distance range', () => {
    expect(rangeRuns(line, 250, 400)).toEqual([
      [
        [40.003, 22],
        [40.004, 22],
      ],
    ]);
  });
});

describe('lineBounds', () => {
  it('spans every finite position', () => {
    expect(lineBounds([line])).toEqual([
      [40, 22],
      [40.004, 22],
    ]);
    expect(lineBounds([])).toBeNull();
  });
});

describe('mapLines', () => {
  const { analysis } = loadFixture('fit-two-attempts');

  it('takes the course from the grid and every attempt track', () => {
    const lines = mapLines(analysis)!;
    expect(lines.course?.lat).toBe(analysis.grid.lat);
    expect(lines.tracks.map((t) => t.attemptId)).toEqual(['trail-2024', 'trail-2025']);
  });

  it('falls back to tracks alone without a gridded course, and to null with no positions', () => {
    const noCourse = { ...analysis, grid: { ...analysis.grid, lat: null, lon: null } };
    expect(mapLines(noCourse)).toMatchObject({ course: null, tracks: [{}, {}] });
    expect(mapLines({ ...noCourse, attempts: noCourse.attempts.map((a) => ({ ...a, track: null })) })).toBeNull();
  });
});
