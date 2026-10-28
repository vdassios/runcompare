// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useStore } from '../../store/useStore';
import { loadFixture } from '../../test/fixtures';
import { RouteMap } from '.';

let el: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  el.remove();
  useStore.getState().loadScenario([], null, null);
});

it('renders the map and legend for two FIT attempts', () => {
  const { attempts, baseline, analysis } = loadFixture('fit-two-attempts');
  useStore.getState().loadScenario(attempts, baseline, analysis);
  useStore.getState().setUnits('metric');
  act(() => root.render(<RouteMap />));

  expect(el.querySelector('.leaflet-container')).not.toBeNull();
  expect(el.querySelectorAll('.leaflet-rc-course-pane path').length).toBeGreaterThan(400);
  expect(el.querySelector('.leaflet-control-attribution')?.textContent).toContain('OpenStreetMap');
  expect(el.querySelector('[data-testid="route-legend"]')?.textContent).toContain('s per 100 m');
  // One attempt besides the baseline: nothing to choose between.
  expect(el.querySelector('select')).toBeNull();
});

it('labels the legend in imperial units', () => {
  const { attempts, baseline, analysis } = loadFixture('fit-two-attempts');
  useStore.getState().loadScenario(attempts, baseline, analysis);
  useStore.getState().setUnits('imperial');
  act(() => root.render(<RouteMap />));
  expect(el.querySelector('[data-testid="route-legend"]')?.textContent).toContain('s per 0.1 mi');
});

it('is absent when there is no analysis', () => {
  act(() => root.render(<RouteMap />));
  expect(el.innerHTML).toBe('');
});
