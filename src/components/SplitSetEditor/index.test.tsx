// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Baseline, SplitSet, UnitSystem } from '../../model/types';
import { SPLIT_LIBRARY_KEY } from '../../store/splitLibrary';
import { useStore } from '../../store/useStore';
import { PRO_10K_SPLIT_SET, loadFixture, type Fixture } from '../../test/fixtures';
import { SplitSetEditor } from '.';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useStore.getState();
let el: HTMLDivElement;
let root: Root;
const addSplitSet = vi.fn((_set: SplitSet, _label?: string) => 'added');
const updateSplitSet = vi.fn((_id: string, _set: SplitSet) => {});
const setBaseline = vi.fn((baseline: Baseline) => useStore.setState({ baseline }));

beforeEach(() => {
  localStorage.clear();
  el = document.body.appendChild(document.createElement('div'));
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  useStore.setState(initialState, true);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function render(fixture: Fixture, units: UnitSystem = 'metric'): void {
  act(() => {
    useStore.getState().loadScenario(fixture.attempts, fixture.baseline, fixture.analysis);
    useStore.setState({ units, addSplitSet, updateSplitSet, setBaseline });
    root.render(<SplitSetEditor />);
  });
}

const field = <T extends Element = HTMLInputElement>(name: string) => el.querySelector<T>(`[name="${name}"]`)!;
const fields = (name: string) => [...el.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)];
const text = () => el.textContent!;
const button = (label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent === label)!;
const click = (target: HTMLElement) => act(() => target.click());
const tab = (mode: string) => click(el.querySelector<HTMLButtonElement>(`[data-tab="${mode}"]`)!);
const parsedRows = () => [...el.querySelectorAll('[data-parsed-rows] li')].map((li) => li.textContent);

/** Sets a control's value the way typing or picking does, so React's onChange fires. */
function fill(target: Element, value: string): void {
  const control = target as HTMLInputElement;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')!.set!.call(control, value);
  const type = control instanceof HTMLSelectElement ? 'change' : 'input';
  act(() => control.dispatchEvent(new Event(type, { bubbles: true })));
}

describe('on a course baseline (fit-two-attempts)', () => {
  const fixture = loadFixture('fit-two-attempts');

  it('renders the editor and baseline parts in every tab', () => {
    render(fixture);
    expect(text()).toContain('Add a split set');
    expect(text()).toContain('Baseline');
    for (const mode of ['rows', 'paste', 'target']) {
      tab(mode);
      expect(el.querySelector('[role="tabpanel"]')!.getAttribute('data-panel')).toBe(mode);
    }
    expect(field('interpolation').disabled).toBe(false);
    expect(field('row-distance')).toBeNull();
  });

  it('lists paste errors with their line numbers', () => {
    render(fixture);
    tab('paste');
    fill(field('paste'), '10 30:00\n5 20:00\nten 1:00:00');
    const errors = [...el.querySelectorAll('[data-paste-errors] li')].map((li) => li.textContent);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^Line 2: .*distance must be greater/);
    expect(errors[1]).toMatch(/^Line 3: /);
    expect(button('Add to comparison').disabled).toBe(true);
  });

  it('explains that an official distance is scaled onto the course', () => {
    render(fixture);
    expect(text()).not.toContain('scaled onto your course length');
    fill(field('official'), '10k');
    expect(text()).toContain('Markers will be scaled onto your course length.');
  });

  it('offers only the course baseline until there is a split set', () => {
    render(fixture);
    const [course, distance] = fields('baseline-kind');
    expect(course!.checked).toBe(true);
    expect(distance!.disabled).toBe(true);
    expect(text()).toContain('Add a split set or a target time first.');
  });
});

describe('on a distance baseline (splits-only-10k)', () => {
  const fixture = loadFixture('splits-only-10k');

  it('renders every tab, disables GAP and lists the split sets with Edit buttons', () => {
    render(fixture);
    for (const mode of ['rows', 'paste', 'target']) {
      tab(mode);
      expect(el.querySelector('[role="tabpanel"]')!.getAttribute('data-panel')).toBe(mode);
    }
    const [gap, linear] = fields('interpolation');
    expect(gap!.disabled).toBe(true);
    expect(linear!.checked).toBe(true);
    expect(el.querySelector('[role="tooltip"]')!.textContent).toMatch(/GAP needs a course baseline with elevation/);
    expect(button('Edit Target 40:00')).toBeDefined();
    expect(button('Edit Pro 10K')).toBeDefined();
  });

  it('loads a split-set attempt into the rows and updates it', () => {
    render(fixture);
    click(button('Edit Pro 10K'));
    expect(fields('row-distance').map((i) => i.value)).toEqual(['5', '10']);
    expect(fields('row-time').map((i) => i.value)).toEqual(['14:10', '28:30']);
    expect(field('name').value).toBe('Pro 10K');
    click(button('Update'));
    expect(updateSplitSet).toHaveBeenCalledWith('pro', { ...PRO_10K_SPLIT_SET, interpolation: 'linear' });
  });

  it('calls setBaseline with the chosen distance and split set', () => {
    render(fixture);
    expect(fields('baseline-kind')[1]!.checked).toBe(true);
    expect(field('baseline-distance').value).toBe('10k');
    expect(button('In use').disabled).toBe(true);

    fill(field('baseline-attempt'), 'pro');
    fill(field('baseline-distance'), 'custom');
    fill(field('baseline-distance-custom'), '10.5');
    click(button('Use as baseline'));
    expect(setBaseline).toHaveBeenCalledWith({
      kind: 'distance',
      attemptId: 'pro',
      preset: 'custom',
      distance: 10_500,
    });
  });
});

it('switches between course and distance baselines (fit-vs-pro)', () => {
  render(loadFixture('fit-vs-pro'));
  const [course, distance] = fields('baseline-kind');
  click(distance!);
  expect(field('baseline-distance').value).toBe('custom');
  expect(field('baseline-distance-custom').value).toBe('54');
  click(button('Use as baseline'));
  expect(setBaseline).toHaveBeenLastCalledWith({
    kind: 'distance',
    attemptId: 'pro',
    preset: 'custom',
    distance: 54_000,
  });
  click(course!);
  expect(setBaseline).toHaveBeenLastCalledWith({ kind: 'course', attemptId: 'trail-2024' });
});

describe('input modes', () => {
  const fixture = loadFixture('splits-only-10k');

  it('pasting "10 30:00, 15 1:02:00" gives two rows', () => {
    render(fixture);
    tab('paste');
    expect(text()).toContain('Numbers without a unit are read as km');
    fill(field('paste'), '10 30:00, 15 1:02:00');
    expect(parsedRows()).toEqual(['1. 10.00 km · 30:00', '2. 15.00 km · 1:02:00']);
  });

  it('reads an imperial paste in miles and stores metres', () => {
    render(fixture, 'imperial');
    tab('paste');
    expect(text()).toContain('Numbers without a unit are read as mi');
    fill(field('name'), 'Mile pro');
    fill(field('paste'), '6 36:00');
    click(button('Add to comparison'));
    const stored = addSplitSet.mock.calls[0]![0];
    expect(stored.markers).toHaveLength(1);
    expect(stored.markers[0]!.distance).toBeCloseTo(9656.064, 6);
    expect(stored.markers[0]!.time).toBe(2160);
  });

  it('shows the average pace of a target time', () => {
    render(fixture);
    tab('target');
    expect(field('target-distance').value).toBe('10k');
    fill(field('target-time'), '40:00');
    expect(el.querySelector('[data-field="average-pace"]')!.textContent).toBe('4:00 /km');
    click(button('Add to comparison'));
    expect(addSplitSet).toHaveBeenCalledWith({
      name: 'Target 40:00',
      markers: [{ distance: 10_000, time: 2400 }],
      officialDistance: 10_000,
      interpolation: 'linear',
    });
  });

  it('validates rows live, reorders them, and keeps metres across a units switch', () => {
    render(fixture);
    fill(field('name'), 'Negative split');
    fill(fields('row-distance')[0]!, '10');
    fill(fields('row-time')[0]!, '40:00');
    click(button('Add split'));
    fill(fields('row-distance')[1]!, '5');
    fill(fields('row-time')[1]!, '21:00');
    expect(text()).toContain('Split 2 must be further than split 1.');
    expect(button('Add to comparison').disabled).toBe(true);

    click(button('Move Split 2 up'));
    expect(fields('row-distance').map((i) => i.value)).toEqual(['5', '10']);
    expect(button('Add to comparison').disabled).toBe(false);

    act(() => useStore.setState({ units: 'imperial' }));
    expect(fields('row-distance').map((i) => i.value)).toEqual(['3.1069', '6.2137']);
    click(button('Add to comparison'));
    expect(addSplitSet.mock.calls[0]![0].markers).toEqual([
      { distance: 5000, time: 1260 },
      { distance: 10_000, time: 2400 },
    ]);
  });
});

describe('library', () => {
  const fixture = loadFixture('splits-only-10k');
  const saveTenK = () => {
    fill(field('name'), 'Ten');
    fill(fields('row-distance')[0]!, '10');
    fill(fields('row-time')[0]!, '35:00');
    click(button('Save to library'));
  };

  it('survives a remount, loads into the editor and deletes', () => {
    render(fixture);
    saveTenK();
    act(() => root.unmount());
    root = createRoot(el);
    render(fixture);

    expect(el.querySelector('[data-list="library"]')!.textContent).toContain('Ten · 10.00 km · 35:00');
    click(button('Load Ten'));
    expect(field('name').value).toBe('Ten');
    expect(fields('row-time').map((i) => i.value)).toEqual(['35:00']);
    click(button('Delete Ten'));
    expect(el.querySelector('[data-list="library"]')!.textContent).toContain('Saved split sets appear here.');
    expect(JSON.parse(localStorage.getItem(SPLIT_LIBRARY_KEY)!)).toEqual({ version: 1, sets: [] });
  });

  it('still works when localStorage throws', () => {
    const denied = () => {
      throw new Error('denied');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    render(fixture);
    saveTenK();
    expect(el.querySelector('[role="alert"]')!.textContent).toMatch(/Couldn't save/);
    expect(el.querySelector('[data-list="library"]')!.textContent).toContain('Saved split sets appear here.');
    click(button('Add to comparison'));
    expect(addSplitSet).toHaveBeenCalledOnce();
  });
});
