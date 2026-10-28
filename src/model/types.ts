/**
 * Shared contract for RunCompare. Every task codes against these types.
 * Changing this file is a task of its own (tasks/README.md).
 *
 * Units: metres, seconds, m/s, °C; pace is s/m; times are seconds since the attempt's start.
 * A missing sample inside a present stream is NaN; a stream the source doesn't have is null.
 */

export type AttemptId = string;
export type UnitSystem = 'metric' | 'imperial';

// ---------- Parsed files ----------

export type LapTrigger = 'manual' | 'distance' | 'time' | 'position' | 'session_end' | 'unknown';

export interface Lap {
  startIndex: number; // first sample, inclusive
  endIndex: number; // last sample, inclusive
  trigger: LapTrigger;
}

export interface Activity {
  source: 'fit' | 'gpx';
  fileName: string;
  startTime: number; // epoch ms, UTC
  t: Float64Array; // s since start, strictly increasing
  dist: Float64Array; // m, cumulative, non-decreasing
  lat: Float64Array | null; // degrees
  lon: Float64Array | null;
  ele: Float32Array | null; // m
  hr: Float32Array | null; // bpm
  cad: Float32Array | null; // steps/min, both feet
  speed: Float32Array | null; // m/s
  power: Float32Array | null; // W
  temp: Float32Array | null; // °C
  laps: Lap[];
  /** Totals the device reported (FIT session); nulls when the file has none. */
  deviceSummary: {
    elapsed: number | null;
    distance: number | null;
    ascent: number | null;
    descent: number | null;
  };
}

// ---------- Split sets ----------

export interface SplitMarker {
  distance: number; // m from the start, cumulative
  time: number; // s from the start, cumulative
}

export interface SplitSet {
  name: string;
  /** Strictly increasing in distance and time. (0, 0) is implicit and never stored. */
  markers: SplitMarker[];
  /** Official race distance the markers refer to; when set, markers are rescaled onto the course length. */
  officialDistance: number | null;
  interpolation: 'gap' | 'linear';
}

// ---------- Attempts and baseline ----------

interface AttemptBase {
  id: AttemptId;
  label: string;
  color: string;
}
export interface GpsAttempt extends AttemptBase {
  kind: 'gps';
  activity: Activity;
}
export interface SplitsAttempt extends AttemptBase {
  kind: 'splits';
  splitSet: SplitSet;
}
export type Attempt = GpsAttempt | SplitsAttempt;

export type DistancePresetId = '5k' | '10k' | 'half' | 'marathon';

export const DISTANCE_PRESETS: Readonly<Record<DistancePresetId, { label: string; distance: number }>> = {
  '5k': { label: '5K', distance: 5000 },
  '10k': { label: '10K', distance: 10000 },
  half: { label: 'Half marathon', distance: 21097.5 },
  marathon: { label: 'Marathon', distance: 42195 },
};

export type Baseline =
  /** A GPS attempt; its track defines the course and its elevation is shared by all attempts. */
  | { kind: 'course'; attemptId: AttemptId }
  /** A split-set attempt on a fixed distance; the course is a straight line of `distance` metres. */
  | { kind: 'distance'; attemptId: AttemptId; preset: DistancePresetId | 'custom'; distance: number };

// ---------- Settings ----------

export interface AnalysisSettings {
  gridStep: number; // m
  walkingCadence: number; // spm; below this while moving = walking
  stoppedSpeed: number; // m/s
  stoppedMinDuration: number; // s
  offCourseThreshold: number; // m
  minOverlap: number; // fraction
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  gridStep: 10,
  walkingCadence: 130,
  stoppedSpeed: 0.5,
  stoppedMinDuration: 10,
  offCourseThreshold: 75,
  minOverlap: 0.7,
};

export interface AnalysisInput {
  attempts: Attempt[];
  baseline: Baseline;
  settings: AnalysisSettings;
}

// ---------- Analysis output ----------

export interface CourseGrid {
  step: number; // m
  length: number; // m
  d: Float64Array; // 0, step, 2·step, …, length (last gap may be shorter)
  ele: Float32Array | null; // smoothed baseline elevation (course baseline only)
  grade: Float32Array | null; // fraction (course baseline only)
  lat: Float64Array | null; // baseline position at each grid point (course baseline only)
  lon: Float64Array | null;
}

export interface AlignedSeries {
  time: Float64Array; // s when the attempt reached each grid point
  ele: Float32Array | null; // the attempt's own smoothed elevation
  hr: Float32Array | null;
  cad: Float32Array | null;
  pace: Float32Array; // s/m over ±50 m
  gap: Float32Array | null; // grade-adjusted pace, s/m; null when no grade is available
  moving: Uint8Array | null; // 1 = moving (GPS only)
  walking: Uint8Array | null; // 1 = walking (GPS only)
  offCourse: Uint8Array; // 1 = not comparable
  estimated: Uint8Array; // 1 = interpolated between split markers
}

export interface AttemptMetrics {
  elapsed: number;
  moving: number;
  stopped: number;
  distance: number; // watch distance, m
  ascent: number | null; // from the attempt's own elevation
  descent: number | null;
  avgHr: number | null; // over moving time
  walkingShare: number | null; // fraction of moving time
  walkingEstimated: boolean; // true when derived from speed + grade (no cadence)
  decoupling: number | null; // fraction; positive = HR drifted up relative to GAP
  cadenceFade: number | null; // fraction; last quarter vs first quarter
}

export interface CourseLap {
  from: number; // course m
  to: number;
  trigger: LapTrigger;
}

export interface AttemptAnalysis {
  attemptId: AttemptId;
  label: string;
  color: string;
  kind: Attempt['kind'];
  series: AlignedSeries;
  delta: Float64Array | null; // series.time − baseline time per grid point; null for the baseline itself
  track: { lat: Float64Array; lon: Float64Array; d: Float64Array } | null; // own samples with course distance
  laps: CourseLap[];
  metrics: AttemptMetrics | null; // null for split sets
  overlap: number | null; // on-course share; null when not applicable
  markers: SplitMarker[] | null; // split sets: markers on the course after rescaling
}

export interface CourseSegment {
  kind: 'climb' | 'descent';
  from: number; // course m
  to: number;
  elevationChange: number; // m, positive for climbs, negative for descents
  avgGrade: number; // fraction
}

export type QuantityKind = 'distance' | 'elevation' | 'pace' | 'duration' | 'delta' | 'percent' | 'count';
export interface Quantity {
  kind: QuantityKind;
  value: number; // SI; percent as a fraction
}

export interface Insight {
  id: string;
  ruleId: string;
  attemptId: AttemptId;
  severity: 'info' | 'warn' | 'strong';
  title: string;
  /** Text with {placeholders} filled from `values` by the UI through src/format. Never put unit-bearing numbers in text. */
  template: string;
  values: Record<string, Quantity>;
  ranges: { from: number; to: number }[]; // course m to highlight
}

export type WarningCode =
  | 'low-overlap'
  | 'off-course'
  | 'invalid-baseline'
  | 'unsupported-file'
  | 'split-set-extrapolated'
  | 'missing-stream'
  | 'distance-scaling'; // which method placed a GPS attempt on a distance baseline (task 35)

export interface AnalysisWarning {
  code: WarningCode;
  attemptId: AttemptId | null;
  message: string;
}

export interface AnalysisResult {
  baseline: Baseline;
  grid: CourseGrid;
  attempts: AttemptAnalysis[]; // input order; rejected attempts are left out and get a warning
  segments: CourseSegment[];
  insights: Insight[];
  warnings: AnalysisWarning[];
}

/** Contract for src/analysis/insights/rules/*.ts: each file default-exports one rule. */
export interface InsightRule {
  id: string;
  run(result: Omit<AnalysisResult, 'insights'>, settings: AnalysisSettings): Insight[];
}
