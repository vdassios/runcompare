/**
 * Content of the shared hover readout: every attempt's values at one course distance,
 * formatted for display, with its delta against the baseline.
 */
import {
  NO_VALUE,
  formatDelta,
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
  formatPace,
} from '../../format';
import type { AnalysisResult, UnitSystem } from '../../model/types';
import { nearestIndex } from './lookup';

export interface ReadoutRow {
  attemptId: string;
  label: string;
  color: string;
  isBaseline: boolean;
  pace: string;
  gap: string | null;
  hr: string | null;
  cad: string | null;
  delta: string | null;
  /** 1 = behind, −1 = ahead, 0 = level; null for the baseline or a missing value. */
  deltaSign: 1 | -1 | 0 | null;
  estimated: boolean;
}

export interface Readout {
  distance: string;
  /** The baseline's elapsed time here. */
  time: string | null;
  elevation: string | null;
  /** Which optional columns any attempt has. */
  columns: { gap: boolean; hr: boolean; cad: boolean; delta: boolean };
  rows: ReadoutRow[];
}

function withUnit(v: number | undefined, unit: string): string {
  return v !== undefined && Number.isFinite(v) ? `${formatNumber(v)} ${unit}` : NO_VALUE;
}

export function hoverReadout(analysis: AnalysisResult, d: number, units: UnitSystem, showGap: boolean): Readout {
  const { grid, attempts } = analysis;
  const i = nearestIndex(grid.d, d);
  const baseline = attempts.find((a) => a.attemptId === analysis.baseline.attemptId);
  const rows = attempts.map((a): ReadoutRow => {
    const s = a.series;
    const delta = a.delta ? a.delta[i]! : null;
    const rounded = delta !== null && Number.isFinite(delta) ? Math.round(delta) : null;
    return {
      attemptId: a.attemptId,
      label: a.label,
      color: a.color,
      isBaseline: a.attemptId === analysis.baseline.attemptId,
      pace: formatPace(s.pace[i]!, units),
      gap: showGap && s.gap ? formatPace(s.gap[i]!, units) : null,
      hr: s.hr ? withUnit(s.hr[i], 'bpm') : null,
      cad: s.cad ? withUnit(s.cad[i], 'spm') : null,
      delta: delta === null ? null : formatDelta(delta),
      deltaSign: rounded === null ? null : rounded > 0 ? 1 : rounded < 0 ? -1 : 0,
      estimated: s.estimated[i] === 1,
    };
  });
  return {
    distance: formatDistance(grid.d[i]!, units),
    time: baseline ? formatDuration(baseline.series.time[i]!) : null,
    elevation: grid.ele ? formatElevation(grid.ele[i]!, units) : null,
    columns: {
      gap: rows.some((r) => r.gap !== null),
      hr: rows.some((r) => r.hr !== null),
      cad: rows.some((r) => r.cad !== null),
      delta: rows.some((r) => r.delta !== null),
    },
    rows,
  };
}
