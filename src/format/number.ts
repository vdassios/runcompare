/** U+2212, used for every negative number shown to the user. */
export const MINUS = '−';
export const NO_VALUE = '—';

const formatters = new Map<number, Intl.NumberFormat>();

/**
 * Groups with en-GB conventions regardless of the browser locale, so output is
 * stable. Negatives get a true minus sign.
 */
export function formatNumber(value: number, decimals = 0, opts: { trimZeros?: boolean } = {}): string {
  if (!Number.isFinite(value)) return NO_VALUE;
  const key = opts.trimZeros ? -1 - decimals : decimals;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: opts.trimZeros ? 0 : decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, fmt);
  }
  const text = fmt.format(Math.abs(value));
  // Compare the rounded text, not the value, so -0.001 doesn't render as "−0".
  return value < 0 && /[1-9]/.test(text) ? MINUS + text : text;
}
