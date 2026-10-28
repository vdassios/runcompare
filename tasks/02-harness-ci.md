# 02 · Test harness and CI

**Milestone** M1 · **Depends on** 00 · **Parallel with** 01, 05 · **Branch** `task/02-harness-ci`

## Goal
Provide **synthetic scenarios** and a `?fixture=` harness, so UI tasks can be built and tested before the analysis pipeline exists. Set up Playwright for e2e and interaction tests, and GitHub Actions CI.

## Read first
`tasks/README.md`, `PLAN.md` §3 and §7, and `src/model/types.ts`.

## You own
- `playwright.config.ts`
- `tests/e2e/helpers.ts`, `tests/e2e/harness.spec.ts`
- `src/test-harness/**`
- `src/test/factories.ts`
- `.github/workflows/ci.yml`
- the `test:e2e` script in `package.json`
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
- Export `SCENARIOS` with the name, a description, and `() => { attempts, baseline, analysis }`. Component tests load them with `useStore.getState().loadScenario(...)`.

### Harness (`src/test-harness/`)
- Only bundled when `import.meta.env.VITE_TEST_HARNESS === '1'`. Load it with a dynamic import from `main.tsx` behind that flag, so production builds don't contain it. Add a build check: `vite build` without the flag must not contain the string `synthetic-two-attempts`.
- `?fixture=<name>` calls `useStore.getState().loadScenario(...)` with the scenario's data.
- `registerScenario(name, loader)` lets later tasks (09, 21) add real-file scenarios with async loaders.
- When the scenario has loaded and rendered, set `document.documentElement.dataset.ready = '1'`.
- Expose `window.__RC_STORE__ = useStore` so Playwright tests can read and set store state, with or without `?fixture=`.
- Only when `?fixture=` is present, expose `window.__RC_TEST__ = true` so components can turn animations off and persistence (36) stays off. Components check `isTestHarness()` from `src/test-harness/flags.ts`, which you also own. It must work without the harness bundle. Without `?fixture=` the app behaves like production.

### Playwright
- Runs on the host with Chromium only. `@playwright/test` is a dev dependency **pinned to an exact version**.
- **Projects:** `desktop` (1280×800) and `mobile` (390×844).
- `timezoneId: 'UTC'`, `locale: 'en-GB'`, `testDir: 'tests/e2e'`.
- `webServer`: `VITE_TEST_HARNESS=1 vite build && vite preview --port 4173`. Specs that test the normal app (15, 23, 36, 37) upload through the UI and never use `?fixture`.
- **Helpers:**
  - `gotoScenario(page, name)` waits for `data-ready`.
  - `stubTiles(page)` routes `**/tile.openstreetmap.org/**` to a 256×256 flat grey PNG, so tests never hit the network.
  - `section(page, name)` returns `[data-section=name]`.
- `tests/e2e/harness.spec.ts`: the empty app loads with no console errors, and `?fixture=synthetic-two-attempts` reaches `data-ready` with `status: 'ready'` in the store.
- `npm run test:e2e` runs the suite. Extra arguments go through to Playwright.

### CI (`.github/workflows/ci.yml`)
Runs on PRs and pushes to `main`.
- Job **`checks`**: ubuntu, Node 22, `npm ci`, then lint, typecheck, `npm test` and build (with the harness check).
- Job **`e2e`**: ubuntu, Node 22, `npm ci`, `npx playwright install --with-deps chromium`, then `npm run test:e2e`. On failure, upload `playwright-report/` and `test-results/` as artifacts.
- The job names must be exactly `checks` and `e2e`, because branch protection requires them.

## Acceptance
- `npm run test:e2e` passes locally.
- Pushing the branch gives green `checks` and `e2e` jobs on the PR.
- The production build doesn't contain the harness (build check above).
- Unit tests for the factories: every scenario's arrays have grid length, `delta` is null only for the baseline, and the time arrays are monotonic.

## Out of scope
Real-file scenarios (09, 21) and component tests (each UI task).
