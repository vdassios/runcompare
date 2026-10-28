# 03 · FIT parser

**Milestone** M1 · **Depends on** 01 · **Parallel with** 04, 05, 06, 07, 08 · **Branch** `task/03-fit-parser`

## Goal
Turn a `.fit` file into an `Activity`, and add the parser entry point that detects the file format.

## Read first
`tasks/README.md`, `PLAN.md` §1.2, §3 and §5.1, and `src/model/types.ts` (`Activity`, `Lap`).

## You own
`src/parsers/fit.ts`, `src/parsers/fit.test.ts`, `src/parsers/index.ts`, `src/parsers/index.test.ts` and `src/parsers/errors.ts`.

## Requirements
- `parseFit(bytes: ArrayBuffer, fileName: string): Activity`, using `@garmin/fitsdk`'s `Decoder` (already a dependency from task 01). It must not touch the DOM: it runs in a worker.
- **Streams** from `record` messages:
  - `t`: seconds since the first record's timestamp.
  - `dist` from `distance`. If it's missing, use cumulative haversine.
  - `lat`/`lon`: convert semicircles to degrees if the SDK hasn't already.
  - `ele` from `enhanced_altitude`, falling back to `altitude`.
  - `speed` from `enhanced_speed`, falling back to `speed`.
  - `hr` from `heart_rate`.
  - `cad`: `(cadence + fractional_cadence) × 2` for running sports. For cycling sports keep `cadence` as is. Decide using `session.sport`.
  - `power`, and `temp` from `temperature`.
- **Stream rules:**
  - A stream that is absent from every record is `null`.
  - A sample missing in some records is `NaN`.
  - Drop records with a duplicate or decreasing timestamp.
  - Make `dist` non-decreasing by carrying the previous value forward.
- **Laps:** map each `lap` message's `start_time` and `timestamp` to sample indices. `lap_trigger` maps to `LapTrigger`, with anything unknown becoming `'unknown'`.
- **`deviceSummary`** from the first `session`: `total_elapsed_time`, `total_distance`, `total_ascent` and `total_descent`.
- `startTime` is the epoch ms of the first record.
- **`parseFile(bytes, fileName): Activity`** in `index.ts` detects the format:
  - bytes 8–11 are `.FIT` → FIT
  - otherwise, the first non-whitespace text starts with `<?xml` or `<gpx` → GPX. Call `parseGpx` from `./gpx`. Task 04 provides it; until then `index.ts` may import a stub that throws.
  - otherwise throw `UnsupportedFileError` (defined in `errors.ts` to avoid an import cycle with `gpx.ts`) with a user-facing message that names the file and the supported formats.

## Acceptance (Vitest, on `fixtures/`)
- `trail-2024.fit`: ≈ 25,735 samples, `dist` end ≈ 54,128 m (±50), `t` end ≈ 25,734 s (±2), and `deviceSummary.elapsed` within 1 s of that.
- `trail-2025.fit`: `dist` end ≈ 53,936 m and `t` end ≈ 26,279 s. Record the exact sample count in the test.
- Every stream the file has is non-null and the same length as `t`. HR stays within 60–200 except `NaN`. Running cadence median is in 140–190 spm. `t` strictly increases and `dist` never decreases.
- The laps are in order, don't overlap, and cover the samples.
- `parseFile` detects FIT and GPX by content, not by extension. A renamed `.txt` FIT still parses. Random bytes throw `UnsupportedFileError`.
- Parsing one fixture takes under 1.5 s in Vitest on a laptop. Log the time; don't assert it.

## Out of scope
GPX (04) and any smoothing or analysis.
