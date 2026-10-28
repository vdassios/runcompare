/**
 * Grade-adjusted pace from Minetti et al. (2002), PLAN §5.3. Pure functions; pace is s/m and
 * grade is a fraction.
 */
import { MAX_GRADE } from './smoothing';

/** Metabolic cost of running on flat ground, J/kg/m: `minettiCost(0)`. */
const FLAT_COST = 3.6;

/**
 * Energy cost of running at grade `i` (fraction), J/kg/m:
 * `155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6`. Unclamped; the fit holds for |i| ≤ 0.45.
 */
export function minettiCost(i: number): number {
  return ((((155.4 * i - 30.4) * i - 43.3) * i + 46.3) * i + 19.5) * i + FLAT_COST;
}

/**
 * How much harder a metre at grade `i` is than a flat metre: `minettiCost(i) / 3.6`, with `i`
 * clamped to ±0.45. 1 on the flat, above 1 uphill, below 1 on gentle descents. NaN for NaN.
 */
export function gapFactor(i: number): number {
  return minettiCost(Math.min(MAX_GRADE, Math.max(-MAX_GRADE, i))) / FLAT_COST;
}

/**
 * Grade-adjusted pace, element-wise `pace / gapFactor(grade)`: the flat pace that would cost the
 * same effort. A NaN pace or grade gives NaN at that sample only.
 */
export function gapPace(pace: ArrayLike<number>, grade: ArrayLike<number>): Float32Array {
  if (pace.length !== grade.length) {
    throw new RangeError(`pace and grade differ in length (${pace.length} vs ${grade.length})`);
  }
  const out = new Float32Array(pace.length);
  for (let k = 0; k < out.length; k++) out[k] = pace[k]! / gapFactor(grade[k]!);
  return out;
}
