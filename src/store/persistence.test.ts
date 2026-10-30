import 'fake-indexeddb/auto';
import { del, get, set } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze } from '../analysis/pipeline';
import { summaryCards } from '../components/SummaryCards/cards';
import { DEFAULT_SETTINGS } from '../model/types';
import { loadFixture } from '../test/fixtures';
import { analyzeInWorker, parseInWorker } from '../worker/client';
import {
  RESTORE_FAILED,
  SAVE_DELAY_MS,
  SESSION_KEY,
  clearSession,
  persistSession,
  restoreSession,
  type SavedSession,
} from './persistence';
import { createAppStore } from './useStore';

// The worker runs in-process: parsing hands back the FIT fixtures by file name.
vi.mock('../worker/client', () => ({ parseInWorker: vi.fn(), analyzeInWorker: vi.fn() }));
const fit = loadFixture('fit-two-attempts');
const gpx = loadFixture('gpx-two-attempts');

let stopSaving = () => {};
beforeEach(async () => {
  vi.mocked(parseInWorker).mockImplementation(async (file) => {
    const attempt = fit.attempts.find((a) => a.activity.fileName === file.name);
    if (!attempt) throw new Error(`No fixture for ${file.name}`);
    return attempt.activity;
  });
  vi.mocked(analyzeInWorker).mockImplementation(async (input) => analyze(input));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  await del(SESSION_KEY);
});
afterEach(() => {
  stopSaving();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A store that saves itself, as the app's singleton does. */
function persistedStore() {
  const store = createAppStore();
  stopSaving = persistSession(store);
  return store;
}

const saved = () => get<SavedSession>(SESSION_KEY);

async function restoredStore() {
  const store = createAppStore();
  await restoreSession(store);
  await vi.waitFor(() => expect(store.getState().status).not.toBe('analyzing'));
  return store;
}

describe('saving and restoring', () => {
  it('round-trips the attempts with identical typed arrays, then re-runs the analysis', async () => {
    persistedStore().getState().loadScenario(gpx.attempts, gpx.baseline, gpx.analysis);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await vi.waitFor(async () => expect(await saved()).toBeDefined());

    const store = createAppStore();
    const statuses: string[] = [];
    store.subscribe((s, prev) => s.status !== prev.status && statuses.push(s.status));
    await restoreSession(store);
    await vi.waitFor(() => expect(statuses).toEqual(['analyzing', 'ready']));

    const { attempts, baseline, settings, analysis } = store.getState();
    expect(attempts).toEqual(gpx.attempts);
    expect(baseline).toEqual(gpx.baseline);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    const restored = attempts[1]!.kind === 'gps' ? attempts[1]!.activity : null;
    expect(restored?.t).toBeInstanceOf(Float64Array);
    expect(restored?.hr).toBeInstanceOf(Float32Array);
    expect(restored?.t).toEqual(gpx.attempts[1]!.activity.t);
    expect(analysis?.attempts.map((a) => a.attemptId)).toEqual(['trail-2024', 'trail-2025']);
  });

  it('saves once, 500 ms after the last change', async () => {
    const store = persistedStore();
    store.getState().loadScenario(gpx.attempts, gpx.baseline, gpx.analysis);
    await vi.advanceTimersByTimeAsync(300);
    store.getState().updateAttempt('trail-2025', { label: 'Second go' });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(await saved()).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(async () => expect((await saved())?.attempts[1]?.label).toBe('Second go'));
  });

  it('discards a session from another version with a one-time message', async () => {
    await set(SESSION_KEY, { version: 2, attempts: [], baseline: null, settings: DEFAULT_SETTINGS });
    const store = await restoredStore();
    expect(store.getState()).toMatchObject({ attempts: [], status: 'idle', errors: [RESTORE_FAILED] });
    expect(await saved()).toBeUndefined();

    await set(SESSION_KEY, 'not a session');
    expect((await restoredStore()).getState().errors).toEqual([RESTORE_FAILED]);
  });

  it('falls back silently to no persistence when IndexedDB fails', async () => {
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => {
      throw new DOMException('Blocked', 'InvalidStateError');
    });
    const store = createAppStore();
    expect(await restoreSession(store)).toBe(false);
    expect(store.getState()).toMatchObject({ attempts: [], status: 'idle', errors: [] });

    persistedStore().getState().loadScenario(gpx.attempts, gpx.baseline, gpx.analysis);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    vi.mocked(IDBDatabase.prototype.transaction).mockRestore();
    expect(await saved()).toBeUndefined();
  });
});

it('keeps both FIT attempts and the +9:05 Time card across a reload, until the session is cleared', async () => {
  const store = persistedStore();
  await store.getState().addFiles(fit.attempts.map((a) => new File([], a.activity.fileName)));
  await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
  await vi.waitFor(async () => expect((await saved())?.attempts).toHaveLength(2));

  const reloaded = await restoredStore();
  const { attempts, analysis } = reloaded.getState();
  expect(attempts).toEqual(store.getState().attempts);
  const time = summaryCards(analysis!, 'metric').find((c) => c.id === 'time')!;
  expect(time.rows.find((r) => r.attemptId === attempts[1]!.id)?.delta).toEqual({ text: '+9:05', tone: 'behind' });

  await clearSession(reloaded);
  expect(reloaded.getState()).toMatchObject({ attempts: [], baseline: null, analysis: null, status: 'idle' });
  expect((await restoredStore()).getState()).toMatchObject({ attempts: [], status: 'idle', errors: [] });
});
