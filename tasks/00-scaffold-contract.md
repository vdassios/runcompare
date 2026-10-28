# 00 · Scaffold and shared contract

**Milestone** M1 · **Depends on** none · **Blocks** every other task · **Branch** `task/00-scaffold-contract`

## Goal
Create the project skeleton and the **shared contract** that every other task codes against: types, unit formatting, theme tokens, the store's shape, and a dashboard with one placeholder slot per section. After this task merges, the other tasks can run in parallel without editing each other's files.

## Read first
`tasks/README.md` (rules), `PLAN.md` §1, §3, §4 and §6.

## You own
`package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `CLAUDE.md`, `README.md`, and these source files:
- `src/main.tsx`, `src/App.tsx`, `src/index.css`
- `src/model/types.ts`
- `src/format/**`
- `src/theme/**`
- `src/store/useStore.ts`
- `src/components/Dashboard.tsx` and the placeholder components listed below

## Requirements

### 1. Tooling
- Vite + React 18 + TypeScript in strict mode, including `noUncheckedIndexedAccess`.
- Tailwind with the `class` dark-mode strategy.
- Zustand.
- Vitest with jsdom available for component tests.
- ESLint (typescript-eslint, react-hooks) and Prettier.
- `@fontsource/inter`, imported in `main.tsx`.

npm scripts:
- `dev`, `build` (`tsc -b && vite build`), `preview`
- `lint`, `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`)

Runtime dependencies, exact versions: `react@18`, `react-dom@18`, `zustand`, `@fontsource/inter`. Don't add chart, map or FIT libraries here; the tasks that use them add them.

### 2. `src/model/types.ts`
Write this exactly as given. JSDoc may be tidied but no type may change.

```ts
/**
 * Shared contract for RunCompare. Every task codes against these types.
 * Changing this file is a task of its own (tasks/README.md).
 *
 * Units: metres, seconds, m/s, °C; pace is s/m; times are seconds since the attempt's start.
 * A missing sample inside a present stream is NaN; a stream the source doesn't have is null.
 */

export type AttemptId = string;
export type UnitSystem = 'metric' | 'imperial';

// ---------- Parsed files ----------

export type LapTrigger = 'manual' | 'distance' | 'time' | 'position' | 'session_end' | 'unknown';

export interface Lap {
  startIndex: number; // first sample, inclusive
  endIndex: number; // last sample, inclusive
  trigger: LapTrigger;
}

export interface Activity {
  source: 'fit' | 'gpx';
  fileName: string;
  startTime: number; // epoch ms, UTC
  t: Float64Array; // s since start, strictly increasing
  dist: Float64Array; // m, cumulative, non-decreasing
  lat: Float64Array | null; // degrees
  lon: Float64Array | null;
  ele: Float32Array | null; // m
  hr: Float32Array | null; // bpm
  cad: Float32Array | null; // steps/min, both feet
  speed: Float32Array | null; // m/s
  power: Float32Array | null; // W
  temp: Float32Array | null; // °C
  laps: Lap[];
  /** Totals the device reported (FIT session); nulls when the file has none. */
  deviceSummary: {
    elapsed: number | null;
    distance: number | null;
    ascent: number | null;
    descent: number | null;
  };
}

// ---------- Split sets ----------

export interface SplitMarker {
  distance: number; // m from the start, cumulative
  time: number; // s from the start, cumulative
}

export interface SplitSet {
  name: string;
  /** Strictly increasing in distance and time. (0, 0) is implicit and never stored. */
  markers: SplitMarker[];
  /** Official race distance the markers refer to; when set, markers are rescaled onto the course length. */
  officialDistance: number | null;
  interpolation: 'gap' | 'linear';
}

// ---------- Attempts and baseline ----------

interface AttemptBase {
  id: AttemptId;
  label: string;
  color: string;
}
export interface GpsAttempt extends AttemptBase {
  kind: 'gps';
  activity: Activity;
}
export interface SplitsAttempt extends AttemptBase {
  kind: 'splits';
  splitSet: SplitSet;
}
export type Attempt = GpsAttempt | SplitsAttempt;

export type DistancePresetId = '5k' | '10k' | 'half' | 'marathon';

export const DISTANCE_PRESETS: Readonly<Record<DistancePresetId, { label: string; distance: number }>> = {
  '5k': { label: '5K', distance: 5000 },
  '10k': { label: '10K', distance: 10000 },
  half: { label: 'Half marathon', distance: 21097.5 },
  marathon: { label: 'Marathon', distance: 42195 },
};

export type Baseline =
  /** A GPS attempt; its track defines the course and its elevation is shared by all attempts. */
  | { kind: 'course'; attemptId: AttemptId }
  /** A split-set attempt on a fixed distance; the course is a straight line of `distance` metres. */
  | { kind: 'distance'; attemptId: AttemptId; preset: DistancePresetId | 'custom'; distance: number };

// ---------- Settings ----------

export interface AnalysisSettings {
  gridStep: number; // m
  walkingCadence: number; // spm; below this while moving = walking
  stoppedSpeed: number; // m/s
  stoppedMinDuration: number; // s
  offCourseThreshold: number; // m
  minOverlap: number; // fraction
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  gridStep: 10,
  walkingCadence: 130,
  stoppedSpeed: 0.5,
  stoppedMinDuration: 10,
  offCourseThreshold: 75,
  minOverlap: 0.7,
};

export interface AnalysisInput {
  attempts: Attempt[];
  baseline: Baseline;
  settings: AnalysisSettings;
}

// ---------- Analysis output ----------

export interface CourseGrid {
  step: number; // m
  length: number; // m
  d: Float64Array; // 0, step, 2·step, …, length (last gap may be shorter)
  ele: Float32Array | null; // smoothed baseline elevation (course baseline only)
  grade: Float32Array | null; // fraction (course baseline only)
  lat: Float64Array | null; // baseline position at each grid point (course baseline only)
  lon: Float64Array | null;
}

export interface AlignedSeries {
  time: Float64Array; // s when the attempt reached each grid point
  ele: Float32Array | null; // the attempt's own smoothed elevation
  hr: Float32Array | null;
  cad: Float32Array | null;
  pace: Float32Array; // s/m over ±50 m
  gap: Float32Array | null; // grade-adjusted pace, s/m; null when no grade is available
  moving: Uint8Array | null; // 1 = moving (GPS only)
  walking: Uint8Array | null; // 1 = walking (GPS only)
  offCourse: Uint8Array; // 1 = not comparable
  estimated: Uint8Array; // 1 = interpolated between split markers
}

export interface AttemptMetrics {
  elapsed: number;
  moving: number;
  stopped: number;
  distance: number; // watch distance, m
  ascent: number | null; // from the attempt's own elevation
  descent: number | null;
  avgHr: number | null; // over moving time
  walkingShare: number | null; // fraction of moving time
  walkingEstimated: boolean; // true when derived from speed + grade (no cadence)
  decoupling: number | null; // fraction; positive = HR drifted up relative to GAP
  cadenceFade: number | null; // fraction; last quarter vs first quarter
}

export interface CourseLap {
  from: number; // course m
  to: number;
  trigger: LapTrigger;
}

export interface AttemptAnalysis {
  attemptId: AttemptId;
  label: string;
  color: string;
  kind: Attempt['kind'];
  series: AlignedSeries;
  delta: Float64Array | null; // series.time − baseline time per grid point; null for the baseline itself
  track: { lat: Float64Array; lon: Float64Array; d: Float64Array } | null; // own samples with course distance
  laps: CourseLap[];
  metrics: AttemptMetrics | null; // null for split sets
  overlap: number | null; // on-course share; null when not applicable
  markers: SplitMarker[] | null; // split sets: markers on the course after rescaling
}

export interface CourseSegment {
  kind: 'climb' | 'descent';
  from: number; // course m
  to: number;
  elevationChange: number; // m, positive for climbs, negative for descents
  avgGrade: number; // fraction
}

export type QuantityKind = 'distance' | 'elevation' | 'pace' | 'duration' | 'delta' | 'percent' | 'count';
export interface Quantity {
  kind: QuantityKind;
  value: number; // SI; percent as a fraction
}

export interface Insight {
  id: string;
  ruleId: string;
  attemptId: AttemptId;
  severity: 'info' | 'warn' | 'strong';
  title: string;
  /** Text with {placeholders} filled from `values` by the UI through src/format. Never put unit-bearing numbers in text. */
  template: string;
  values: Record<string, Quantity>;
  ranges: { from: number; to: number }[]; // course m to highlight
}

export type WarningCode =
  | 'low-overlap'
  | 'off-course'
  | 'invalid-baseline'
  | 'unsupported-file'
  | 'split-set-extrapolated'
  | 'missing-stream'
  | 'distance-scaling'; // which method placed a GPS attempt on a distance baseline (task 35)

export interface AnalysisWarning {
  code: WarningCode;
  attemptId: AttemptId | null;
  message: string;
}

export interface AnalysisResult {
  baseline: Baseline;
  grid: CourseGrid;
  attempts: AttemptAnalysis[]; // input order; rejected attempts are left out and get a warning
  segments: CourseSegment[];
  insights: Insight[];
  warnings: AnalysisWarning[];
}

/** Contract for src/analysis/insights/rules/*.ts: each file default-exports one rule. */
export interface InsightRule {
  id: string;
  run(result: Omit<AnalysisResult, 'insights'>, settings: AnalysisSettings): Insight[];
}
```

### 3. `src/format/`
Pure functions with full unit tests. Every component formats through this module.
```ts
splitLength(units): number                    // 1000 | 1609.344
formatDuration(s, opts?: { sign?: boolean }): string   // 25734 → "7:08:54"; 545 with sign → "+9:05"; -42 → "−0:42"
formatDelta(s): string                         // formatDuration with sign; 0 → "±0:00"
formatDistance(m, units, opts?: { decimals?: number }): string   // "54.13 km" | "33.63 mi"
formatPace(sPerM, units): string               // "5:12 /km" | "8:22 /mi"; non-finite → "—"
formatElevation(m, units): string              // "2,780 m" | "9,121 ft"
formatVam(mPerH, units): string                // "812 m/h" | "2,664 ft/h"
formatTemp(c, units): string
formatPercent(fraction, opts?: { sign?: boolean }): string
formatQuantity(q: Quantity, units): string     // dispatches on q.kind
fillTemplate(template, values, units): string  // replaces {name} with formatQuantity
parseDuration(text): number | null             // "1:02:00", "30:00", "45" (seconds), "2:05:30.5"
defaultUnits(language: string): UnitSystem     // en-US, en-LR, my → imperial; otherwise metric
```
- Use a true minus sign (U+2212) for negatives.
- Numbers are grouped with `en-GB` style regardless of the browser locale, so output stays stable.

### 4. `src/theme/`
- Colour tokens as CSS variables on `:root` and `.dark`: background, surface, text, muted, border, accent, `ahead` (blue), `behind` (orange), `off-course` (grey) and `estimated`.
- `ATTEMPT_PALETTE`: 8 colours that are colour-blind safe (Okabe–Ito based), readable in both themes, and don't clash with ahead/behind.
- `nextAttemptColor(used: string[]): string`.
- `useResolvedTheme()`: resolves `'system'` to light or dark through `prefers-color-scheme` and toggles the `dark` class on `<html>`.

### 5. `src/store/useStore.ts`
A Zustand store with this exact shape:
```ts
export interface AppState {
  attempts: Attempt[];
  baseline: Baseline | null;
  settings: AnalysisSettings;
  analysis: AnalysisResult | null;
  status: 'idle' | 'parsing' | 'analyzing' | 'ready' | 'error';
  errors: string[]; // user-facing messages, e.g. unsupported files

  units: UnitSystem; // initial: localStorage 'rc.units' ?? defaultUnits(navigator.language)
  theme: 'system' | 'light' | 'dark'; // initial: localStorage 'rc.theme' ?? 'system'
  xAxis: 'distance' | 'time';
  hoverDistance: number | null; // course m under the pointer, shared by charts and map
  zoomRange: { from: number; to: number } | null;
  highlightRanges: { from: number; to: number }[];
  focusAttemptId: AttemptId | null; // the attempt whose delta colours the map

  // Data actions. Task 09 implements the GPS ones; task 21 implements addSplitSet and updateSplitSet.
  addFiles(files: File[]): Promise<void>;
  addSplitSet(splitSet: SplitSet, label?: string): AttemptId;
  updateSplitSet(id: AttemptId, splitSet: SplitSet): void;
  updateAttempt(id: AttemptId, patch: { label?: string; color?: string }): void;
  removeAttempt(id: AttemptId): void;
  setBaseline(baseline: Baseline): void;
  setSettings(patch: Partial<AnalysisSettings>): void;
  dismissError(index: number): void;

  // View actions. Implemented here.
  setUnits(units: UnitSystem): void; // persists to localStorage
  setTheme(theme: AppState['theme']): void; // persists to localStorage
  setXAxis(axis: AppState['xAxis']): void;
  setHover(d: number | null): void;
  setZoom(range: AppState['zoomRange']): void;
  setHighlights(ranges: AppState['highlightRanges']): void;
  setFocusAttempt(id: AttemptId | null): void;

  /** Tests only: replaces the data state in one go and sets status to 'ready'. */
  loadScenario(attempts: Attempt[], baseline: Baseline | null, analysis: AnalysisResult | null): void;
}
```
- Implement the view actions, `loadScenario` and `dismissError` now.
- Data actions not yet implemented throw `new Error('Not implemented: task NN')`, naming the task that owns them.
- Wrap every `localStorage` access in try/catch.

### 6. Dashboard slots
`src/components/Dashboard.tsx` renders these sections in PLAN §6 order. Each one comes from its own file, which exports a placeholder returning `null` for now:

`Header`, `UploadPanel`, `AttemptList`, `SplitSetEditor`, `SummaryCards`, `RouteMap`, `LinkedCharts`, `SplitsTable`, `ClimbsTable`, `InsightsPanel`.

- Give each section a `data-section="<kebab-name>"` wrapper so tests can find it.
- Layout: a centred `max-w-7xl` column with `px-4` gutters and vertical spacing. Task 10 owns the final layout.

### 7. Docs
- `CLAUDE.md`: points agents to `PLAN.md` and `tasks/README.md` and repeats the conventions in five lines.
- `README.md`: one paragraph on what the app is, plus `npm i && npm run dev`.

## Acceptance
- `npm run build`, `npm run lint`, `npm run typecheck` and `npm test` pass.
- Unit tests for every function in `src/format`, including:
  - imperial conversions
  - sign handling
  - `parseDuration` edge cases: empty, garbage, `"60:00"` (= 3600)
  - `fillTemplate` with every quantity kind
- Store tests:
  - view actions update state
  - units and theme persist, and still work when `localStorage` throws
  - `loadScenario` sets `status: 'ready'`
- `npm run dev` shows an empty page with the header placeholder and no console errors.

## Out of scope
Parsing, analysis, charts, maps and CI.
