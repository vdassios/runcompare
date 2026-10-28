// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SplitsAttempt } from '../model/types';
import { useStore, type AppState } from '../store/useStore';
import { loadFixture, type FixtureName } from '../test/fixtures';
import { AttemptList } from './AttemptList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useStore.getState();
let el: HTMLDivElement;
let root: Root;

beforeEach(() => {
  el = document.body.appendChild(document.createElement('div'));
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  useStore.setState(initialState, true);
  vi.useRealTimers();
});

/** Loads a fixture into the store, with `actions` replacing store actions, and renders the list. */
function render(fixture: FixtureName = 'fit-two-attempts', actions: Partial<AppState> = {}) {
  const { attempts, baseline, analysis } = loadFixture(fixture);
  useStore.getState().loadScenario(attempts, baseline, analysis);
  useStore.setState({ units: 'metric', ...actions });
  act(() => root.render(<AttemptList />));
}

const rows = () => [...el.querySelectorAll('li[data-attempt-id]')];
const row = (id: string) => el.querySelector<HTMLElement>(`li[data-attempt-id="${id}"]`)!;
const renameButton = (id: string) => row(id).querySelector<HTMLButtonElement>('button[aria-label^="Rename"]')!;
const byLabel = <T extends HTMLElement>(scope: ParentNode, label: string) =>
  scope.querySelector<T>(`[aria-label="${label}"]`)!;
const click = (target: HTMLElement) => act(() => target.click());
const key = (target: HTMLElement, k: string) =>
  act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));

describe('attempt rows', () => {
  it('renders nothing without attempts', () => {
    act(() => root.render(<AttemptList />));
    expect(el.innerHTML).toBe('');
  });

  it('shows FIT attempts with kind, watch distance and elapsed time', () => {
    render('fit-two-attempts');
    expect(rows().map((r) => r.getAttribute('data-attempt-id'))).toEqual(['trail-2024', 'trail-2025']);
    const r2024 = row('trail-2024').textContent!;
    const r2025 = row('trail-2025').textContent!;
    expect(r2024).toContain('FIT');
    expect(r2024).toContain('54.13 km');
    expect(r2024).toContain('7:08:54');
    expect(r2025).toContain('FIT');
    expect(r2025).toContain('53.94 km');
    expect(r2025).toContain('7:17:59');
    expect(row('trail-2024').querySelector<HTMLInputElement>('input[type=radio]')!.checked).toBe(true);
    expect(row('trail-2025').querySelector<HTMLInputElement>('input[type=radio]')!.checked).toBe(false);
  });

  it('shows GPX attempts with kind, watch distance and elapsed time', () => {
    render('gpx-two-attempts');
    expect(row('trail-2024').textContent).toMatch(/GPX.*2\.00 km.*18:16/);
    expect(row('trail-2025').textContent).toMatch(/GPX.*2\.00 km.*17:30/);
  });

  it('switches to imperial units', () => {
    render();
    act(() => useStore.setState({ units: 'imperial' }));
    expect(row('trail-2024').textContent).toContain('33.63 mi');
  });

  it('lists the warnings of each attempt in a disclosure', () => {
    render();
    act(() =>
      useStore.setState((s) => ({
        analysis: s.analysis && {
          ...s.analysis,
          warnings: [{ code: 'off-course', attemptId: 'trail-2025', message: 'Off course from 12 km to 13 km.' }],
        },
      })),
    );
    expect(row('trail-2024').querySelector('details')).toBeNull();
    const details = row('trail-2025').querySelector('details')!;
    expect(details.querySelector('summary')!.textContent).toBe('1 warning');
    expect(details.textContent).toContain('Off course from 12 km to 13 km.');
  });

  it('shows the overlap only when it is below 99 %', () => {
    render();
    expect(el.textContent).not.toContain('overlap');
    act(() =>
      useStore.setState((s) => ({
        analysis: s.analysis && {
          ...s.analysis,
          attempts: s.analysis.attempts.map((a) => (a.attemptId === 'trail-2025' ? { ...a, overlap: 0.84 } : a)),
        },
      })),
    );
    expect(row('trail-2025').textContent).toContain('84% overlap');
  });
});

describe('label editing', () => {
  it('saves on Enter and on blur', () => {
    const updateAttempt = vi.fn();
    render('fit-two-attempts', { updateAttempt });

    click(renameButton('trail-2025'));
    let input = byLabel<HTMLInputElement>(el, 'Attempt label');
    input.value = 'Second go';
    key(input, 'Enter');
    expect(updateAttempt).toHaveBeenCalledWith('trail-2025', { label: 'Second go' });
    expect(el.querySelector('[aria-label="Attempt label"]')).toBeNull();

    click(renameButton('trail-2024'));
    input = byLabel<HTMLInputElement>(el, 'Attempt label');
    input.value = 'First go';
    act(() => input.blur());
    expect(updateAttempt).toHaveBeenLastCalledWith('trail-2024', { label: 'First go' });
    expect(updateAttempt).toHaveBeenCalledTimes(2);
  });

  it('cancels on Escape', () => {
    const updateAttempt = vi.fn();
    render('fit-two-attempts', { updateAttempt });
    const before = renameButton('trail-2025').textContent;

    click(renameButton('trail-2025'));
    const input = byLabel<HTMLInputElement>(el, 'Attempt label');
    input.value = 'Discarded';
    key(input, 'Escape');
    expect(updateAttempt).not.toHaveBeenCalled();
    const button = renameButton('trail-2025');
    expect(button.textContent).toBe(before);
    expect(document.activeElement).toBe(button);
  });
});

describe('controls', () => {
  it('sets a course baseline from the radio', () => {
    const setBaseline = vi.fn();
    render('fit-two-attempts', { setBaseline });
    click(row('trail-2025').querySelector<HTMLInputElement>('input[type=radio]')!);
    expect(setBaseline).toHaveBeenCalledWith({ kind: 'course', attemptId: 'trail-2025' });
    expect(el.querySelector('legend')!.textContent).toBe('Attempts');
  });

  it('shows a distance baseline as a chip and offers no radio on split sets', () => {
    render();
    const pro: SplitsAttempt = {
      id: 'pro',
      kind: 'splits',
      label: 'Pro',
      color: '#0072b2',
      splitSet: {
        name: 'Pro',
        markers: [{ distance: 10000, time: 1650 }],
        officialDistance: null,
        interpolation: 'linear',
      },
    };
    act(() =>
      useStore.setState((s) => ({
        attempts: [...s.attempts, pro],
        baseline: { kind: 'distance', attemptId: 'pro', preset: '10k', distance: 10000 },
      })),
    );
    expect(el.textContent).toContain('Baseline: 10K · Pro');
    expect(row('pro').querySelector('input[type=radio]')).toBeNull();
    expect(row('pro').textContent).toContain('Splits');
    expect(el.querySelectorAll<HTMLInputElement>('input[type=radio]:checked')).toHaveLength(0);
  });

  it('picks a colour from the palette', () => {
    const updateAttempt = vi.fn();
    render('fit-two-attempts', { updateAttempt });
    const swatch = row('trail-2025').querySelector<HTMLButtonElement>('button[aria-label^="Colour of"]')!;
    click(swatch);
    expect(swatch.getAttribute('aria-expanded')).toBe('true');
    click(byLabel(row('trail-2025'), 'Colour 3'));
    expect(updateAttempt).toHaveBeenCalledWith('trail-2025', { color: '#0072b2' });
    expect(swatch.getAttribute('aria-expanded')).toBe('false');
  });

  it('removes only after the inline confirm, which reverts after 3 s', () => {
    vi.useFakeTimers();
    const removeAttempt = vi.fn();
    render('fit-two-attempts', { removeAttempt });
    const remove = () => row('trail-2025').querySelector<HTMLButtonElement>('button[aria-label*="emov"]')!;

    click(remove());
    expect(removeAttempt).not.toHaveBeenCalled();
    expect(remove().textContent).toBe('Remove?');
    act(() => vi.advanceTimersByTime(3000));
    expect(remove().textContent).toBe('Remove');

    click(remove());
    click(remove());
    expect(removeAttempt).toHaveBeenCalledWith('trail-2025');
  });

  it('reverts the remove confirm on blur', () => {
    render();
    const remove = () => row('trail-2025').querySelector<HTMLButtonElement>('button[aria-label*="emov"]')!;
    act(() => remove().focus());
    click(remove());
    expect(remove().textContent).toBe('Remove?');
    act(() => remove().blur());
    expect(remove().textContent).toBe('Remove');
  });
});
