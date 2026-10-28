// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AnalysisResult, UnitSystem } from '../../model/types';
import { useStore } from '../../store/useStore';
import { loadFixture } from '../../test/fixtures';
import { SplitsTable } from '.';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = loadFixture('fit-two-attempts');
let el: HTMLDivElement;
let root: Root;

function render(analysis: AnalysisResult, units: UnitSystem): void {
  act(() => {
    useStore.getState().loadScenario(fixture.attempts, fixture.baseline, analysis);
    useStore.setState({ units, highlightRanges: [], zoomRange: null });
    root.render(<SplitsTable />);
  });
}

const rows = () => [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')];
const modeButtons = () => [...el.querySelectorAll('[data-mode]')].map((b) => b.textContent);
const clickMode = (mode: string) => act(() => el.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!.click());
const totalDelta = () => el.querySelector('[data-row="total"] [data-delta]')!.textContent;

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
  it('shows per-km splits with the baseline time and pace and the attempt delta', () => {
    render(fixture.analysis, 'metric');
    expect(modeButtons()).toEqual(['Per km', 'Laps']);
    expect(rows()).toHaveLength(55);
    const twelfth = rows()[11]!;
    expect(twelfth.querySelector('th')!.textContent).toBe('12 · 11.0–12.0 km');
    expect(twelfth.querySelectorAll('td')[1]!.textContent).toMatch(/ \/km$/);
    expect(twelfth.querySelector('[data-delta]')!.textContent).toMatch(/^([+−]\d+:\d\d|±0:00)$/);
    expect(el.querySelector('thead')!.textContent).toContain('2 Nov 2024(baseline)');
    expect(totalDelta()).toBe('+6:23');
  });

  it('shows per-mile splits in imperial', () => {
    render(fixture.analysis, 'imperial');
    expect(modeButtons()).toEqual(['Per mile', 'Laps']);
    expect(rows()).toHaveLength(34);
    expect(rows()[0]!.querySelector('th')!.textContent).toBe('1 · 0.0–1.0 mi');
    expect(rows()[0]!.querySelectorAll('td')[1]!.textContent).toMatch(/ \/mi$/);
    expect(totalDelta()).toBe('+6:23');
  });

  it.each(['metric', 'imperial'] as const)('switches to one row per baseline lap (%s)', (units) => {
    render(fixture.analysis, units);
    clickMode('laps');
    expect(rows()).toHaveLength(42);
    expect(rows()[1]!.querySelector('th')!.textContent).toMatch(/^Lap 2 · /);
    expect(totalDelta()).toBe('+6:23');
  });

  it('heat-colours delta cells: orange behind, blue ahead', () => {
    render(fixture.analysis, 'metric');
    const styles = rows().map((r) => r.querySelector<HTMLElement>('[data-delta]')!.style.backgroundColor);
    expect(styles.some((s) => s.includes('--rc-behind'))).toBe(true);
    expect(styles.some((s) => s.includes('--rc-ahead'))).toBe(true);
  });

  it('highlights the hovered row and zooms to a clicked one', () => {
    render(fixture.analysis, 'metric');
    const row = rows()[2]!;
    act(() => row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(useStore.getState().highlightRanges).toEqual([{ from: 2000, to: 3000 }]);
    act(() => row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    expect(useStore.getState().highlightRanges).toEqual([]);
    act(() => row.click());
    expect(useStore.getState().zoomRange).toEqual({ from: 2000, to: 3000 });
  });

  it('greys the splits an attempt left the course in, with a not-comparable icon', () => {
    const { grid, attempts } = fixture.analysis;
    const offCourse = new Uint8Array(grid.d.length);
    offCourse.fill(1, 520, 680); // 5,200–6,790 m
    const copy: AnalysisResult = {
      ...fixture.analysis,
      attempts: attempts.map((a) => (a.delta ? { ...a, series: { ...a.series, offCourse } } : a)),
    };
    render(copy, 'metric');
    const flagged = rows().filter((r) => r.dataset.offCourse);
    expect(flagged.map((r) => r.dataset.row)).toEqual(['split-6', 'split-7']);
    for (const r of flagged) {
      expect(r.className).toContain('text-off-course');
      expect(r.querySelector('[role="img"]')!.getAttribute('title')).toMatch(/^Not comparable/);
      expect(r.querySelector<HTMLElement>('[data-delta]')!.style.backgroundColor).toBe('');
    }
    expect(totalDelta()).toBe('+6:23');
  });

  it('hides the climbs mode without segments and offers it with them', () => {
    render(fixture.analysis, 'metric');
    expect(el.querySelector('[data-mode="climbs"]')).toBeNull();
    const climb = { kind: 'climb' as const, from: 1200, to: 3400, elevationChange: 310, avgGrade: 0.14 };
    render({ ...fixture.analysis, segments: [climb] }, 'metric');
    clickMode('climbs');
    expect(rows().map((r) => r.querySelector('th')!.textContent)).toEqual(['Climb 1 · 1.20–3.40 km']);
    expect(el.querySelector('[data-row="total"] th')!.textContent).toBe('Course total');
  });
});

it('renders nothing without an analysis', () => {
  act(() => {
    useStore.getState().loadScenario([], null, null);
    root.render(<SplitsTable />);
  });
  expect(el.innerHTML).toBe('');
});
