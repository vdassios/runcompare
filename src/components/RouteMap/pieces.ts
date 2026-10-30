/**
 * Colouring of the course line: the course is cut into fixed-length pieces, each scored by how
 * much time the focused attempt gained or lost against the baseline over it. Pure, so it can be
 * tested without a map.
 */
import { quantile } from 'd3-array';
import type { CourseGrid } from '../../model/types';

/** Changes within ±this many seconds per piece are drawn neutral grey. */
export const NEUTRAL_BAND = 1;
/** Pieces above this share of |value| are clipped to full colour, so outliers don't wash out the rest. */
export const CLIP_QUANTILE = 0.95;

export interface RoutePiece {
  from: number; // first grid index
  to: number; // last grid index, inclusive; the next piece starts here
  /** Delta change over the piece scaled to one full piece, s; positive means time lost. NaN when off course. */
  value: number;
  offCourse: boolean;
  /** −1 (full ahead colour) … 1 (full behind colour); 0 inside the neutral band and off course. */
  intensity: number;
}

export interface RouteColouring {
  pieces: RoutePiece[];
  /** |value| that maps to full colour, s per piece; never below NEUTRAL_BAND. */
  clip: number;
}

/**
 * Splits the grid into pieces of `pieceLength` metres (the last one may be shorter) and scores each
 * by the change in `delta` across it. A piece is off course when any of its grid points is flagged
 * or the delta at either end is missing.
 */
export function routePieces(
  grid: CourseGrid,
  delta: Float64Array,
  offCourse: Uint8Array,
  pieceLength: number,
): RouteColouring {
  const { d } = grid;
  const pieces: RoutePiece[] = [];
  for (let from = 0; from < d.length - 1;) {
    let to = from + 1;
    while (to < d.length - 1 && d[to]! < d[from]! + pieceLength - 1e-9) to++;
    let flagged = false;
    for (let k = from; k <= to && !flagged; k++) flagged = offCourse[k] === 1;
    const change = delta[to]! - delta[from]!;
    const off = flagged || !Number.isFinite(change);
    const value = off ? NaN : (change / (d[to]! - d[from]!)) * pieceLength;
    pieces.push({ from, to, value, offCourse: off, intensity: 0 });
    from = to;
  }

  const magnitudes = pieces.filter((p) => !p.offCourse).map((p) => Math.abs(p.value));
  const clip = Math.max(NEUTRAL_BAND, quantile(magnitudes, CLIP_QUANTILE) ?? 0);
  for (const p of pieces) {
    if (p.offCourse || Math.abs(p.value) <= NEUTRAL_BAND) continue;
    p.intensity = Math.sign(p.value) * Math.min(1, Math.abs(p.value) / clip);
  }
  return { pieces, clip };
}

/** Lightest tint a piece outside the neutral band gets, so it never reads as neutral. */
const MIN_TINT = 0.3;

/** Colour for an intensity: `neutral` at 0, blending to `ahead` at −1 and `behind` at 1. */
export function pieceColor(intensity: number, colors: { neutral: string; ahead: string; behind: string }): string {
  if (intensity === 0) return colors.neutral;
  const target = intensity < 0 ? colors.ahead : colors.behind;
  return mixHex(colors.neutral, target, MIN_TINT + (1 - MIN_TINT) * Math.abs(intensity));
}

/** Linear blend of two `#rrggbb` colours; t = 0 gives `a`, 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return `#${out.toString(16).padStart(6, '0')}`;
}
