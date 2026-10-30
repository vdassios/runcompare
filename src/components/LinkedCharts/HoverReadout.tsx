/**
 * The one shared tooltip for the chart stack: every attempt's values at the hovered course
 * distance, floated beside the crosshair on the side with more room.
 */
import type { Readout } from './readout';

const GAP = 14;

export function HoverReadout({
  readout,
  x,
  width,
  y,
}: {
  readout: Readout;
  x: number;
  width: number;
  y: number | null;
}) {
  const { columns } = readout;
  const onLeft = x > width / 2;
  return (
    <div
      role="status"
      aria-live="off"
      className="pointer-events-none absolute z-10 min-w-48 rounded-md border border-border bg-surface/95 px-3 py-2 text-xs text-text shadow-lg"
      style={{
        left: onLeft ? x - GAP : x + GAP,
        top: y === null ? 4 : y + GAP,
        transform: onLeft ? 'translateX(-100%)' : undefined,
      }}
    >
      <div className="mb-1.5 flex items-baseline gap-2 whitespace-nowrap">
        <span className="font-semibold tabular-nums">{readout.distance}</span>
        {readout.time && <span className="tabular-nums text-muted">{readout.time}</span>}
        {readout.elevation && <span className="tabular-nums text-muted">↑ {readout.elevation}</span>}
      </div>
      <table className="border-separate border-spacing-x-2 tabular-nums">
        <tbody>
          {readout.rows.map((r) => (
            <tr key={r.attemptId} className="whitespace-nowrap">
              <td className="pl-0">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                  {r.label}
                  {r.estimated && <span className="text-estimated">est.</span>}
                </span>
              </td>
              <td className="text-right">{r.pace}</td>
              {columns.gap && <td className="text-right text-muted">{r.gap ?? ''}</td>}
              {columns.hr && <td className="text-right">{r.hr ?? ''}</td>}
              {columns.cad && <td className="text-right">{r.cad ?? ''}</td>}
              {columns.delta && (
                <td
                  className={`pr-0 text-right font-medium ${
                    r.deltaSign === 1 ? 'text-behind' : r.deltaSign === -1 ? 'text-ahead' : 'text-muted'
                  }`}
                >
                  {r.isBaseline ? 'baseline' : (r.delta ?? '')}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
