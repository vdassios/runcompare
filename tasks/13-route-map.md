# 13 · Route map

**Milestone** M1 · **Depends on** 02 · **Parallel with** 10, 11, 12 · **Branch** `task/13-route-map`

## Goal
Show the course on a map, coloured by where the focused attempt gained or lost time against the baseline, with a hover marker synced with the charts.

## Read first
`tasks/README.md`, `PLAN.md` §3 and §6, `src/model/types.ts` (`CourseGrid`, `AttemptAnalysis.track`), and `src/store/useStore.ts`.

## You own
`src/components/RouteMap/**` and its tests. Add `leaflet` and `react-leaflet@4` (exact versions) and `@types/leaflet`.

## Requirements
- **Map:** OSM standard tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) with the required attribution. Fit the bounds of the course on load and when the baseline changes. Import the Leaflet CSS in this component only.
- **Course line** (course baseline: `grid.lat`/`grid.lon`):
  - Split the line into 100 m pieces, each coloured by the focused attempt's **delta change over that piece**, in seconds per 100 m.
  - Use a diverging scale: ahead is blue, behind is orange, and near zero (±1 s) is neutral grey. Clip at the 95th percentile of the absolute value.
  - Off-course pieces are dashed grey.
  - A small legend explains the scale, in the active units ("s per 100 m" or "s per 0.1 mi").
- **Focus selector:** when there's more than one non-baseline attempt, a select that calls `setFocusAttempt`.
- **Other tracks:** a toggle "show all tracks" that draws each attempt's own `track` as a thin line in its colour.
- **Hover:**
  - Moving the mouse near the course (within 30 px) finds the nearest grid point and calls `setHover(d)`.
  - When `hoverDistance` changes, a marker shows at the grid point for that `d`.
  - Leaving the map calls `setHover(null)`.
- `highlightRanges` are drawn as a thicker outline on top.
- **Distance baseline:** when there's no grid lat/lon but some attempts have `track`s, draw those tracks uncoloured. Hover uses `track.d`.
- **Splits-only:** when there's nothing to draw, render `null`. The section disappears.
- **Size:** 420 px tall on desktop and 280 px on mobile. Scroll-wheel zoom is enabled only after a click into the map, so page scrolling isn't hijacked.

## Acceptance
- Unit: the piece colouring is a pure function of `(grid, delta, offCourse, pieceLength)`. Test the sign, clipping and off-course handling, and the nearest-grid-point lookup.
- Component: the section is absent for `synthetic-splits-only`.

## Out of scope
The charts (12) and elevation colouring of the line.
