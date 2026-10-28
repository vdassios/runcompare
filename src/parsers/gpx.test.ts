/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UnsupportedFileError } from './errors';
import { parseGpx } from './gpx';

const FIXTURES_DIR = join(import.meta.dirname, '..', '..', 'fixtures');
const readFixture = (name: string) => readFileSync(join(FIXTURES_DIR, name), 'utf8');

const V1 = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1';
const V2 = 'http://www.garmin.com/xmlschemas/TrackPointExtension/v2';

function gpx(body: string, ns = `xmlns:gpxtpx="${V1}"`): string {
  return `<?xml version="1.0" encoding="UTF-8"?><gpx xmlns="http://www.topografix.com/GPX/1/1" ${ns}>${body}</gpx>`;
}

describe.each([
  { file: 'trail-2024-head.gpx', points: 691, start: '2024-11-02T05:00:48.000Z' },
  { file: 'trail-2025-head.gpx', points: 711, start: '2025-11-01T04:30:25.000Z' },
])('parseGpx($file)', ({ file, points, start }) => {
  const activity = parseGpx(readFixture(file), file);

  it('reads every track point', () => {
    expect(activity.source).toBe('gpx');
    expect(activity.fileName).toBe(file);
    expect(activity.t.length).toBe(points);
    for (const stream of [activity.dist, activity.lat, activity.lon, activity.ele, activity.hr, activity.speed]) {
      expect(stream?.length).toBe(points);
    }
  });

  it('starts at the first point time', () => {
    expect(new Date(activity.startTime).toISOString()).toBe(start);
    expect(activity.t[0]).toBe(0);
  });

  it('covers about 2 km', () => {
    expect(activity.dist.at(-1)).toBeGreaterThan(1970);
    expect(activity.dist.at(-1)).toBeLessThan(2030);
  });

  it('has heart rate but no cadence, power or temperature', () => {
    expect(activity.hr).not.toBeNull();
    expect(activity.cad).toBeNull();
    expect(activity.power).toBeNull();
    expect(activity.temp).toBeNull();
  });

  it('keeps t strictly increasing and dist non-decreasing', () => {
    for (let i = 1; i < activity.t.length; i++) {
      expect(activity.t[i]).toBeGreaterThan(activity.t[i - 1]!);
      expect(activity.dist[i]).toBeGreaterThanOrEqual(activity.dist[i - 1]!);
    }
  });

  it('has no laps or device summary', () => {
    expect(activity.laps).toEqual([]);
    expect(activity.deviceSummary).toEqual({ elapsed: null, distance: null, ascent: null, descent: null });
  });
});

describe('parseGpx', () => {
  it('reads TrackPointExtension v2 fields and power', () => {
    const a = parseGpx(
      gpx(
        `<trk><trkseg>
          <trkpt lat="0" lon="0"><time>2024-01-01T00:00:00Z</time><extensions><power>250</power>
            <gpxtpx:TrackPointExtension><gpxtpx:atemp>12.5</gpxtpx:atemp><gpxtpx:hr>140</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension>
          </extensions></trkpt>
          <trkpt lat="0" lon="0.001"><time>2024-01-01T00:00:01Z</time></trkpt>
        </trkseg></trk>`,
        `xmlns:gpxtpx="${V2}"`,
      ),
      'v2.gpx',
    );
    expect(Array.from(a.hr!)).toEqual([140, NaN]);
    expect(Array.from(a.cad!)).toEqual([88, NaN]);
    expect(Array.from(a.temp!)).toEqual([12.5, NaN]);
    expect(Array.from(a.power!)).toEqual([250, NaN]);
    expect(a.ele).toBeNull();
  });

  it('reads extensions under any prefix', () => {
    const a = parseGpx(
      gpx(
        `<trk><trkseg><trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time><extensions>
          <ns3:TrackPointExtension><ns3:hr>151</ns3:hr></ns3:TrackPointExtension>
        </extensions></trkpt></trkseg></trk>`,
        `xmlns:ns3="${V1}"`,
      ),
      'ns3.gpx',
    );
    expect(Array.from(a.hr!)).toEqual([151]);
  });

  it('reads every segment of every track in order, with times and haversine distance', () => {
    const a = parseGpx(
      gpx(
        `<trk><trkseg>
          <trkpt lat="0" lon="0"><time>2024-01-01T00:00:00Z</time></trkpt>
          <trkpt lat="0" lon="0.001"><time>2024-01-01T00:00:10Z</time></trkpt>
        </trkseg><trkseg>
          <trkpt lat="0" lon="0.002"><time>2024-01-01T00:00:20.5Z</time></trkpt>
        </trkseg></trk>
        <trk><trkseg><trkpt lat="0" lon="0.003"><time>2024-01-01T01:00:30+01:00</time></trkpt></trkseg></trk>`,
      ),
      'segments.gpx',
    );
    expect(Array.from(a.t)).toEqual([0, 10, 20.5, 30]);
    expect(Array.from(a.lon!)).toEqual([0, 0.001, 0.002, 0.003]);
    // 0.001° of longitude on the equator is R·π/180_000 ≈ 111.195 m.
    expect(a.dist[1]).toBeCloseTo(111.195, 3);
    expect(a.dist[3]).toBeCloseTo(3 * 111.195, 2);
  });

  it('gives NaN for a missing elevation', () => {
    const a = parseGpx(
      gpx(
        `<trk><trkseg>
          <trkpt lat="0" lon="0"><ele>100.5</ele><time>2024-01-01T00:00:00Z</time></trkpt>
          <trkpt lat="0" lon="0"><time>2024-01-01T00:00:01Z</time></trkpt>
          <trkpt lat="0" lon="0"><ele>102</ele><time>2024-01-01T00:00:02Z</time></trkpt>
        </trkseg></trk>`,
      ),
      'ele.gpx',
    );
    expect(Array.from(a.ele!)).toEqual([100.5, NaN, 102]);
    expect(a.hr).toBeNull();
  });

  it('drops points with no, duplicate or decreasing times', () => {
    const a = parseGpx(
      gpx(
        `<trk><trkseg>
          <trkpt lat="0" lon="0"><ele>1</ele><time>2024-01-01T00:00:00Z</time></trkpt>
          <trkpt lat="0" lon="0"><ele>2</ele></trkpt>
          <trkpt lat="0" lon="0"><ele>3</ele><time>2024-01-01T00:00:00Z</time></trkpt>
          <trkpt lat="0" lon="0"><ele>4</ele><time>2024-01-01T00:00:02Z</time></trkpt>
          <trkpt lat="0" lon="0"><ele>5</ele><time>2024-01-01T00:00:01Z</time></trkpt>
          <trkpt lat="0" lon="0"><ele>6</ele><time>2024-01-01T00:00:03Z</time></trkpt>
        </trkseg></trk>`,
      ),
      'times.gpx',
    );
    expect(Array.from(a.ele!)).toEqual([1, 4, 6]);
    expect(Array.from(a.t)).toEqual([0, 2, 3]);
  });

  it('smooths speed with a 5-sample centred mean of distance over time', () => {
    // 1 s apart, steps of 0.001° of longitude: a constant 111.195 m/s.
    const points = [0, 1, 2, 3, 4, 5]
      .map((i) => `<trkpt lat="0" lon="${i / 1000}"><time>2024-01-01T00:00:0${i}Z</time></trkpt>`)
      .join('');
    const a = parseGpx(gpx(`<trk><trkseg>${points}</trkseg></trk>`), 'speed.gpx');
    for (const v of a.speed!) expect(v).toBeCloseTo(111.195, 2);
  });

  it('throws UnsupportedFileError for a route-only GPX', () => {
    const route = gpx(
      `<rte><rtept lat="0" lon="0"><time>2024-01-01T00:00:00Z</time></rtept>
        <rtept lat="0" lon="0.001"><time>2024-01-01T00:00:01Z</time></rtept></rte>`,
    );
    expect(() => parseGpx(route, 'route.gpx')).toThrow(UnsupportedFileError);
    expect(() => parseGpx(route, 'route.gpx')).toThrow("GPX has no timed track points (routes aren't supported)");
  });

  it('accepts CRLF line endings and a BOM', () => {
    const text =
      '﻿' +
      gpx(
        `<trk>\r\n<trkseg>\r\n<trkpt\r\n lat="1.5"\r\n lon="2.5">\r\n<ele>\r\n10\r\n</ele>\r\n` +
          `<time>2024-01-01T00:00:00Z</time>\r\n</trkpt>\r\n</trkseg>\r\n</trk>\r\n`,
      ).replace(/></g, '>\r\n<');
    const a = parseGpx(text, 'crlf.gpx');
    expect(Array.from(a.lat!)).toEqual([1.5]);
    expect(Array.from(a.lon!)).toEqual([2.5]);
    expect(Array.from(a.ele!)).toEqual([10]);
    expect(a.startTime).toBe(Date.UTC(2024, 0, 1));
  });
});
