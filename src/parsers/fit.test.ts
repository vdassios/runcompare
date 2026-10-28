/// <reference types="node" />
import { Encoder, Profile } from '@garmin/fitsdk';
import type { FileIdMesg, LapMesg, RecordMesg, SessionMesg } from '@garmin/fitsdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Activity } from '../model/types';
import { UnsupportedFileError } from './errors';
import { parseFit } from './fit';

const FIXTURES_DIR = join(import.meta.dirname, '..', '..', 'fixtures');

function readFixture(name: string): ArrayBuffer {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name))).buffer;
}

function median(values: ArrayLike<number>): number {
  const finite = Array.from(values)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return finite[finite.length >> 1]!;
}

type Message = [number, FileIdMesg | RecordMesg | LapMesg | SessionMesg];

/** Encodes the messages as a FIT file; each one is `[mesgNum, fields]`. */
function encode(mesgs: Message[]): ArrayBuffer {
  const encoder = new Encoder();
  for (const [mesgNum, mesg] of mesgs) encoder.writeMesg({ mesgNum, ...mesg });
  return new Uint8Array(encoder.close()).buffer;
}

const { FILE_ID, RECORD, LAP, SESSION } = Profile.MesgNum as Record<string, number>;
const fileId: Message = [FILE_ID!, { type: 'activity', manufacturer: 'development', timeCreated: new Date(0) }];
const at = (s: number): Date => new Date(Date.UTC(2025, 10, 1, 4, 30, s));

// The 2025 watch recorded a 168-sample HR dropout down to 39 bpm about 3.5 h in. The parser keeps
// samples as recorded, so that file's lower HR bound is the recorded minimum, not 60.
describe.each([
  {
    file: 'trail-2024.fit',
    samples: 25_735,
    dist: 54_128,
    end: 25_734,
    start: '2024-11-02T05:00:47Z',
    laps: 42,
    hrMin: 60,
  },
  {
    file: 'trail-2025.fit',
    samples: 26_280,
    dist: 53_936,
    end: 26_279,
    start: '2025-11-01T04:30:24Z',
    laps: 42,
    hrMin: 39,
  },
])('parseFit($file)', ({ file, samples, dist, end, start, laps, hrMin }) => {
  const bytes = readFixture(file);
  const began = performance.now();
  const activity = parseFit(bytes, file);
  console.log(`parseFit(${file}): ${(performance.now() - began).toFixed(0)} ms`);
  const n = activity.t.length;

  it('matches the fixture facts', () => {
    expect(activity.source).toBe('fit');
    expect(activity.fileName).toBe(file);
    expect(activity.startTime).toBe(Date.parse(start));
    expect(n).toBe(samples);
    expect(activity.dist[n - 1]).toBeCloseTo(dist, -2);
    expect(Math.abs(activity.dist[n - 1]! - dist)).toBeLessThanOrEqual(50);
    expect(Math.abs(activity.t[n - 1]! - end)).toBeLessThanOrEqual(2);
    expect(Math.abs(activity.deviceSummary.elapsed! - activity.t[n - 1]!)).toBeLessThanOrEqual(1);
    expect(activity.deviceSummary.distance).toBeCloseTo(dist, -2);
    expect(activity.deviceSummary.ascent).toBeGreaterThan(2_700);
    expect(activity.deviceSummary.descent).toBeGreaterThan(2_700);
  });

  it('has every stream, each as long as t', () => {
    const streams: (keyof Activity)[] = ['dist', 'lat', 'lon', 'ele', 'hr', 'cad', 'speed', 'power', 'temp'];
    for (const key of streams) {
      const stream = activity[key] as ArrayLike<number> | null;
      expect(stream, key).not.toBeNull();
      expect(stream!.length, key).toBe(n);
    }
  });

  it('keeps samples in range', () => {
    const hr = activity.hr!.filter((v) => !Number.isNaN(v));
    expect(Math.min(...hr)).toBeGreaterThanOrEqual(hrMin);
    expect(Math.max(...hr)).toBeLessThanOrEqual(200);
    expect(median(activity.cad!)).toBeGreaterThanOrEqual(140);
    expect(median(activity.cad!)).toBeLessThanOrEqual(190);
    // Degrees, not semicircles: the race is near Mount Olympus.
    expect(median(activity.lat!)).toBeCloseTo(40.1, 0);
    expect(median(activity.lon!)).toBeCloseTo(22.4, 0);
  });

  it('has t strictly increasing from 0 and dist never decreasing', () => {
    expect(activity.t[0]).toBe(0);
    let increasing = true;
    let nonDecreasing = true;
    for (let i = 1; i < n; i++) {
      if (!(activity.t[i]! > activity.t[i - 1]!)) increasing = false;
      if (!(activity.dist[i]! >= activity.dist[i - 1]!)) nonDecreasing = false;
    }
    expect(increasing).toBe(true);
    expect(nonDecreasing).toBe(true);
  });

  it('has laps in order that cover the samples without overlapping', () => {
    expect(activity.laps).toHaveLength(laps);
    expect(activity.laps[0]!.startIndex).toBe(0);
    expect(activity.laps.at(-1)!.endIndex).toBe(n - 1);
    activity.laps.forEach((lap, k) => {
      expect(lap.endIndex).toBeGreaterThanOrEqual(lap.startIndex);
      expect(lap.trigger).toBe('manual');
      if (k > 0) expect(lap.startIndex).toBe(activity.laps[k - 1]!.endIndex + 1);
    });
  });
});

describe('parseFit rules', () => {
  it('drops repeated timestamps, fills gaps with NaN and keeps dist non-decreasing', () => {
    const activity = parseFit(
      encode([
        fileId,
        [RECORD!, { timestamp: at(0), distance: 0, heartRate: 100, cadence: 80, fractionalCadence: 0.5 }],
        [RECORD!, { timestamp: at(1), distance: 10, cadence: 81 }],
        [RECORD!, { timestamp: at(1), distance: 99, heartRate: 199 }],
        [RECORD!, { timestamp: at(0), distance: 99 }],
        [RECORD!, { timestamp: at(3), distance: 8, heartRate: 120 }],
        [RECORD!, { timestamp: at(4), heartRate: 130 }],
        [RECORD!, { timestamp: at(5), distance: 20 }],
        [SESSION!, { timestamp: at(5), sport: 'running' }],
      ]),
      'rules.fit',
    );
    expect(activity.startTime).toBe(at(0).getTime());
    expect(Array.from(activity.t)).toEqual([0, 1, 3, 4, 5]);
    expect(Array.from(activity.dist)).toEqual([0, 10, 10, 10, 20]);
    expect(Array.from(activity.hr!)).toEqual([100, NaN, 120, 130, NaN]);
    expect(Array.from(activity.cad!)).toEqual([161, 162, NaN, NaN, NaN]);
    expect(activity.lat).toBeNull();
    expect(activity.power).toBeNull();
    expect(activity.laps).toEqual([]);
    expect(activity.deviceSummary).toEqual({ elapsed: null, distance: null, ascent: null, descent: null });
  });

  it('keeps cycling cadence, measures dist by haversine without a distance field, and maps lap triggers', () => {
    const semicircles = (degrees: number) => Math.round((degrees * 2 ** 31) / 180);
    const activity = parseFit(
      encode([
        fileId,
        [RECORD!, { timestamp: at(0), positionLat: semicircles(40), positionLong: semicircles(22), cadence: 90 }],
        [RECORD!, { timestamp: at(1), cadence: 91 }],
        [RECORD!, { timestamp: at(2), positionLat: semicircles(40.001), positionLong: semicircles(22) }],
        [LAP!, { timestamp: at(1), startTime: at(0), lapTrigger: 'distance' }],
        [LAP!, { timestamp: at(2), startTime: at(1), lapTrigger: 'fitnessEquipment' }],
        [SESSION!, { timestamp: at(2), sport: 'cycling', totalElapsedTime: 2, totalDistance: 111 }],
      ]),
      'ride.fit',
    );
    expect(Array.from(activity.cad!)).toEqual([90, 91, NaN]);
    expect(activity.lat![0]).toBeCloseTo(40, 6);
    expect(activity.lat![1]).toBeNaN();
    expect(activity.dist[0]).toBe(0);
    expect(activity.dist[1]).toBe(0);
    expect(activity.dist[2]).toBeCloseTo(111.2, 1);
    expect(activity.laps).toEqual([
      { startIndex: 0, endIndex: 0, trigger: 'distance' },
      { startIndex: 1, endIndex: 2, trigger: 'unknown' },
    ]);
    expect(activity.deviceSummary).toEqual({ elapsed: 2, distance: 111, ascent: null, descent: null });
  });

  it('rejects bytes that are not FIT', () => {
    expect(() => parseFit(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).buffer, 'x.fit')).toThrow(
      UnsupportedFileError,
    );
  });
});
