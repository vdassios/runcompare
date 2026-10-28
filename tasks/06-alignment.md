# 06 · Course alignment

**Milestone** M1 · **Depends on** 01 · **Parallel with** 03, 04, 05, 07, 08 · **Branch** `task/06-alignment`

## Goal
Give every sample of an attempt a position along the baseline course (`courseDist`), and flag where the attempt left the course. This is the riskiest algorithm in the app: if it's wrong, every downstream metric is wrong.

## Read first
`tasks/README.md`, `PLAN.md` §1.3, §5.4 and §5.5, and `src/model/types.ts`.

## You own
`src/analysis/alignment.ts`, `src/analysis/alignment.test.ts` and `src/analysis/geo.ts` (+ test).

## Requirements
`geo.ts`:
- `haversine(lat1, lon1, lat2, lon2)` with R = 6,371,008.8 m
- `makeLocalProjection(lat0, lon0)` → `(lat, lon) => [x, y]` in metres (equirectangular)
- `projectOntoSegment(p, a, b)` → `{ t ∈ [0,1], dist }`

`alignment.ts`:
```ts
export interface Reference { x: Float64Array; y: Float64Array; d: Float64Array; length: number; project(lat, lon): [number, number] }
export function buildReference(baseline: Activity): Reference          // vertices < 1 m apart are skipped; d = baseline.dist
export interface AlignmentResult { courseDist: Float64Array; offCourse: Uint8Array; overlap: number }
export function alignToCourse(attempt: Activity, ref: Reference, settings: AnalysisSettings): AlignmentResult
export function alignToDistance(attempt: Activity, length: number): AlignmentResult  // linear scale; offCourse all 0; overlap 1
```
Implement PLAN §5.4 exactly:
- start search over the first 1,000 m
- window `[last − 100, last + 400]`
- monotonic `max(last, d)`
- an off-course threshold from `settings.offCourseThreshold`
- scaled dead-reckoning while off-course
- a re-acquire window of `[last − 200, last + 3000]`
- `overlap` as the on-course share of the attempt's distance
- clamp to `ref.length`

Attempts with no lat/lon fall back to `alignToDistance(attempt, ref.length)` with `overlap: 0`. The pipeline turns that into a warning.

Performance: a linear walk with a moving window, **no** all-pairs search. Aim for under 300 ms for 26k × 26k samples.

## Acceptance (Vitest)
- **Self-alignment:** `fixtures/trail-2024.fit` against itself gives `courseDist` within 5 m of `dist` everywhere, `overlap` = 1, and no off-course points.
- **Real pair:** 2025 against 2024 is monotonic, finishes within 1 % of `ref.length` (actually within 0.5 %, since both end at the finish arch), has `overlap` > 0.95, and no off-course run longer than 200 m. Log the off-course runs it finds.
- **Synthetic out-and-back:** an 8 km out and back on the same road. Positions on the way back must map to the second half (d > 4 km), not jump back to the first.
- **Synthetic loop:** two laps of a 3 km loop map to 0–6 km.
- **Synthetic detour:** a 600 m detour 150 m away from the reference produces one off-course run covering it, `courseDist` stays monotonic through it, and alignment re-acquires afterwards.
- **Different course:** an attempt on another course gives `overlap` < 0.3.
- `alignToDistance` maps the last sample to exactly `length`.
- These tests use the parsers from task 03. If 03 hasn't merged yet, decode with `@garmin/fitsdk` directly in a test helper in your test file.

## Out of scope
Lap-snapping (task 35) and resampling onto the grid (task 07).
