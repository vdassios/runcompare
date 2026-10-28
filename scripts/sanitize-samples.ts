/**
 * Writes the owner's race files to fixtures/ (task 01).
 *
 *   npm run sanitize                 # reads ./samples
 *   npm run sanitize -- <samplesDir> # or SAMPLES_DIR=<samplesDir> npm run sanitize
 *
 * The only personal data is the owner's name in the GPX <metadata>. The FIT files are copied as is;
 * the GPX files lose their <metadata> and are cut to the first 2,000 m to keep them small.
 * The raw files in samples/ are gitignored and must never be committed. The JSON DeviceLogs are ignored.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = join(REPO_ROOT, 'fixtures');

const RACES = [
  { year: 2024, fit: 'TrailRunning_2024-11-02T07_00_47.fit', gpx: 'suuntoapp-TrailRunning-2024-11-02-track.gpx' },
  { year: 2025, fit: 'TrailRunning_2025-11-01T06_30_24.fit', gpx: 'suuntoapp-TrailRunning-2025-11-01-track.gpx' },
] as const;

const GPX_HEAD_METRES = 2_000;
const EARTH_RADIUS = 6_371_008.8; // m, mean radius

type LatLon = readonly [number, number];

function haversine([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The GPX without <metadata>, keeping the track points within the first `metres` of the start. */
function gpxHead(xml: string, metres: number): { xml: string; kept: number; total: number } {
  const body = xml.replace(/<metadata>[\s\S]*?<\/metadata>/, '');
  const points = [...body.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">[\s\S]*?<\/trkpt>/g)];
  const first = points[0];
  if (first === undefined) throw new Error('GPX has no track points');
  const position = (p: RegExpExecArray): LatLon => [Number(p[1]), Number(p[2])];

  let distance = 0;
  let end = 1;
  for (; end < points.length; end++) {
    distance += haversine(position(points[end - 1]!), position(points[end]!));
    if (distance > metres) break;
  }
  const head = points.slice(0, end).map((p) => p[0]);
  return {
    xml: `${body.slice(0, first.index)}${head.join('')}</trkseg></trk></gpx>\n`,
    kept: head.length,
    total: points.length,
  };
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main(): void {
  const samplesDir = resolve(process.argv[2] ?? process.env.SAMPLES_DIR ?? join(REPO_ROOT, 'samples'));
  mkdirSync(FIXTURES_DIR, { recursive: true });
  console.log(`Reading ${samplesDir}\nWriting ${FIXTURES_DIR}\n`);

  for (const race of RACES) {
    const fitOut = join(FIXTURES_DIR, `trail-${race.year}.fit`);
    copyFileSync(join(samplesDir, race.fit), fitOut);
    console.log(`trail-${race.year}.fit  ${kb(statSync(fitOut).size)} (copied)`);

    const gpx = gpxHead(readFileSync(join(samplesDir, race.gpx), 'utf8'), GPX_HEAD_METRES);
    writeFileSync(join(FIXTURES_DIR, `trail-${race.year}-head.gpx`), gpx.xml);
    console.log(`trail-${race.year}-head.gpx  ${kb(Buffer.byteLength(gpx.xml))} (${gpx.kept} of ${gpx.total} trkpt)`);
  }
}

main();
