# 21 · Pipeline: split sets and distance baselines

**Milestone** M2 · **Depends on** 09, 20 · **Branch** `task/21-pipeline-split-sets`

## Goal
Teach `analyze()` and the store about split-set attempts and distance baselines, including comparisons made only of split sets.

## Read first
`tasks/README.md`, `PLAN.md` §1.3, §4, §5.5 and §5.7, `src/analysis/pipeline.ts`, `src/analysis/splitSets.ts`, and `src/store/useStore.ts`.

## You own
- `src/analysis/pipeline.ts` and its test (extend them)
- the `addSplitSet` and `updateSplitSet` actions, plus the baseline rules, in `src/store/useStore.ts`
- `src/test-harness/realScenarios.ts` (add scenarios)
- `tests/e2e/real-m2.spec.ts`

## Requirements
- **Distance baseline:**
  - `grid = buildDistanceGrid(baseline.distance, step)`; the baseline's own times come from `interpolateSplitSet`.
  - GPS attempts go through `alignToDistance(activity, grid.length)`, then `resampleAttempt`. GAP uses each attempt's own grade, or `null` without elevation.
  - `track` is kept so the map can draw uncoloured tracks.
- **Split-set attempts on any baseline:** `interpolateSplitSet(set, grid)`, with `metrics: null`, `track: null`, `laps: []`, and `markers` set. Their warnings are added to the result.
- **Split sets only:** this is valid. The grid has no elevation, so GAP is null and interpolation is linear.
- **Baseline validity:**
  - `{kind:'course'}` must point to a GPS attempt with lat/lon.
  - `{kind:'distance'}` must point to a split-set attempt.
  - Otherwise return an `invalid-baseline` warning with an empty grid. The UI shows the message.
- **Store:**
  - `addSplitSet(set, label?)` adds a `SplitsAttempt` (label defaults to `set.name`, colour from the palette) and re-analyses. If there is no baseline yet, it becomes `{ kind: 'distance', attemptId, preset: 'custom', distance: last marker's distance }`. It returns the id.
  - `updateSplitSet` replaces the set and re-analyses.
  - Removing a distance baseline's split set falls back to the earliest GPS attempt as a course baseline, or to `null`.
- **Real scenarios** to register:
  - `fit-vs-pro`: both FIT fixtures on a 2024 course baseline, plus a pro set `10 → 55:00, 25 → 2:30:00, 54 → 5:30:00` with `officialDistance` 54,000 and `'gap'`.
  - `splits-only-10k`: a 10K distance baseline from a target time of 40:00, plus a pro set at 5 km 14:10 and 10 km 28:30.

  In `real-m2.spec.ts`, check that both reach `data-ready` with no `errors`.

## Acceptance
- Pipeline tests:
  - `fit-vs-pro`: the pro's `series.time` equals the marker times at the rescaled marker positions, and the 2024 baseline is unchanged from M1.
  - Distance baseline 10K with the 2024 FIT attempt cut to a synthetic 10 km: the attempt's `courseDist` end = 10,000.
  - Splits only: no warnings and two attempts.
  - A course baseline pointing to a split attempt gives `invalid-baseline`.
- Store tests: the first split set becomes the distance baseline, and removing it falls back correctly.
- All M1 tests still pass unchanged.

## Out of scope
The editor UI (22) and lap-snapping (35).
