/**
 * GPX track parser (PLAN §1.2, §5.1). Turns the `trkpt`s of every `trk`/`trkseg` into an
 * `Activity`. Workers have no `DOMParser`, so this is a small dependency-free tag scanner that
 * runs in a worker and in Node. Routes (`rte`) and waypoints are ignored.
 */
import { rollingMean } from '../analysis/interp';
import type { Activity } from '../model/types';
import { UnsupportedFileError } from './errors';

/** Mean Earth radius (IUGG), m. */
const EARTH_RADIUS = 6_371_008.8;

const SPEED_WINDOW = 5;

type Field = 'ele' | 'time' | 'hr' | 'cad' | 'atemp' | 'power';

interface Point {
  lat: number;
  lon: number;
  ele: number;
  time: number; // epoch ms
  hr: number;
  cad: number;
  atemp: number;
  power: number;
}

// Tag, comment, CDATA, processing instruction or declaration. Attribute values may contain `>`.
const TOKEN =
  /<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[?!][^>]*>/g;
const ATTRIBUTE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Parses GPX text. Throws `UnsupportedFileError` when there is no track point with a time.
 */
export function parseGpx(text: string, fileName: string): Activity {
  const points = keepIncreasingTimes(scanTrackPoints(text));
  if (points.length === 0) {
    throw new UnsupportedFileError("GPX has no timed track points (routes aren't supported)");
  }

  const n = points.length;
  const startTime = points[0]!.time;
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = (points[i]!.time - startTime) / 1000;

  const lat = float64Stream(points, 'lat');
  const lon = float64Stream(points, 'lon');
  const dist = cumulativeDistance(points);

  return {
    source: 'gpx',
    fileName,
    startTime,
    t,
    dist,
    lat,
    lon,
    ele: float32Stream(points, 'ele'),
    hr: float32Stream(points, 'hr'),
    cad: float32Stream(points, 'cad'),
    speed: rollingMean(rawSpeed(t, dist), SPEED_WINDOW),
    power: float32Stream(points, 'power'),
    temp: float32Stream(points, 'atemp'),
    laps: [],
    deviceSummary: { elapsed: null, distance: null, ascent: null, descent: null },
  };
}

/** Great-circle distance between two points in degrees, m. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function scanTrackPoints(text: string): Point[] {
  const points: Point[] = [];
  let trk = 0;
  let trkseg = 0;
  let extensions = 0;
  let point: Point | null = null;
  let field: Field | null = null;
  let fieldText = '';

  TOKEN.lastIndex = 0;
  let last = 0;
  for (let m = TOKEN.exec(text); m !== null; m = TOKEN.exec(text)) {
    if (field !== null) fieldText += text.slice(last, m.index);
    last = TOKEN.lastIndex;

    const [, closing, qname, attrs, selfClosing, cdata] = m;
    if (qname === undefined) {
      if (cdata !== undefined && field !== null) fieldText += cdata;
      continue;
    }
    const name = localName(qname);

    if (closing) {
      if (field !== null && name === field) {
        if (point !== null) point[field] = field === 'time' ? parseTime(fieldText) : parseNumber(fieldText);
        field = null;
      } else if (name === 'trkpt' && point !== null) {
        points.push(point);
        point = null;
        field = null;
        extensions = 0;
      } else if (name === 'extensions' && point !== null) extensions = Math.max(0, extensions - 1);
      else if (name === 'trkseg') trkseg = Math.max(0, trkseg - 1);
      else if (name === 'trk') trk = Math.max(0, trk - 1);
      continue;
    }

    if (name === 'trk') trk++;
    else if (name === 'trkseg' && trk > 0) trkseg++;
    else if (name === 'trkpt' && trkseg > 0) {
      const { lat, lon } = readAttributes(attrs ?? '');
      point = { lat, lon, ele: NaN, time: NaN, hr: NaN, cad: NaN, atemp: NaN, power: NaN };
      if (selfClosing) {
        points.push(point);
        point = null;
      }
    } else if (point !== null && !selfClosing) {
      if (name === 'extensions') extensions++;
      else if (field === null && isField(name, extensions > 0)) {
        field = name;
        fieldText = '';
      }
    }
  }
  return points;
}

function isField(name: string, inExtensions: boolean): name is Field {
  // hr/cad/atemp come from Garmin's TrackPointExtension (v1 or v2) under any prefix, so match by
  // local name; power has no Garmin schema and is usually a bare <power> in <extensions>.
  return inExtensions
    ? name === 'hr' || name === 'cad' || name === 'atemp' || name === 'power'
    : name === 'ele' || name === 'time';
}

function localName(qname: string): string {
  const colon = qname.indexOf(':');
  return colon < 0 ? qname : qname.slice(colon + 1);
}

function readAttributes(attrs: string): { lat: number; lon: number } {
  let lat = NaN;
  let lon = NaN;
  ATTRIBUTE.lastIndex = 0;
  for (let m = ATTRIBUTE.exec(attrs); m !== null; m = ATTRIBUTE.exec(attrs)) {
    const value = parseNumber(m[2] ?? m[3] ?? '');
    if (m[1] === 'lat') lat = value;
    else if (m[1] === 'lon') lon = value;
  }
  return { lat, lon };
}

function parseNumber(s: string): number {
  const trimmed = s.trim();
  return trimmed === '' ? NaN : Number(trimmed);
}

function parseTime(s: string): number {
  const iso = s.trim();
  if (iso === '') return NaN;
  // GPX times are UTC; Date.parse would read a zone-less date-time as local time.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return Date.parse(hasZone || !iso.includes('T') ? iso : `${iso}Z`);
}

function keepIncreasingTimes(points: Point[]): Point[] {
  const kept: Point[] = [];
  let previous = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.time) || p.time <= previous) continue;
    kept.push(p);
    previous = p.time;
  }
  return kept;
}

function cumulativeDistance(points: Point[]): Float64Array {
  const dist = new Float64Array(points.length);
  let total = 0;
  let from: Point | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      if (from !== null) total += haversine(from.lat, from.lon, p.lat, p.lon);
      from = p;
    }
    dist[i] = total;
  }
  return dist;
}

/** Central difference inside, one-sided at the ends. */
function rawSpeed(t: Float64Array, dist: Float64Array): Float32Array {
  const n = t.length;
  const speed = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    if (b > a) speed[i] = (dist[b]! - dist[a]!) / (t[b]! - t[a]!);
  }
  return speed;
}

function float64Stream(points: Point[], key: 'lat' | 'lon'): Float64Array | null {
  if (!points.some((p) => Number.isFinite(p[key]))) return null;
  return Float64Array.from(points, (p) => p[key]);
}

function float32Stream(points: Point[], key: Exclude<Field, 'time'>): Float32Array | null {
  if (!points.some((p) => Number.isFinite(p[key]))) return null;
  return Float32Array.from(points, (p) => p[key]);
}
