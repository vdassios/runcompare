/** The app bar: name, tagline, and the units and theme controls. Applies the resolved theme to <html>. */
import type { UnitSystem } from '../model/types';
import { useStore, type AppState } from '../store/useStore';
import { useResolvedTheme } from '../theme';
import { Toggle } from './ui';

const UNIT_OPTIONS = [
  { value: 'metric', label: 'Metric' },
  { value: 'imperial', label: 'Imperial' },
] as const satisfies readonly { value: UnitSystem; label: string }[];

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: AppState['theme']; label: string }[];

export function Header() {
  useResolvedTheme();
  const units = useStore((s) => s.units);
  const theme = useStore((s) => s.theme);
  const setUnits = useStore((s) => s.setUnits);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">RunCompare</h1>
        <p className="text-sm text-muted">Line up attempts at the same race and see where the time went.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle legend="Units" value={units} options={UNIT_OPTIONS} onChange={setUnits} />
        <Toggle legend="Theme" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
      </div>
    </header>
  );
}
