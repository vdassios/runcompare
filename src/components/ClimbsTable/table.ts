/**
 * The climbs table as data (PLAN §5.10): one row per climb or descent with a cell per attempt
 * (baseline first) from `segmentStats`, the heat scale for the delta cells, and the sort. Pure, so
 * it can be tested on the fixtures without rendering.
 */
import { bisectLeft, bisectRight } from 'd3-array';
import { segmentStats } from '../../analysis/segments';
import type { Split } from '../../analysis/splits';
import type { AnalysisResult, AttemptAnalysis, CourseSegment } from '../../model/types';
import { baselineOf, deltaRate } from '../SplitsTable/table';

export type SegmentFilter = 'both' | 'climb' | 'descent';

/** A `Split`, so the splits table's heat scale applies, plus the vertical rate. */
export interface ClimbCell extends Split {
  rate: number | null; // m/h: VAM on a climb, descent rate on a descent
}

export interface ClimbsRow {
  key: string;
  segment: CourseSegment;
  number: number; // 1-based, counted per kind in course order whatever the filter
  cells: ClimbCell[]; // one per column
  offCourse: boolean; // any attempt left the course on this segment
}

export interface ClimbsTableData {
  columns: AttemptAnalysis[]; // the baseline, then the other attempts in input order
  rows: ClimbsRow[]; // course order
  maxRate: number; // largest |delta| per metre over comparable cells; 0 when there is none
}

/** `segment` is course order; otherwise the value of one attempt's column. */
export type SortColumn = { field: 'segment' } | { field: 'time' | 'delta' | 'rate'; attemptId: string };
export interface Sort {
  column: SortColumn;
  descending: boolean;
}

function cell(analysis: AnalysisResult, attempt: AttemptAnalysis, seg: CourseSegment): ClimbCell {
  const { grid } = analysis;
  const stats = segmentStats(seg, grid, attempt.series, attempt.delta);
  const lo = bisectLeft(grid.d, seg.from);
  const hi = bisectRight(grid.d, seg.to);
  return {
    from: seg.from,
    to: seg.to,
    time: stats.time,
    delta: stats.delta,
    offCourse: stats.offCourse,
    estimated: attempt.series.estimated.subarray(lo, hi).includes(1),
    rate: stats.vam ?? stats.descentRate,
  };
}

export function buildClimbsTable(analysis: AnalysisResult, filter: SegmentFilter): ClimbsTableData {
  const baseline = baselineOf(analysis);
  const columns = baseline ? [baseline, ...analysis.attempts.filter((a) => a !== baseline)] : [...analysis.attempts];

  const counts = { climb: 0, descent: 0 };
  const rows: ClimbsRow[] = [];
  for (const segment of analysis.segments) {
    const number = ++counts[segment.kind];
    if (filter !== 'both' && segment.kind !== filter) continue;
    const cells = columns.map((a) => cell(analysis, a, segment));
    rows.push({ key: `${segment.kind}-${number}`, segment, number, cells, offCourse: cells.some((c) => c.offCourse) });
  }

  let maxRate = 0;
  for (const row of rows) for (const c of row.cells) maxRate = Math.max(maxRate, Math.abs(deltaRate(c)) || 0);
  return { columns, rows, maxRate };
}

/** Delta of the focused attempt, largest loss first; course order when there is nothing to compare. */
export function defaultSort(columns: AttemptAnalysis[], focusAttemptId: string | null): Sort {
  const others = columns.slice(1);
  const focus = others.find((a) => a.attemptId === focusAttemptId) ?? others[0];
  return focus
    ? { column: { field: 'delta', attemptId: focus.attemptId }, descending: true }
    : { column: { field: 'segment' }, descending: false };
}

/** Sort value of a row; null sorts last in either direction. Off-course cells aren't comparable. */
function sortValue(row: ClimbsRow, column: SortColumn, columns: AttemptAnalysis[]): number | null {
  if (column.field === 'segment') return row.segment.from;
  const c = row.cells[columns.findIndex((a) => a.attemptId === column.attemptId)];
  if (!c || c.offCourse) return null;
  const value = c[column.field];
  return value !== null && Number.isFinite(value) ? value : null;
}

export function sortRows(rows: ClimbsRow[], sort: Sort, columns: AttemptAnalysis[]): ClimbsRow[] {
  const keyed = rows.map((row) => ({ row, value: sortValue(row, sort.column, columns) }));
  keyed.sort((a, b) => {
    if (a.value === null || b.value === null) return a.value === null ? (b.value === null ? 0 : 1) : -1;
    return sort.descending ? b.value - a.value : a.value - b.value;
  });
  return keyed.map((k) => k.row);
}
