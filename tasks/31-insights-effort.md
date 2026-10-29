# 31 · Insight rules A: effort and fade

**Milestone** M3 · **Depends on** 09 · **Parallel with** 10–14, 21, 30 · **Branch** `task/31-insights-effort`

## Goal
Coaching rules about how each attempt was paced and where it faded, **against the baseline**: pacing, lost ground or bonk, cardiac drift and cadence fade.

## Read first
`tasks/README.md`, `PLAN.md` §3, §5.8 and §5.11, `src/model/types.ts` (`InsightRule`, `Insight`, `Quantity`), and `src/analysis/insights/index.ts`.

## You own
These new files and nothing else:
- `src/analysis/insights/rules/pacing.ts`
- `src/analysis/insights/rules/lostGround.ts`
- `src/analysis/insights/rules/cardiacDrift.ts`
- `src/analysis/insights/rules/cadenceFade.ts`
- a test for each
- `src/analysis/insights/rules/_helpers.ts` (+ test): the baseline and the attempts compared with it, moving time per grid step, cuts by course distance and by moving time, rolling windows on the grid, and runs of grid points

## Requirements
- Each file default-exports an `InsightRule`. The runner's glob skips `_*.ts`.
- Rules compare **each GPS attempt except the baseline** with a **course baseline**, at the same course positions. They return nothing on a split-set baseline, and ignore points where the attempt is off-course. "Slower" compares moving time over the same course metres.
- **Text rules:** a `title` of 8 words or fewer. The `template` names the baseline by its label and uses `{placeholders}` with `values` as `Quantity` objects, and **no unit-bearing numbers in text**. Example: `"First third {firstFaster} faster than 2024 ({firstGain}); last third {lastSlower} slower ({lastLoss})."`
- **`ranges`** covers the stretch the rule is about, in course metres.
- **Thresholds** follow PLAN §5.11 exactly:
  - **pacing:** over the course thirds, > 3 % faster than the baseline in the first **and** > 5 % slower in the last. `warn`, or `strong` when the last third is > 10 % slower.
  - **lost-ground:** a stretch of ≥ 3 km where the 1 km rolling median of the attempt's moving time over the baseline's is > 1.10. Report up to 2, the longest, in course order.
    - With HR on both: if the attempt's HR over the baseline's fell > 5 % from the preceding 3 km to the stretch, title it as a bonk at `strong`.
    - Otherwise `warn`.
  - **cardiac-drift:** `metrics.decoupling` minus the baseline's > 5 points is `warn`, > 10 points `strong`. The range covers the attempt's second half of moving time.
  - **cadence-fade:** `metrics.cadenceFade` (positive = cadence dropped) minus the baseline's > 5 points, at `warn`. Never fires when either side's walking is estimated.
- **Deterministic ids:** `${ruleId}:${attemptId}:${index}`.

## Acceptance (Vitest)
Small arrays built in the test, or `loadFixture(...)` results from `src/test/fixtures.ts`:
- A start faster than the baseline and a finish slower than it fires pacing. The same pace as the baseline, or uniformly slower, doesn't.
- A 5 km stretch slower than the baseline with the attempt's HR dropping against the baseline's is a strong bonk. With HR tracking the baseline's it is a warn. A 2 km stretch doesn't fire.
- Decoupling 0.07 points above the baseline's is warn, 0.12 is strong, 0.03 doesn't fire.
- The baseline itself never gets an insight, and a split-set baseline gets none at all.
- Off-course points inside a candidate stretch are ignored.
- **Fixtures:** run all four rules on `loadFixture('fit-two-attempts')` and **log** what fires, for the owner's review. Don't assert on the fixtures.

## Out of scope
Comparison rules (32) and UI (33).
