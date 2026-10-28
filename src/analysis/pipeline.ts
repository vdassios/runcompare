/**
 * `analyze()`: the whole analysis from attempts, baseline and settings to an `AnalysisResult`
 * (PLAN §4). Pure and synchronous; the worker runs it off the main thread.
 *
 * M1 handles a course baseline with GPS attempts. Distance baselines and split-set attempts are
 * reported with a warning and left out until task 21.
 */
import { formatDistance } from '../format';
import type {
  Activity,
  AnalysisInput,
  AnalysisResult,
  AnalysisSettings,
  AnalysisWarning,
  AttemptAnalysis,
  CourseGrid,
  GpsAttempt,
} from '../model/types';
import { alignToCourse, buildReference, type Reference } from './alignment';
import { gapPace } from './gap';
import { buildCourseGrid, computeDelta, resampleAttempt, resampleFlags } from './grid';
import { runInsights } from './insights';
import { rollingMean } from './interp';
import { computeMetrics, gradePerSample, movementFlags } from './metrics';
import { detectSegments } from './segments';

/** Off-course stretches shorter than this (m of course) are GPS noise, not worth a warning. */
const OFF_COURSE_WARNING_LENGTH = 100;
/** Samples averaged when speed has to be derived from distance and time. */
const DERIVED_SPEED_WINDOW = 5;

export function analyze(input: AnalysisInput): AnalysisResult {
  const { attempts, baseline, settings } = input;
  const warnings: AnalysisWarning[] = [];

  const base = attempts.find((a) => a.id === baseline.attemptId);
  if (baseline.kind !== 'course' || !base || base.kind !== 'gps' || !base.activity.lat || !base.activity.lon) {
    const message =
      baseline.kind === 'distance'
        ? 'Distance baselines are not supported yet; choose a GPS attempt as the baseline.'
        : 'The baseline must be a GPS attempt with a recorded track.';
    warnings.push({ code: 'invalid-baseline', attemptId: baseline.attemptId, message });
    return { baseline, grid: emptyGrid(settings.gridStep), attempts: [], segments: [], insights: [], warnings };
  }

  const grid = buildCourseGrid(base.activity, settings.gridStep);
  const ref = buildReference(base.activity);

  const analysed: AttemptAnalysis[] = [];
  for (const attempt of attempts) {
    if (attempt.kind !== 'gps') {
      warnings.push({
        code: 'invalid-baseline',
        attemptId: attempt.id,
        message: `${attempt.label}: split sets are not supported yet, so it is left out.`,
      });
      continue;
    }
    const result = analyseGps(attempt, attempt.id === base.id, grid, ref, settings, warnings);
    if (result) analysed.push(result);
  }

  const baselineTime = analysed.find((a) => a.attemptId === base.id)!.series.time;
  for (const a of analysed) {
    if (a.attemptId !== base.id) a.delta = computeDelta(a.series, baselineTime);
  }

  const withoutInsights = { baseline, grid, attempts: analysed, segments: detectSegments(grid), warnings };
  return { ...withoutInsights, insights: runInsights(withoutInsights, settings) };
}

/** One GPS attempt on the course, or null (with a warning) when too little of it overlaps. */
function analyseGps(
  attempt: GpsAttempt,
  isBaseline: boolean,
  grid: CourseGrid,
  ref: Reference,
  settings: AnalysisSettings,
  warnings: AnalysisWarning[],
): AttemptAnalysis | null {
  const { activity } = attempt;
  const aligned = alignToCourse(activity, ref, settings);
  const { offCourse, overlap } = aligned;
  const courseDist = snapFinish(aligned.courseDist, activity.dist, grid.length, grid.step);
  // The baseline defines the course, so it is never rejected against itself.
  if (!isBaseline && overlap < settings.minOverlap) {
    warnings.push({
      code: 'low-overlap',
      attemptId: attempt.id,
      message: `${attempt.label} follows only ${Math.round(overlap * 100)}% of the baseline course, so it is left out.`,
    });
    return null;
  }

  const series = resampleAttempt(activity, courseDist, offCourse, grid);
  const grade = gradePerSample(activity);
  const flags = movementFlags(activity, grade, settings);
  series.moving = resampleFlags(flags.moving, courseDist, grid);
  series.walking = flags.walking && resampleFlags(flags.walking, courseDist, grid);
  const metrics = computeMetrics(activity, flags, grade && gapPace(samplePace(activity), grade));

  for (const run of offCourseRuns(offCourse, courseDist)) {
    if (run.to - run.from <= OFF_COURSE_WARNING_LENGTH) continue;
    warnings.push({
      code: 'off-course',
      attemptId: attempt.id,
      message: `${attempt.label} is off the course from ${formatDistance(run.from, 'metric')} to ${formatDistance(run.to, 'metric')}.`,
    });
  }
  if (!activity.hr) {
    warnings.push({ code: 'missing-stream', attemptId: attempt.id, message: `${attempt.label} has no heart rate.` });
  }

  return {
    attemptId: attempt.id,
    label: attempt.label,
    color: attempt.color,
    kind: 'gps',
    series,
    delta: null,
    track: activity.lat && activity.lon ? { lat: activity.lat, lon: activity.lon, d: courseDist } : null,
    laps: activity.laps.map((lap) => ({
      from: courseDist[lap.startIndex] ?? NaN,
      to: courseDist[lap.endIndex] ?? NaN,
      trigger: lap.trigger,
    })),
    metrics,
    overlap,
    markers: null,
  };
}

/**
 * Two watches stop a few metres apart, so an attempt's last fix often projects just short of the
 * course end. Beyond its reach `resampleAttempt` takes the time of its last sample, which would
 * count standing at the finish into time(L) (PLAN §5.6 says it must not). An attempt that ends
 * within `tolerance` of the end has finished, at the first sample where its own distance stops
 * growing (the projection can stall a few metres earlier, where the reference runs out).
 */
function snapFinish(courseDist: Float64Array, dist: Float64Array, length: number, tolerance: number): Float64Array {
  const last = courseDist[courseDist.length - 1];
  if (last === undefined || last >= length || length - last > tolerance) return courseDist;
  const finalDist = dist.reduce((a, b) => (b > a ? b : a), -Infinity);
  const snapped = courseDist.slice();
  for (let i = dist.findIndex((x) => x >= finalDist); i >= 0 && i < snapped.length; i++) snapped[i] = length;
  return snapped;
}

/** Pace (s/m) per sample: the device speed where it has one, else smoothed Δdist/Δt. */
function samplePace(a: Activity): Float32Array {
  const n = a.t.length;
  const derived = new Float32Array(n).fill(NaN);
  for (let k = 1; k < n; k++) derived[k] = (a.dist[k]! - a.dist[k - 1]!) / (a.t[k]! - a.t[k - 1]!);
  const smoothed = rollingMean(derived, DERIVED_SPEED_WINDOW);
  return Float32Array.from({ length: n }, (_, k) => {
    const v = a.speed?.[k];
    return 1 / (v !== undefined && Number.isFinite(v) ? v : smoothed[k]!);
  });
}

/** Course ranges of consecutive off-course samples. */
function offCourseRuns(offCourse: Uint8Array, courseDist: Float64Array): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  let start = -1;
  for (let i = 0; i <= offCourse.length; i++) {
    const off = i < offCourse.length && offCourse[i] === 1;
    if (off && start < 0) start = i;
    if (!off && start >= 0) {
      runs.push({ from: courseDist[start]!, to: courseDist[i - 1]! });
      start = -1;
    }
  }
  return runs;
}

function emptyGrid(step: number): CourseGrid {
  return { step, length: 0, d: new Float64Array(0), ele: null, grade: null, lat: null, lon: null };
}
