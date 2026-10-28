# 07 · Grid resampling and delta

**Milestone** M1 · **Depends on** 05 · **Parallel with** 03, 04, 06, 08 · **Branch** `task/07-grid-resampling`

## Goal
Build the shared 10 m course grid and resample each aligned attempt onto it, so every attempt can be compared point by point. Then compute the ghost delta.

## Read first
`tasks/README.md`, `PLAN.md` §3, §5.2, §5.3 and §5.6, and `src/model/types.ts` (`CourseGrid`, `AlignedSeries`).

## You own
`src/analysis/grid.ts` and `src/analysis/grid.test.ts`.

## Requirements
```ts
export function buildCourseGrid(baseline: Activity, step: number): CourseGrid
//   length = baseline.dist[end]; d_k = k·step, last = length exactly
//   ele/grade from smoothElevationByDistance + gradeFromElevation; lat/lon interpolated at each d (null if absent)
export function buildDistanceGrid(length: number, step: number): CourseGrid   // ele/grade/lat/lon null

export function resampleAttempt(
  activity: Activity,
  courseDist: Float64Array,
  offCourse: Uint8Array,
  grid: CourseGrid,
): AlignedSeries
//   time(d): interpolateAt(courseDist, t, d) (first arrival)
//   hr/cad/ele: rollingMean over 5 s, then sample at time(d) (interpolate over t)
//   pace: (time(d+50) − time(d−50)) / 100, one-sided at the ends
//   gap: grade = grid.grade ?? own grade (from own smoothed ele on the grid) ?? null → gapPace
//   moving/walking: null here (the pipeline fills them from task 08's flags)
//   offCourse: 1 if any sample whose courseDist falls in the cell is off-course
//   estimated: all zeros

export function computeDelta(series: AlignedSeries, baselineTime: Float64Array): Float64Array
export function resampleFlags(flags: Uint8Array, courseDist: Float64Array, grid: CourseGrid): Uint8Array
//   majority vote per cell; used by the pipeline for moving/walking
```

## Acceptance (Vitest, synthetic and fixtures)
- The grid's last point equals `length` exactly, and `d` is strictly increasing.
- An activity at constant speed 3 m/s resampled with `courseDist = dist` gives `time` = d/3 (±0.01 s) and `pace` = 1/3 everywhere.
- A 60 s stop at 500 m makes `time` jump by about 60 s between 500 and 510 m, and the pace spike stays local to ±50 m.
- On a synthetic 10 % climb with grid grade, `gap` ≈ `pace / 1.659`.
- Fixture 2024 against itself (courseDist = dist): `delta` is all zeros.
- Fixture 2025 against 2024, using a stub alignment (scaled distance) if task 06 hasn't merged yet: `delta[end]` = 26,116 − 25,733 ≈ **383 s** (±3). That is first arrival at `L`; 2025's remaining 163 s were spent standing at the finish.
- `resampleFlags` majority vote on a hand-made example.
- Resampling 26k samples onto a 5,400-point grid takes under 100 ms (log).


If task 03 hasn't merged yet, decode the fixtures with `@garmin/fitsdk` directly in a helper inside your test file.

## Out of scope
Alignment (06), metrics (08) and split sets (20).
