/**
 * The splits table as data: which modes are offered, one row per split with a cell per attempt
 * (baseline first), the course totals, and the heat scale for the delta cells. Pure, so it can be
 * tested on the fixtures without rendering.
 */
import { computeSplits, distanceBoundaries, lapBoundaries, segmentBoundaries, type Split } from '../../analysis/splits';
import { splitLength } from '../../format';
import type { AnalysisResult, AttemptAnalysis, CourseLap, UnitSystem } from '../../model/types';

export type SplitsMode = 'distance' | 'laps' | 'climbs';

export interface SplitsRow {
  key: string;
  kind: 'split' | 'lap' | 'climb' | 'descent';
  number: number; // 1-based, counted per kind
  from: number; // course m
  to: number;
  cells: Split[]; // one per column
  offCourse: boolean; // any attempt left the course in this split
}

export interface SplitsTableData {
  columns: AttemptAnalysis[]; // the baseline, then the other attempts in input order
  rows: SplitsRow[];
  totals: Split[]; // whole course, one per column
  maxRate: number; // largest |delta| per metre over comparable cells; 0 when there is none
}

export function baselineOf(analysis: AnalysisResult): AttemptAnalysis | undefined {
  return analysis.attempts.find((a) => a.attemptId === analysis.baseline.attemptId);
}

/** Distance always; laps when the baseline has 2 or more; climbs when there are segments. */
export function availableModes(analysis: AnalysisResult): SplitsMode[] {
  const modes: SplitsMode[] = ['distance'];
  if ((baselineOf(analysis)?.laps.length ?? 0) >= 2) modes.push('laps');
  if (analysis.segments.length > 0) modes.push('climbs');
  return modes;
}

/**
 * Lap starts only: a watch leaves a few metres between one lap's last sample and the next lap's
 * first, and using both edges would add a sliver row between every pair of laps.
 */
function lapStartBoundaries(laps: CourseLap[], length: number): number[] {
  return lapBoundaries(
    laps.map((lap) => ({ ...lap, to: lap.from })),
    length,
  );
}

/** Rate of a cell for the heat colour: delta per metre of split, or NaN when it has none. */
export function deltaRate(split: Split): number {
  if (split.delta === null || split.offCourse || !(split.to > split.from)) return NaN;
  return split.delta / (split.to - split.from);
}

export function buildSplitsTable(analysis: AnalysisResult, mode: SplitsMode, units: UnitSystem): SplitsTableData {
  const { grid } = analysis;
  const baseline = baselineOf(analysis);
  const columns = baseline ? [baseline, ...analysis.attempts.filter((a) => a !== baseline)] : [...analysis.attempts];
  const splitsFor = (boundaries: number[]) => columns.map((a) => computeSplits(grid, a.series, a.delta, boundaries));

  type Span = Pick<SplitsRow, 'kind' | 'number'> & { cells: Split[] };
  let spans: Span[];
  if (mode === 'climbs') {
    const counts = { climb: 0, descent: 0 };
    spans = segmentBoundaries(analysis.segments).map((pair, i) => {
      const kind = analysis.segments[i]!.kind;
      return { kind, number: ++counts[kind], cells: splitsFor(pair).map((s) => s[0]!) };
    });
  } else {
    const kind = mode === 'laps' ? 'lap' : 'split';
    const boundaries =
      mode === 'laps'
        ? lapStartBoundaries(baseline?.laps ?? [], grid.length)
        : distanceBoundaries(grid.length, splitLength(units));
    const perColumn = splitsFor(boundaries);
    spans = boundaries.slice(1).map((_, i) => ({ kind, number: i + 1, cells: perColumn.map((s) => s[i]!) }));
  }

  const rows = spans.map(({ kind, number, cells }) => ({
    key: `${kind}-${number}`,
    kind,
    number,
    from: cells[0]?.from ?? 0,
    to: cells[0]?.to ?? 0,
    cells,
    offCourse: cells.some((c) => c.offCourse),
  }));

  let maxRate = 0;
  for (const row of rows) {
    for (const cell of row.cells) {
      const rate = Math.abs(deltaRate(cell));
      if (rate > maxRate) maxRate = rate;
    }
  }

  // Split deltas telescope, so in distance and laps modes the rows add up to these totals.
  const totals = splitsFor([0, grid.length]).map((s) => s[0]!);
  return { columns, rows, totals, maxRate };
}

/**
 * Largest tint alpha. The tokens at this alpha over the surface keep body text at 4.5:1 or more
 * in both themes (table.test.ts checks it), so the strongest cell is still readable.
 */
export const MAX_HEAT_ALPHA = 0.45;

/** Background tint for a delta cell: orange behind, blue ahead, alpha scaled to the table's largest rate. */
export function heat(split: Split, maxRate: number): { token: 'behind' | 'ahead'; alpha: number } | null {
  const rate = deltaRate(split);
  if (!Number.isFinite(rate) || rate === 0 || !(maxRate > 0)) return null;
  return {
    token: rate > 0 ? 'behind' : 'ahead',
    alpha: (MAX_HEAT_ALPHA * Math.min(Math.abs(rate), maxRate)) / maxRate,
  };
}
