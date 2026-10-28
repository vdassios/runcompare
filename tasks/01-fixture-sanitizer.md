# 01 · Fixture sanitizer

**Milestone** M1 · **Depends on** 00 · **Parallel with** 02, 05 · **Branch** `task/01-fixture-sanitizer`

> **Run this task on the owner's machine.** The raw files only exist in the gitignored `samples/` folder there.

## Goal
Copy the owner's race files into `fixtures/` for tests and visual scenarios, with the owner's name removed, and add a test that fails if it ever gets back in. The repo is public. Nothing from `samples/` may be committed.

## Read first
`tasks/README.md`, `PLAN.md` §7 (fixture facts) and §9.

## You own
`scripts/sanitize-samples.ts`, `fixtures/**`, `src/fixtures.privacy.test.ts`, and the `sanitize` script in `package.json` (that line only).

## Inputs (in `samples/`, gitignored)
- `TrailRunning_2024-11-02T07_00_47.fit` and `TrailRunning_2025-11-01T06_30_24.fit`. These contain nothing personal.
- `suuntoapp-TrailRunning-2024-11-02-track.gpx` and `suuntoapp-TrailRunning-2025-11-01-track.gpx`. These contain `<metadata><author><name>…` with the owner's name. It's the only personal data in the samples.
- `*.json` Suunto DeviceLogs. **Ignore them**; they are never used.

## Requirements
- `npm run sanitize` (with `tsx`, a dev dependency) writes:
  - `fixtures/trail-2024.fit` and `fixtures/trail-2025.fit`, copied as is.
  - `fixtures/trail-2024-head.gpx` and `fixtures/trail-2025-head.gpx`: the original GPX without `<metadata>`, keeping the track points within the first 2,000 m of haversine distance (about 150 KB).
- Print the output sizes and the GPX point counts kept.
- `@garmin/fitsdk` is added as a runtime dependency (task 03 uses it) and `tsx` as a dev dependency.

## Acceptance
- `src/fixtures.privacy.test.ts` checks that the four fixtures exist and that no fixture GPX contains `<metadata>` or `<author>`.
- `git status` shows only `fixtures/`, the script, the test and `package.json` changes. **`samples/` must not appear.**
- The fixtures add up to less than 2.5 MB in total.

## Out of scope
The app's parsers (tasks 03 and 04). Trimming tracks for privacy zones (agreed: not needed).
