// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { Header } from './Header';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useStore.getState();
afterEach(() => useStore.setState(initialState, true));

it('switches units and theme through the store and applies the theme to <html>', () => {
  useStore.setState({ units: 'metric', theme: 'light' });
  const el = document.body.appendChild(document.createElement('div'));
  const root = createRoot(el);
  act(() => root.render(<Header />));

  expect(el.querySelector('h1')!.textContent).toBe('RunCompare');
  expect([...el.querySelectorAll('legend')].map((l) => l.textContent)).toEqual(['Units', 'Theme']);
  const radio = (value: string) => el.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
  expect(radio('metric').checked).toBe(true);
  expect(document.documentElement.classList.contains('dark')).toBe(false);

  act(() => radio('imperial').click());
  act(() => radio('dark').click());
  expect(useStore.getState()).toMatchObject({ units: 'imperial', theme: 'dark' });
  expect(radio('imperial').checked).toBe(true);
  expect(document.documentElement.classList.contains('dark')).toBe(true);

  act(() => root.unmount());
  el.remove();
});
