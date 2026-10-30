/**
 * Text ↔ value helpers for the split-set editor's inputs. Distances are typed in the active units
 * (km or mi) and kept in metres, so switching units only changes what the inputs show.
 */
import { formatDuration, splitLength } from '../../format';
import { DISTANCE_PRESETS, type DistancePresetId, type SplitSet, type UnitSystem } from '../../model/types';

export const PRESET_IDS = Object.keys(DISTANCE_PRESETS) as DistancePresetId[];

/** A preset, or a custom distance in metres (NaN until a valid one is typed). */
export interface DistanceChoice {
  preset: DistancePresetId | 'custom';
  custom: number;
}

export function unitLabel(units: UnitSystem): string {
  return units === 'imperial' ? 'mi' : 'km';
}

/** Metres as the number to put in a distance input: km or mi, at most 4 decimals; '' for NaN. */
export function distanceText(m: number, units: UnitSystem): string {
  return Number.isFinite(m) ? String(Number((m / splitLength(units)).toFixed(4))) : '';
}

/** A typed km or mi value in metres; NaN unless it is a positive number. */
export function parseDistanceText(text: string, units: UnitSystem): number {
  const t = text.trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t) || Number(t) === 0) return NaN;
  return Number(t) * splitLength(units);
}

/** Seconds as text `parseDuration` reads back unchanged, keeping fractions of a second. */
export function timeText(s: number): string {
  const whole = Math.floor(s);
  const fraction = String(Number((s - whole).toFixed(3))).slice(1);
  return formatDuration(whole) + fraction;
}

export function choiceDistance(choice: DistanceChoice): number {
  return choice.preset === 'custom' ? choice.custom : DISTANCE_PRESETS[choice.preset].distance;
}

/** The preset a distance matches, else a custom choice holding it. */
export function choiceFor(distance: number): DistanceChoice {
  const preset = PRESET_IDS.find((id) => DISTANCE_PRESETS[id].distance === distance);
  return preset ? { preset, custom: NaN } : { preset: 'custom', custom: distance };
}

/** The distance a split set covers: its official distance, else its last marker. */
export function setDistance(set: SplitSet): number {
  return set.officialDistance ?? set.markers[set.markers.length - 1]?.distance ?? NaN;
}
