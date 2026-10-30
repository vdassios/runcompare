/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Decoder, Stream } from '@garmin/fitsdk';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Activity, type Lap, type LapTrigger } from '../model/types';
import { loadFixture } from '../test/fixtures';
import { alignToCourse, alignToDistance, buildReference, type AlignmentResult } from './alignment';
import { EARTH_RADIUS } from './geo';

// Until the FIT parser (task 03) lands: just the streams alignment reads.
function loadFit(name: string): Activity {
  const bytes = readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', name));
  const { messages } = new Decoder(Stream.fromByteArray(bytes)).read();
  const t: number[] = [];
  const dist: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const semicircles = 180 / 2 ** 31;
  let start = NaN;
  let distance = 0;
  for (const r of messages.recordMesgs ?? []) {
    const time = new Date(r.timestamp ?? NaN).getTime() / 1000;
    if (Number.isNaN(start)) start = time;
    if (t.length > 0 && time - start <= t[t.length - 1]!) continue;
    t.push(time - start);
    distance = Math.max(distance, r.distance ?? distance);
    dist.push(distance);
    lat.push(r.positionLat === undefined ? NaN : r.positionLat * semicircles);
    lon.push(r.positionLong === undefined ? NaN : r.positionLong * semicircles);
  }
  return activity(name, t, dist, lat, lon);
}

function activity(fileName: string, t: number[], dist: number[], lat: number[] | null, lon: number[] | null): Activity {
  return {
    source: 'fit',
    fileName,
    startTime: 0,
    t: Float64Array.from(t),
    dist: Float64Array.from(dist),
    lat: lat && Float64Array.from(lat),
    lon: lon && Float64Array.from(lon),
    ele: null,
    hr: null,
    cad: null,
    speed: null,
    power: null,
    temp: null,
    laps: [],
    deviceSummary: { elapsed: null, distance: null, ascent: null, descent: null },
  };
}

// Synthetic tracks are drawn in metres around this point; the reference projection is centred on it.
const LAT0 = 40;
const LON0 = 22.5;
const M_PER_DEG_LAT = (EARTH_RADIUS * Math.PI) / 180;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** Points every `step` m along the polyline through `corners` (x east, y north, m). */
function walk(corners: [number, number][], step: number): [number, number][] {
  const points: [number, number][] = [corners[0]!];
  let carry = 0;
  for (let k = 1; k < corners.length; k++) {
    const [ax, ay] = corners[k - 1]!;
    const [bx, by] = corners[k]!;
    const length = Math.hypot(bx - ax, by - ay);
    let s = step - carry;
    for (; s <= length; s += step) points.push([ax + ((bx - ax) * s) / length, ay + ((by - ay) * s) / length]);
    carry = length - (s - step);
  }
  const last = corners[corners.length - 1]!;
  if (carry > 1e-9) points.push(last);
  return points;
}

/** An activity at 1 sample/s along `points`, with the watch distance as the exact path length. */
function track(points: [number, number][]): Activity {
  const dist = [0];
  for (let i = 1; i < points.length; i++) {
    dist.push(dist[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  }
  return activity(
    'synthetic',
    points.map((_, i) => i),
    dist,
    points.map(([, y]) => LAT0 + y / M_PER_DEG_LAT),
    points.map(([x]) => LON0 + x / M_PER_DEG_LON),
  );
}

function offCourseRuns(attempt: Activity, result: AlignmentResult) {
  const runs: { from: number; to: number; metres: number }[] = [];
  for (let i = 0; i < result.offCourse.length; i++) {
    if (!result.offCourse[i]) continue;
    const startsRun = i === 0 || !result.offCourse[i - 1];
    if (startsRun) runs.push({ from: result.courseDist[i]!, to: result.courseDist[i]!, metres: 0 });
    const run = runs[runs.length - 1]!;
    run.to = result.courseDist[i]!;
    if (!startsRun) run.metres += attempt.dist[i]! - attempt.dist[i - 1]!;
  }
  return runs;
}

function isMonotonic(xs: Float64Array): boolean {
  return xs.every((x, i) => i === 0 || x >= xs[i - 1]!);
}

describe('buildReference', () => {
  const y = (m: number) => LAT0 + m / M_PER_DEG_LAT;

  it('takes d from the watch distance, skips vertices under 1 m apart, and keeps the finish', () => {
    const baseline = activity(
      'b',
      [0, 1, 2, 3, 4],
      [0, 10, 10.5, 20, 20.4],
      [y(0), y(10), y(10.5), y(20), y(20.4)],
      [LON0, LON0, LON0, LON0, LON0],
    );
    const ref = buildReference(baseline);
    expect(Array.from(ref.d)).toEqual([0, 10, 20, 20.4]);
    expect(ref.length).toBe(20.4);
    expect(ref.x[0]).toBe(0);
    expect(ref.y[1]).toBeCloseTo(10, 6);
  });

  it('skips samples without a fix', () => {
    const baseline = activity('b', [0, 1, 2], [0, 5, 10], [y(0), NaN, y(10)], [LON0, NaN, LON0]);
    expect(Array.from(buildReference(baseline).d)).toEqual([0, 10]);
  });

  it('throws without positions', () => {
    expect(() => buildReference(activity('b', [0, 1], [0, 5], null, null))).toThrow();
  });
});

describe('alignToDistance', () => {
  it('scales linearly and lands the last sample exactly on the length', () => {
    const attempt = activity('a', [0, 1, 2, 3], [0, 1000, 2000, 3333.3], null, null);
    const result = alignToDistance(attempt, 5000);
    expect(result.courseDist[1]).toBeCloseTo(1500.015, 3);
    expect(result.courseDist[3]).toBe(5000);
    expect(Array.from(result.offCourse)).toEqual([0, 0, 0, 0]);
    expect(result.overlap).toBe(1);
  });

  /** Ten samples per lap of each watch length; `trigger` for every lap. */
  function lapped(lengths: number[], trigger: LapTrigger = 'manual'): Activity {
    const dist = [0];
    const laps: Lap[] = [];
    for (const [k, l] of lengths.entries()) {
      const at = dist[dist.length - 1]!;
      for (let s = 1; s <= 10; s++) dist.push(at + (l * s) / 10);
      laps.push({ startIndex: k === 0 ? 0 : dist.length - 10, endIndex: dist.length - 1, trigger });
    }
    return { ...activity('laps', Array.from(dist.keys()), dist, null, null), laps };
  }
  const lapEnds = (result: AlignmentResult, laps: number) =>
    Array.from({ length: laps }, (_, k) => result.courseDist[(k + 1) * 10]);

  // 25 laps of 405–425 m on the watch, 10,293 m in all.
  const track = lapped(Array.from({ length: 25 }, (_, k) => 405 + ((k * 7) % 21)));
  // Per-km laps of 1,005–1,020 m, then the last 1,030 m to the finish without a press.
  const road = lapped([1012, 1008, 1015, 1020, 1005, 1011, 1018, 1009, 1013, 1030]);
  road.laps[9]!.trigger = 'session_end';

  it('snaps a track 10K to exact multiples of 400 m', () => {
    const result = alignToDistance(track, 10_000);
    expect(lapEnds(result, 25)).toEqual(Array.from({ length: 25 }, (_, k) => (k + 1) * 400));
    expect(result.courseDist[5]).toBeCloseTo(200, 9);
    expect(result.courseDist[250]).toBe(10_000);
    expect(isMonotonic(result.courseDist)).toBe(true);
    expect(result.warning).toEqual({
      code: 'distance-scaling',
      attemptId: null,
      message: 'Placed by its 25 manual laps, each counted as exactly 0.4 km.',
    });
  });

  it('snaps a road 10K to whole kilometres and stretches the rest to the finish', () => {
    const result = alignToDistance(road, 10_000);
    expect(lapEnds(result, 9)).toEqual(Array.from({ length: 9 }, (_, k) => (k + 1) * 1000));
    expect(result.courseDist[95]).toBeCloseTo(9500, 9);
    expect(result.courseDist[100]).toBe(10_000);
    expect(result.warning!.message).toContain('9 manual laps');
  });

  it('scales auto laps, or any laps with snapping off, linearly', () => {
    const auto = { ...road, laps: road.laps.map((lap) => ({ ...lap, trigger: 'distance' as const })) };
    const result = alignToDistance(auto, 10_000);
    const total = auto.dist[auto.dist.length - 1]!;
    expect(result.courseDist[10]).toBeCloseTo((1012 * 10_000) / total, 9);
    expect(result.warning!.message).toBe('Its watch distance of 10.14 km is scaled evenly to 10.00 km.');
    expect(alignToDistance(track, 10_000, { snapLaps: false }).courseDist[10]).toBeCloseTo((405 * 10_000) / 10_293, 9);
  });

  it('falls back to linear when the manual laps are irregular or overrun the distance', () => {
    const { activity: trail } = loadFixture('fit-two-attempts').attempts[0]!;
    const total = trail.dist[trail.dist.length - 1]!;
    const result = alignToDistance(trail, 54_000);
    expect(result.courseDist[1000]).toBeCloseTo((trail.dist[1000]! * 54_000) / total, 6);
    expect(result.warning!.message).toContain('manual laps were not used');
    // 25 × 400 m runs past 5K, and leaves too much of a half marathon after the last lap.
    expect(alignToDistance(track, 5000).warning!.message).toContain('scaled evenly');
    expect(alignToDistance(track, 21_097.5).warning!.message).toContain('scaled evenly');
  });
});

describe('alignToCourse', () => {
  const course = track(
    walk(
      [
        [0, 0],
        [3000, 0],
      ],
      3,
    ),
  );

  it('falls back to distance scaling with overlap 0 when the attempt has no positions', () => {
    const attempt = activity('a', [0, 1, 2], [0, 500, 1000], null, null);
    const result = alignToCourse(attempt, buildReference(course), DEFAULT_SETTINGS);
    expect(Array.from(result.courseDist)).toEqual([0, 1500, 3000]);
    expect(result.overlap).toBe(0);
  });

  describe('on the fixtures', () => {
    const race2024 = loadFit('trail-2024.fit');
    const race2025 = loadFit('trail-2025.fit');
    const ref = buildReference(race2024);

    it('aligns the baseline to its own watch distance', () => {
      const started = performance.now();
      const result = alignToCourse(race2024, ref, DEFAULT_SETTINGS);
      console.info(`self-alignment of ${race2024.t.length} samples: ${(performance.now() - started).toFixed(0)} ms`);
      let worst = 0;
      for (let i = 0; i < race2024.dist.length; i++) {
        worst = Math.max(worst, Math.abs(result.courseDist[i]! - race2024.dist[i]!));
      }
      expect(worst).toBeLessThanOrEqual(5);
      expect(result.overlap).toBe(1);
      expect(result.offCourse.includes(1)).toBe(false);
    });

    it('aligns 2025 onto the 2024 course', () => {
      const result = alignToCourse(race2025, ref, DEFAULT_SETTINGS);
      const runs = offCourseRuns(race2025, result);
      console.info(`2025 on 2024: overlap ${result.overlap.toFixed(4)}, off-course runs ${JSON.stringify(runs)}`);
      expect(isMonotonic(result.courseDist)).toBe(true);
      const finish = result.courseDist[result.courseDist.length - 1]!;
      expect(Math.abs(finish - ref.length)).toBeLessThanOrEqual(0.005 * ref.length);
      expect(result.overlap).toBeGreaterThan(0.95);
      expect(runs.every((run) => run.metres <= 200)).toBe(true);
    });

    it('gives a low overlap for another course', () => {
      // The 2025 race moved 3 km north: same shape, different trails.
      const shifted: Activity = { ...race2025, lat: race2025.lat!.map((v) => v + 0.027) };
      const result = alignToCourse(shifted, ref, DEFAULT_SETTINGS);
      console.info(`shifted course: overlap ${result.overlap.toFixed(4)}`);
      expect(result.overlap).toBeLessThan(0.3);
      expect(isMonotonic(result.courseDist)).toBe(true);
    });
  });

  it('maps the way back of an out-and-back to the second half', () => {
    // The reference's two legs are 4 m apart. The attempt runs out nearer the return leg and back
    // nearer the outward one, so the nearest leg alone would pick the wrong one at both ends.
    const ref = buildReference(
      track(
        walk(
          [
            [0, 0],
            [4000, 0],
            [4000, 4],
            [0, 4],
          ],
          2.5,
        ),
      ),
    );
    const attempt = track(
      walk(
        [
          [0, 3],
          [3999, 3],
          [3999, 1],
          [0, 1],
        ],
        3.1,
      ),
    );
    const result = alignToCourse(attempt, ref, DEFAULT_SETTINGS);
    const scale = ref.length / attempt.dist[attempt.dist.length - 1]!;
    for (let i = 0; i < attempt.dist.length; i++) {
      if (attempt.dist[i]! > 4010) expect(result.courseDist[i]).toBeGreaterThan(4000);
      expect(Math.abs(result.courseDist[i]! - attempt.dist[i]! * scale)).toBeLessThan(15);
    }
    expect(result.overlap).toBe(1);
  });

  it('maps two laps of a 3 km loop onto 0–6 km', () => {
    const lap: [number, number][] = [
      [0, 0],
      [750, 0],
      [750, 750],
      [0, 750],
      [0, 0],
    ];
    const ref = buildReference(track(walk([...lap, ...lap.slice(1)], 2.5)));
    // Both laps of the reference lie on top of each other; the attempt runs 4 m east and 3 m south of them.
    const shifted = lap.map(([x, y]): [number, number] => [x + 4, y - 3]);
    const attempt = track(walk([...shifted, ...shifted.slice(1)], 2.9));
    const result = alignToCourse(attempt, ref, DEFAULT_SETTINGS);
    const n = attempt.dist.length;
    expect(ref.length).toBeCloseTo(6000, 6);
    for (let i = 0; i < n; i++) {
      if (attempt.dist[i]! > 3010) expect(result.courseDist[i]).toBeGreaterThan(3000);
      // Offset corners are ambiguous by about 4 + 3 m plus the offset along the course.
      expect(Math.abs(result.courseDist[i]! - attempt.dist[i]!)).toBeLessThan(12);
    }
    expect(result.courseDist[n - 1]).toBeGreaterThan(5990);
    expect(result.overlap).toBe(1);
  });

  it('flags a 600 m detour 150 m off the course as one off-course run and re-acquires after it', () => {
    const ref = buildReference(course);
    const points = walk(
      [
        [0, 0],
        [1000, 0],
        [1000, 150],
        [1600, 150],
        [1600, 0],
        [3000, 0],
      ],
      3,
    );
    const attempt = track(points);
    const result = alignToCourse(attempt, ref, DEFAULT_SETTINGS);
    const runs = offCourseRuns(attempt, result);
    expect(runs).toHaveLength(1);
    points.forEach(([x, y], i) => {
      expect(result.offCourse[i]).toBe(y > 75.5 ? 1 : y < 74.5 ? 0 : result.offCourse[i]);
      if (y === 0 && x > 1700) expect(Math.abs(result.courseDist[i]! - x)).toBeLessThan(10);
    });
    expect(isMonotonic(result.courseDist)).toBe(true);
    expect(result.courseDist[points.length - 1]).toBeCloseTo(3000, 6);
  });

  it('re-acquires after a detour that runs much longer than the course it skips', () => {
    // 1.4 km of zigzags in place of 600 m of course: dead reckoning overshoots the rejoin by ~400 m.
    const ref = buildReference(course);
    const zigzag: [number, number][] = [
      [1000, 150],
      [1100, 300],
      [1200, 150],
      [1300, 300],
      [1400, 150],
      [1500, 300],
      [1600, 150],
    ];
    const points = walk([[0, 0], [1000, 0], ...zigzag, [1600, 0], [3000, 0]], 3);
    const result = alignToCourse(track(points), ref, DEFAULT_SETTINGS);
    expect(offCourseRuns(track(points), result)).toHaveLength(1);
    points.forEach(([x, y], i) => {
      if (y === 0 && x > 2100) {
        expect(result.offCourse[i]).toBe(0);
        expect(Math.abs(result.courseDist[i]! - x)).toBeLessThan(10);
      }
    });
    expect(isMonotonic(result.courseDist)).toBe(true);
  });

  it('holds at the start until the attempt reaches the course', () => {
    // Warming up 300 m south of the start line, then running the course.
    const ref = buildReference(course);
    const points = walk(
      [
        [0, -300],
        [0, 0],
        [3000, 0],
      ],
      3,
    );
    const result = alignToCourse(track(points), ref, DEFAULT_SETTINGS);
    points.forEach(([x, y], i) => {
      if (y < -75.5) expect(result.courseDist[i]).toBe(0);
      if (y === 0) expect(Math.abs(result.courseDist[i]! - x)).toBeLessThan(1);
    });
  });
});
