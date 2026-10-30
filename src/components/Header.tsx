/**
 * The app bar: name, tagline, the units and theme controls, and "Clear session" once there are
 * attempts. Applies the resolved theme to <html>.
 */
import { useEffect, useState } from 'react';
import type { UnitSystem } from '../model/types';
import { clearSession } from '../store/persistence';
import { useStore, type AppState } from '../store/useStore';
import { useResolvedTheme } from '../theme';
import { Button, Toggle } from './ui';

const CLEAR_CONFIRM_MS = 3000;

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
  const hasAttempts = useStore((s) => s.attempts.length > 0);

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">RunCompare</h1>
        <p className="text-sm text-muted">Line up attempts at the same race and see where the time went.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle legend="Units" value={units} options={UNIT_OPTIONS} onChange={setUnits} />
        <Toggle legend="Theme" value={theme} options={THEME_OPTIONS} onChange={setTheme} />
        {hasAttempts && <ClearSessionButton />}
      </div>
    </header>
  );
}

/** The same inline confirm as removing an attempt: a second click within 3 s clears. */
function ClearSessionButton() {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CLEAR_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <Button
      variant={confirming ? 'secondary' : 'ghost'}
      size="sm"
      aria-label={confirming ? 'Confirm clearing the session' : 'Clear session'}
      onClick={() => (confirming ? void clearSession(useStore) : setConfirming(true))}
      onBlur={() => setConfirming(false)}
      className={confirming ? 'border-text font-semibold' : ''}
    >
      {confirming ? 'Clear session?' : 'Clear session'}
    </Button>
  );
}
