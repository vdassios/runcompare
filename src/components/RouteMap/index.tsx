/**
 * Route map section: the baseline course on OSM tiles, coloured by where the focused attempt
 * gained or lost time, with the hover marker and highlight ranges shared with the charts through
 * the store, and the baseline's elevation profile docked underneath. On a distance baseline it
 * draws the attempts' own tracks instead, with no profile.
 */
import 'leaflet/dist/leaflet.css';
import type { LeafletMouseEvent, Map as LeafletMap } from 'leaflet';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Pane, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import { MINUS, formatNumber, splitLength } from '../../format';
import type { AttemptAnalysis, UnitSystem } from '../../model/types';
import { useStore } from '../../store/useStore';
import { TOKENS, useResolvedTheme, type ColorToken } from '../../theme';
import {
  finiteRuns,
  indexAtDistance,
  lineBounds,
  mapLines,
  nearestPointIndex,
  rangeRuns,
  type AttemptTrack,
  type LatLngTuple,
  type MapLine,
} from './geometry';
import { ElevationProfile } from './ElevationProfile';
import { NEUTRAL_BAND, pieceColor, routePieces, type RouteColouring } from './pieces';

const PIECE_LENGTH = 100; // m
const HOVER_RADIUS = 30; // px
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const OFF_COURSE_DASH = '4 6';

type Colors = Readonly<Record<ColorToken, string>>;
type Bounds = [LatLngTuple, LatLngTuple];

export function RouteMap() {
  const analysis = useStore((s) => s.analysis);
  const focusAttemptId = useStore((s) => s.focusAttemptId);
  const setFocusAttempt = useStore((s) => s.setFocusAttempt);
  const units = useStore((s) => s.units);
  const colors = TOKENS[useResolvedTheme()];
  const [showAllTracks, setShowAllTracks] = useState(false);

  const lines = useMemo(() => (analysis ? mapLines(analysis) : null), [analysis]);
  const candidates = useMemo(
    () => analysis?.attempts.filter((a) => a.attemptId !== analysis.baseline.attemptId && a.delta) ?? [],
    [analysis],
  );
  const focused = candidates.find((a) => a.attemptId === focusAttemptId) ?? candidates[0] ?? null;
  const colouring = useMemo(
    () =>
      analysis?.grid.lat && focused?.delta
        ? routePieces(analysis.grid, focused.delta, focused.series.offCourse, PIECE_LENGTH)
        : null,
    [analysis, focused],
  );
  const bounds = useMemo(() => lines && lineBounds(lines.course ? [lines.course] : lines.tracks), [lines]);

  if (!analysis || !lines || !bounds) return null;

  const { course, tracks } = lines;
  // On a distance baseline the tracks are the map, so hover and the marker follow them.
  const hoverLines: MapLine[] = course ? [course] : tracks;
  const markerLine = course ?? tracks.find((t) => t.attemptId === focused?.attemptId) ?? tracks[0]!;
  const fitKey = `${analysis.baseline.kind}:${analysis.baseline.attemptId}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="text-lg font-semibold">Route</h2>
        {candidates.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Colour by
            <select
              className="rounded border border-border bg-surface px-2 py-1 text-text"
              value={focused?.attemptId ?? ''}
              onChange={(e) => setFocusAttempt(e.target.value)}
            >
              {candidates.map((a) => (
                <option key={a.attemptId} value={a.attemptId}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {course && tracks.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="accent-accent"
              checked={showAllTracks}
              onChange={(e) => setShowAllTracks(e.target.checked)}
            />
            Show all tracks
          </label>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <MapContainer
          className="h-[280px] w-full md:h-[420px]"
          style={{ background: colors.background }}
          bounds={bounds}
          boundsOptions={{ padding: [16, 16] }}
          scrollWheelZoom={false}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <Pane name="rc-tracks" style={{ zIndex: 410 }}>
            {(!course || showAllTracks) && <Tracks tracks={tracks} weight={course ? 2 : 3} />}
          </Pane>
          {course && (
            <Pane name="rc-course" style={{ zIndex: 420 }}>
              <CourseLine course={course} colouring={colouring} colors={colors} />
            </Pane>
          )}
          <Pane name="rc-highlight" style={{ zIndex: 430 }}>
            <Highlights line={course ?? markerLine} color={colors.accent} />
          </Pane>
          <Pane name="rc-hover" style={{ zIndex: 440 }}>
            <HoverMarker line={markerLine} colors={colors} />
          </Pane>
          <MapBehaviour hoverLines={hoverLines} bounds={bounds} fitKey={fitKey} />
        </MapContainer>
        {course && <ElevationProfile grid={analysis.grid} units={units} colors={colors} />}
      </div>

      {colouring && focused && <Legend colouring={colouring} focused={focused} units={units} />}
    </div>
  );
}

const Tracks = memo(function Tracks({ tracks, weight }: { tracks: AttemptTrack[]; weight: number }) {
  const runs = useMemo(() => tracks.map((t) => finiteRuns(t.lat, t.lon)), [tracks]);
  return tracks.map((t, i) => (
    <Polyline
      key={t.attemptId}
      positions={runs[i]!}
      pathOptions={{ color: t.color, weight, opacity: 0.85 }}
      interactive={false}
    />
  ));
});

const CourseLine = memo(function CourseLine({
  course,
  colouring,
  colors,
}: {
  course: MapLine;
  colouring: RouteColouring | null;
  colors: Colors;
}) {
  const pieceRuns = useMemo(
    () => colouring?.pieces.map((p) => finiteRuns(course.lat, course.lon, p.from, p.to)) ?? null,
    [course, colouring],
  );
  const wholeRuns = useMemo(() => finiteRuns(course.lat, course.lon), [course]);

  if (!colouring || !pieceRuns) {
    return <Polyline positions={wholeRuns} pathOptions={{ color: colors.muted, weight: 5 }} interactive={false} />;
  }
  const scale = { neutral: colors.muted, ahead: colors.ahead, behind: colors.behind };
  return colouring.pieces.map((p, i) => (
    <Polyline
      key={p.from}
      positions={pieceRuns[i]!}
      pathOptions={
        p.offCourse
          ? { color: colors['off-course'], weight: 4, dashArray: OFF_COURSE_DASH, lineCap: 'butt' }
          : { color: pieceColor(p.intensity, scale), weight: 5, dashArray: undefined, lineCap: 'round' }
      }
      interactive={false}
    />
  ));
});

function Highlights({ line, color }: { line: MapLine; color: string }) {
  const ranges = useStore((s) => s.highlightRanges);
  const runs = useMemo(() => ranges.map((r) => rangeRuns(line, r.from, r.to)), [line, ranges]);
  return runs.map((r, i) => (
    <Polyline key={i} positions={r} pathOptions={{ color, weight: 11, opacity: 0.45 }} interactive={false} />
  ));
}

function HoverMarker({ line, colors }: { line: MapLine; colors: Colors }) {
  const hoverDistance = useStore((s) => s.hoverDistance);
  if (hoverDistance === null) return null;
  const i = indexAtDistance(line, hoverDistance);
  if (i < 0) return null;
  return (
    <CircleMarker
      center={[line.lat[i]!, line.lon[i]!]}
      radius={6}
      pathOptions={{ color: colors.text, weight: 2, fillColor: colors.surface, fillOpacity: 1 }}
      interactive={false}
    />
  );
}

/** Pointer → store hover, click-to-enable scroll zoom, and refitting when the baseline changes. */
function MapBehaviour({ hoverLines, bounds, fitKey }: { hoverLines: MapLine[]; bounds: Bounds; fitKey: string }) {
  const setHover = useStore((s) => s.setHover);
  const map = useMapEvents({
    mousemove: (e) => setHover(distanceUnderPointer(map, hoverLines, e)),
    click: () => map.scrollWheelZoom.enable(),
  });

  useEffect(() => {
    // A DOM mouseleave, unlike Leaflet's mouseout, doesn't fire when the pointer moves onto a control.
    const container = map.getContainer();
    const leave = () => {
      setHover(null);
      map.scrollWheelZoom.disable();
    };
    container.addEventListener('mouseleave', leave);
    return () => container.removeEventListener('mouseleave', leave);
  }, [map, setHover]);

  // MapContainer fits the first bounds itself; later analyses only refit when the baseline changes.
  const fitted = useRef(fitKey);
  useEffect(() => {
    if (fitted.current === fitKey) return;
    fitted.current = fitKey;
    map.fitBounds(bounds, { padding: [16, 16] });
  }, [map, bounds, fitKey]);

  return null;
}

/** Course distance of the nearest point within HOVER_RADIUS pixels of the pointer, else null. */
function distanceUnderPointer(map: LeafletMap, lines: MapLine[], e: LeafletMouseEvent): number | null {
  let best: number | null = null;
  let bestPx = HOVER_RADIUS;
  for (const line of lines) {
    const i = nearestPointIndex(line.lat, line.lon, e.latlng.lat, e.latlng.lng);
    if (i < 0 || !Number.isFinite(line.d[i]!)) continue;
    const px = map.latLngToContainerPoint([line.lat[i]!, line.lon[i]!]).distanceTo(e.containerPoint);
    if (px <= bestPx) {
      bestPx = px;
      best = line.d[i]!;
    }
  }
  return best;
}

function Legend({
  colouring,
  focused,
  units,
}: {
  colouring: RouteColouring;
  focused: AttemptAnalysis;
  units: UnitSystem;
}) {
  // Pieces are scored per 100 m; the legend reads per 100 m or per 0.1 mi.
  const perUnit = splitLength(units) / 10 / PIECE_LENGTH;
  const unitLabel = units === 'imperial' ? 's per 0.1 mi' : 's per 100 m';
  const seconds = (s: number) => formatNumber(s, Math.abs(s) < 10 ? 1 : 0, { trimZeros: true });
  const clip = colouring.clip * perUnit;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted" data-testid="route-legend">
      <span>
        {focused.label} vs baseline, {unitLabel}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-ahead">ahead {MINUS + seconds(clip)}</span>
        <span className="h-2 w-32 rounded-full bg-gradient-to-r from-ahead via-muted to-behind" />
        <span className="text-behind">+{seconds(clip)} behind</span>
      </div>
      <span>grey within ±{seconds(NEUTRAL_BAND * perUnit)}</span>
      <span className="flex items-center gap-2">
        <span className="w-6 border-t-2 border-dashed border-off-course" />
        off course
      </span>
    </div>
  );
}
