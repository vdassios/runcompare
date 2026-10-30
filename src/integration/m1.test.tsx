// @vitest-environment jsdom
/**
 * M1 end to end: the real fixtures go in through the upload input and come out through the real
 * pipeline, store and dashboard. Only the worker hop (run in-process) and the ECharts canvas
 * (jsdom has none) are stubbed; charts are checked through task 12's option builders.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { analyze } from '../analysis/pipeline';
import { Dashboard } from '../components/Dashboard';
import { visibleCharts } from '../components/LinkedCharts/options';
import { MINUS, parseDuration } from '../format';
import { parseFile } from '../parsers';
import { useStore } from '../store/useStore';

vi.mock('../worker/client', () => ({
  parseInWorker: async (file: File) => parseFile(await file.arrayBuffer(), file.name),
  analyzeInWorker: async (input: Parameters<typeof analyze>[0]) => analyze(input),
}));
vi.mock('../components/LinkedCharts/EChart', () => ({ EChart: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURES = join(import.meta.dirname, '..', '..', 'fixtures');
const initialState = useStore.getState();
let el: HTMLDivElement;
let root: Root;

beforeAll(() => {
  useStore.getState().setUnits('metric');
  el = document.body.appendChild(document.createElement('div'));
  root = createRoot(el);
  act(() => root.render(<Dashboard />));
});
afterAll(() => {
  act(() => root.unmount());
  el.remove();
});

function fixtureFile(name: string): File {
  return new File([readFileSync(join(FIXTURES, name))], name);
}

/** Picks files the way a user does, then waits for the analysis and the lazy sections. */
async function upload(...files: File[]) {
  const input = el.querySelector<HTMLInputElement>('[data-section="upload-panel"] input[type=file]')!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })));
  await settle();
}

/**
 * Waits until the analysis is ready and the lazy sections have mounted. React flushes an async
 * act only when its callback returns, so poll with short acts rather than wait inside one.
 */
async function settle() {
  const done = () => {
    const { status, analysis } = useStore.getState();
    return status === 'ready' && (!analysis || el.querySelector('[data-chart]') !== null);
  };
  for (const start = Date.now(); !done();) {
    if (Date.now() - start > 10_000) throw new Error(`not ready: ${useStore.getState().status}`);
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

const click = (target: Element | null) => act(async () => void (target as HTMLElement).click());
const attemptRows = () => [...el.querySelectorAll<HTMLElement>('li[data-attempt-id]')];
const attemptId = (label: string) => attemptRows().find((r) => r.textContent!.includes(label))!.dataset.attemptId!;
const shownCharts = () => [...el.querySelectorAll<HTMLElement>('[data-chart]')].map((c) => c.dataset.chart);
const splitRows = () => el.querySelectorAll('[data-section="splits-table"] tbody tr');
const timeDelta = (id: string) =>
  el.querySelector(`[data-card="time"] [data-attempt="${id}"] [data-delta]`)!.textContent!;

/** "+9:05" → 545, "−9:05" → −545. */
function signedSeconds(text: string): number {
  const negative = text.startsWith(MINUS);
  const s = parseDuration(text.replace(/^[+−]/, ''));
  if (s === null) throw new Error(`not a duration: ${text}`);
  return negative ? -s : s;
}

/** The charts on screen are exactly the ones task 12's builders say have data. */
function expectChartsMatchBuilders() {
  expect(shownCharts()).toEqual(visibleCharts(useStore.getState().analysis!));
}

it('compares the two FIT attempts with 2024 as the baseline', async () => {
  await upload(fixtureFile('trail-2024.fit'));
  await upload(fixtureFile('trail-2025.fit'));

  const state = useStore.getState();
  const y2024 = attemptId('2024');
  const y2025 = attemptId('2025');
  expect(state.baseline).toEqual({ kind: 'course', attemptId: y2024 });
  expect(attemptRows()).toHaveLength(2);

  expect(timeDelta(y2025)).toMatch(/^\+9:0\d$/);
  expect(Math.abs(signedSeconds(timeDelta(y2025)) - 545)).toBeLessThanOrEqual(3);
  expect(timeDelta(y2024)).toBe('baseline');

  expect(shownCharts()).toEqual(['elevation', 'pace', 'hr', 'cadence', 'delta']);
  expectChartsMatchBuilders();
  expect(el.querySelector('[data-section="route-map"] .leaflet-container')).not.toBeNull();
});

it('ends the splits table on the ghost delta at the finish, 163 s short of the Time card', () => {
  expect(splitRows()).toHaveLength(55);
  const total = el.querySelector('[data-section="splits-table"] tfoot [data-delta]')!.textContent!;
  expect(Math.abs(signedSeconds(total) - (6 * 60 + 23))).toBeLessThanOrEqual(3);
  // The 2025 attempt stood at the finish for 163 s; elapsed time counts it, the ghost doesn't.
  const card = signedSeconds(timeDelta(attemptId('2025')));
  expect(Math.abs(card - signedSeconds(total) - 163)).toBeLessThanOrEqual(3);
});

it('splits per mile in imperial units', async () => {
  await click(el.querySelector('[data-section="header"] input[value="imperial"]'));
  expect(useStore.getState().units).toBe('imperial');
  expect(splitRows()).toHaveLength(34);
  const firstRow = splitRows()[0]!.querySelector('th')!.textContent!;
  expect(firstRow).toMatch(/ mi$/);
  expect(el.querySelector('[data-section="attempt-list"]')!.textContent).toMatch(/\d mi/);
  expect(el.querySelector('[data-section="attempt-list"]')!.textContent).not.toMatch(/\d km/);
  await click(el.querySelector('[data-section="header"] input[value="metric"]'));
});

it('flips the Time card delta when 2025 becomes the baseline', async () => {
  const y2024 = attemptId('2024');
  await click(el.querySelector(`li[data-attempt-id="${attemptId('2025')}"] input[name="baseline"]`));
  await settle();
  expect(useStore.getState().baseline?.attemptId).toBe(attemptId('2025'));
  expect(timeDelta(y2024)).toMatch(new RegExp(`^${MINUS}9:0\\d$`));
  expect(Math.abs(signedSeconds(timeDelta(y2024)) + 545)).toBeLessThanOrEqual(3);
});

it('removes 2025 after the inline confirm, leaving one attempt and no delta chart', async () => {
  const row = el.querySelector(`li[data-attempt-id="${attemptId('2025')}"]`)!;
  const remove = row.querySelector<HTMLButtonElement>('button[aria-label^="Remove "]')!;
  await click(remove);
  expect(attemptRows()).toHaveLength(2);
  await click(row.querySelector('button[aria-label^="Confirm removing "]'));
  await settle();

  expect(attemptRows()).toHaveLength(1);
  expect(useStore.getState().baseline?.attemptId).toBe(attemptId('2024'));
  expect(shownCharts()).not.toContain('delta');
  expectChartsMatchBuilders();
});

it('marks walking as estimated and has no cadence chart for the GPX heads', async () => {
  act(() => useStore.setState({ ...initialState, units: 'metric' }, true));
  expect(attemptRows()).toHaveLength(0);
  await upload(fixtureFile('trail-2024-head.gpx'), fixtureFile('trail-2025-head.gpx'));

  expect(attemptRows()).toHaveLength(2);
  const walking = el.querySelector('[data-card="walking"]')!;
  expect(walking.querySelectorAll('[data-badge="estimated"]')).toHaveLength(2);
  expect(walking.textContent).toContain('estimated');
  expect(shownCharts()).not.toContain('cadence');
  expect(shownCharts()).toContain('delta');
  expectChartsMatchBuilders();
});

it('shows a dismissible alert for an unsupported file', async () => {
  await upload(new File(['just some notes'], 'notes.txt', { type: 'text/plain' }));
  const alerts = () => el.querySelectorAll('[data-section="upload-panel"] [role="alert"]');
  expect(alerts()).toHaveLength(1);
  expect(alerts()[0]!.textContent).toContain('notes.txt');
  expect(attemptRows()).toHaveLength(2);

  await click(alerts()[0]!.querySelector('button'));
  expect(alerts()).toHaveLength(0);
});
