import { create } from 'zustand';
import { defaultUnits } from '../format';
import {
  DEFAULT_SETTINGS,
  type AnalysisResult,
  type AnalysisSettings,
  type Attempt,
  type AttemptId,
  type Baseline,
  type SplitSet,
  type UnitSystem,
} from '../model/types';

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

/** Builds a fresh store. The app uses the `useStore` singleton; tests can make their own. */
export function createAppStore() {
  return create<AppState>()((set) => ({
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

    addFiles: async () => notImplemented('09'),
    addSplitSet: () => notImplemented('21'),
    updateSplitSet: () => notImplemented('21'),
    updateAttempt: () => notImplemented('09'),
    removeAttempt: () => notImplemented('09'),
    setBaseline: () => notImplemented('09'),
    setSettings: () => notImplemented('09'),
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

    loadScenario: (attempts, baseline, analysis) => set({ attempts, baseline, analysis, status: 'ready', errors: [] }),
  }));
}

export const useStore = createAppStore();
