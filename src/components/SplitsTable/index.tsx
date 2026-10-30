/**
 * Splits table (PLAN §5.9, §6.7): per km or mile, per baseline lap, or per climb, with the
 * baseline's time and pace and, for every other attempt, its time and heat-coloured delta.
 * Hovering a row highlights its range on the charts and map; clicking zooms to it.
 */
import { Fragment, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { Split } from '../../analysis/splits';
import { formatDelta, formatDistance, formatDuration, formatPace } from '../../format';
import type { UnitSystem } from '../../model/types';
import { useStore } from '../../store/useStore';
import { availableModes, buildSplitsTable, heat, type SplitsMode, type SplitsRow } from './table';

const KIND_LABEL: Record<SplitsRow['kind'], string> = { split: '', lap: 'Lap', climb: 'Climb', descent: 'Descent' };
const NOT_COMPARABLE = 'Not comparable: an attempt left the course in this split';
const ESTIMATED = 'Estimated: interpolated between split markers';

/** "11.0–12.0 km": both ends formatted, the unit kept once. */
function formatRange(from: number, to: number, units: UnitSystem, decimals: number): string {
  const a = formatDistance(from, units, { decimals });
  const b = formatDistance(to, units, { decimals });
  const unit = b.slice(b.lastIndexOf(' '));
  return a.endsWith(unit) ? `${a.slice(0, -unit.length)}–${b}` : `${a}–${b}`;
}

function rowLabel(row: SplitsRow, units: UnitSystem): string {
  const name = row.kind === 'split' ? String(row.number) : `${KIND_LABEL[row.kind]} ${row.number}`;
  return `${name} · ${formatRange(row.from, row.to, units, row.kind === 'split' ? 1 : 2)}`;
}

function modeLabel(mode: SplitsMode, units: UnitSystem): string {
  if (mode === 'distance') return units === 'imperial' ? 'Per mile' : 'Per km';
  return mode === 'laps' ? 'Laps' : 'Climbs';
}

function heatStyle(split: Split, maxRate: number): CSSProperties | undefined {
  const h = heat(split, maxRate);
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

function EstimatedMarker() {
  return (
    <abbr title={ESTIMATED} className="ml-1 text-xs text-estimated" data-estimated="">
      est.
    </abbr>
  );
}

const CELL = 'whitespace-nowrap px-3 py-1.5 text-right';
const STICKY = 'sticky left-0 z-10 bg-surface text-left';

export function SplitsTable() {
  const analysis = useStore((s) => s.analysis);
  const units = useStore((s) => s.units);
  const setHighlights = useStore((s) => s.setHighlights);
  const setZoom = useStore((s) => s.setZoom);
  const [chosen, setChosen] = useState<SplitsMode>('distance');

  const modes = useMemo(() => (analysis ? availableModes(analysis) : []), [analysis]);
  const mode = modes.includes(chosen) ? chosen : 'distance';
  const table = useMemo(() => (analysis ? buildSplitsTable(analysis, mode, units) : null), [analysis, mode, units]);

  if (!analysis || !table || table.columns.length === 0) return null;
  const [baseline, ...others] = table.columns;
  const length = analysis.grid.length;

  const rowHandlers = (row: SplitsRow) => {
    const range = { from: row.from, to: row.to };
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

  const timeCell = (split: Split) => (
    <>
      {formatDuration(split.time)}
      {split.estimated && <EstimatedMarker />}
    </>
  );

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">Splits</h2>
        <div role="group" aria-label="Split by" className="inline-flex rounded-md border border-border p-0.5 text-sm">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === mode}
              data-mode={m}
              onClick={() => setChosen(m)}
              className={`rounded px-3 py-1 ${m === mode ? 'bg-accent text-surface' : 'text-muted hover:text-text'}`}
            >
              {modeLabel(m, units)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-muted">
            <tr>
              <th rowSpan={2} scope="col" className={`${STICKY} px-3 py-1.5 align-bottom font-medium`}>
                Split
              </th>
              {table.columns.map((a) => (
                <th
                  key={a.attemptId}
                  colSpan={2}
                  scope="colgroup"
                  className="whitespace-nowrap px-3 pt-2 text-right font-medium text-text"
                >
                  <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                  {a.label}
                  {a === baseline && <span className="ml-1 font-normal text-muted">(baseline)</span>}
                </th>
              ))}
            </tr>
            <tr className="border-b border-border">
              <th scope="col" className={`${CELL} font-medium`}>
                Time
              </th>
              <th scope="col" className={`${CELL} font-medium`}>
                Pace
              </th>
              {others.map((a) => (
                <Fragment key={a.attemptId}>
                  <th scope="col" className={`${CELL} font-medium`}>
                    Time
                  </th>
                  <th scope="col" className={`${CELL} font-medium`}>
                    Delta
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const [base, ...rest] = row.cells;
              return (
                <tr
                  key={row.key}
                  tabIndex={0}
                  data-row={row.key}
                  data-off-course={row.offCourse || undefined}
                  className={`group cursor-pointer border-b border-border/60 outline-none hover:bg-background focus-visible:bg-background ${
                    row.offCourse ? 'text-off-course' : ''
                  }`}
                  {...rowHandlers(row)}
                >
                  <th
                    scope="row"
                    className={`${STICKY} whitespace-nowrap px-3 py-1.5 font-normal group-hover:bg-background group-focus-visible:bg-background`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {rowLabel(row, units)}
                      {row.offCourse && <NotComparableIcon />}
                    </span>
                  </th>
                  <td className={CELL}>{base && timeCell(base)}</td>
                  <td className={CELL}>{base && formatPace(base.time / (base.to - base.from), units)}</td>
                  {rest.map((cell, i) => (
                    <SplitCells key={others[i]!.attemptId} cell={cell} maxRate={table.maxRate} time={timeCell(cell)} />
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr data-row="total" className="border-t-2 border-border font-semibold">
              <th scope="row" className={`${STICKY} whitespace-nowrap px-3 py-1.5`}>
                {mode === 'climbs' ? 'Course total' : 'Total'}
              </th>
              <td className={CELL}>{formatDuration(table.totals[0]!.time)}</td>
              <td className={CELL}>{formatPace(table.totals[0]!.time / length, units)}</td>
              {table.totals.slice(1).map((total, i) => (
                <TotalCells key={others[i]!.attemptId} total={total} />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SplitCells({ cell, maxRate, time }: { cell: Split; maxRate: number; time: ReactNode }) {
  return (
    <>
      <td className={CELL}>{time}</td>
      <td className={CELL} style={heatStyle(cell, maxRate)} data-delta="">
        {cell.delta === null ? '' : formatDelta(cell.delta)}
      </td>
    </>
  );
}

function TotalCells({ total }: { total: Split }) {
  return (
    <>
      <td className={CELL}>{formatDuration(total.time)}</td>
      <td className={CELL} data-delta="">
        {total.delta === null ? '' : formatDelta(total.delta)}
      </td>
    </>
  );
}
