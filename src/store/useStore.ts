import { create } from 'zustand';
import { defaultUnits } from '../format';
import {
  DEFAULT_SETTINGS,
  type AnalysisResult,
  type AnalysisSettings,
  type Attempt,
  type AttemptId,
  type Baseline,
  type GpsAttempt,
  type SplitSet,
  type UnitSystem,
} from '../model/types';
import { nextAttemptColor } from '../theme';
import { analyzeInWorker, parseInWorker } from '../worker/client';

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

export const UNITS_KEY = 'rc.units';
export const THEME_KEY = 'rc.theme';

// Storage can be missing or throw (private mode, blocked site data); the app must work without it.
function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Not persisted; the in-memory state still changes.
  }
}

function initialUnits(): UnitSystem {
  const stored = readStorage(UNITS_KEY);
  if (stored === 'metric' || stored === 'imperial') return stored;
  return defaultUnits(globalThis.navigator?.language ?? '');
}

function initialTheme(): AppState['theme'] {
  const stored = readStorage(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function notImplemented(task: string): never {
  throw new Error(`Not implemented: task ${task}`);
}

const LABEL_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Default attempt label: its start date, e.g. "2 Nov 2024". */
export function attemptLabel(startTime: number): string {
  return LABEL_FORMAT.format(startTime);
}

let attemptCounter = 0;

function errorMessage(error: unknown, fileName: string): string {
  if (error instanceof Error && error.name === 'UnsupportedFileError') return error.message;
  return `"${fileName}" can't be read: ${error instanceof Error ? error.message : String(error)}`;
}

/** The earliest GPS attempt by start time, as a course baseline. */
function defaultBaseline(attempts: Attempt[]): Baseline | null {
  const gps = attempts.filter((a): a is GpsAttempt => a.kind === 'gps');
  if (gps.length === 0) return null;
  const earliest = gps.reduce((a, b) => (b.activity.startTime < a.activity.startTime ? b : a));
  return { kind: 'course', attemptId: earliest.id };
}

/** Keeps `current` while it is a non-baseline attempt, else the first non-baseline attempt. */
function pickFocus(attempts: Attempt[], baseline: Baseline | null, current: AttemptId | null): AttemptId | null {
  const candidates = attempts.filter((a) => a.id !== baseline?.attemptId);
  if (candidates.some((a) => a.id === current)) return current;
  return candidates[0]?.id ?? null;
}

/** Builds a fresh store. The app uses the `useStore` singleton; tests can make their own. */
export function createAppStore() {
  // Only the latest analysis request may land; an older one finishing late is dropped.
  let latestRequest = 0;

  return create<AppState>()((set, get) => {
    async function reanalyze(): Promise<void> {
      const { attempts, baseline, settings } = get();
      const request = ++latestRequest;
      if (!baseline) {
        set({ analysis: null, status: attempts.length > 0 ? 'ready' : 'idle' });
        return;
      }
      set({ status: 'analyzing' });
      try {
        const result = await analyzeInWorker({ attempts, baseline, settings });
        if (request !== latestRequest) return;
        // Labels and colours may have been edited while the worker ran (updateAttempt doesn't re-analyse).
        const byId = new Map(get().attempts.map((a) => [a.id, a]));
        const merged = result.attempts.map((a) => {
          const current = byId.get(a.attemptId);
          return current ? { ...a, label: current.label, color: current.color } : a;
        });
        set({ analysis: { ...result, attempts: merged }, status: 'ready' });
      } catch (error) {
        if (request !== latestRequest) return;
        const message = error instanceof Error ? error.message : String(error);
        set((s) => ({ status: 'error', errors: [...s.errors, `Analysis failed: ${message}`] }));
      }
    }

    function commit(attempts: Attempt[], baseline: Baseline | null): Promise<void> {
      set((s) => ({ attempts, baseline, focusAttemptId: pickFocus(attempts, baseline, s.focusAttemptId) }));
      return reanalyze();
    }

    return {
      attempts: [],
      baseline: null,
      settings: DEFAULT_SETTINGS,
      analysis: null,
      status: 'idle',
      errors: [],

      units: initialUnits(),
      theme: initialTheme(),
      xAxis: 'distance',
      hoverDistance: null,
      zoomRange: null,
      highlightRanges: [],
      focusAttemptId: null,

      addFiles: async (files) => {
        set({ status: 'parsing' });
        const parsed = await Promise.allSettled(files.map(parseInWorker));
        const errors: string[] = [];
        const added: GpsAttempt[] = [];
        const colors = get().attempts.map((a) => a.color);
        parsed.forEach((p, i) => {
          if (p.status === 'rejected') {
            errors.push(errorMessage(p.reason, files[i]!.name));
            return;
          }
          const color = nextAttemptColor(colors);
          colors.push(color);
          const id = `attempt-${++attemptCounter}`;
          added.push({ id, kind: 'gps', label: attemptLabel(p.value.startTime), color, activity: p.value });
        });
        if (errors.length > 0) set((s) => ({ errors: [...s.errors, ...errors] }));
        const attempts = [...get().attempts, ...added];
        await commit(attempts, get().baseline ?? defaultBaseline(attempts));
      },
      addSplitSet: () => notImplemented('21'),
      updateSplitSet: () => notImplemented('21'),
      updateAttempt: (id, patch) =>
        set((s) => ({
          attempts: s.attempts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          analysis: s.analysis && {
            ...s.analysis,
            attempts: s.analysis.attempts.map((a) => (a.attemptId === id ? { ...a, ...patch } : a)),
          },
        })),
      removeAttempt: (id) => {
        const { attempts, baseline } = get();
        const remaining = attempts.filter((a) => a.id !== id);
        void commit(remaining, baseline?.attemptId === id ? defaultBaseline(remaining) : baseline);
      },
      setBaseline: (baseline) => void commit(get().attempts, baseline),
      setSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        void reanalyze();
      },
      dismissError: (index) => set((s) => ({ errors: s.errors.filter((_, i) => i !== index) })),

      setUnits: (units) => {
        writeStorage(UNITS_KEY, units);
        set({ units });
      },
      setTheme: (theme) => {
        writeStorage(THEME_KEY, theme);
        set({ theme });
      },
      setXAxis: (xAxis) => set({ xAxis }),
      setHover: (hoverDistance) => set({ hoverDistance }),
      setZoom: (zoomRange) => set({ zoomRange }),
      setHighlights: (highlightRanges) => set({ highlightRanges }),
      setFocusAttempt: (focusAttemptId) => set({ focusAttemptId }),

      loadScenario: (attempts, baseline, analysis) =>
        set({ attempts, baseline, analysis, status: 'ready', errors: [] }),
    };
  });
}

export const useStore = createAppStore();
