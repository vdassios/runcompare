/**
 * Plane geometry for course alignment: great-circle distance, a local equirectangular
 * projection to metres, and point-to-segment projection on that plane.
 */

export const EARTH_RADIUS = 6_371_008.8; // m, mean radius

const RAD = Math.PI / 180;

export type Point = readonly [x: number, y: number];

export interface SegmentProjection {
  /** Position of the foot of the perpendicular along a→b, clamped to [0, 1]. */
  t: number;
  /** Distance from the point to that foot, m. */
  dist: number;
}

/** Great-circle distance in metres between two positions in degrees. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const h =
    Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Equirectangular projection centred on (lat0, lon0): x east and y north, in metres.
 * Accurate to well under 1 % within a few tens of kilometres of the centre.
 */
export function makeLocalProjection(lat0: number, lon0: number): (lat: number, lon: number) => [number, number] {
  const kx = EARTH_RADIUS * RAD * Math.cos(lat0 * RAD);
  const ky = EARTH_RADIUS * RAD;
  return (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * ky];
}

/** Projects `p` onto the segment a→b. A zero-length segment projects to `a` (t = 0). */
export function projectOntoSegment(p: Point, a: Point, b: Point): SegmentProjection {
  const t = segmentParameter(p[0], p[1], a[0], a[1], b[0], b[1]);
  const fx = a[0] + t * (b[0] - a[0]);
  const fy = a[1] + t * (b[1] - a[1]);
  return { t, dist: Math.hypot(p[0] - fx, p[1] - fy) };
}

/** The clamped `t` of {@link projectOntoSegment} on raw coordinates, for allocation-free inner loops. */
export function segmentParameter(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const ux = bx - ax;
  const uy = by - ay;
  const len2 = ux * ux + uy * uy;
  if (len2 === 0) return 0;
  const t = ((px - ax) * ux + (py - ay) * uy) / len2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
