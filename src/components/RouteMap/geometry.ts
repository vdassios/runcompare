/**
 * What the route map draws and how the pointer finds a course distance on it: the lines taken
 * from an AnalysisResult, nearest-point lookups and NaN-safe polyline runs. Pure, no Leaflet.
 */
import type { AnalysisResult, AttemptId } from '../../model/types';

/** Positions with the course distance of each one; the hover marker and pointer lookups use these. */
export interface MapLine {
  lat: Float64Array;
  lon: Float64Array;
  d: Float64Array;
}

export interface AttemptTrack extends MapLine {
  attemptId: AttemptId;
  color: string;
}

export interface MapLines {
  /** The baseline course on the grid; null on a distance baseline. */
  course: MapLine | null;
  /** Every attempt's own track, in input order. */
  tracks: AttemptTrack[];
}

/** The lines the map can draw, or null when there is nothing with a position (splits only). */
export function mapLines(analysis: AnalysisResult): MapLines | null {
  const { grid } = analysis;
  const course = grid.lat && grid.lon ? { lat: grid.lat, lon: grid.lon, d: grid.d } : null;
  const tracks = analysis.attempts.flatMap((a) =>
    a.track ? [{ ...a.track, attemptId: a.attemptId, color: a.color }] : [],
  );
  if (!course && tracks.length === 0) return null;
  return { course, tracks };
}

/** [[south, west], [north, east]] over every finite position, or null when there is none. */
export function lineBounds(lines: readonly MapLine[]): [[number, number], [number, number]] | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const { lat, lon } of lines) {
    for (let i = 0; i < lat.length; i++) {
      const y = lat[i]!;
      const x = lon[i]!;
      if (!Number.isFinite(y) || !Number.isFinite(x)) continue;
      if (y < south) south = y;
      if (y > north) north = y;
      if (x < west) west = x;
      if (x > east) east = x;
    }
  }
  return south <= north
    ? [
        [south, west],
        [north, east],
      ]
    : null;
}

/**
 * Index of the finite position nearest (qLat, qLon), or −1 when there is none. Distances are taken
 * on a local equirectangular plane, which ranks points the same as screen pixels do at map scale.
 */
export function nearestPointIndex(lat: Float64Array, lon: Float64Array, qLat: number, qLon: number): number {
  const kx = Math.cos((qLat * Math.PI) / 180);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < lat.length; i++) {
    const dy = lat[i]! - qLat;
    const dx = (lon[i]! - qLon) * kx;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Index of the drawable position whose course distance is nearest `d`, or −1 when there is none. */
export function indexAtDistance(line: MapLine, d: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < line.d.length; i++) {
    if (!Number.isFinite(line.lat[i]!) || !Number.isFinite(line.lon[i]!)) continue;
    const dist = Math.abs(line.d[i]! - d);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export type LatLngTuple = [number, number];

/** Positions `from..to` (inclusive) as polyline runs, split wherever a position is missing. */
export function finiteRuns(lat: Float64Array, lon: Float64Array, from = 0, to = lat.length - 1): LatLngTuple[][] {
  return collectRuns(lat, lon, from, to, () => true);
}

/** The parts of `line` whose course distance lies in [from, to], as polyline runs. */
export function rangeRuns(line: MapLine, from: number, to: number): LatLngTuple[][] {
  return collectRuns(line.lat, line.lon, 0, line.d.length - 1, (i) => line.d[i]! >= from && line.d[i]! <= to);
}

function collectRuns(
  lat: Float64Array,
  lon: Float64Array,
  from: number,
  to: number,
  keep: (i: number) => boolean,
): LatLngTuple[][] {
  const runs: LatLngTuple[][] = [];
  let run: LatLngTuple[] = [];
  for (let i = from; i <= to; i++) {
    const y = lat[i]!;
    const x = lon[i]!;
    if (Number.isFinite(y) && Number.isFinite(x) && keep(i)) {
      run.push([y, x]);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs.filter((r) => r.length > 1);
}
