/**
 * Turns a FIT file into an Activity (PLAN §5.1): streams from `record` messages, laps from `lap`
 * messages and device totals from the first `session`. Pure and DOM-free: it runs in the worker.
 */
import { Decoder, Stream } from '@garmin/fitsdk';
import { bisectLeft, bisectRight } from 'd3-array';
import type { LapMesg, RecordMesg, SessionMesg } from '@garmin/fitsdk';
import type { Activity, Lap, LapTrigger } from '../model/types';
import { UnsupportedFileError } from './errors';

// The JS SDK has no option to convert positions, so they always arrive as raw Sint32 semicircles.
const DEGREES_PER_SEMICIRCLE = 180 / 2 ** 31;
const EARTH_RADIUS = 6_371_008.8; // m, mean radius

/** FIT cadence is per pedal revolution for these, and per stride (one foot) for everything else. */
const CYCLING_SPORTS: ReadonlySet<SessionMesg['sport']> = new Set(['cycling', 'eBiking']);

const LAP_TRIGGERS: Readonly<Record<string, LapTrigger>> = {
  manual: 'manual',
  time: 'time',
  distance: 'distance',
  positionStart: 'position',
  positionLap: 'position',
  positionWaypoint: 'position',
  positionMarked: 'position',
  sessionEnd: 'session_end',
};

export function parseFit(bytes: ArrayBuffer, fileName: string): Activity {
  const stream = Stream.fromArrayBuffer(bytes);
  if (!Decoder.isFIT(stream)) throw new UnsupportedFileError(fileName);
  // The build prunes the SDK profile to the messages listed in scripts/fitProfile.ts: reading a new
  // message type here means adding it there.
  // A truncated file still decodes up to the damage, so errors only matter when nothing came out.
  const { messages, errors } = new Decoder(stream).read();

  const { records, epochMs } = keepIncreasing(messages.recordMesgs ?? []);
  const n = records.length;
  const first = epochMs[0];
  if (first === undefined) {
    const reason = errors[0] ? ` (${errors[0].message})` : '';
    throw new Error(`"${fileName}" is a FIT file without any timed records${reason}.`);
  }

  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = (epochMs[i]! - first) / 1000;

  const session: SessionMesg | undefined = messages.sessionMesgs?.[0];
  const cadenceFactor = CYCLING_SPORTS.has(session?.sport) ? 1 : 2;

  const position = (r: RecordMesg): [number, number] | null =>
    r.positionLat != null && r.positionLong != null ? [r.positionLat, r.positionLong] : null;
  const lat = float64Stream(records, (r) => scale(position(r)?.[0], DEGREES_PER_SEMICIRCLE));
  const lon = float64Stream(records, (r) => scale(position(r)?.[1], DEGREES_PER_SEMICIRCLE));

  const recordedDist = float64Stream(records, (r) => r.distance);
  const dist = nonDecreasing(recordedDist ?? haversineDistance(lat, lon, n));

  return {
    source: 'fit',
    fileName,
    startTime: first,
    t,
    dist,
    lat,
    lon,
    ele: float32Stream(records, (r) => r.enhancedAltitude ?? r.altitude),
    hr: float32Stream(records, (r) => r.heartRate),
    cad: float32Stream(records, (r) =>
      r.cadence == null ? undefined : (r.cadence + (r.fractionalCadence ?? 0)) * cadenceFactor,
    ),
    speed: float32Stream(records, (r) => r.enhancedSpeed ?? r.speed),
    power: float32Stream(records, (r) => r.power),
    temp: float32Stream(records, (r) => r.temperature),
    laps: mapLaps(messages.lapMesgs ?? [], epochMs),
    deviceSummary: {
      elapsed: finiteOrNull(session?.totalElapsedTime),
      distance: finiteOrNull(session?.totalDistance),
      ascent: finiteOrNull(session?.totalAscent),
      descent: finiteOrNull(session?.totalDescent),
    },
  };
}

function toEpochMs(value: RecordMesg['timestamp']): number {
  return value instanceof Date ? value.getTime() : NaN;
}

/** The records whose timestamp is later than every one kept before it. */
function keepIncreasing(all: RecordMesg[]): { records: RecordMesg[]; epochMs: Float64Array } {
  const records: RecordMesg[] = [];
  const times: number[] = [];
  let last = -Infinity;
  for (const record of all) {
    const ms = toEpochMs(record.timestamp);
    if (!(ms > last)) continue;
    records.push(record);
    times.push(ms);
    last = ms;
  }
  return { records, epochMs: Float64Array.from(times) };
}

type Field = number | null | undefined;

function scale(value: Field, factor: number): Field {
  return value == null ? value : value * factor;
}

function finiteOrNull(value: Field): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

/** One sample per record, NaN where the record lacks the field; null when every record does. */
function fillStream<T extends Float32Array | Float64Array>(
  out: T,
  records: RecordMesg[],
  get: (r: RecordMesg) => Field,
): T | null {
  let present = false;
  for (let i = 0; i < records.length; i++) {
    const value = finiteOrNull(get(records[i]!));
    out[i] = value ?? NaN;
    if (value !== null) present = true;
  }
  return present ? out : null;
}

function float64Stream(records: RecordMesg[], get: (r: RecordMesg) => Field): Float64Array | null {
  return fillStream(new Float64Array(records.length), records, get);
}

function float32Stream(records: RecordMesg[], get: (r: RecordMesg) => Field): Float32Array | null {
  return fillStream(new Float32Array(records.length), records, get);
}

/** Carries the previous value over gaps (NaN) and drops (GPS jitter), starting from 0. */
function nonDecreasing(raw: Float64Array): Float64Array {
  let previous = 0;
  for (let i = 0; i < raw.length; i++) {
    const value = raw[i]!;
    if (value > previous) previous = value;
    raw[i] = previous;
  }
  return raw;
}

/** Cumulative great-circle distance over the samples that have a position; zeros without any. */
function haversineDistance(lat: Float64Array | null, lon: Float64Array | null, n: number): Float64Array {
  const dist = new Float64Array(n);
  if (lat === null || lon === null) return dist;
  const rad = Math.PI / 180;
  let total = 0;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(lat[i]!) || Number.isNaN(lon[i]!)) {
      dist[i] = total;
      continue;
    }
    if (prev >= 0) {
      const lat1 = lat[prev]! * rad;
      const lat2 = lat[i]! * rad;
      const h =
        Math.sin((lat2 - lat1) / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(((lon[i]! - lon[prev]!) * rad) / 2) ** 2;
      total += 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    dist[i] = total;
    prev = i;
  }
  return dist;
}

/**
 * Each lap runs from its `start_time` up to the sample before the next lap starts, so the laps are
 * contiguous even when the device left a gap between them. The last lap ends at its `timestamp`.
 */
function mapLaps(lapMesgs: LapMesg[], epochMs: Float64Array): Lap[] {
  const n = epochMs.length;
  const timed = lapMesgs
    .map((lap) => ({ lap, start: toEpochMs(lap.startTime) }))
    .filter(({ start }) => Number.isFinite(start))
    .sort((a, b) => a.start - b.start);
  const starts = timed.map(({ start }) => bisectLeft(epochMs, start));

  const laps: Lap[] = [];
  timed.forEach(({ lap }, k) => {
    const startIndex = starts[k]!;
    const next = starts[k + 1];
    const endMs = toEpochMs(lap.timestamp);
    let endIndex = n - 1;
    if (next !== undefined) endIndex = next - 1;
    else if (Number.isFinite(endMs)) endIndex = bisectRight(epochMs, endMs) - 1;
    if (startIndex > endIndex) return;
    const trigger = typeof lap.lapTrigger === 'string' ? LAP_TRIGGERS[lap.lapTrigger] : undefined;
    laps.push({ startIndex, endIndex, trigger: trigger ?? 'unknown' });
  });
  return laps;
}
