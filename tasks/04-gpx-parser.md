# 04 · GPX parser

**Milestone** M1 · **Depends on** 01 · **Parallel with** 03, 05, 06, 07, 08 · **Branch** `task/04-gpx-parser`

## Goal
Turn a `.gpx` track into an `Activity`, keeping the sparser data GPX offers.

## Read first
`tasks/README.md`, `PLAN.md` §1.2, §3 and §5.1, and `src/model/types.ts`.

## You own
`src/parsers/gpx.ts` and `src/parsers/gpx.test.ts`.

## Requirements
- `parseGpx(text: string, fileName: string): Activity`. Task 03's `parseFile` calls it with the decoded text.
- **Workers have no `DOMParser`.** Use a small dependency-free XML scanner, or a tiny pure-JS parser such as `txml` (allowed if you justify it in the PR). It must run in both a worker and Node.
- Read every `trkpt` in every `trkseg` of every `trk`, in document order:
  - lat and lon
  - `ele`
  - `time`, parsed as ISO 8601 to epoch ms
  - the `hr`, `cad` and `atemp` extensions from either the Garmin `TrackPointExtension` v1 or v2 namespace, whatever prefix is used
  - `power` if present
- **Streams:**
  - `t` is seconds since the first point.
  - `dist` is cumulative haversine with R = 6,371,008.8 m.
  - `speed` is distance over time, smoothed with a 5-sample centred mean.
  - Streams that are absent are `null`.
  - Drop points with a duplicate or decreasing time, and points with no time.
- `laps: []`. `deviceSummary` is all nulls.
- If the GPX has no timed track points, throw `UnsupportedFileError` from `./errors` (task 03; if it hasn't merged yet, create the same one-class file and note it in the PR) with "GPX has no timed track points (routes aren't supported)".

## Acceptance (Vitest)
- `fixtures/trail-2024-head.gpx` and `trail-2025-head.gpx`:
  - Record the exact point count in the test.
  - `dist` end ≈ 2,000 m (±30).
  - `hr` is present; `cad`, `power` and `temp` are `null`.
  - Point times start at 05:00:48 UTC on 2024-11-02 (2024 file).
- Inline GPX strings test:
  - the v2 namespace
  - a different prefix (`ns3:hr`)
  - multiple segments
  - a missing `ele` on some points, giving `NaN`
  - a route-only GPX, which throws
  - CRLF line endings and a BOM

## Out of scope
FIT (03), KML and TCX.
