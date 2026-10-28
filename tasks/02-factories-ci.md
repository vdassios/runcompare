# 02 · Test factories and CI

**Milestone** M1 · **Depends on** 00 · **Parallel with** 01, 05 · **Branch** `task/02-factories-ci`

## Goal
Provide **synthetic scenarios**, so UI tasks can be built and tested before the analysis pipeline exists, and set up GitHub Actions CI.

## Read first
`tasks/README.md`, `PLAN.md` §3 and §7, and `src/model/types.ts`.

## You own
- `src/test/factories.ts` (+ test)
- `.github/workflows/ci.yml`

## Requirements

### Factories (`src/test/factories.ts`)
Deterministic builders using a seeded PRNG. No `Math.random`.
- `makeActivity(opts)`: a synthetic `Activity` with a configurable length, elevation profile (flat / one climb / hilly), pace profile (even / fast start and slow finish), and which streams are present (cadence, HR, power, temp, lat/lon).
- `makeSplitSet(opts)`.
- `makeAnalysisResult(scenario)`: builds a complete, internally consistent `AnalysisResult` plus the matching `Attempt[]` and `Baseline` **without calling any analysis code**. Scenarios:
  - `synthetic-two-attempts`: course baseline, 2 FIT-like attempts, 12 km hilly, all streams. Second attempt +3:20 behind. Laps every km. Two climbs and one descent in `segments`. One insight per severity.
  - `synthetic-gpx`: like the above, but with no cadence/power/temp, `walkingEstimated: true`, and `cadenceFade: null`.
  - `synthetic-splits-only`: distance baseline 10K, two split-set attempts, no grid elevation or lat/lon.
  - `synthetic-off-course`: two attempts, where the second has a 600 m off-course stretch at 5 km and overlap 0.95.
- Export `SCENARIOS` with the name, a description, and `() => { attempts, baseline, analysis }`. Component tests load them with `useStore.getState().loadScenario(...)`.

### CI (`.github/workflows/ci.yml`)
Runs on PRs and pushes to `main`.
- One job, **`checks`**: ubuntu, Node 22, `npm ci`, then lint, typecheck, `npm test` and build.
- The job name must be exactly `checks`, because branch protection requires it.

## Acceptance
- Pushing the branch gives a green `checks` job on the PR.
- Unit tests for the factories: every scenario's arrays have grid length, `delta` is null only for the baseline, and the time arrays are monotonic.

## Out of scope
Component tests (each UI task).
