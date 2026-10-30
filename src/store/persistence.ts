/**
 * Keeps the session across reloads: attempts, the baseline and settings go to IndexedDB under one
 * key, and come back on startup to be analysed again (the analysis itself is never saved).
 * Without IndexedDB (private mode, blocked site data) the app simply runs without persistence.
 */
import { del, get, set } from 'idb-keyval';
import type { StoreApi } from 'zustand';
import { DEFAULT_SETTINGS, type AnalysisSettings, type Attempt, type Baseline } from '../model/types';
import type { AppState } from './useStore';

export const SESSION_KEY = 'rc.session.v1';
export const SAVE_DELAY_MS = 500;
export const RESTORE_FAILED = "Couldn't restore your last session";

export interface SavedSession {
  version: 1;
  attempts: Attempt[];
  baseline: Baseline | null;
  settings: AnalysisSettings;
}

type Store = StoreApi<AppState>;

/**
 * Loads the saved session into `store` and starts its analysis. Resolves to whether IndexedDB is
 * usable, so the caller only starts saving when it is.
 */
export async function restoreSession(store: Store): Promise<boolean> {
  let saved: unknown;
  try {
    saved = await get(SESSION_KEY);
  } catch {
    return false;
  }
  if (saved === undefined) return true;
  if (!isSavedSession(saved)) {
    await del(SESSION_KEY).catch(() => undefined);
    store.setState((s) => ({ errors: [...s.errors, RESTORE_FAILED] }));
    return true;
  }
  // Files dropped while IndexedDB was still answering win over the old session.
  if (store.getState().attempts.length > 0) return true;

  store.setState({ attempts: saved.attempts, settings: saved.settings, status: 'analyzing' });
  // setBaseline re-runs the analysis and picks the focus attempt, as any baseline change does.
  if (saved.baseline) store.getState().setBaseline(saved.baseline);
  else store.setState({ status: 'ready' });
  return true;
}

/** Saves `store`'s data state 500 ms after it last changed. Returns the unsubscribe function. */
export function persistSession(store: Store): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = store.subscribe((state, prev) => {
    if (state.attempts === prev.attempts && state.baseline === prev.baseline && state.settings === prev.settings) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void save(store.getState()), SAVE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

async function save({ attempts, baseline, settings, status }: AppState): Promise<void> {
  // addFiles always ends by committing a new attempts array, which schedules the save that counts.
  if (status === 'parsing') return;
  try {
    if (attempts.length === 0) await del(SESSION_KEY);
    else await set(SESSION_KEY, { version: 1, attempts, baseline, settings } satisfies SavedSession);
  } catch {
    // Not persisted; the session still works in memory.
  }
}

/** Forgets the saved session and empties the data state, as on a first visit. */
export async function clearSession(store: Store): Promise<void> {
  store.setState({
    attempts: [],
    baseline: null,
    analysis: null,
    errors: [],
    focusAttemptId: null,
    hoverDistance: null,
    zoomRange: null,
    highlightRanges: [],
  });
  // Also re-runs the analysis, which with no baseline sets status 'idle' and drops any still in flight.
  store.getState().setSettings(DEFAULT_SETTINGS);
  await del(SESSION_KEY).catch(() => undefined);
}

function isSavedSession(value: unknown): value is SavedSession {
  if (!isRecord(value) || value.version !== 1) return false;
  const { attempts, baseline, settings } = value;
  if (!Array.isArray(attempts) || !attempts.every(isAttempt)) return false;
  if (baseline !== null && !(isRecord(baseline) && attempts.some((a) => a.id === baseline.attemptId))) return false;
  return isRecord(settings) && Object.keys(DEFAULT_SETTINGS).every((key) => typeof settings[key] === 'number');
}

function isAttempt(value: unknown): value is Attempt {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string') return false;
  if (typeof value.color !== 'string') return false;
  if (value.kind === 'gps') {
    const { activity } = value;
    return isRecord(activity) && activity.t instanceof Float64Array && activity.dist instanceof Float64Array;
  }
  return value.kind === 'splits' && isRecord(value.splitSet) && Array.isArray(value.splitSet.markers);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
