/**
 * The baseline's elevation profile docked under the route map. Steep stretches are shaded behind
 * it, and it shares the hover distance and highlight ranges with the map and the charts.
 */
import { useMemo, type PointerEvent } from 'react';
import { interpolateAt } from '../../analysis/interp';
import { formatDistance, formatElevation, formatPercent } from '../../format';
import type { CourseGrid, UnitSystem } from '../../model/types';
import { useStore } from '../../store/useStore';
import type { ColorToken } from '../../theme';
import { GRADE_STEPS, PROFILE_HEIGHT, elevationProfile } from './profile';

const BAND_OPACITY = [0.14, 0.28, 0.46] as const;

export function ElevationProfile({
  grid,
  units,
  colors,
}: {
  grid: CourseGrid;
  units: UnitSystem;
  colors: Readonly<Record<ColorToken, string>>;
}) {
  const profile = useMemo(() => elevationProfile(grid), [grid]);
  const hoverDistance = useStore((s) => s.hoverDistance);
  const ranges = useStore((s) => s.highlightRanges);
  const setHover = useStore((s) => s.setHover);

  if (!profile) return null;
  const { length } = profile;

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width > 0) setHover(Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1) * length);
  };
  const hovering = hoverDistance !== null && hoverDistance >= 0 && hoverDistance <= length;

  return (
    <div className="relative h-24 border-t border-border md:h-32" data-testid="elevation-profile">
      <svg
        className="block h-full w-full touch-pan-y"
        viewBox={`0 0 ${length} ${PROFILE_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Elevation profile, ${formatElevation(profile.minEle, units)} to ${formatElevation(profile.maxEle, units)}`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        {profile.bands.map((b) => (
          <rect
            key={b.from}
            data-level={b.level}
            x={b.from}
            width={b.to - b.from}
            y={0}
            height={PROFILE_HEIGHT}
            fill={colors.accent}
            fillOpacity={BAND_OPACITY[b.level - 1]}
          />
        ))}
        <path d={profile.area} fill={colors.muted} />
        {ranges.map((r, i) => (
          <rect
            key={i}
            x={r.from}
            width={r.to - r.from}
            y={0}
            height={PROFILE_HEIGHT}
            fill={colors.accent}
            fillOpacity={0.25}
          />
        ))}
        {hovering && (
          <line
            x1={hoverDistance}
            x2={hoverDistance}
            y1={0}
            y2={PROFILE_HEIGHT}
            stroke={colors.text}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <span className="pointer-events-none absolute right-2 top-1 text-xs text-muted">
        {formatElevation(profile.maxEle, units)}
      </span>
      <span className="pointer-events-none absolute bottom-1 right-2 text-xs text-muted">
        {formatElevation(profile.minEle, units)}
      </span>
      {hovering ? (
        <span className="pointer-events-none absolute left-2 top-1 rounded bg-surface/85 px-1.5 text-xs tabular-nums">
          {formatDistance(hoverDistance, units)} ·{' '}
          {formatElevation(interpolateAt(grid.d, grid.ele!, hoverDistance), units)}
          {grid.grade && ` · ${formatPercent(interpolateAt(grid.d, grid.grade, hoverDistance))}`}
        </span>
      ) : (
        <GradeKey colors={colors} />
      )}
    </div>
  );
}

function GradeKey({ colors }: { colors: Readonly<Record<ColorToken, string>> }) {
  return (
    <span className="pointer-events-none absolute left-2 top-1 flex gap-2 text-xs text-muted">
      {GRADE_STEPS.map((g, i) => (
        <span key={g} className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: colors.accent, opacity: BAND_OPACITY[i] }}
          />
          &gt;{formatPercent(g)}
        </span>
      ))}
    </span>
  );
}
