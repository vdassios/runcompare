// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parseDuration } from '../../format';
import { useStore } from '../../store/useStore';
import { loadFixture, type FixtureName } from '../../test/fixtures';
import { ESTIMATED_TOOLTIP, SummaryCards } from '.';

let el: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  el = document.createElement('div');
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  useStore.getState().loadScenario([], null, null);
});

function render(name: FixtureName) {
  const { attempts, baseline, analysis } = loadFixture(name);
  act(() => {
    useStore.getState().setUnits('metric');
    useStore.getState().loadScenario(attempts, baseline, analysis);
  });
  act(() => root.render(<SummaryCards />));
}

function cell(card: string, attemptId: string, field: 'value' | 'delta'): HTMLElement {
  const found = el.querySelector<HTMLElement>(`[data-card="${card}"] [data-attempt="${attemptId}"] [data-${field}]`);
  if (!found) throw new Error(`no ${field} for ${attemptId} on ${card}`);
  return found;
}

it('renders nothing without an analysis', () => {
  act(() => root.render(<SummaryCards />));
  expect(el.innerHTML).toBe('');
});

it('renders the six cards for the FIT fixture, 2025 behind by about 9:05', () => {
  render('fit-two-attempts');
  const titles = [...el.querySelectorAll('[data-card] h3')].map((h) => h.textContent);
  expect(titles).toEqual(['Time', 'Moving time', 'Stopped', 'D+', 'Avg HR', 'Walking']);

  expect(cell('time', 'trail-2024', 'delta').textContent).toBe('baseline');
  const delta = cell('time', 'trail-2025', 'delta');
  expect(delta.textContent?.startsWith('+')).toBe(true);
  expect(Math.abs(parseDuration(delta.textContent!.slice(1))! - 545)).toBeLessThanOrEqual(3);
  expect(delta.className).toContain('text-behind');

  expect(cell('ascent', 'trail-2025', 'delta').className).toContain('text-muted');
  expect(el.querySelector('[data-badge="estimated"]')).toBeNull();
});

it('marks walking as estimated for the GPX fixture, with the explanation as a tooltip', () => {
  render('gpx-two-attempts');
  const badges = [...el.querySelectorAll<HTMLElement>('[data-badge="estimated"]')];
  expect(badges).toHaveLength(2);
  for (const badge of badges) {
    expect(badge.closest('[data-card]')?.getAttribute('data-card')).toBe('walking');
    expect(badge.title).toBe(ESTIMATED_TOOLTIP);
  }
  expect(cell('time', 'trail-2025', 'delta').className).toContain('text-ahead');
});

it('follows the store units', () => {
  render('fit-two-attempts');
  expect(cell('ascent', 'trail-2024', 'value').textContent).toBe('2,728 m');
  act(() => useStore.getState().setUnits('imperial'));
  expect(cell('ascent', 'trail-2024', 'value').textContent).toBe('8,951 ft');
});
