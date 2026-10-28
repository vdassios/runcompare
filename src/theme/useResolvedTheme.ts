import { useEffect, useSyncExternalStore } from 'react';
import { useStore, type AppState } from '../store/useStore';
import type { ResolvedTheme } from './tokens';

const QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: AppState['theme'], systemDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

export function applyTheme(resolved: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', resolved === 'dark');
}

function subscribe(onChange: () => void): () => void {
  const mql = globalThis.matchMedia?.(QUERY);
  mql?.addEventListener('change', onChange);
  return () => mql?.removeEventListener('change', onChange);
}

const systemPrefersDark = () => globalThis.matchMedia?.(QUERY).matches ?? false;

/**
 * Resolves the store's theme ('system' follows `prefers-color-scheme`, live) and
 * toggles the `dark` class on <html>. Returns the resolved theme.
 */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useStore((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribe, systemPrefersDark, () => false);
  const resolved = resolveTheme(theme, systemDark);
  useEffect(() => applyTheme(resolved), [resolved]);
  return resolved;
}
