# 11 · KPI cards

**Milestone** M1 · **Depends on** 02 · **Parallel with** 10, 12, 13 · **Branch** `task/11-kpi-cards`

## Goal
Give an at-a-glance comparison of every attempt against the baseline on the headline metrics.

## Read first
`tasks/README.md`, `PLAN.md` §1.5, §1.6, §3 and §5.8, and `src/model/types.ts` (`AttemptMetrics`).

## You own
`src/components/SummaryCards.tsx` (+ a folder if needed), its tests, and `tests/visual/kpi.spec.ts`.

## Requirements
- One card per metric: **Time** (finish time), **Moving time**, **Stopped**, **D+**, **Avg HR** and **Walking**.
- Each card lists every attempt: colour dot, label, value, and the delta against the baseline.
  - The baseline row shows "baseline" instead of a delta.
  - Time-like deltas use behind = orange and ahead = blue, and the sign comes from `formatDelta`.
  - D+, average HR and walking show neutral deltas with no colour judgement.
- Split-set attempts appear only on the Time card. Their time is the interpolated finish time, `series.time[end]`.
- Hide a card when every attempt's value is `null`. Hide a row when that attempt's value is `null`.
- Walking: show an "estimated" badge with a tooltip ("No cadence in this file — estimated from speed and grade") when `walkingEstimated` is true.
- Format everything through `src/format`. Units follow the store.
- Layout: a 3-column grid on desktop, 2 columns at 768 px and below, 1 column under 480 px.

## Acceptance
- Visual: `kpi.spec.ts` covers the summary section for `synthetic-two-attempts`, `synthetic-gpx` (estimated badge, no cadence) and `synthetic-splits-only` (Time card only).
- Unit: delta sign and colour mapping, hiding cards and rows on null values, and the imperial D+ in feet.

## Out of scope
Charts, tables and insights.
