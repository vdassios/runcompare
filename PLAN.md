# RunCompare

Compare GPS attempts of the same race, plus pro or target split sets, by **course position**. Plot every stream the files have and explain where time was gained or lost and why.

Agreed with the owner on 2026-10-28 over four rounds of questions. The work is split into agent-sized tasks in [`tasks/`](tasks/README.md). Start there.

---

## 1. Product

### 1.1 Audience
For the owner and their running friends. A public static site, no accounts. **Every file stays in the browser.**

### 1.2 Inputs
| Input | How | Notes |
|---|---|---|
| FIT | `@garmin/fitsdk` | Primary format. Native to Garmin, Coros, Suunto, Polar and Wahoo. 1 Hz records: lat/long, barometric altitude, HR, cadence, distance, speed, power, temperature. Also laps and session totals. |
| GPX | Small XML scanner (no `DOMParser` in workers) | Fallback. lat/lon/ele/time plus `gpxtpx:hr` and `gpxtpx:cad` when present. **Suunto GPX exports have no cadence** and are sparser (~1.4 s between points). |
| Split set | Typed, pasted, or generated from a target time | `(distance, time)` markers. Used for pro athletes or goals. |

Not supported: Suunto JSON DeviceLog, KML, TCX.

### 1.3 Baselines
There is always exactly one baseline. Every delta is measured against it.

- **Course baseline.** A GPS attempt. Its track defines the course. Its smoothed elevation is the **shared elevation** used for grade, GAP and climbs of *every* attempt, so a different barometer calibration in another year doesn't distort comparisons. KPI cards still show each attempt's own ascent.
- **Distance baseline.** A split-set attempt on a preset (5K, 10K, half marathon 21,097.5 m, marathon 42,195 m) or a custom distance. There is no geometry and no shared elevation. GPS attempts are scaled linearly so they finish exactly at the distance (lap-snapping comes later, in task 35). A comparison with **no GPS attempts at all** is allowed, for example two pros, or a pro against your target.

A split set can also be a regular (non-baseline) attempt on either kind of baseline.

### 1.4 Units
Everything is SI internally. A **metric/imperial toggle** defaults from `navigator.language` (en-US → imperial) and is saved in `localStorage`. Imperial shows mi, min/mi, ft, ft/h and °F; split markers are typed in miles and splits are per mile. Preset names stay as they are.

### 1.5 Heart rate
HR chart, HR at the hovered position, average HR and aerobic decoupling. **No HR zones and no max HR.**

### 1.6 Missing data
Any stream can be missing, and the UI hides whatever isn't there. Without cadence (GPX), walking is **estimated** from speed and grade and shown with a badge. Cadence fade is hidden.

### 1.7 Screens
Desktop first. Below 768 px everything stacks into one column: charts stacked, and tables scroll sideways inside their own container. Light and dark themes.

---

## 2. Stack
Vite, React 18, TypeScript (strict), Tailwind CSS, Zustand, `echarts` + `echarts-for-react`, `leaflet` + `react-leaflet@4` with OSM tiles, `@garmin/fitsdk`, a dependency-free GPX scanner (workers have no `DOMParser`), a Web Worker for parsing and analysis, Vitest, ESLint + Prettier, `@fontsource/inter` (fonts are bundled, never fetched at runtime), and `idb-keyval` (task 36).

---

## 3. Conventions
- **Units:** metres, seconds, m/s, °C. Pace is stored as **s/m**. Anything shown to the user goes through `src/format/`. Components never convert units themselves.
- **Course distance `d`:** metres along the baseline course. Attempts are compared on a shared grid with a **10 m** step.
- **Delta:** attempt time minus baseline time at the same `d`. **Positive means behind (slower)**, displayed as `+9:05`. Behind is **orange** and ahead is **blue**. Never rely on red/green alone.
- **Analysis code is pure TypeScript** (no DOM, no React) so it runs in the worker. Streams are typed arrays. A missing sample inside a stream that exists is `NaN`; a stream the source doesn't have is `null`.
- **Shared contract:** `src/model/types.ts`, written by task 00. Changing it is a task of its own.

---

## 4. Architecture

```
.fit/.gpx ──► parsers (worker) ──► Activity ──► Attempt{kind:'gps'}    ┐
split-set editor ──────────────────────────► Attempt{kind:'splits'} ┤
                                                                     ▼
            AnalysisInput { attempts, baseline, settings } ──► analyze() (worker)
                                                                     │
                                                                     ▼
                                     AnalysisResult ──► Zustand store ──► components
```

`analyze()` runs these steps in order (`src/analysis/pipeline.ts`):
1. **Grid.** A course baseline gives the baseline track with smoothed elevation and grade. A distance baseline gives a flat line with no elevation.
2. **Align** each GPS attempt: a `courseDist` for every sample, off-course flags and overlap. Attempts with **< 70 % overlap are rejected** with a warning.
3. **Resample** GPS attempts onto the grid to get an `AlignedSeries`.
4. **Interpolate** split sets onto the grid.
5. **Delta** against the baseline.
6. **Metrics** for each GPS attempt.
7. **Segments** (climbs and descents), from task 30.
8. **Insights:** a registry of rule files in `src/analysis/insights/rules/` (tasks 31–32).

```
src/
  model/types.ts            shared contract (task 00)
  format/                   unit-aware formatting and parsing (00)
  theme/                    colour tokens, attempt palette (00)
  parsers/                  fit.ts (03), gpx.ts (04), index.ts (03)
  analysis/
    smoothing.ts gap.ts     (05)
    alignment.ts            (06, lap-snapping 35)
    grid.ts                 resampling, pace/GAP series, delta (07)
    metrics.ts splits.ts    (08)
    splitSets.ts            interpolation, paste parsing, target time (20)
    segments.ts             climbs/descents (30, stub from 09)
    insights/index.ts       rule runner (09); rules/*.ts (31, 32)
    pipeline.ts             analyze() (09, extended in 21)
  worker/                   analysis.worker.ts + client (09)
  store/                    useStore.ts (00 view state, 09/21 data actions), persistence (36), splitLibrary (22)
  components/               one file or folder per section (10–14, 22, 33, 34)
  test/fixtures.ts          the real fixtures run through the pipeline, for tests (09, 21)
  integration/              real-file tests through the whole UI (15, 23, 37)
scripts/sanitize-samples.ts (01)
fixtures/                   sanitized sample files, committed (01)
```

---

## 5. Algorithms

### 5.1 Parsing
- **FIT:** take `record` messages. Cadence is FIT running cadence (strides/min) × 2, plus `fractional_cadence`. Prefer `enhanced_speed` and `enhanced_altitude`. Distance comes from `record.distance`. Laps come from `lap` messages, mapped to sample indices. `deviceSummary` comes from `session`.
- **GPX:** use `trkpt`. Distance is cumulative haversine.
- **Both:** drop samples with duplicate timestamps so `t` is strictly increasing.

### 5.2 Smoothing and grade
Apply a 5-sample median filter to elevation, resample by distance, then take a moving average over 50 m. Grade is the central difference over 50 m, **clamped to ±0.45**. Ascent and descent use a **3 m hysteresis**.

### 5.3 Grade-adjusted pace (Minetti 2002)
`C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6` J/kg/m, where `i` is the grade as a fraction. `factor(i) = C(i) / 3.6` and `gapPace = pace / factor`. Reference values: factor(0) = 1, factor(0.10) ≈ 1.659, factor(−0.10) ≈ 0.598, factor(−0.20) ≈ 0.500.

### 5.4 Alignment to a course baseline
- **Reference.** The reference polyline is the baseline's lat/lon samples, skipping vertices less than 1 m apart. Each vertex has `d = baseline.dist[i]`. **The course axis is the baseline's own watch distance**, so aligning the baseline to itself returns its own `dist`.
- **Projection.** Points are projected onto a local equirectangular plane centred on the first reference point.
- **First sample.** Search for the nearest segment in the first 1,000 m of the reference.
- **Later samples.** Search candidate segments with `d ∈ [last − 100, last + 400]` and take the nearest perpendicular projection. `courseDist = max(last, projected d)`, so it is monotonic.
- **Off-course.** A sample whose perpendicular distance is over **75 m** is off-course. While off-course, `courseDist` advances by the attempt's own distance increment × (reference length / attempt length). Each off-course sample also tries to re-acquire in `[last − 200, last + 3000]`, and alignment resumes once a projection within 75 m is found.
- **Overlap** is the on-course share of the attempt's distance. Below `minOverlap` (0.7) the attempt is rejected and gets a `low-overlap` warning.
- `courseDist` is clamped to the reference length.

### 5.5 Alignment to a distance baseline
`courseDist = dist × L / dist[end]`. Nothing is off-course. Task 35 adds lap-snapping: when an attempt's manual laps match the expected boundaries, scale piecewise between them.

### 5.6 Grid resampling
- Grid points are `d_k = k·step`, and the last point is exactly `L`.
- `time(d)` is the first time the attempt reaches `d`, linearly interpolated between the two samples that straddle it. Stops therefore show up as a jump in time at the next grid point, and time spent standing after the finish, before the watch is stopped, is not part of `time(L)`.
- HR, cadence and elevation: apply a 5 s rolling mean, then interpolate over `t` at `time(d)`.
- `pace(d) = (time(d+50) − time(d−50)) / 100` s/m, clamped at the ends. This includes stops, which is truthful; the charts clip outliers.
- `gap = pace / factor(grade)`. For a course baseline the grade is `grid.grade`. For a distance baseline it is the attempt's own grade, and `gap` is `null` without elevation.
- A grid point is off-course if any sample in its cell is off-course. The delta is still computed there, so the ghost curve stays continuous, but the point is flagged and left out of per-segment deltas and insights.

### 5.7 Split-set interpolation
- If `officialDistance` is set, markers are rescaled by `L / officialDistance`. Markers beyond `L` are clamped and get a warning.
- The point `(0, 0)` is implicit. If the last marker is before `L`, extrapolate at the last interval's pace, mark it estimated, and warn with `split-set-extrapolated`.
- **Linear:** time within an interval is proportional to distance.
- **GAP** (the default, when the grid has grade): each cell is weighted by `factor(grade_k) · step`, and the interval's time is distributed in proportion to those weights. That is constant GAP within the interval: slower on climbs, faster on descents.
- The curve is **exact at markers** and `estimated = 1` everywhere else.

### 5.8 Metrics (GPS attempts)
- **Stopped:** speed < 0.5 m/s for ≥ 10 s. Moving time = elapsed − stopped.
- **Walking:** moving with cadence < 130 spm. With no cadence it is **estimated**: moving, speed < 1.667 m/s (6 km/h) and grade > 0.10. Walking share = walking time / moving time.
- **Average HR** is over moving time.
- **Decoupling:** the ratio (GAP speed / HR) for the first half versus the second half of moving time. `(r1 − r2) / r1`, so a positive value means HR drifted up.
- **Cadence fade:** mean cadence while running (moving and not walking) in the last quarter, compared with the first quarter, as a fraction.
- **Ascent and descent** come from the attempt's own smoothed elevation.

### 5.9 Splits
Boundaries are every `splitLength(units)` (1,000 m or 1,609.344 m) plus `L`, or the baseline's lap positions, or climb boundaries.
- Split time = `time(b) − time(a)`.
- Split delta = `delta(b) − delta(a)`, so **split deltas always add up to the total delta**.
- Splits that touch off-course points are shown greyed out as "not comparable".

### 5.10 Climbs and descents (course baseline only)
On `grid.ele`, a climb is a stretch with cumulative gain ≥ 50 m and average grade ≥ 4 %, allowing dips < 10 m inside it. Descents are the mirror image. For each attempt and segment: time, delta, VAM (m/h) on climbs, and descent rate (m/h) on descents.

### 5.11 Insight rules
Each rule cites its numbers and returns the course ranges it is about.

| Rule | Fires when |
|---|---|
| `went-out-too-hard` | First-third average GAP > 5 % faster than the whole-race average **and** last third > 8 % slower. |
| `fade` | GAP > 15 % slower than the race median for ≥ 3 km **while HR over that span is > 5 % below the preceding 3 km** (described as a bonk). Without HR it reports a plain fade at `info`. |
| `cardiac-drift` | Decoupling > 5 % gives `warn`, > 10 % gives `strong`. |
| `cadence-fade` | Cadence fade < −5 %. |
| `walking-late` | Walking share in the last third minus the first third > 15 points. Compared across attempts. |
| `stopped-time` | Stopped time differs from the baseline by > 2 min. |
| `terrain-attribution` | Splits the total delta into climbs, descents and flats and names the one that dominates. |
| `vs-split-set` | The 3 marker intervals with the largest deficit against a split set, given as relative pace %. |
| `top-sections` | The top 5 non-overlapping 1 km windows where time was gained and lost, excluding off-course points. |

---

## 6. UI
Sections in page order:
1. Header: title, units toggle, theme toggle.
2. Upload panel and attempts list: label, colour, baseline radio, remove, warnings.
3. Baseline and split-set editor (M2): distance presets or custom, rows, paste, target time.
4. KPI cards.
5. Route map, coloured by gained or lost against the baseline.
6. Linked charts on a shared course-distance axis: elevation (with climb shading), pace/GAP, HR, cadence, and the cumulative time delta. One zoom, one crosshair, synced with the map.
7. Splits table: per km or mile, per lap, per climb.
8. Climbs table (M3).
9. Insights panel (M3). Clicking an insight zooms to and highlights its ranges.

Interaction state shared through the store: `hoverDistance`, `zoomRange`, `highlightRanges`, `xAxis` and `focusAttemptId`. On the **time x-axis**, the shared axis is relabelled with the baseline's elapsed time at each grid point, so all series stay aligned.

---

## 7. Testing
- **Unit:** Vitest, on the sanitized fixtures, plus small arrays written inline where a test needs an exact expected value.
- **Component:** Vitest + jsdom, rendering each section from the real fixtures run through the pipeline (`src/test/fixtures.ts`).
- **Integration:** Vitest + jsdom, uploading the real fixtures through `<Dashboard />` with the pipeline run in-process (tasks 15, 23, 37).
- **Manual:** hover sync, zoom, theming and the 390 px layout are checked by hand in each milestone's end-to-end task.
- **Privacy:** a fixture test checks that no fixture GPX carries `<metadata>` or `<author>`, where the owner's name is (task 01).
- **CI:** GitHub Actions with one job, `checks` (lint, typecheck, tests, build), required on `main`.

### Fixture facts (from the raw FIT files)
| | 2024 | 2025 |
|---|---|---|
| Elapsed | 25,734 s (7:08:54) | 26,279 s (7:17:59) |
| Watch distance | ≈ 54,128 m | ≈ 53,936 m |
| Records | 25,735 | 26,280 |
| Distance stops growing | ≈ 25,733 s | 26,116 s (then 163 s standing at the finish) |

The race is a trail race near Olympus with about 2,780 m D+. 2025 against a 2024 baseline:
- **Ghost delta at the finish** (`delta[end]`, splits total): **+383 s (+6:23)**, from first arrival at `L` (§5.6).
- **KPI Time card** (elapsed time difference): **+545 s (+9:05)**. The gap between the two is the 163 s spent standing at the 2025 finish.

---

## 8. Milestones
- **M1: GPS vs GPS.** Tasks 00–15. Your two FIT races, end to end.
- **M2: split sets and distance baselines.** Tasks 20–23.
- **M3: insights, climbs, lap-snapping, persistence.** Tasks 30–37.
- **Deploy.** Task 38: Cloudflare Pages `runcompare.pages.dev`, preview deploys on PRs, production on merges to `main`.

---

## 9. Repo and workflow
- Public repo at `github.com/vdassios/runcompare`, MIT licence.
- Commits use the repo-local email `va.dassios@gmail.com`.
- `main` is protected: PRs only, `checks` must pass, no force pushes, and only the owner merges.
- One branch and one PR per task.
- Bootstrap steps and the rules for builder agents are in [`tasks/README.md`](tasks/README.md).

---

## 10. Decision log
- **FIT first, GPX as fallback, JSON dropped:** FIT has every stream at 1 Hz. GPX is the lowest common denominator.
- **Shared baseline elevation:** barometers are calibrated differently each year, so per-attempt grades would blame the altimeter for time differences.
- **Off-course ranges are flagged, not hidden:** races get rerouted. The ghost curve stays continuous while deltas and insights ignore the changed stretch. Below 70 % overlap there's nothing meaningful to compare.
- **Estimated walking without cadence:** walking late is one of the most useful mountain insights, and speed plus grade is a decent proxy. Cadence fade can't be estimated honestly, so it is hidden.
- **No HR zones:** the owner asked for none. They would need a max HR the app can't know.
- **Distance presets: 5K, 10K, half and marathon, plus custom:** the owner's choice. Trail races rarely match a preset, so custom covers them.
- **Contract first (task 00):** parallel agents need fixed types. Otherwise each one invents its own.
- **Real fixtures as test data, no synthetic factories:** tests use the owner's races run through the real pipeline. UI tasks therefore start after task 09.
- **Insight rules as one file each, picked up by a glob:** rule tasks never edit a shared registry file.
- **Finish delta uses first arrival, the Time card uses elapsed time:** standing at the finish before stopping the watch isn't racing, so the ghost delta and splits leave it out. The Time card still compares what the watch recorded.
- **Raw samples are never committed:** `samples/` is gitignored. Only the sanitized `fixtures/` go in. The repo is public.
