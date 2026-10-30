/** Form controls shared by the split-set editor and the baseline picker. */
import { useState, type ReactNode } from 'react';
import { DISTANCE_PRESETS, type UnitSystem } from '../../model/types';
import { FOCUS_RING } from '../ui';
import { PRESET_IDS, distanceText, parseDistanceText, unitLabel, type DistanceChoice } from './fields';

/** Text inputs and selects; add a height (`h-9`) except on textareas. */
export const INPUT = `min-w-0 rounded-md border border-border bg-background px-2 text-sm aria-[invalid=true]:border-behind ${FOCUS_RING}`;

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

interface DistanceInputProps {
  name: string;
  /** m; NaN while empty or invalid. */
  value: number;
  units: UnitSystem;
  onChange(m: number): void;
  ariaLabel?: string;
}

/**
 * A distance typed in km or mi. Keeps the user's text while it matches `value`; a new `value` from
 * outside or a units switch rewrites the text from the metres, which stay as they are.
 */
export function DistanceInput({ name, value, units, onChange, ariaLabel }: DistanceInputProps) {
  const [text, setText] = useState(() => distanceText(value, units));
  const [shown, setShown] = useState({ value, units });
  if (shown.units !== units || !Object.is(shown.value, value)) {
    setShown({ value, units });
    setText(distanceText(value, units));
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        name={name}
        aria-label={ariaLabel}
        value={text}
        aria-invalid={text.trim() !== '' && Number.isNaN(value)}
        onChange={(e) => {
          const next = e.currentTarget.value;
          const m = parseDistanceText(next, units);
          setText(next);
          setShown({ value: m, units });
          onChange(m);
        }}
        className={`${INPUT} h-9 w-24`}
      />
      <span className="text-sm text-muted">{unitLabel(units)}</span>
    </span>
  );
}

interface DistanceSelectProps {
  name: string;
  label: string;
  value: DistanceChoice | null;
  units: UnitSystem;
  onChange(choice: DistanceChoice | null): void;
  /** Offers "none" as the first option. */
  noneLabel?: string;
  hint?: ReactNode;
}

/** A distance preset, or a custom distance in the active units. */
export function DistanceSelect({ name, label, value, units, onChange, noneLabel, hint }: DistanceSelectProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <Field label={label}>
          <select
            name={name}
            value={value?.preset ?? ''}
            onChange={(e) => {
              const preset = e.currentTarget.value;
              if (preset === '') onChange(null);
              else onChange({ preset: preset as DistanceChoice['preset'], custom: value?.custom ?? NaN });
            }}
            className={`${INPUT} h-9`}
          >
            {noneLabel && <option value="">{noneLabel}</option>}
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {DISTANCE_PRESETS[id].label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </Field>
        {value?.preset === 'custom' && (
          <div className="pb-px">
            <DistanceInput
              name={`${name}-custom`}
              ariaLabel={`${label}, custom (${unitLabel(units)})`}
              value={value.custom}
              units={units}
              onChange={(custom) => onChange({ preset: 'custom', custom })}
            />
          </div>
        )}
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
