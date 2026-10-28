# 01 · Fixture sanitizer

**Milestone** M1 · **Depends on** 00 · **Parallel with** 02, 05 · **Branch** `task/01-fixture-sanitizer`

> **Run this task on the owner's machine.** The raw files only exist in the gitignored `samples/` folder there.

## Goal
Make privacy-safe copies of the owner's race files in `fixtures/` for tests and visual scenarios, and add a test that fails if personal data ever gets into them. The repo is public. Nothing from `samples/` may be committed.

## Read first
`tasks/README.md`, `PLAN.md` §7 (fixture facts) and §9.

## You own
`scripts/sanitize-samples.ts`, `fixtures/**`, `src/fixtures.privacy.test.ts`, and the `sanitize` script in `package.json` (that line only).

## Inputs (in `samples/`, gitignored)
- `TrailRunning_2024-11-02T07_00_47.fit` and `TrailRunning_2025-11-01T06_30_24.fit`
- `suuntoapp-TrailRunning-2024-11-02-track.gpx` and `suuntoapp-TrailRunning-2025-11-01-track.gpx`. These contain `<metadata><author><name>…` with the owner's name.
- `*.json` Suunto DeviceLogs. **Ignore them**; they are never used.

## Requirements
- `npm run sanitize` (with `tsx`, a dev dependency) writes:
  - `fixtures/trail-2024.fit` and `fixtures/trail-2025.fit`
  - `fixtures/trail-2024-head.gpx` and `fixtures/trail-2025-head.gpx`
- **FIT, using an allowlist:** decode with `@garmin/fitsdk`, then re-encode with its `Encoder`, keeping **only** these message types: `file_id`, `event`, `record`, `lap`, `session`, `activity` and `sport`.
  - Remove `serial_number` from `file_id`.
  - Drop all developer fields and every other message type (`device_info`, `user_profile`, `hrv`, …).
  - Keep every field of `record`, `lap` and `session`.
- **GPX, using an allowlist:** write a new document from scratch with `<gpx version="1.1" creator="runcompare-fixture">`, a `<trk>` whose `<name>` is a neutral label (`Trail 2024`), and one `<trkseg>`.
  - Each `<trkpt>` has only lat/lon, `<ele>`, `<time>` and the `gpxtpx:hr` extension.
  - **Truncate** to the first 2,000 m of haversine distance, which is about 150 KB.
  - No `<metadata>`.
- Print a summary: message counts kept and dropped for each file, and the output sizes.
- `@garmin/fitsdk` is added as a runtime dependency (task 03 uses it too) and `tsx` as a dev dependency.

## Acceptance
- `src/fixtures.privacy.test.ts`, written as structural checks with no list of names:
  - Every message in each fixture FIT is one of the allowlisted types, nothing has `serial_number`, and there are no developer fields.
  - Each fixture GPX has no `<metadata>`, `<author>`, `<email>` or `<link>`. Its only elements are `gpx`, `trk`, `name`, `trkseg`, `trkpt`, `ele`, `time`, `extensions`, `gpxtpx:TrackPointExtension` and `gpxtpx:hr`.
- Each sanitized FIT has the same `record` count, final distance and elapsed time as its raw file. Check this once inside the script; the test can't see `samples/`. The 2024 file still decodes to ≈ 54,128 m and 25,734 s, and the 2025 file to ≈ 53,936 m and 26,279 s.
- `git status` shows only `fixtures/`, the script, the test and `package.json` changes. **`samples/` must not appear.**
- The fixtures add up to less than 2.5 MB in total.

## Out of scope
The app's parsers (tasks 03 and 04). Trimming tracks for privacy zones (agreed: not needed).
