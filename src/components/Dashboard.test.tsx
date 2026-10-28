// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Dashboard } from './Dashboard';

it('renders one data-section per dashboard section in PLAN order', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => root.render(<Dashboard />));
  const names = [...el.querySelectorAll('[data-section]')].map((s) => s.getAttribute('data-section'));
  expect(names).toEqual([
    'header',
    'upload-panel',
    'attempt-list',
    'split-set-editor',
    'summary-cards',
    'route-map',
    'linked-charts',
    'splits-table',
    'climbs-table',
    'insights-panel',
  ]);
  act(() => root.unmount());
});
