# 20 · Split-set model

**Milestone** M2 · **Depends on** 05 · **Parallel with** M1 UI tasks · **Branch** `task/20-split-set-model`

## Goal
The pure logic behind split sets:
- interpolating a pro's or a target's split times onto the course grid (GAP-weighted or linear)
- parsing pasted split lists in the active units
- building a target-time set

## Read first
`tasks/README.md`, `PLAN.md` §1.3, §1.4 and §5.7, and `src/model/types.ts` (`SplitSet`, `SplitMarker`, `CourseGrid`, `AlignedSeries`).

## You own
`src/analysis/splitSets.ts` and `src/analysis/splitSets.test.ts`.

## Requirements
```ts
export function interpolateSplitSet(set: SplitSet, grid: CourseGrid): {
  series: AlignedSeries;            // time, pace, gap (when grid.grade), estimated; streams null; offCourse zeros
  markers: SplitMarker[];           // after rescaling onto grid.length
  warnings: AnalysisWarning[];      // split-set-extrapolated, markers clamped
}
//   rescale by grid.length / officialDistance when set
//   'gap' && grid.grade: per interval, weight each cell by gapFactor(grade)·cellLength, distribute time ∝ weight
//   otherwise linear; extrapolate past the last marker at the last interval's pace (estimated, warning)
//   estimated = 0 only at the grid points nearest each marker (and d = 0)

export type ParseResult = { ok: true; markers: SplitMarker[] } | { ok: false; errors: { line: number; message: string }[] };
export function parseSplitList(text: string, units: UnitSystem): ParseResult
//   accepts "10 30:00, 15 1:02:00" (comma, semicolon or newline separated); "10km 30:00", "6.2 mi 31:00",
//   "10 → 30:00", tab-separated rows pasted from a results table; explicit km/mi/m suffixes override `units`
//   times via parseDuration; validates strictly increasing distance and time; line numbers are 1-based

export function targetTimeSplitSet(distance: number, time: number, name?: string): SplitSet   // one marker at the finish, 'linear'
export function validateSplitSet(set: SplitSet): string[]   // human messages; [] when valid
```

## Acceptance (Vitest)
- **Exact at markers:** for random sets on a hilly synthetic grid, `time` at each marker's grid point equals the marker's time (±0.5 s, the grid quantisation), in both modes.
- **GAP vs linear:** they agree at markers. Inside an interval that is half climb and half descent, GAP gives more time to the climb half.
- **Constant GAP:** inside an interval, `gap` is constant (±1 %) in GAP mode.
- **Rescaling:** a set with `officialDistance` 54,000 on a 54,128 m grid puts its 54,000 m marker at the grid end.
- **Extrapolation:** a set ending at 40 km on a 42.195 km grid extrapolates and warns.
- **Paste:** every accepted format, imperial input (`6 36:00` → 9,656.064 m), mixed suffixes, and errors with line numbers for decreasing times, bad durations and empty input.
- **Target time:** `targetTimeSplitSet(10000, 2400)` interpolates to an even 4:00/km.

## Out of scope
UI (22) and pipeline wiring (21).
