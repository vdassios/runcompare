# 02 · Visual test harness and CI

**Milestone** M1 · **Depends on** 00 · **Parallel with** 01, 05 · **Branch** `task/02-visual-harness-ci`

## Goal
Make deterministic Playwright snapshot testing and GitHub Actions CI work, and provide **synthetic scenarios**. UI tasks can then be built and snapshotted before the analysis pipeline exists.

## Read first
`tasks/README.md`, `PLAN.md` §3 and §7, and `src/model/types.ts`.

## You own
- `playwright.config.ts`
- `tests/visual/shell.spec.ts`, `tests/visual/helpers.ts`, `tests/e2e/.gitkeep`
- `src/test-harness/**`
- `src/test/factories.ts`
- `.github/workflows/ci.yml`
- `scripts/playwright-docker.sh`
- the `test:visual`, `test:e2e` and `test:visual:update` scripts in `package.json`
- a single harness hook in `src/main.tsx` (see below)

## Requirements

### Factories (`src/test/factories.ts`)
Deterministic builders using a seeded PRNG. No `Math.random`.
- `makeActivity(opts)`: a synthetic `Activity` with a configurable length, elevation profile (flat / one climb / hilly), pace profile (even / fast start and slow finish), and which streams are present (cadence, HR, power, temp, lat/lon).
- `makeSplitSet(opts)`.
- `makeAnalysisResult(scenario)`: builds a complete, internally consistent `AnalysisResult` plus the matching `Attempt[]` and `Baseline` **without calling any analysis code**. Scenarios:
  - `synthetic-two-attempts`: course baseline, 2 FIT-like attempts, 12 km hilly, all streams. Second attempt +3:20 behind. Laps every km. Two climbs and one descent in `segments`. One insight per severity.
  - `synthetic-gpx`: like the above, but with no cadence/power/temp, `walkingEstimated: true`, and `cadenceFade: null`.
  - `synthetic-splits-only`: distance baseline 10K, two split-set attempts, no grid elevation or lat/lon.
  - `synthetic-off-course`: two attempts, where the second has a 600 m off-course stretch at 5 km and overlap 0.95.
- Export `SCENARIOS` with the name, a description, and `() => { attempts, baseline, analysis }`.

### Harness (`src/test-harness/`)
- Only bundled when `import.meta.env.VITE_TEST_HARNESS === '1'`. Load it with a dynamic import from `main.tsx` behind that flag, so production builds don't contain it. Add a build check: `vite build` without the flag must not contain the string `synthetic-two-attempts`.
- `?fixture=<name>` calls `useStore.getState().loadScenario(...)` with the scenario's data.
- `registerScenario(name, loader)` lets later tasks (09, 21) add real-file scenarios with async loaders.
- When the scenario has loaded and rendered, set `document.documentElement.dataset.ready = '1'`.
- Expose `window.__RC_STORE__ = useStore` so Playwright tests can read and set store state.
- Expose `window.__RC_TEST__ = true` so components can turn animations off. Components check `isTestHarness()` from `src/test-harness/flags.ts`, which you also own. It must work without the harness bundle.

### Playwright
- **Projects:** `desktop-light` (1280×800), `desktop-dark` (1280×800, `colorScheme: 'dark'`), `mobile-light` (390×844), `mobile-dark` (390×844).
- `timezoneId: 'UTC'`, `locale: 'en-GB'`, `expect.toHaveScreenshot` with `maxDiffPixelRatio: 0.01` and `animations: 'disabled'`.
- `webServer`: `VITE_TEST_HARNESS=1 vite build && vite preview --port 4173`.
- **Helpers:**
  - `gotoScenario(page, name)` waits for `data-ready`.
  - `stubTiles(page)` routes `**/tile.openstreetmap.org/**` to a 256×256 flat grey PNG.
  - `section(page, name)` returns `[data-section=name]`.
- `tests/visual/shell.spec.ts` snapshots the full page for the empty app and for `synthetic-two-attempts`. At this stage it's mostly placeholders, and later tasks will move these pixels. That's expected: the **shell spec belongs to task 10 after this task merges**.
- `@playwright/test` is a dev dependency **pinned to an exact version**.

### Docker (`scripts/playwright-docker.sh`)
- Runs the suite in `mcr.microsoft.com/playwright:v<same version>-noble`.
- Mounts the repo at `/work`, but puts **`/work/node_modules` on a named Docker volume** and runs `npm ci` inside, because macOS native binaries (esbuild, rollup) break on Linux.
- `npm run test:visual` runs it. `npm run test:visual:update` passes `--update-snapshots`, and any extra arguments go through to Playwright.
- `test:e2e` runs `tests/e2e` in the same container.
- The visual config only matches `tests/visual/**`, and an e2e config (the same file, a different project or `testDir`) only matches `tests/e2e/**`.

### CI (`.github/workflows/ci.yml`)
Runs on PRs and pushes to `main`.
- Job **`checks`**: ubuntu, Node 22, `npm ci`, then lint, typecheck, `npm test` and build.
- Job **`visual`**: `container: mcr.microsoft.com/playwright:v<same>-noble`, `npm ci`, then the visual and e2e suites. On failure, upload `playwright-report/` and `test-results/` as artifacts.
- The job names must be exactly `checks` and `visual`, because branch protection requires them.

## Acceptance
- `npm run test:visual` passes twice in a row on macOS, with no snapshot changes the second time.
- Pushing the branch gives green `checks` and `visual` jobs on the PR, and the Linux CI matches the committed snapshots.
- The production build doesn't contain the harness (build check above).
- Unit tests for the factories: every scenario's arrays have grid length, `delta` is null only for the baseline, and the time arrays are monotonic.

## Out of scope
Real-file scenarios (09, 21) and component snapshots (each UI task).
