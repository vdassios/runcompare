# 14 · Splits table

**Milestone** M1 · **Depends on** 02, 08 · **Branch** `task/14-splits-table`

## Goal
A table of split times per km or mile, per lap and per climb, with heat-coloured deltas against the baseline that always add up to the total.

## Read first
`tasks/README.md`, `PLAN.md` §3 and §5.9, `src/analysis/splits.ts`, and `src/store/useStore.ts`.

## You own
`src/components/SplitsTable/**` and `tests/visual/splits.spec.ts`.

## Requirements
- **Modes**, as a segmented control:
  - **Distance:** per km or per mile, depending on `units`.
  - **Laps:** the baseline's laps. Only offered when the baseline has 2 or more laps.
  - **Climbs:** each `analysis.segments` entry. Only offered when segments are non-empty (M3).
- Rows are built with `computeSplits` for every attempt, memoised on `(analysis, mode, units)`.
- **Columns:**
  - split label and range (e.g. `12 · 11.0–12.0 km`)
  - the baseline's split time and pace
  - for each other attempt: split time and **delta**, heat-coloured by delta per unit of distance. Orange is behind and blue is ahead. Intensity is scaled to the largest absolute value in the table, with a minimum contrast for text.
- **Totals row:** the total time per attempt and the total delta, which must equal `delta[end]`.
- Rows with `offCourse` are greyed with a "not comparable" icon and tooltip. Rows with `estimated` (split sets) show an "estimated" marker.
- Hovering a row calls `setHighlights([{from, to}])`, and leaving clears it. Clicking a row calls `setZoom({from, to})`.
- The first column is sticky. On mobile the table scrolls sideways inside its container only.

## Acceptance
- Visual: `splits.spec.ts` covers the splits section for `synthetic-two-attempts` (distance and laps modes, metric and imperial), `synthetic-off-course` and `synthetic-splits-only`.
- Unit: the totals row equals `delta[end]` for every scenario, the climbs mode is hidden with `segments: []`, and the laps mode is hidden with fewer than 2 laps.

## Out of scope
The climbs table (34) and computing splits (08 owns `computeSplits`).
