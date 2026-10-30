/**
 * Climbs table (PLAN §5.10, §6.8): one row per climb or descent with, for every attempt, its time,
 * its heat-coloured delta against the baseline and its VAM or descent rate. Sortable by any
 * column; hovering a row highlights its range on the charts and map, clicking zooms to it.
 */
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  MINUS,
  formatDelta,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPercent,
  formatVam,
} from '../../format';
import type { AttemptAnalysis, UnitSystem } from '../../model/types';
import { useStore } from '../../store/useStore';
import { heat } from '../SplitsTable/table';
import { Card, FOCUS_RING, Toggle } from '../ui';
import {
  buildClimbsTable,
  defaultSort,
  sortRows,
  type ClimbCell,
  type ClimbsRow,
  type SegmentFilter,
  type Sort,
  type SortColumn,
} from './table';

const NOT_COMPARABLE = 'Not comparable: an attempt left the course on this stretch';
const ESTIMATED = 'Estimated: interpolated between split markers';
const RATE_HINT = 'Vertical speed: height climbed or descended per hour';

const FILTERS: readonly { value: SegmentFilter; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'climb', label: 'Climbs' },
  { value: 'descent', label: 'Descents' },
];
const RATE_LABEL: Record<SegmentFilter, string> = { both: 'VAM / descent', climb: 'VAM', descent: 'Descent rate' };

type Field = 'time' | 'delta' | 'rate';
const SEGMENT: SortColumn = { field: 'segment' };

/** "18.4–22.1 km": both ends formatted, the unit kept once. */
function formatRange(from: number, to: number, units: UnitSystem): string {
  const a = formatDistance(from, units, { decimals: 1 });
  const b = formatDistance(to, units, { decimals: 1 });
  const unit = b.slice(b.lastIndexOf(' '));
  return a.endsWith(unit) ? `${a.slice(0, -unit.length)}–${b}` : `${a}–${b}`;
}

/** ["Climb 3", "18.4–22.1 km · +412 m · 9%"]; the grade is rounded to a whole percent. */
function rowLabel({ segment, number }: ClimbsRow, units: UnitSystem): [string, string] {
  const name = `${segment.kind === 'climb' ? 'Climb' : 'Descent'} ${number}`;
  const change = formatElevation(segment.elevationChange, units);
  const sign = change.startsWith(MINUS) ? '' : '+';
  const grade = formatPercent(Math.round(segment.avgGrade * 100) / 100);
  return [name, `${formatRange(segment.from, segment.to, units)} · ${sign}${change} · ${grade}`];
}

function columnId(column: SortColumn): string {
  return column.field === 'segment' ? 'segment' : `${column.attemptId}:${column.field}`;
}

/** The sub-columns an attempt gets: the baseline has no delta, a split set no vertical rate. */
function fieldsOf(a: AttemptAnalysis, baseline: AttemptAnalysis | undefined): Field[] {
  if (a === baseline) return ['time', 'rate'];
  return a.kind === 'splits' ? ['time', 'delta'] : ['time', 'delta', 'rate'];
}

function heatStyle(c: ClimbCell, maxRate: number): CSSProperties | undefined {
  const h = heat(c, maxRate);
  return h ? { backgroundColor: `rgb(var(--rc-${h.token}) / ${h.alpha.toFixed(3)})` } : undefined;
}

function NotComparableIcon() {
  return (
    <span role="img" aria-label={NOT_COMPARABLE} title={NOT_COMPARABLE} className="inline-flex text-off-course">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M3.6 12.4l8.8-8.8" />
      </svg>
    </span>
  );
}

const CELL = 'whitespace-nowrap px-3 py-1.5 text-right';
const STICKY = 'sticky left-0 z-10 bg-surface text-left';

export function ClimbsTable() {
  const analysis = useStore((s) => s.analysis);
  const units = useStore((s) => s.units);
  const focusAttemptId = useStore((s) => s.focusAttemptId);
  const setHighlights = useStore((s) => s.setHighlights);
  const setZoom = useStore((s) => s.setZoom);
  const [filter, setFilter] = useState<SegmentFilter>('both');
  const [chosenSort, setChosenSort] = useState<Sort | null>(null);

  const table = useMemo(
    () => (analysis && analysis.segments.length > 0 ? buildClimbsTable(analysis, filter) : null),
    [analysis, filter],
  );
  if (!table) return null;

  const { columns, maxRate } = table;
  const baseline = columns[0];
  // A chosen sort on an attempt that has since been removed falls back to the default.
  const chosen = chosenSort?.column;
  const sort =
    chosenSort && (chosen?.field === 'segment' || columns.some((a) => a.attemptId === chosen?.attemptId))
      ? chosenSort
      : defaultSort(columns, focusAttemptId);
  const rows = sortRows(table.rows, sort, columns);
  const fieldLabel: Record<Field, string> = { time: 'Time', delta: 'Delta', rate: RATE_LABEL[filter] };

  const isSorted = (column: SortColumn) => columnId(column) === columnId(sort.column);
  const ariaSort = (column: SortColumn) =>
    isSorted(column) ? (sort.descending ? 'descending' : 'ascending') : undefined;
  // A new column sorts largest first, except course order; the sorted column flips direction.
  const onSort = (column: SortColumn) =>
    setChosenSort({ column, descending: isSorted(column) ? !sort.descending : column.field !== 'segment' });

  const sortButton = (column: SortColumn, label: string) => (
    <button
      type="button"
      data-sort={columnId(column)}
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 rounded hover:text-text ${isSorted(column) ? 'text-text' : ''} ${FOCUS_RING}`}
    >
      {label}
      <span aria-hidden="true" className="w-2.5 text-xs">
        {isSorted(column) ? (sort.descending ? '↓' : '↑') : ''}
      </span>
    </button>
  );

  const rowHandlers = (row: ClimbsRow) => {
    const range = { from: row.segment.from, to: row.segment.to };
    const zoom = () => setZoom(range);
    return {
      onMouseEnter: () => setHighlights([range]),
      onMouseLeave: () => setHighlights([]),
      onFocus: () => setHighlights([range]),
      onBlur: () => setHighlights([]),
      onClick: zoom,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        zoom();
      },
    };
  };

  const cellFor = (a: AttemptAnalysis, field: Field, c: ClimbCell) => {
    const key = `${a.attemptId}:${field}`;
    if (field === 'time') {
      return (
        <td key={key} className={CELL}>
          {formatDuration(c.time)}
          {c.estimated && (
            <abbr title={ESTIMATED} className="ml-1 text-xs text-estimated" data-estimated="">
              est.
            </abbr>
          )}
        </td>
      );
    }
    if (field === 'delta') {
      return (
        <td key={key} className={CELL} style={heatStyle(c, maxRate)} data-delta="">
          {c.delta === null ? '' : formatDelta(c.delta)}
        </td>
      );
    }
    return (
      <td key={key} className={CELL} data-rate="">
        {formatVam(c.rate ?? NaN, units)}
      </td>
    );
  };

  return (
    <Card
      title="Climbs and descents"
      actions={<Toggle<SegmentFilter> legend="Show" value={filter} options={FILTERS} onChange={setFilter} />}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No {filter === 'climb' ? 'climbs' : 'descents'} on this course.</p>
      ) : (
        <div className="-mx-4 -mb-4 overflow-x-auto rounded-b-lg border-t border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="text-muted">
              <tr>
                <th
                  rowSpan={2}
                  scope="col"
                  aria-sort={ariaSort(SEGMENT)}
                  className={`${STICKY} px-3 py-1.5 align-bottom font-medium`}
                >
                  {sortButton(SEGMENT, 'Segment')}
                </th>
                {columns.map((a) => (
                  <th
                    key={a.attemptId}
                    colSpan={fieldsOf(a, baseline).length}
                    scope="colgroup"
                    className="whitespace-nowrap px-3 pt-2 text-right font-medium text-text"
                  >
                    <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                    {a.label}
                    {a === baseline && <span className="ml-1 font-normal text-muted">(baseline)</span>}
                    {a.kind === 'splits' && <span className="ml-1 font-normal text-estimated">(estimated)</span>}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border">
                {columns.flatMap((a) =>
                  fieldsOf(a, baseline).map((field) => {
                    const column: SortColumn = { field, attemptId: a.attemptId };
                    return (
                      <th
                        key={columnId(column)}
                        scope="col"
                        aria-sort={ariaSort(column)}
                        title={field === 'rate' ? RATE_HINT : undefined}
                        className={`${CELL} font-medium`}
                      >
                        {sortButton(column, fieldLabel[field])}
                      </th>
                    );
                  }),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const [name, details] = rowLabel(row, units);
                return (
                  <tr
                    key={row.key}
                    tabIndex={0}
                    data-row={row.key}
                    data-off-course={row.offCourse || undefined}
                    className={`group cursor-pointer border-b border-border/60 outline-none last:border-b-0 hover:bg-background focus-visible:bg-background ${
                      row.offCourse ? 'text-off-course' : ''
                    }`}
                    {...rowHandlers(row)}
                  >
                    <th
                      scope="row"
                      className={`${STICKY} whitespace-nowrap px-3 py-1.5 font-normal group-hover:bg-background group-focus-visible:bg-background`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {/* Two lines on phones so the sticky column stays narrow; one line from `sm`. */}
                        <span>
                          <span className="block font-medium sm:inline">{name}</span>
                          <span className="hidden sm:inline"> · </span>
                          <span className="block text-xs text-muted sm:inline sm:text-sm">{details}</span>
                        </span>
                        {row.offCourse && <NotComparableIcon />}
                      </span>
                    </th>
                    {columns.flatMap((a, i) => fieldsOf(a, baseline).map((field) => cellFor(a, field, row.cells[i]!)))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
