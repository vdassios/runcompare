// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze } from '../analysis/pipeline';
import type { AnalysisInput, AnalysisResult, Attempt, Baseline } from '../model/types';
import { UnsupportedFileError } from '../parsers';
import { loadFixture } from '../test/fixtures';
import { analyzeInWorker, parseInWorker } from '../worker/client';
import { THEME_KEY, UNITS_KEY, createAppStore } from './useStore';

// The worker runs in-process: parsing hands back the GPX fixtures by file name.
vi.mock('../worker/client', () => ({ parseInWorker: vi.fn(), analyzeInWorker: vi.fn() }));
const gpx = loadFixture('gpx-two-attempts');
const byFileName = new Map(gpx.attempts.map((a) => [a.activity.fileName, a.activity]));
beforeEach(() => {
  vi.mocked(parseInWorker).mockImplementation(async (file) => {
    const activity = byFileName.get(file.name);
    if (!activity) throw new UnsupportedFileError(file.name);
    return activity;
  });
  vi.mocked(analyzeInWorker).mockImplementation(async (input) => analyze(input));
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('initial state', () => {
  it('defaults units from navigator.language and theme to system', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
    const store = createAppStore();
    expect(store.getState().units).toBe('imperial');
    expect(store.getState().theme).toBe('system');
    expect(store.getState().status).toBe('idle');
  });

  it('reads stored units and theme, ignoring invalid values', () => {
    localStorage.setItem(UNITS_KEY, 'imperial');
    localStorage.setItem(THEME_KEY, 'dark');
    expect(createAppStore().getState()).toMatchObject({ units: 'imperial', theme: 'dark' });

    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    localStorage.setItem(UNITS_KEY, 'furlongs');
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(createAppStore().getState()).toMatchObject({ units: 'metric', theme: 'system' });
  });

  it('works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    expect(createAppStore().getState()).toMatchObject({ units: 'metric', theme: 'system' });
  });
});

describe('view actions', () => {
  it('update state', () => {
    const store = createAppStore();
    const s = () => store.getState();
    s().setXAxis('time');
    s().setHover(1234);
    s().setZoom({ from: 100, to: 900 });
    s().setHighlights([{ from: 10, to: 20 }]);
    s().setFocusAttempt('a2');
    expect(s()).toMatchObject({
      xAxis: 'time',
      hoverDistance: 1234,
      zoomRange: { from: 100, to: 900 },
      highlightRanges: [{ from: 10, to: 20 }],
      focusAttemptId: 'a2',
    });
    s().setHover(null);
    s().setZoom(null);
    s().setFocusAttempt(null);
    expect(s()).toMatchObject({ hoverDistance: null, zoomRange: null, focusAttemptId: null });
  });

  it('persist units and theme', () => {
    const store = createAppStore();
    store.getState().setUnits('imperial');
    store.getState().setTheme('dark');
    expect(localStorage.getItem(UNITS_KEY)).toBe('imperial');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(createAppStore().getState()).toMatchObject({ units: 'imperial', theme: 'dark' });
  });

  it('still change state when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const store = createAppStore();
    store.getState().setUnits('imperial');
    store.getState().setTheme('light');
    expect(store.getState()).toMatchObject({ units: 'imperial', theme: 'light' });
  });
});

describe('data state', () => {
  it('loadScenario replaces the data and sets status ready', () => {
    const store = createAppStore();
    store.setState({ errors: ['old'] });
    const attempts: Attempt[] = [
      {
        id: 's1',
        kind: 'splits',
        label: 'Target',
        color: '#009e73',
        splitSet: {
          name: 'Target',
          markers: [{ distance: 5000, time: 1500 }],
          officialDistance: null,
          interpolation: 'linear',
        },
      },
    ];
    const baseline: Baseline = { kind: 'distance', attemptId: 's1', preset: '5k', distance: 5000 };
    const analysis = { baseline, attempts: [], segments: [], insights: [], warnings: [] } as unknown as AnalysisResult;
    store.getState().loadScenario(attempts, baseline, analysis);
    expect(store.getState()).toMatchObject({ attempts, baseline, analysis, status: 'ready', errors: [] });
  });

  it('dismissError removes one message', () => {
    const store = createAppStore();
    store.setState({ errors: ['a', 'b', 'c'] });
    store.getState().dismissError(1);
    expect(store.getState().errors).toEqual(['a', 'c']);
  });

  it('unimplemented data actions name their task', () => {
    const s = createAppStore().getState();
    expect(() => s.addSplitSet({ name: '', markers: [], officialDistance: null, interpolation: 'gap' })).toThrow(
      'Not implemented: task 21',
    );
  });
});

describe('data actions', () => {
  const files = (...names: string[]) => names.map((n) => new File([], n));

  async function withBothAttempts() {
    const store = createAppStore();
    await store.getState().addFiles(files('trail-2025-head.gpx', 'notes.txt', 'trail-2024-head.gpx'));
    return store;
  }

  it('addFiles parses, picks the earliest as baseline and focuses the other', async () => {
    const store = createAppStore();
    const statuses: string[] = [];
    store.subscribe((s, prev) => s.status !== prev.status && statuses.push(s.status));
    await store.getState().addFiles(files('trail-2025-head.gpx', 'notes.txt', 'trail-2024-head.gpx'));

    const s = store.getState();
    expect(statuses).toEqual(['parsing', 'analyzing', 'ready']);
    expect(s.attempts.map((a) => a.label)).toEqual([gpx.attempts[1]!.label, gpx.attempts[0]!.label]);
    expect(s.attempts[0]!.label).toMatch(/^\d{1,2} \w+ 2025$/);
    expect(new Set(s.attempts.map((a) => a.color)).size).toBe(2);
    const [a2025, a2024] = s.attempts;
    expect(s.baseline).toEqual({ kind: 'course', attemptId: a2024!.id });
    expect(s.focusAttemptId).toBe(a2025!.id);
    expect(s.errors).toEqual([new UnsupportedFileError('notes.txt').message]);
    expect(s.analysis!.attempts.map((a) => a.attemptId)).toEqual([a2025!.id, a2024!.id]);
  });

  it('applies only the latest analysis when an older one finishes last', async () => {
    const store = await withBothAttempts();
    const resolvers: ((r: AnalysisResult) => void)[] = [];
    vi.mocked(analyzeInWorker)
      .mockClear()
      .mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    store.getState().setSettings({ gridStep: 20 });
    store.getState().setSettings({ gridStep: 50 });
    const [first, second] = vi.mocked(analyzeInWorker).mock.calls.map(([input]) => analyze(input as AnalysisInput));
    resolvers[1]!(second!);
    await vi.waitFor(() => expect(store.getState().status).toBe('ready'));
    resolvers[0]!(first!);
    await new Promise((r) => setTimeout(r));
    expect(store.getState().analysis!.grid.step).toBe(50);
  });

  it('removing the baseline promotes the earliest remaining attempt, then clears', async () => {
    const store = await withBothAttempts();
    const [a2025, a2024] = store.getState().attempts;
    store.getState().removeAttempt(a2024!.id);
    await vi.waitFor(() => expect(store.getState().status).toBe('ready'));
    expect(store.getState()).toMatchObject({
      baseline: { kind: 'course', attemptId: a2025!.id },
      focusAttemptId: null,
    });
    expect(store.getState().analysis!.attempts.map((a) => a.attemptId)).toEqual([a2025!.id]);

    store.getState().removeAttempt(a2025!.id);
    expect(store.getState()).toMatchObject({ attempts: [], baseline: null, analysis: null, status: 'idle' });
  });

  it('setBaseline re-analyses and moves the focus off the new baseline', async () => {
    const store = await withBothAttempts();
    const [a2025, a2024] = store.getState().attempts;
    store.getState().setBaseline({ kind: 'course', attemptId: a2025!.id });
    await vi.waitFor(() => expect(store.getState().analysis!.baseline.attemptId).toBe(a2025!.id));
    expect(store.getState().focusAttemptId).toBe(a2024!.id);
  });

  it('updateAttempt patches label and colour without re-analysing', async () => {
    const store = await withBothAttempts();
    const id = store.getState().attempts[0]!.id;
    vi.mocked(analyzeInWorker).mockClear();
    store.getState().updateAttempt(id, { label: 'Second go', color: '#123456' });
    const s = store.getState();
    expect(s.attempts[0]).toMatchObject({ label: 'Second go', color: '#123456' });
    expect(s.analysis!.attempts[0]).toMatchObject({ label: 'Second go', color: '#123456' });
    expect(analyzeInWorker).not.toHaveBeenCalled();
  });
});
