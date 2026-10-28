# 35 · Lap-snapping on distance baselines

**Milestone** M3 · **Depends on** 21 · **Parallel with** 30–34, 36 · **Branch** `task/35-lap-snapping`

## Goal
On a distance baseline, GPS distance drifts. When an attempt has **manual laps** at known distances (per-km lap presses on the road, or 400 m laps on the track), use them as exact markers instead of scaling the whole run linearly.

## Read first
`tasks/README.md`, `PLAN.md` §5.5, and `src/analysis/alignment.ts`.

## You own
`alignToDistance` in `src/analysis/alignment.ts` (extend it; keep `alignToCourse` untouched) and the matching tests. Also the one line in `pipeline.ts` that passes laps through, if needed.

## Requirements
- `alignToDistance(attempt, length, opts?: { snapLaps?: boolean })`, default `true`.
- **Detection:** take the `manual` laps only.
  - If there are ≥ 3 of them and their watch distances are all within 8 % of a common lap length `ℓ`, where `ℓ` is the median, then the expected boundaries are `k·ℓ'`, with `ℓ'` being `ℓ` rounded to the nearest of 400, 1000 or 1609.344, or to the nearest 100 m otherwise.
  - Snap only if the last boundary is ≤ `length`, and the remainder after the last lap is less than 1.5 `ℓ'`.
- **Mapping:** piecewise-linear between lap boundaries, where each boundary maps to `k·ℓ'` exactly. The stretch after the last lap is scaled to end at `length`.
- If detection fails, fall back to the linear scale. **Return a `distance-scaling` warning** either way, saying which method was used. Extend `AlignmentResult` with an optional `warning?: AnalysisWarning` field, and pass it through in the pipeline.

## Acceptance (Vitest)
- **Synthetic track 10K:** 25 manual laps whose watch distances wander between 405 and 425 m. Boundaries snap to exact multiples of 400 m, and the final distance is 10,000.
- **Synthetic road 10K with per-km laps:** snaps to 1,000 m.
- **Auto laps only** (trigger `distance`): no snapping.
- **Inconsistent manual laps:** they fall back to linear, with a warning.
- **Course-baseline behaviour is unchanged:** all task 06 tests pass.

## Out of scope
UI. The method warning appears through the attempts list warnings that already exist.
