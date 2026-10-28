# 30 · Climb and descent detection

**Milestone** M3 · **Depends on** 09 · **Parallel with** 31, 33, 35, 36 · **Branch** `task/30-climbs`

## Goal
Find the climbs and descents of a course, and compute per-attempt stats on them (time, delta, VAM and descent rate). The splits table, charts, climbs table and insights already consume `analysis.segments`; this task fills it in.

## Read first
`tasks/README.md`, `PLAN.md` §5.2 and §5.10, `src/analysis/segments.ts` (stub from 09), and `src/model/types.ts` (`CourseSegment`).

## You own
`src/analysis/segments.ts` (replace the stub body; keep the signature) and `src/analysis/segments.test.ts`.

## Requirements
```ts
export function detectSegments(grid: CourseGrid): CourseSegment[]     // [] when grid.ele is null
export interface SegmentStats { time: number; delta: number | null; vam: number | null; descentRate: number | null; offCourse: boolean }
export function segmentStats(seg: CourseSegment, grid: CourseGrid, series: AlignedSeries, delta: Float64Array | null): SegmentStats
```
- **Detection** on `grid.ele`. Walk the profile tracking runs:
  - A climb continues while any dip inside it is smaller than 10 m.
  - Keep climbs with total gain ≥ 50 m and average grade ≥ 4 %. Descents are the mirror image.
  - Trim each segment's ends to the actual low and high points.
  - Segments don't overlap and are ordered by `from`.
- **Stats:**
  - `time` is the time between the ends.
  - `delta` is the change in delta between the ends.
  - VAM = `elevationChange / time × 3600` for climbs.
  - descent rate = `|elevationChange| / time × 3600` for descents.
  - `offCourse` is true if any point inside is off-course.

## Acceptance (Vitest)
- **Synthetic:** a profile with a 300 m climb (6 %), a 30 m bump and a 200 m descent finds exactly one climb and one descent with correct ends (±20 m) and changes (±5 m). The bump is ignored.
- **A climb with a 6 m dip** stays one climb. **One with a 15 m dip** splits into two.
- **Fixture 2024 grid:** log the climbs found (count, total gain). Their total gain is within 25 % of the course D+. Cross-check the list with the owner in the PR.
- **Stats:** on a synthetic climb of 500 m elevation gain in 50 minutes, VAM = 600 m/h.
- `detectSegments` on a grid with no elevation returns `[]`.

## Out of scope
UI (34) and insights (32).
