# 31 · Insight rules A: effort and fade

**Milestone** M3 · **Depends on** 09 · **Parallel with** 10–14, 21, 30 · **Branch** `task/31-insights-effort`

## Goal
Coaching rules about how each attempt was paced and how it faded: went out too hard, fade or bonk, cardiac drift, and cadence fade.

## Read first
`tasks/README.md`, `PLAN.md` §3 and §5.11, `src/model/types.ts` (`InsightRule`, `Insight`, `Quantity`), and `src/analysis/insights/index.ts`.

## You own
These new files and nothing else:
- `src/analysis/insights/rules/wentOutTooHard.ts`
- `src/analysis/insights/rules/fade.ts`
- `src/analysis/insights/rules/cardiacDrift.ts`
- `src/analysis/insights/rules/cadenceFade.ts`
- a test for each
- `src/analysis/insights/rules/_helpers.ts` (+ test): thirds and quarters by moving time, rolling windows on the grid, and a skip for off-course points

## Requirements
- Each file default-exports an `InsightRule`. The runner picks it up through its glob, so **don't edit `index.ts`**.
- Rules run for **GPS attempts only** and ignore off-course grid points.
- **Text rules:** a `title` of 8 words or fewer. The `template` uses `{placeholders}` with `values` as `Quantity` objects, and **no unit-bearing numbers in text**. Example: `"First third {firstGap} GAP vs {avgGap} average; last third {lastGap}."`
- **`ranges`** covers the stretch the rule is about, in course metres.
- **Thresholds** follow PLAN §5.11 exactly:
  - **went-out-too-hard:** first-third average GAP > 5 % faster than the whole-race average **and** last third > 8 % slower. Severity `warn`, or `strong` when the last third is > 15 % slower.
  - **fade:** a window of at least 3 km where the GAP is > 15 % slower than the race median.
    - With HR: if the mean HR over that window is > 5 % below the preceding 3 km, title it as a bonk at `strong`; otherwise a fade at `warn`.
    - Without HR: a fade at `info`.
    - Report up to 2 non-overlapping windows.
  - **cardiac-drift:** from `metrics.decoupling`. > 5 % is `warn` and > 10 % is `strong`. The range covers the second half.
  - **cadence-fade:** from `metrics.cadenceFade` < −5 %, at `warn`. Never fires when `walkingEstimated` is true.
- **Deterministic ids:** `${ruleId}:${attemptId}:${index}`.

## Acceptance (Vitest)
Small arrays built in the test, or `loadFixture(...)` results from `src/test/fixtures.ts`:
- A fast start and slow finish fires went-out-too-hard. An even pace doesn't.
- A 5 km slowdown with HR dropping is a strong bonk. A 5 km slowdown with HR steady is a warn fade. A 2 km slowdown doesn't fire.
- Decoupling of 0.07 is warn, 0.12 is strong, and 0.03 doesn't fire.
- Cadence fade doesn't fire on `loadFixture('gpx-two-attempts')`.
- Off-course points inside a candidate window are ignored.
- **Fixtures:** run all four rules on `loadFixture('fit-two-attempts')` and **log** what fires, for the owner's review. Don't assert on the fixtures.

## Out of scope
Comparison rules (32) and UI (33).
