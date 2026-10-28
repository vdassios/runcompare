# 34 · Climbs table

**Milestone** M3 · **Depends on** 02, 30 · **Parallel with** 31, 32, 33 · **Branch** `task/34-climbs-table`

## Goal
A per-climb and per-descent comparison: how each attempt did on each named stretch of the course, with VAM and descent rate.

## Read first
`tasks/README.md`, `PLAN.md` §5.10, and `src/analysis/segments.ts` (`segmentStats`).

## You own
`src/components/ClimbsTable/**` and its tests.

## Requirements
- Show **only** when `analysis.segments` is non-empty.
- **Rows:** one per segment, labelled `Climb 3 · 18.4–22.1 km · +412 m · 9 %`, or the matching descent label, in the active units.
- A toggle shows climbs, descents or both.
- **Columns, per attempt:**
  - time
  - delta against the baseline, coloured like the splits table
  - VAM for climbs, or descent rate for descents, using `formatVam`

  Split-set attempts show time and delta only, marked estimated.
- Off-course rows are greyed with the "not comparable" icon.
- Hovering a row sets the highlights, and clicking zooms, the same as the splits table.
- The table is sortable by a column (delta of the focused attempt by default, largest loss first). The first column is sticky, and on mobile it scrolls sideways inside its container.

## Acceptance
- Component tests: the section for `synthetic-two-attempts` (both, climbs-only, and sorted by VAM) and `synthetic-splits-only` (where the section is absent), the VAM is formatted in ft/h when imperial, the sort works, and estimated split-set rows are marked.

## Out of scope
Detection (30) and the splits table's climbs mode (already in 14).
