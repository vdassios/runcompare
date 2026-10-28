// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from '../store/useStore';
import { loadFixture } from '../test/fixtures';
import { UploadPanel } from './UploadPanel';

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
});

const render = () => act(() => root.render(<UploadPanel />));
const buttons = () => [...el.querySelectorAll('button')].map((b) => b.textContent);

it('shows the empty state with a large drop zone, what the app does, privacy and formats', () => {
  render();
  const text = el.textContent!;
  expect(el.querySelector('[data-testid="drop-zone"]')).not.toBeNull();
  expect(buttons()).toEqual(['Choose files']);
  expect(text).toContain('RunCompare lines them up');
  expect(text).toContain('Files never leave your browser');
  expect(text).toContain('FIT (.fit) and GPX (.gpx)');
  const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(input.multiple).toBe(true);
  expect(input.accept).toBe('.fit,.gpx');
});

it('collapses to an "Add files" button once attempts exist', () => {
  const { attempts, baseline, analysis } = loadFixture('gpx-two-attempts');
  useStore.getState().loadScenario(attempts, baseline, analysis);
  render();
  expect(buttons()).toEqual(['Add files']);
  expect(el.textContent).not.toContain('Files never leave your browser');
});

it('passes picked and dropped files to addFiles', () => {
  const addFiles = vi.fn(async () => {});
  useStore.setState({ addFiles });
  render();
  const files = [new File(['a'], 'a.fit'), new File(['b'], 'b.gpx')];

  const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  act(() => void input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(addFiles).toHaveBeenLastCalledWith(files);

  // jsdom has no DragEvent/DataTransfer; React only needs `dataTransfer.files` on the event.
  const drop = Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files } });
  act(() => void el.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(drop));
  expect(addFiles).toHaveBeenCalledTimes(2);
  expect(drop.defaultPrevented).toBe(true);
});

it('shows the parsing and analysing status', () => {
  useStore.setState({ status: 'parsing' });
  render();
  expect(el.querySelector('[role="status"]')!.textContent).toBe('Parsing files…');
  act(() => useStore.setState({ status: 'analyzing' }));
  expect(el.querySelector('[role="status"]')!.textContent).toBe('Analysing…');
});

it('dismisses each error on its own', () => {
  useStore.setState({ errors: ['"a.tcx" is not a FIT or GPX file.', '"b.kml" is not a FIT or GPX file.'] });
  render();
  const alerts = () => [...el.querySelectorAll('[role="alert"]')].map((a) => a.firstChild!.textContent);
  expect(alerts()).toHaveLength(2);
  act(() => el.querySelector<HTMLButtonElement>('[aria-label^="Dismiss: \\"a.tcx\\""]')!.click());
  expect(alerts()).toEqual(['"b.kml" is not a FIT or GPX file.']);
  expect(useStore.getState().errors).toEqual(['"b.kml" is not a FIT or GPX file.']);
});
