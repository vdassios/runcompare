# 32 · Insight rules B: comparison

**Milestone** M3 · **Depends on** 09, 30 · **Parallel with** 15, 22, 34, 35, 36 · **Branch** `task/32-insights-comparison`

## Goal
Rules that compare attempts with the baseline: where they walked more, which climbs gained or lost time, stopped time, where the time went by terrain, deficits against a split-set baseline, and the top sections where time was gained or lost.

## Read first
`tasks/README.md`, `PLAN.md` §3, §5.10 and §5.11, `src/model/types.ts`, `src/analysis/segments.ts` (`segmentStats`), and `src/analysis/insights/rules/_helpers.ts` (task 31; if it hasn't merged yet, keep your own small helpers in `_compareHelpers.ts`).

## You own
These new files and their tests, and nothing else:
- `src/analysis/insights/rules/walking.ts`
- `src/analysis/insights/rules/climbs.ts`
- `src/analysis/insights/rules/stoppedTime.ts`
- `src/analysis/insights/rules/terrainAttribution.ts`
- `src/analysis/insights/rules/vsSplitSet.ts`
- `src/analysis/insights/rules/topSections.ts`
- `src/analysis/insights/rules/_compareHelpers.ts`, if needed

## Requirements
Text and template rules are the same as in task 31: every rule compares an attempt with the baseline (PLAN §5.11), names the baseline by its label, skips the baseline itself and ignores off-course points. Rules that need the baseline's streams skip a split-set baseline.
- **walking** (needs `segments`, and `walking` on both sides): climbs where the attempt's walking share is > 15 points above the baseline's give one `warn` listing up to 3, the largest ("walked {share} vs {shareBaseline} on 2024 on the climbs at {from0}, {from1} and {from2}"). If either side's walking is estimated, the title includes "(estimated)". The ranges are those climbs.
- **climbs** (needs `segments`): the 3 climbs with the most time gained and the 3 with the most lost against the baseline, each with its time and relative pace % ("{faster} faster than 2024, {gain} gained, on the climb at {from}"). One `info` insight each for "gained" and "lost", with `ranges` set to the climbs.
- **stopped-time:** |stopped − baseline stopped| > 120 s gives `info`. The range covers the grid points where the attempt was not moving, merged into ranges.
- **terrain-attribution** (needs `segments`): sum the delta changes over climbs, descents and everything else, then name the biggest share at `info`. Use `warn` if one category explains > 60 % of a total |delta| over 2 minutes. The ranges are that category's segments.
- **vs-split-set** (split-set baseline only): for each GPS attempt against the baseline, find the 3 marker intervals with the largest deficit, as relative pace % (attempt pace over the interval against the split set's). `warn` if the worst is > 10 %.
- **top-sections:** for each non-baseline attempt, the 5 non-overlapping 1 km windows (rolling, on the grid) with the largest time lost and the 5 with the largest gained, at `info`. One insight each for "lost" and "gained", listing them in `values`, with `ranges` set to the windows.

## Acceptance (Vitest)
- Synthetic cases for each rule: it fires, it doesn't fire, and the edge case right at the threshold.
- terrain-attribution shares add up to the total delta (±1 s).
- top-sections windows never overlap and are left out when they're off-course.
- vs-split-set runs on `loadFixture('fit-vs-pro')`. **Log** the output for the owner.
- walking and climbs run on `loadFixture('fit-two-attempts')`. **Log** the output for the owner.

## Out of scope
Effort rules (31) and UI (33).
