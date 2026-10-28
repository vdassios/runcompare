# 09 · Pipeline, worker and store

**Milestone** M1 · **Depends on** 02, 03, 04, 06, 07, 08 · **Branch** `task/09-pipeline-worker-store`

## Goal
Join parsers, alignment, resampling and metrics into one `analyze()` that runs in a Web Worker, and implement the store's data actions so dropping files in the UI produces an `AnalysisResult`. Also register the first **real-file** harness scenarios.

## Read first
`tasks/README.md`, `PLAN.md` §4 and §5, `src/model/types.ts`, `src/store/useStore.ts`, and the exports of tasks 03–08.

## You own
- `src/analysis/pipeline.ts` (+ test)
- `src/analysis/segments.ts`: **stub only**, `detectSegments(grid): CourseSegment[]` returning `[]`. Task 30 replaces the body.
- `src/analysis/insights/index.ts` (+ test)
- `src/analysis/insights/rules/.gitkeep`
- `src/worker/**`
- the data actions in `src/store/useStore.ts`
- `src/test-harness/realScenarios.ts`
- `tests/e2e/real-m1.spec.ts`

## Requirements

### `analyze(input: AnalysisInput): AnalysisResult` (pure, synchronous)
M1 supports **course baselines with GPS attempts** only. If the baseline is a distance baseline, or there are split attempts, add an `invalid-baseline` warning or skip them with a warning. Task 21 adds both.

1. Validate the baseline: it must reference an existing GPS attempt with lat/lon. If not, return a result with an empty grid and an `invalid-baseline` warning.
2. `grid = buildCourseGrid(baselineActivity, settings.gridStep)` and `ref = buildReference(baselineActivity)`.
3. For each GPS attempt:
   - `alignToCourse`
   - if `overlap < settings.minOverlap`, add a `low-overlap` warning and leave the attempt out
   - otherwise call `resampleAttempt`
   - `flags = movementFlags(...)` using `gradePerSample`; set `series.moving` and `series.walking` with `resampleFlags`
   - `metrics = computeMetrics(...)`
   - `track = { lat, lon, d: courseDist }`
   - laps mapped to course metres
   - add an `off-course` warning for each off-course run longer than 100 m, with the range in the message formatted in km.
   - Warn with `missing-stream` when HR is absent.
4. Compute deltas against the baseline's `series.time`. The baseline's own delta is `null`.
5. `segments = detectSegments(grid)`, then `insights = runInsights(resultWithoutInsights, settings)`.

`runInsights` loads rules with `import.meta.glob('./rules/*.ts', { eager: true })`. Each module default-exports an `InsightRule`. Run them all, sort by severity (strong, warn, info), and wrap each rule in try/catch so one broken rule never breaks analysis. Log the error and skip that rule.

### Worker (`src/worker/`)
- `analysis.worker.ts` handles `{ id, type: 'parse', fileName, bytes }` by calling `parseFile`, and `{ id, type: 'analyze', input }` by calling `analyze`. It replies with `{ id, ok, result | error }`.
- Transfer the result typed arrays back with a transfer list.
- `client.ts` exports `parseInWorker(file: File): Promise<Activity>` and `analyzeInWorker(input): Promise<AnalysisResult>` on top of one shared worker (`new Worker(new URL(...), { type: 'module' })`).

### Store data actions
- **`addFiles`:**
  - Status goes `'parsing'`, then `'analyzing'`, then `'ready'`.
  - Each file becomes a `GpsAttempt` with label = start date formatted `'2 Nov 2024'` (en-GB, UTC) and colour from `nextAttemptColor`.
  - `UnsupportedFileError` and other parse failures go to `errors[]` and the remaining files continue.
  - If there is no baseline, the earliest attempt by `startTime` becomes `{ kind: 'course' }`.
  - `focusAttemptId` defaults to the first non-baseline attempt.
- **`setBaseline`, `setSettings` and `removeAttempt`** re-analyse. Removing the baseline makes the earliest remaining GPS attempt the baseline, or `null` with `analysis = null`.
- **`updateAttempt`** patches `attempts` and `analysis.attempts` in place without re-analysing.
- **Ignore stale results:** keep a request counter, and only the latest analysis is applied.

### Real scenarios (`realScenarios.ts`)
Register with task 02's `registerScenario`:
- `fit-two-attempts`: both FIT fixtures, 2024 as the baseline.
- `gpx-two-attempts`: both GPX heads.

Loaders import the fixtures with `?url`, `fetch` them, and run the real worker pipeline. `tests/e2e/real-m1.spec.ts` checks that both reach `data-ready` with no `errors` and every M1 section rendered.

## Acceptance
- Pipeline test on the fixtures: with a 2024 baseline, 2025's `delta[end]` = 545 ± 3 s. Neither attempt has a `low-overlap` warning. The metrics are non-null where the streams exist.
- Pipeline test: an attempt on a different synthetic course is rejected with `low-overlap`, and the rest of the result is still valid.
- Pipeline test: a rule that throws is skipped and the other rules still run. Use a temporary rule file in a test-only glob, or inject rules through an optional parameter.
- Store tests (worker mocked): adding files sets the baseline and focus, unsupported files go to `errors`, stale results are dropped, and removing the baseline picks a new one.
- In the real app: dropping both FIT files reaches `ready` in under 3 s on a laptop. Log the number in the PR.

## Out of scope
UI components, split sets and distance baselines (21), real segments (30) and rules (31, 32).
