/**
 * Deterministic builders for synthetic test data (task 02).
 *
 * Everything here is seeded: the same options always give the same arrays. Nothing calls
 * the analysis code; `makeAnalysisResult` assembles an `AnalysisResult` that is
 * internally consistent by construction, so UI tasks can be built and snapshotted before
 * the pipeline exists.
 */
import type {
  Activity,
  AlignedSeries,
  AnalysisResult,
  AnalysisWarning,
  Attempt,
  AttemptAnalysis,
  AttemptMetrics,
  Baseline,
  CourseGrid,
  CourseLap,
  CourseSegment,
  GpsAttempt,
  Insight,
  Lap,
  SplitMarker,
  SplitSet,
  SplitsAttempt,
} from '../model/types';
import { ATTEMPT_PALETTE } from '../theme/palette';

// ---------- Seeded PRNG ----------

/** mulberry32: a small, fast, seedable PRNG returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform noise in [−amplitude, amplitude). */
function noise(rng: () => number, amplitude: number): number {
  return (rng() * 2 - 1) * amplitude;
}

// ---------- Shapes ----------

export type ElevationProfile = 'flat' | 'one-climb' | 'hilly';
export type PaceProfile = 'even' | 'fast-start';

/**
 * Elevation control points as (distance on a 12 km reference course, metres of elevation),
 * scaled to the real length and cosine-interpolated between them.
 */
const REFERENCE_LENGTH = 12_000;
const ELEVATION_POINTS: Record<ElevationProfile, readonly (readonly [number, number])[]> = {
  flat: [
    [0, 100],
    [12_000, 100],
  ],
  'one-climb': [
    [0, 100],
    [3_600, 100],
    [7_200, 300],
    [12_000, 300],
  ],
  // Climbs 2–4 km (+220 m) and 8–9.5 km (+160 m), descent 5–6.5 km (−160 m).
  hilly: [
    [0, 100],
    [2_000, 110],
    [4_000, 330],
    [5_000, 320],
    [6_500, 160],
    [8_000, 170],
    [9_500, 330],
    [12_000, 250],
  ],
};

/** Smoothed course elevation at course distance `d` (m) for a course of `length` m. */
export function elevationAt(profile: ElevationProfile, length: number, d: number): number {
  const points = ELEVATION_POINTS[profile];
  const x = Math.min(Math.max((d / length) * REFERENCE_LENGTH, 0), REFERENCE_LENGTH);
  for (let i = 1; i < points.length; i++) {
    const [x1, e1] = points[i]!;
    const [x0, e0] = points[i - 1]!;
    if (x <= x1) {
      const u = x1 === x0 ? 1 : (x - x0) / (x1 - x0);
      return e0 + (e1 - e0) * (1 - Math.cos(Math.PI * u)) * 0.5;
    }
  }
  return points[points.length - 1]![1];
}

/** Grade (fraction) at `d`, by central difference over ±5 m. */
export function gradeAt(profile: ElevationProfile, length: number, d: number): number {
  const h = 5;
  return (elevationAt(profile, length, d + h) - elevationAt(profile, length, d - h)) / (2 * h);
}

/** The climbs and descents built into a profile: control-point stretches steeper than 5 %. */
export function profileSegments(profile: ElevationProfile, length: number): CourseSegment[] {
  const points = ELEVATION_POINTS[profile];
  const segments: CourseSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = (points[i - 1]![0] * length) / REFERENCE_LENGTH;
    const to = (points[i]![0] * length) / REFERENCE_LENGTH;
    const elevationChange = elevationAt(profile, length, to) - elevationAt(profile, length, from);
    const avgGrade = elevationChange / (to - from);
    if (Math.abs(avgGrade) >= 0.05) {
      segments.push({ kind: elevationChange > 0 ? 'climb' : 'descent', from, to, elevationChange, avgGrade });
    }
  }
  return segments;
}

/** Start of every synthetic course: on the slopes of Olympus. */
const ORIGIN = { lat: 40.0857, lon: 22.3584 };
const METRES_PER_DEG_LAT = 111_320;

/** Course heading (radians from east) at `d`: a gentle meander. */
function headingAt(d: number): number {
  return 0.9 * Math.sin((2 * Math.PI * d) / 5000) + 0.3;
}

/**
 * Positions along the course for an increasing list of course distances, integrating the
 * heading in ≤ 5 m steps. `offset(d)` pushes the point sideways (m) to model leaving the course.
 */
function positionsAt(ds: ArrayLike<number>, offset: (d: number) => number = () => 0) {
  const lat = new Float64Array(ds.length);
  const lon = new Float64Array(ds.length);
  const metresPerDegLon = METRES_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);
  let x = 0;
  let y = 0;
  let d = 0;
  for (let i = 0; i < ds.length; i++) {
    const target = ds[i]!;
    while (d < target) {
      const step = Math.min(5, target - d);
      const heading = headingAt(d + step / 2);
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      d += step;
    }
    const side = offset(target);
    const heading = headingAt(target);
    const px = x - Math.sin(heading) * side;
    const py = y + Math.cos(heading) * side;
    lat[i] = ORIGIN.lat + py / METRES_PER_DEG_LAT;
    lon[i] = ORIGIN.lon + px / metresPerDegLon;
  }
  return { lat, lon };
}

/** Pace multiplier at course fraction `x` (0…1). */
function paceShape(profile: PaceProfile, x: number): number {
  return profile === 'even' ? 1 : 0.92 + 0.18 * x;
}

/** Pace multiplier for a grade: slower uphill, a little faster downhill. */
function gradeShape(grade: number): number {
  return grade >= 0 ? 1 + 4.5 * grade : Math.max(0.8, 1 + 1.5 * grade);
}

/** Below this grade the synthetic runner runs; above it they walk (cadence < 130 spm). */
const WALK_GRADE = 0.12;

// ---------- makeActivity ----------

export interface ActivityStreams {
  latlon: boolean;
  ele: boolean;
  hr: boolean;
  cad: boolean;
  speed: boolean;
  power: boolean;
  temp: boolean;
}

export interface ActivityOptions {
  seed?: number;
  source?: Activity['source'];
  fileName?: string;
  startTime?: number; // epoch ms
  length?: number; // m
  elevation?: ElevationProfile;
  pace?: PaceProfile;
  basePace?: number; // s/m on the flat
  /** Seconds between samples (FIT records at 1 s). */
  sampleInterval?: number;
  /** Which streams exist. Defaults to all for FIT; no cad, speed, power or temp for GPX. */
  streams?: Partial<ActivityStreams>;
  /** Auto-lap distance in m; null for no laps. Defaults to 1000 for FIT and null for GPX. */
  lapEvery?: number | null;
  /** Barometer calibration offset added to the recorded elevation, m. */
  elevationOffset?: number;
  /** Sideways deviation from the course (m) at course distance d, for off-course stretches. */
  offCourse?: (d: number) => number;
}

const ALL_STREAMS: ActivityStreams = {
  latlon: true,
  ele: true,
  hr: true,
  cad: true,
  speed: true,
  power: true,
  temp: true,
};
const GPX_STREAMS: ActivityStreams = { ...ALL_STREAMS, cad: false, speed: false, power: false, temp: false };

/**
 * A synthetic activity. `dist` is the course distance (the synthetic runner never strays
 * along the course), ending exactly at `length`.
 */
export function makeActivity(opts: ActivityOptions = {}): Activity {
  const source = opts.source ?? 'fit';
  const rng = createRng(opts.seed ?? 1);
  const length = opts.length ?? 10_000;
  const elevation = opts.elevation ?? 'flat';
  const pace = opts.pace ?? 'even';
  const basePace = opts.basePace ?? 0.33;
  const dt = opts.sampleInterval ?? 1;
  const streams = { ...(source === 'fit' ? ALL_STREAMS : GPX_STREAMS), ...opts.streams };
  const lapEvery = opts.lapEvery === undefined ? (source === 'fit' ? 1000 : null) : opts.lapEvery;

  const t: number[] = [0];
  const dist: number[] = [0];
  const paceAt: number[] = [];
  while (dist[dist.length - 1]! < length) {
    const d = dist[dist.length - 1]!;
    const p =
      basePace * paceShape(pace, d / length) * gradeShape(gradeAt(elevation, length, d)) * (1 + noise(rng, 0.03));
    paceAt.push(p);
    t.push(t[t.length - 1]! + dt);
    dist.push(d + dt / p);
  }
  paceAt.push(paceAt[paceAt.length - 1] ?? basePace);
  // Land the last sample exactly on the finish line.
  const n = t.length;
  const overshoot = dist[n - 1]! - length;
  if (overshoot > 0 && n > 1) {
    const frac = 1 - overshoot / (dist[n - 1]! - dist[n - 2]!);
    t[n - 1] = t[n - 2]! + dt * Math.max(frac, 0.01);
    dist[n - 1] = length;
  }

  const duration = t[n - 1]!;
  const tArr = Float64Array.from(t);
  const distArr = Float64Array.from(dist);
  const stream = (on: boolean, f: (i: number) => number) => {
    if (!on) return null;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = f(i);
    return out;
  };
  const gradeOf = (i: number) => gradeAt(elevation, length, dist[i]!);
  const offset = opts.elevationOffset ?? 0;

  const ele = stream(streams.ele, (i) => elevationAt(elevation, length, dist[i]!) + offset + noise(rng, 0.4));
  const hr = stream(streams.hr, (i) => 138 + 22 * (t[i]! / duration) + 60 * Math.max(gradeOf(i), 0) + noise(rng, 2));
  const cad = stream(
    streams.cad,
    (i) => (gradeOf(i) > WALK_GRADE ? 112 : 172 - 4 * (t[i]! / duration)) + noise(rng, 2),
  );
  const speed = stream(streams.speed, (i) => 1 / paceAt[i]!);
  const power = stream(streams.power, (i) => 240 + 400 * Math.max(gradeOf(i), 0) + noise(rng, 10));
  const temp = stream(streams.temp, (i) => 14 + 6 * (t[i]! / duration) + noise(rng, 0.2));
  const pos = streams.latlon ? positionsAt(distArr, opts.offCourse) : null;

  const laps: Lap[] = [];
  if (lapEvery !== null && lapEvery > 0) {
    let start = 0;
    for (let k = 1; start < n - 1; k++) {
      const boundary = k * lapEvery;
      let end = start;
      while (end < n - 1 && dist[end + 1]! < boundary) end++;
      if (end >= n - 2 || boundary >= length) end = n - 1;
      laps.push({ startIndex: start, endIndex: end, trigger: end === n - 1 ? 'session_end' : 'distance' });
      start = end + 1;
    }
  }

  let ascent = 0;
  let descent = 0;
  if (ele) {
    for (let i = 1; i < n; i++) {
      const step = elevationAt(elevation, length, dist[i]!) - elevationAt(elevation, length, dist[i - 1]!);
      if (step > 0) ascent += step;
      else descent -= step;
    }
  }

  return {
    source,
    fileName: opts.fileName ?? `synthetic-${opts.seed ?? 1}.${source}`,
    startTime: opts.startTime ?? Date.UTC(2024, 5, 23, 4, 0, 0),
    t: tArr,
    dist: distArr,
    lat: pos?.lat ?? null,
    lon: pos?.lon ?? null,
    ele,
    hr,
    cad,
    speed,
    power,
    temp,
    laps,
    deviceSummary:
      source === 'fit'
        ? { elapsed: duration, distance: length, ascent: ele ? ascent : null, descent: ele ? descent : null }
        : { elapsed: null, distance: null, ascent: null, descent: null },
  };
}

/** A copy of `activity` with every time scaled so that it finishes at `elapsed` seconds. */
function withElapsed(activity: Activity, elapsed: number): Activity {
  const scale = elapsed / activity.t[activity.t.length - 1]!;
  const t = activity.t.map((v) => v * scale);
  const speed = activity.speed ? activity.speed.map((v) => v / scale) : null;
  const deviceSummary =
    activity.deviceSummary.elapsed === null ? activity.deviceSummary : { ...activity.deviceSummary, elapsed };
  return { ...activity, t, speed, deviceSummary };
}

// ---------- makeSplitSet ----------

export interface SplitSetOptions {
  seed?: number;
  name?: string;
  distance?: number; // m
  every?: number; // m between markers
  pace?: number; // s/m at the start
  /** Fractional slowdown from start to finish: 0.06 means the last marker is 6 % slower. */
  fade?: number;
  /** Random pace jitter per marker, as a fraction. */
  jitter?: number;
  officialDistance?: number | null;
  interpolation?: SplitSet['interpolation'];
}

export function makeSplitSet(opts: SplitSetOptions = {}): SplitSet {
  const rng = createRng(opts.seed ?? 1);
  const distance = opts.distance ?? 10_000;
  const every = opts.every ?? 1000;
  const pace = opts.pace ?? 0.3;
  const fade = opts.fade ?? 0;
  const jitter = opts.jitter ?? 0.01;
  const markers: SplitMarker[] = [];
  let time = 0;
  let prev = 0;
  for (let d = every; prev < distance; d += every) {
    const to = Math.min(d, distance);
    const mid = (prev + to) / 2;
    time += (to - prev) * pace * (1 + fade * (mid / distance)) * (1 + noise(rng, jitter));
    markers.push({ distance: to, time: Math.round(time) });
    prev = to;
  }
  return {
    name: opts.name ?? 'Splits',
    markers,
    officialDistance: opts.officialDistance ?? null,
    interpolation: opts.interpolation ?? 'linear',
  };
}

// ---------- makeAnalysisResult ----------

export type ScenarioName =
  'synthetic-two-attempts' | 'synthetic-gpx' | 'synthetic-splits-only' | 'synthetic-off-course';

export interface ScenarioData {
  attempts: Attempt[];
  baseline: Baseline;
  analysis: AnalysisResult;
}

const GRID_STEP = 10;
const COURSE_LENGTH = 12_000;
const BASELINE_ELAPSED = 4920; // 1:22:00 over 12 km
const BEHIND_AT_FINISH = 200; // +3:20
const OFF_COURSE = { from: 5000, to: 5600 };

function makeGridDistances(length: number, step: number): Float64Array {
  const n = Math.ceil(length / step) + 1;
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.min(i * step, length);
  return d;
}

/** Linear interpolation of (xs, ys) at x; xs strictly increasing. Clamps outside the range. */
function interp(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number, hint = { i: 0 }): number {
  const n = xs.length;
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  let i = hint.i;
  if (xs[i]! > x) i = 0;
  while (i < n - 2 && xs[i + 1]! < x) i++;
  hint.i = i;
  const x0 = xs[i]!;
  const x1 = xs[i + 1]!;
  return ys[i]! + ((ys[i + 1]! - ys[i]!) * (x - x0)) / (x1 - x0);
}

function resample(xs: ArrayLike<number>, ys: ArrayLike<number>, at: Float64Array): Float64Array {
  const hint = { i: 0 };
  return at.map((x) => interp(xs, ys, x, hint));
}

function resample32(xs: ArrayLike<number>, ys: ArrayLike<number> | null, at: Float64Array): Float32Array | null {
  return ys ? Float32Array.from(resample(xs, ys, at)) : null;
}

/** Pace (s/m) over ±50 m around each grid point. */
function paceOver(d: Float64Array, time: Float64Array): Float32Array {
  const n = d.length;
  const out = new Float32Array(n);
  const w = Math.round(50 / GRID_STEP);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(n - 1, i + w);
    out[i] = (time[b]! - time[a]!) / (d[b]! - d[a]!);
  }
  return out;
}

/** Minetti et al. (2002) energy cost of running, J/(kg·m), by grade. */
function minettiCost(g: number): number {
  const i = Math.min(Math.max(g, -0.45), 0.45);
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i]!;
  return sum / (to - from);
}

interface CourseInfo {
  grid: CourseGrid;
  profile: ElevationProfile | null;
}

function courseGrid(profile: ElevationProfile, length: number): CourseGrid {
  const d = makeGridDistances(length, GRID_STEP);
  const pos = positionsAt(d);
  return {
    step: GRID_STEP,
    length,
    d,
    ele: Float32Array.from(d, (x) => elevationAt(profile, length, x)),
    grade: Float32Array.from(d, (x) => gradeAt(profile, length, x)),
    lat: pos.lat,
    lon: pos.lon,
  };
}

function distanceGrid(length: number): CourseGrid {
  return {
    step: GRID_STEP,
    length,
    d: makeGridDistances(length, GRID_STEP),
    ele: null,
    grade: null,
    lat: null,
    lon: null,
  };
}

function gpsAnalysis(
  attempt: GpsAttempt,
  course: CourseInfo,
  baselineTime: Float64Array | null,
  offCourseRange: { from: number; to: number } | null,
): AttemptAnalysis {
  const { grid } = course;
  const a = attempt.activity;
  const d = grid.d;
  const n = d.length;
  const time = resample(a.dist, a.t, d);
  const pace = paceOver(d, time);
  const gap = grid.grade ? pace.map((p, i) => (p * minettiCost(0)) / minettiCost(grid.grade![i]!)) : null;
  const hr = resample32(a.dist, a.hr, d);
  const cad = resample32(a.dist, a.cad, d);
  const ele = resample32(a.dist, a.ele, d);

  const offCourse = new Uint8Array(n);
  if (offCourseRange) {
    for (let i = 0; i < n; i++) if (d[i]! >= offCourseRange.from && d[i]! <= offCourseRange.to) offCourse[i] = 1;
  }
  const moving = new Uint8Array(n).fill(1);
  // With cadence, walking is cadence below 130 spm; without, it is estimated from grade.
  const walking = Uint8Array.from(d, (_, i) => ((cad ? cad[i]! < 130 : (grid.grade?.[i] ?? 0) > WALK_GRADE) ? 1 : 0));

  const series: AlignedSeries = {
    time,
    ele,
    hr,
    cad,
    pace,
    gap,
    moving,
    walking,
    offCourse,
    estimated: new Uint8Array(n),
  };

  const delta = baselineTime ? time.map((v, i) => (offCourse[i] ? NaN : v - baselineTime[i]!)) : null;

  const elapsed = a.t[a.t.length - 1]!;
  let walkingTime = 0;
  for (let i = 1; i < n; i++) if (walking[i]) walkingTime += time[i]! - time[i - 1]!;
  let ascent = 0;
  let descent = 0;
  if (ele && course.profile) {
    // Own elevation, smoothed: the course shape plus this attempt's barometer offset.
    for (let i = 1; i < n; i++) {
      const step =
        elevationAt(course.profile, grid.length, d[i]!) - elevationAt(course.profile, grid.length, d[i - 1]!);
      if (step > 0) ascent += step;
      else descent -= step;
    }
  }
  const half = Math.floor(n / 2);
  const quarter = Math.floor(n / 4);
  const efficiency = (from: number, to: number) => mean(hr!, from, to) * mean(gap!, from, to);
  const metrics: AttemptMetrics = {
    elapsed,
    moving: elapsed,
    stopped: 0,
    distance: a.dist[a.dist.length - 1]!,
    ascent: ele ? ascent : null,
    descent: ele ? descent : null,
    avgHr: hr ? mean(hr) : null,
    walkingShare: walkingTime / elapsed,
    walkingEstimated: cad === null,
    decoupling: hr && gap ? efficiency(half, n) / efficiency(0, half) - 1 : null,
    cadenceFade: cad ? mean(cad, n - quarter, n) / mean(cad, 0, quarter) - 1 : null,
  };

  // A lap ends where the next one starts: at the next lap's first sample, snapped to the grid.
  const laps: CourseLap[] = a.laps.map((lap, k) => {
    const next = a.dist[lap.endIndex + 1];
    const to = k === a.laps.length - 1 || next === undefined ? grid.length : Math.round(next / grid.step) * grid.step;
    return { from: 0, to, trigger: lap.trigger };
  });
  for (let k = 1; k < laps.length; k++) laps[k]!.from = laps[k - 1]!.to;

  const overlap = offCourseRange ? 1 - (offCourseRange.to - offCourseRange.from) / grid.length : 1;

  return {
    attemptId: attempt.id,
    label: attempt.label,
    color: attempt.color,
    kind: 'gps',
    series,
    delta,
    track: a.lat && a.lon ? { lat: a.lat, lon: a.lon, d: a.dist } : null,
    laps,
    metrics,
    overlap,
    markers: null,
  };
}

function splitsAnalysis(attempt: SplitsAttempt, grid: CourseGrid, baselineTime: Float64Array | null): AttemptAnalysis {
  const d = grid.d;
  const markers = attempt.splitSet.markers;
  const xs = [0, ...markers.map((m) => m.distance)];
  const ys = [0, ...markers.map((m) => m.time)];
  const time = resample(xs, ys, d);
  const markerDistances = new Set(xs);
  const series: AlignedSeries = {
    time,
    ele: null,
    hr: null,
    cad: null,
    pace: paceOver(d, time),
    gap: null,
    moving: null,
    walking: null,
    offCourse: new Uint8Array(d.length),
    estimated: Uint8Array.from(d, (x) => (markerDistances.has(x) ? 0 : 1)),
  };
  return {
    attemptId: attempt.id,
    label: attempt.label,
    color: attempt.color,
    kind: 'splits',
    series,
    delta: baselineTime ? time.map((v, i) => v - baselineTime[i]!) : null,
    track: null,
    laps: [],
    metrics: null,
    overlap: null,
    markers: markers.map((m) => ({ ...m })),
  };
}

/** Delta at course distance `x` (nearest grid point). */
function deltaAt(result: AttemptAnalysis, grid: CourseGrid, x: number): number {
  const i = Math.min(Math.round(x / grid.step), grid.d.length - 1);
  return result.delta?.[i] ?? NaN;
}

function gpsInsights(attempt: AttemptAnalysis, grid: CourseGrid, segments: CourseSegment[]): Insight[] {
  const lossOn = (s: CourseSegment) => deltaAt(attempt, grid, s.to) - deltaAt(attempt, grid, s.from);
  const climb = segments
    .filter((s) => s.kind === 'climb')
    .reduce<CourseSegment | null>((worst, s) => (worst === null || lossOn(s) > lossOn(worst) ? s : worst), null);
  const insights: Insight[] = [];
  if (climb) {
    insights.push({
      id: `climb-loss:${attempt.attemptId}:${climb.from}`,
      ruleId: 'climb-loss',
      attemptId: attempt.attemptId,
      severity: 'warn',
      title: 'Time lost on a climb',
      template: 'Lost {delta} between {from} and {to}.',
      values: {
        delta: { kind: 'delta', value: lossOn(climb) },
        from: { kind: 'distance', value: climb.from },
        to: { kind: 'distance', value: climb.to },
      },
      ranges: [{ from: climb.from, to: climb.to }],
    });
  }
  const lastQuarter = grid.length * 0.75;
  insights.push({
    id: `fade:${attempt.attemptId}`,
    ruleId: 'fade',
    attemptId: attempt.attemptId,
    severity: 'strong',
    title: 'Faded in the last quarter',
    template: 'Lost {delta} over the last {distance}.',
    values: {
      delta: { kind: 'delta', value: deltaAt(attempt, grid, grid.length) - deltaAt(attempt, grid, lastQuarter) },
      distance: { kind: 'distance', value: grid.length - lastQuarter },
    },
    ranges: [{ from: lastQuarter, to: grid.length }],
  });
  const share = attempt.metrics?.walkingShare;
  if (share !== null && share !== undefined) {
    insights.push({
      id: `walking:${attempt.attemptId}`,
      ruleId: 'walking',
      attemptId: attempt.attemptId,
      severity: 'info',
      title: attempt.metrics?.walkingEstimated ? 'Walking (estimated)' : 'Walking',
      template: 'Walked {share} of moving time, all of it on climbs.',
      values: { share: { kind: 'percent', value: share } },
      ranges: segments.filter((s) => s.kind === 'climb').map((s) => ({ from: s.from, to: s.to })),
    });
  }
  return insights;
}

interface GpsScenarioOptions {
  source: Activity['source'];
  offCourse: boolean;
}

function gpsScenario({ source, offCourse }: GpsScenarioOptions): ScenarioData {
  const profile: ElevationProfile = 'hilly';
  const common = {
    source,
    length: COURSE_LENGTH,
    elevation: profile,
    sampleInterval: source === 'gpx' ? 1.4 : 1,
  } as const;
  const first = withElapsed(
    makeActivity({
      ...common,
      seed: 2024,
      pace: 'even',
      fileName: `2024.${source}`,
      startTime: Date.UTC(2024, 5, 23, 4, 0, 0),
    }),
    BASELINE_ELAPSED,
  );
  const sideways = (d: number) =>
    d < OFF_COURSE.from || d > OFF_COURSE.to
      ? 0
      : 180 * Math.sin((Math.PI * (d - OFF_COURSE.from)) / (OFF_COURSE.to - OFF_COURSE.from));
  const second = withElapsed(
    makeActivity({
      ...common,
      seed: 2025,
      pace: 'fast-start',
      fileName: `2025.${source}`,
      startTime: Date.UTC(2025, 5, 22, 4, 0, 0),
      elevationOffset: 12,
      offCourse: offCourse ? sideways : undefined,
    }),
    BASELINE_ELAPSED + BEHIND_AT_FINISH,
  );

  const attempts: GpsAttempt[] = [
    { id: 'a1', kind: 'gps', label: '2024', color: ATTEMPT_PALETTE[0], activity: first },
    { id: 'a2', kind: 'gps', label: '2025', color: ATTEMPT_PALETTE[1], activity: second },
  ];
  const baseline: Baseline = { kind: 'course', attemptId: 'a1' };
  const course: CourseInfo = { grid: courseGrid(profile, COURSE_LENGTH), profile };
  const base = gpsAnalysis(attempts[0]!, course, null, null);
  const other = gpsAnalysis(attempts[1]!, course, base.series.time, offCourse ? OFF_COURSE : null);
  const segments = profileSegments(profile, COURSE_LENGTH);

  const warnings: AnalysisWarning[] = [];
  if (offCourse) {
    warnings.push({
      code: 'off-course',
      attemptId: 'a2',
      message: '2025 left the course between 5.0 km and 5.6 km; that stretch is not compared.',
    });
  }
  if (source === 'gpx') {
    for (const a of attempts) {
      warnings.push({
        code: 'missing-stream',
        attemptId: a.id,
        message: `${a.label} has no cadence; walking is estimated from speed and grade.`,
      });
    }
  }

  return {
    attempts,
    baseline,
    analysis: {
      baseline,
      grid: course.grid,
      attempts: [base, other],
      segments,
      insights: gpsInsights(other, course.grid, segments),
      warnings,
    },
  };
}

function splitsOnlyScenario(): ScenarioData {
  const distance = 10_000;
  const target = makeSplitSet({ seed: 10, name: 'Target 50:00', distance, pace: 0.3, jitter: 0.005 });
  const actual = makeSplitSet({ seed: 11, name: 'Race', distance, pace: 0.295, fade: 0.08, jitter: 0.015 });
  const attempts: SplitsAttempt[] = [
    { id: 's1', kind: 'splits', label: 'Target', color: ATTEMPT_PALETTE[0], splitSet: target },
    { id: 's2', kind: 'splits', label: 'Race', color: ATTEMPT_PALETTE[1], splitSet: actual },
  ];
  const baseline: Baseline = { kind: 'distance', attemptId: 's1', preset: '10k', distance };
  const grid = distanceGrid(distance);
  const base = splitsAnalysis(attempts[0]!, grid, null);
  const other = splitsAnalysis(attempts[1]!, grid, base.series.time);
  const insights: Insight[] = [
    {
      id: 'fade:s2',
      ruleId: 'fade',
      attemptId: 's2',
      severity: 'info',
      title: 'Slower second half',
      template: 'Lost {delta} over the second half.',
      values: { delta: { kind: 'delta', value: deltaAt(other, grid, distance) - deltaAt(other, grid, distance / 2) } },
      ranges: [{ from: distance / 2, to: distance }],
    },
  ];
  return {
    attempts,
    baseline,
    analysis: { baseline, grid, attempts: [base, other], segments: [], insights, warnings: [] },
  };
}

export function makeAnalysisResult(scenario: ScenarioName): ScenarioData {
  switch (scenario) {
    case 'synthetic-two-attempts':
      return gpsScenario({ source: 'fit', offCourse: false });
    case 'synthetic-gpx':
      return gpsScenario({ source: 'gpx', offCourse: false });
    case 'synthetic-splits-only':
      return splitsOnlyScenario();
    case 'synthetic-off-course':
      return gpsScenario({ source: 'fit', offCourse: true });
  }
}

export interface ScenarioDefinition {
  name: ScenarioName;
  description: string;
  build: () => ScenarioData;
}

export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    name: 'synthetic-two-attempts',
    description:
      'Course baseline, two FIT attempts on 12 km of hills with every stream. The second finishes +3:20 behind. Laps every km, two climbs and a descent, one insight per severity.',
    build: () => makeAnalysisResult('synthetic-two-attempts'),
  },
  {
    name: 'synthetic-gpx',
    description:
      'As synthetic-two-attempts, from GPX: no cadence, power or temperature, walking estimated, no cadence fade, no laps.',
    build: () => makeAnalysisResult('synthetic-gpx'),
  },
  {
    name: 'synthetic-splits-only',
    description: 'Distance baseline (10K) with two split-set attempts. No elevation and no positions.',
    build: () => makeAnalysisResult('synthetic-splits-only'),
  },
  {
    name: 'synthetic-off-course',
    description:
      'As synthetic-two-attempts, but the second attempt leaves the course for 600 m at 5 km (overlap 0.95).',
    build: () => makeAnalysisResult('synthetic-off-course'),
  },
];
