# 08 · Metrics and splits

**Milestone** M1 · **Depends on** 05 · **Parallel with** 03, 04, 06, 07 · **Branch** `task/08-metrics-splits`

## Goal
Compute the per-attempt summary metrics behind the KPI cards and insights, plus the split computation that the splits table uses.

## Read first
`tasks/README.md`, `PLAN.md` §1.5, §1.6, §5.8 and §5.9, and `src/model/types.ts` (`AttemptMetrics`, `CourseLap`).

## You own
`src/analysis/metrics.ts`, `src/analysis/splits.ts`, and their tests.

## Requirements
`metrics.ts`:
```ts
export interface MovementFlags { moving: Uint8Array; walking: Uint8Array | null; walkingEstimated: boolean }
export function movementFlags(a: Activity, grade: Float32Array | null /* per sample, may be null */, s: AnalysisSettings): MovementFlags
//   speed: a.speed ?? derived from dist/t (5-sample smoothing)
//   stopped: speed < s.stoppedSpeed for ≥ s.stoppedMinDuration consecutive seconds; moving = !stopped
//   walking: moving && cad < s.walkingCadence; with cad null and grade present → estimated:
//            moving && speed < 1.667 && grade > 0.10; with neither → walking null
export function computeMetrics(a: Activity, flags: MovementFlags, gapPerSample: Float32Array | null): AttemptMetrics
//   elapsed = t[end]; stopped from flags; moving = elapsed − stopped; distance = dist[end]
//   ascent/descent: ascentDescent(smoothElevationByDistance(...)) or null
//   avgHr over moving samples; decoupling (GAP speed / HR, first vs second half of moving time);
//   cadenceFade over running samples (moving && !walking), last vs first quarter of moving time;
//   null whenever the needed stream is missing (cadenceFade is null when walking is estimated)
export function gradePerSample(a: Activity): Float32Array | null   // from own smoothed elevation, mapped back to samples
```

`splits.ts`:
```ts
export interface Split { from: number; to: number; time: number; delta: number | null; offCourse: boolean; estimated: boolean }
export function distanceBoundaries(length: number, splitLength: number): number[]   // 0, L1, 2·L1, …, length
export function lapBoundaries(laps: CourseLap[], length: number): number[]
export function segmentBoundaries(segments: CourseSegment[]): number[][]           // [from, to] pairs, M3 uses it
export function computeSplits(grid: CourseGrid, series: AlignedSeries, delta: Float64Array | null, boundaries: number[]): Split[]
//   time = time(b) − time(a) via interpolateAt on grid.d; delta = delta(b) − delta(a)
//   offCourse/estimated: any flagged grid point within [a, b]
```

## Acceptance (Vitest)
- **Synthetic:** a 2 h activity with two 5-minute stops gives `stopped` ≈ 600 s and `moving` ≈ 6,600 s. Short dips under 10 s don't count.
- **Walking with cadence:** a 20-minute stretch at 110 spm counts as walking. **Without cadence:** 1.2 m/s on a 15 % grade counts as estimated walking, and 1.2 m/s on the flat doesn't.
- **Decoupling:** constant GAP with HR rising 10 % in the second half gives ≈ 0.09. Constant HR and GAP gives ≈ 0.
- **Fixtures:**
  - `trail-2024.fit` ascent is within 10 % of `deviceSummary.ascent`, or ≈ 2,780 m if the summary is missing.
  - `trail-2025.fit` `elapsed` = 26,279 s.
  - Log the moving, stopped and walking share for both, so the owner can sanity-check them.
- **Splits:** for any boundaries, `Σ split.delta === delta[end] − delta[0]` (±1e-6), and `Σ split.time === time[end]`. Boundaries for 54,128 m at 1,000 m give 55 splits, the last one 128 m. At imperial `splitLength` they give 34 splits.


If task 03 hasn't merged yet, decode the fixtures with `@garmin/fitsdk` directly in a helper inside your test file.

## Out of scope
Climb detection (30), insights (31, 32) and UI.
