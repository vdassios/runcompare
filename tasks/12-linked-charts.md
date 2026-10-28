# 12 · Linked charts

**Milestone** M1 · **Depends on** 02 · **Parallel with** 10, 11, 13 · **Branch** `task/12-linked-charts`

## Goal
A stack of charts on one shared course axis (elevation, pace/GAP, HR, cadence and the time delta) with one zoom and one crosshair, synced with the map through the store. This is the heart of the app.

## Read first
`tasks/README.md`, `PLAN.md` §3, §5.6, §5.7 and §6, `src/model/types.ts`, and `src/store/useStore.ts`.

## You own
`src/components/LinkedCharts/**` and its tests. Add `echarts` and `echarts-for-react` (exact versions).

## Requirements
- **Charts, top to bottom.** A chart is hidden when no attempt has its data.
  1. **Elevation:** `grid.ele` as a filled course profile.
     - Shade `analysis.segments` as light bands for climbs and descents; there are none until M3, so it must work with `[]`.
     - Grey bands mark ranges where any attempt is `offCourse`.
     - Hidden when `grid.ele` is null.
  2. **Pace:** one line per attempt, plus a toggle to show GAP as dashed lines. The y-axis is **inverted** (faster is higher) and clipped to the 2nd–98th percentile across attempts, so stops don't flatten everything.
  3. **Heart rate.**
  4. **Cadence.**
  5. **Time delta:** one line per non-baseline attempt, with a zero line. The area between the line and zero is tinted orange above zero (behind) and blue below (ahead). The y-axis is formatted with `formatDelta`.
- **Split-set attempts** are drawn dashed where `estimated = 1`, with dots at `markers`. They only appear on the pace and delta charts.
- **X axis:**
  - `xAxis = 'distance'` uses `grid.d` labelled with `formatDistance`.
  - `'time'` keeps the same points but labels each with the **baseline's elapsed time** at that `d` (PLAN §6).
  - Include a small toggle that calls `setXAxis`.
- **Linking:**
  - All charts are in one `echarts.connect` group.
  - Zoom uses `inside` dataZoom on every chart and a `slider` on the bottom chart. Zoom changes call `setZoom`, and an external `zoomRange` change (insights, later) is applied to the charts.
  - Moving the axis pointer calls `setHover(d)` (throttled to an animation frame). When `hoverDistance` is set from outside (the map), show the axis pointer and tooltip at that `d`.
  - One shared tooltip lists every attempt's value at that `d`, formatted, with the delta.
- `highlightRanges` from the store are drawn as a `markArea` on every chart.
- **Performance:** `showSymbol: false`, and `sampling: 'lttb'`. Only rebuild an option object when its inputs change.
- **Theme:** chart colours come from the theme tokens, and the charts re-theme when the resolved theme changes.
- **Size:** each chart is 180 px tall on desktop and 150 px on mobile, with matching left grid widths so the axes line up vertically.

## Acceptance
- Unit: the option builders give the right charts and series for:
  - `synthetic-two-attempts`
  - `synthetic-gpx` (no cadence chart)
  - `synthetic-splits-only` (pace and delta only, dashed)
  - `synthetic-off-course` (grey band)
  - one zoomed state, `zoomRange = {from: 3000, to: 6000}`
- Unit: the axis-pointer handler turns an ECharts event into `setHover(d)`, and an external `hoverDistance` produces the matching `showTip` action.
- Unit: the option builders are pure functions of `(analysis, units, theme, xAxis)`. Test the percentile clipping, the hidden-chart rules and the time-axis labels.

## Out of scope
The map (13), tables, and insight UI (33 only *sets* `highlightRanges` and `zoomRange`).
