/**
 * The baseline course's elevation profile docked under the route map, the way tracedetrail draws
 * it: the elevation as a filled area over vertical bands that shade the steep stretches. Geometry
 * is in course metres across and 0–PROFILE_HEIGHT down, for an SVG stretched to its container.
 */
import type { CourseGrid } from '../../model/types';

export const PROFILE_HEIGHT = 100;
/** |grade| at or above each step shades a band one level darker. */
export const GRADE_STEPS = [0.1, 0.2, 0.3] as const;
const TOP_PAD = 0.1; // share of the height left above the highest point

export interface GradeBand {
  from: number; // m
  to: number;
  level: 1 | 2 | 3;
}

export interface ElevationProfile {
  length: number; // m
  minEle: number; // m
  maxEle: number;
  /** Closed SVG path of the filled area. */
  area: string;
  bands: GradeBand[];
}

/** Null when the course has no elevation (a distance baseline, or a track without altitude). */
export function elevationProfile(grid: CourseGrid): ElevationProfile | null {
  const { d, ele, grade, length } = grid;
  if (!ele || !(length > 0)) return null;

  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const e of ele) {
    if (e < minEle) minEle = e;
    if (e > maxEle) maxEle = e;
  }
  if (!Number.isFinite(minEle)) return null;

  const span = Math.max(maxEle - minEle, 1);
  const y = (e: number) => PROFILE_HEIGHT * (1 - (1 - TOP_PAD) * ((e - minEle) / span));
  const points: string[] = [];
  for (let i = 0; i < d.length; i++) {
    if (Number.isFinite(ele[i]!)) points.push(`${d[i]!.toFixed(0)} ${y(ele[i]!).toFixed(2)}`);
  }
  const area = `M0 ${PROFILE_HEIGHT} L${points.join(' L')} L${length.toFixed(0)} ${PROFILE_HEIGHT} Z`;

  return { length, minEle, maxEle, area, bands: grade ? gradeBands(d, grade) : [] };
}

/** Runs of grid intervals whose |grade| reaches the same step, merged; the flat ones are left out. */
export function gradeBands(d: Float64Array, grade: Float32Array): GradeBand[] {
  const bands: GradeBand[] = [];
  for (let i = 0; i + 1 < d.length; i++) {
    const level = steepness(grade[i]!);
    if (level === 0) continue;
    const last = bands.at(-1);
    if (last && last.level === level && last.to === d[i]) last.to = d[i + 1]!;
    else bands.push({ from: d[i]!, to: d[i + 1]!, level });
  }
  return bands;
}

function steepness(g: number): 0 | GradeBand['level'] {
  const a = Math.abs(g); // NaN fails every comparison and stays flat
  return a >= GRADE_STEPS[2] ? 3 : a >= GRADE_STEPS[1] ? 2 : a >= GRADE_STEPS[0] ? 1 : 0;
}
