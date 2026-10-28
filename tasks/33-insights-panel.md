# 33 · Insights panel

**Milestone** M3 · **Depends on** 02 · **Parallel with** 30, 31, 32, 34 · **Branch** `task/33-insights-panel`

## Goal
Show the coaching insights clearly. Clicking one zooms the charts and highlights the stretch of course it's about.

## Read first
`tasks/README.md`, `PLAN.md` §3, §5.11 and §6, `src/model/types.ts` (`Insight`), `src/format` (`fillTemplate`), and `src/store/useStore.ts`.

## You own
`src/components/InsightsPanel/**` and `tests/visual/insights.spec.ts`.

## Requirements
- Insights are grouped by attempt, in attempt order, and within each group sorted strong, warn, info. A group header carries the attempt's colour dot and label.
- **Each insight:**
  - a severity icon and label, not colour alone
  - the title
  - the `fillTemplate(template, values, units)` text
  - a "Show on course" action
- **Clicking an insight** (or pressing Enter on it) calls `setHighlights(ranges)` and `setZoom` on the union of the ranges, padded by 5 % and clamped to the course. Clicking it again, or the clear button, clears both.
- **Filters:** a severity filter (all / warn and above), plus a filter for one attempt when there are 2 or more attempts.
- **Empty state:** "No insights — nothing stood out", or hide the section entirely if `analysis` is null.
- Insight text changes with the units toggle; it's rendered at display time.

## Acceptance
- Visual: `insights.spec.ts` covers the insights section for `synthetic-two-attempts` (one per severity), the filtered state, the selected and highlighted state, and the empty state.
- Component tests:
  - the template is filled in both unit systems
  - clicking sets `highlightRanges` and a padded `zoomRange`
  - a second click clears both
  - it works with the keyboard

## Out of scope
Generating insights (31, 32). Chart and map highlight rendering already exists (12, 13).
