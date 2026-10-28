import type { Quantity, UnitSystem } from '../model/types';
import { formatDelta, formatDuration } from './duration';
import { MINUS, NO_VALUE, formatNumber } from './number';
import { METRES_PER_FOOT, METRES_PER_MILE, splitLength } from './units';

/** "54.13 km" | "33.63 mi". Two decimals unless `decimals` says otherwise. */
export function formatDistance(m: number, units: UnitSystem, opts: { decimals?: number } = {}): string {
  if (!Number.isFinite(m)) return NO_VALUE;
  const decimals = opts.decimals ?? 2;
  return units === 'imperial'
    ? `${formatNumber(m / METRES_PER_MILE, decimals)} mi`
    : `${formatNumber(m / 1000, decimals)} km`;
}

/** Pace from s/m: "5:12 /km" | "8:22 /mi". Non-finite or non-positive → "—". */
export function formatPace(sPerM: number, units: UnitSystem): string {
  if (!Number.isFinite(sPerM) || sPerM <= 0) return NO_VALUE;
  return `${formatDuration(sPerM * splitLength(units))} /${units === 'imperial' ? 'mi' : 'km'}`;
}

/** "2,780 m" | "9,121 ft". */
export function formatElevation(m: number, units: UnitSystem): string {
  if (!Number.isFinite(m)) return NO_VALUE;
  return units === 'imperial' ? `${formatNumber(m / METRES_PER_FOOT)} ft` : `${formatNumber(m)} m`;
}

/** Vertical speed: "812 m/h" | "2,664 ft/h". */
export function formatVam(mPerH: number, units: UnitSystem): string {
  if (!Number.isFinite(mPerH)) return NO_VALUE;
  return units === 'imperial' ? `${formatNumber(mPerH / METRES_PER_FOOT)} ft/h` : `${formatNumber(mPerH)} m/h`;
}

/** "12 °C" | "54 °F". */
export function formatTemp(c: number, units: UnitSystem): string {
  if (!Number.isFinite(c)) return NO_VALUE;
  return units === 'imperial' ? `${formatNumber((c * 9) / 5 + 32)} °F` : `${formatNumber(c)} °C`;
}

/** A fraction as a percentage with at most one decimal: 0.053 → "5.3%", 0.12 → "12%". */
export function formatPercent(fraction: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(fraction)) return NO_VALUE;
  const text = `${formatNumber(fraction * 100, 1, { trimZeros: true })}%`;
  return opts.sign && !text.startsWith(MINUS) && text !== '0%' ? `+${text}` : text;
}

export function formatQuantity(q: Quantity, units: UnitSystem): string {
  switch (q.kind) {
    case 'distance':
      return formatDistance(q.value, units);
    case 'elevation':
      return formatElevation(q.value, units);
    case 'pace':
      return formatPace(q.value, units);
    case 'duration':
      return formatDuration(q.value);
    case 'delta':
      return formatDelta(q.value);
    case 'percent':
      return formatPercent(q.value);
    case 'count':
      return formatNumber(q.value);
  }
}

/** Replaces each `{name}` with its formatted quantity. Unknown placeholders are left as they are. */
export function fillTemplate(template: string, values: Record<string, Quantity>, units: UnitSystem): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const q = values[name];
    return q ? formatQuantity(q, units) : match;
  });
}
