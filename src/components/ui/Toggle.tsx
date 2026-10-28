/**
 * A segmented control for picking one of a few options (units, theme). Native radios under the
 * hood, so arrow keys, focus and labelling come from the browser; the legend names the group.
 */
import { useId } from 'react';

export interface ToggleProps<T extends string> {
  legend: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
}

export function Toggle<T extends string>({ legend, value, options, onChange }: ToggleProps<T>) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex rounded-md border border-border bg-background p-0.5">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span className="block rounded px-2.5 py-1 text-sm text-muted peer-checked:bg-surface peer-checked:font-medium peer-checked:text-text peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
