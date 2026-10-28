// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisResult, Attempt, Baseline } from '../model/types';
import { THEME_KEY, UNITS_KEY, createAppStore } from './useStore';

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

  it('unimplemented data actions name their task', async () => {
    const s = createAppStore().getState();
    await expect(s.addFiles([])).rejects.toThrow('Not implemented: task 09');
    expect(() => s.setBaseline({ kind: 'course', attemptId: 'x' })).toThrow('Not implemented: task 09');
    expect(() => s.setSettings({})).toThrow('Not implemented: task 09');
    expect(() => s.removeAttempt('x')).toThrow('Not implemented: task 09');
    expect(() => s.updateAttempt('x', {})).toThrow('Not implemented: task 09');
    expect(() => s.addSplitSet({ name: '', markers: [], officialDistance: null, interpolation: 'gap' })).toThrow(
      'Not implemented: task 21',
    );
  });
});
