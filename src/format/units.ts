import type { UnitSystem } from '../model/types';

export const METRES_PER_MILE = 1609.344;
export const METRES_PER_FOOT = 0.3048;

/** Length of one split (1 km or 1 mi) in metres. */
export function splitLength(units: UnitSystem): number {
  return units === 'imperial' ? METRES_PER_MILE : 1000;
}

const IMPERIAL_LANGUAGES = new Set(['en-us', 'en-lr', 'my']);

/** Unit system for a BCP 47 language tag such as `navigator.language`. */
export function defaultUnits(language: string): UnitSystem {
  const tag = language.trim().toLowerCase().replace(/_/g, '-');
  const primary = tag.split('-')[0] ?? '';
  return IMPERIAL_LANGUAGES.has(tag) || IMPERIAL_LANGUAGES.has(primary) || tag.startsWith('en-us-')
    ? 'imperial'
    : 'metric';
}
