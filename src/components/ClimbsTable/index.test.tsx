// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnalysisResult, UnitSystem } from '../../model/types';
import { useStore } from '../../store/useStore';
import { loadFixture, type FixtureName } from '../../test/fixtures';
import { ClimbsTable } from '.';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = loadFixture('fit-two-attempts');
let el: HTMLDivElement;
let root: Root;

function render(analysis: AnalysisResult = fixture.analysis, units: UnitSystem = 'metric', name?: FixtureName): void {
  const { attempts, baseline } = name ? loadFixture(name) : fixture;
  act(() => {
    useStore.getState().loadScenario(attempts, baseline, analysis);
    useStore.setState({ units, highlightRanges: [], zoomRange: null, focusAttemptId: 'trail-2025' });
    root.render(<ClimbsTable />);
  });
}

const rows = () => [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')];
const keys = () => rows().map((r) => r.dataset.row);
const label = (row: HTMLTableRowElement) => row.querySelector('th')!.textContent;
const click = (selector: string) => act(() => el.querySelector<HTMLElement>(selector)!.click());
const cells = (selector: string) => rows().map((r) => r.querySelector(selector)!.textContent!);
const sortedBy = () => el.querySelector('[aria-sort]')!;

beforeEach(() => {
  el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  el.remove();
});

describe('fit-two-attempts', () => {
  it('lists every climb and descent, the focused attempt’s biggest loss first', () => {
    render();
    expect(rows()).toHaveLength(14);
    expect(label(rows()[0]!)).toBe('Climb 5 · 22.2–25.5 km · +480 m · 15%');
    expect(keys().slice(0, 4)).toEqual(['climb-5', 'climb-6', 'climb-2', 'climb-7']);
    expect(sortedBy().querySelector('[data-sort]')!.getAttribute('data-sort')).toBe('trail-2025:delta');
    expect(sortedBy().getAttribute('aria-sort')).toBe('descending');
    expect(el.querySelector('thead')!.textContent).toContain('2 Nov 2024(baseline)');

    const descent = rows().find((r) => r.dataset.row === 'descent-1')!;
    expect(label(descent)).toBe('Descent 1 · 9.2–15.1 km · −655 m · −11%');
    // Baseline: time and descent rate; attempt: time, delta and descent rate.
    expect([...descent.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      '30:13',
      '1,300 m/h',
      '29:29',
      '−0:44',
      '1,333 m/h',
    ]);
  });

  it('heat-colours delta cells: orange behind, blue ahead', () => {
    render();
    const styles = rows().map((r) => r.querySelector<HTMLElement>('[data-delta]')!.style.backgroundColor);
    expect(styles[0]).toContain('--rc-behind');
    expect(styles[styles.length - 1]).toContain('--rc-ahead');
  });

  it('shows climbs only, then sorts them by VAM', () => {
    render();
    click('input[value="climb"]');
    expect(keys()).toHaveLength(9);
    expect(keys().every((k) => k!.startsWith('climb-'))).toBe(true);
    expect(el.querySelector('[data-sort="trail-2025:rate"]')!.textContent).toBe('VAM');

    click('[data-sort="trail-2025:rate"]');
    expect(keys().slice(0, 3)).toEqual(['climb-1', 'climb-8', 'climb-4']);
    expect(cells('td:nth-of-type(5)').slice(0, 3)).toEqual(['844 m/h', '812 m/h', '808 m/h']);
    click('[data-sort="trail-2025:rate"]');
    expect(keys()[0]).toBe('climb-3');
    expect(sortedBy().getAttribute('aria-sort')).toBe('ascending');
  });

  it('shows descents only', () => {
    render();
    click('input[value="descent"]');
    expect(keys()).toEqual(['descent-5', 'descent-2', 'descent-3', 'descent-1', 'descent-4']);
    expect(el.querySelector('[data-sort="trail-2025:rate"]')!.textContent).toBe('Descent rate');
  });

  it('sorts by course order, by time and back', () => {
    render();
    click('[data-sort="segment"]');
    expect(keys().slice(0, 4)).toEqual(['climb-1', 'climb-2', 'descent-1', 'descent-2']);
    click('[data-sort="segment"]');
    expect(keys()[0]).toBe('descent-5');
    click('[data-sort="trail-2024:time"]');
    expect(keys()[0]).toBe('descent-4'); // 49:00, the longest
  });

  it('formats distances, heights and VAM in imperial units', () => {
    render(fixture.analysis, 'imperial');
    expect(label(rows()[0]!)).toBe('Climb 5 · 13.8–15.8 mi · +1,573 ft · 15%');
    expect(cells('[data-rate]')[0]).toBe('2,313 ft/h');
    expect(cells('[data-rate]').every((v) => v.endsWith(' ft/h'))).toBe(true);
  });

  it('highlights the hovered row and zooms to a clicked one', () => {
    render();
    const row = rows()[0]!;
    act(() => row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(useStore.getState().highlightRanges).toEqual([{ from: 22150, to: 25450 }]);
    act(() => row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    expect(useStore.getState().highlightRanges).toEqual([]);
    act(() => row.click());
    expect(useStore.getState().zoomRange).toEqual({ from: 22150, to: 25450 });
  });

  it('greys the stretches an attempt left the course on and sorts them last', () => {
    const { grid, attempts } = fixture.analysis;
    const offCourse = new Uint8Array(grid.d.length);
    offCourse.fill(1, 2300, 2400); // 23.0–24.0 km, inside climb 5
    const copy: AnalysisResult = {
      ...fixture.analysis,
      attempts: attempts.map((a) => (a.delta ? { ...a, series: { ...a.series, offCourse } } : a)),
    };
    render(copy);
    const flagged = rows().filter((r) => r.dataset.offCourse);
    expect(flagged.map((r) => r.dataset.row)).toEqual(['climb-5']);
    expect(rows()[rows().length - 1]).toBe(flagged[0]);
    expect(flagged[0]!.className).toContain('text-off-course');
    expect(flagged[0]!.querySelector('[role="img"]')!.getAttribute('title')).toMatch(/^Not comparable/);
    expect(flagged[0]!.querySelector<HTMLElement>('[data-delta]')!.style.backgroundColor).toBe('');
  });

  it('is absent without segments', () => {
    render({ ...fixture.analysis, segments: [] });
    expect(el.innerHTML).toBe('');
  });
});

it('marks split-set times as estimated and gives them no vertical rate', () => {
  const { analysis } = loadFixture('fit-vs-pro');
  render(analysis, 'metric', 'fit-vs-pro');
  expect(el.querySelector('thead')!.textContent).toContain('Pro(estimated)');
  expect(el.querySelector('[data-sort="pro:delta"]')).not.toBeNull();
  expect(el.querySelector('[data-sort="pro:rate"]')).toBeNull();
  for (const row of rows()) {
    const tds = row.querySelectorAll('td');
    expect(tds).toHaveLength(7); // baseline 2, 2025 attempt 3, split set 2
    expect(tds[5]!.querySelector('[data-estimated]')!.textContent).toBe('est.');
    expect(tds[0]!.querySelector('[data-estimated]')).toBeNull();
  }
});

it('renders nothing without an analysis', () => {
  act(() => {
    useStore.getState().loadScenario([], null, null);
    root.render(<ClimbsTable />);
  });
  expect(el.innerHTML).toBe('');
});
