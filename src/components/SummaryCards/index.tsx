/**
 * KPI cards: one card per headline metric, each listing every attempt's value and its delta
 * against the baseline. The rules live in cards.ts; this file only lays them out.
 */
import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { summaryCards, type CardRow, type DeltaTone } from './cards';

export const ESTIMATED_TOOLTIP = 'No cadence in this file — estimated from speed and grade';

const TONE_CLASS: Record<DeltaTone, string> = {
  behind: 'text-behind',
  ahead: 'text-ahead',
  neutral: 'text-muted',
};

// Plain elements until task 10's src/components/ui primitives (card, badge, tooltip) land.
function Row({ row }: { row: CardRow }) {
  return (
    <li data-attempt={row.attemptId} className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
      <span className="min-w-0 flex-1 truncate text-text">{row.label}</span>
      {row.estimated && (
        <span
          data-badge="estimated"
          title={ESTIMATED_TOOLTIP}
          className="shrink-0 cursor-help rounded bg-estimated/15 px-1.5 py-0.5 text-xs font-medium text-estimated"
        >
          estimated<span className="sr-only">: {ESTIMATED_TOOLTIP}</span>
        </span>
      )}
      <span data-value className="shrink-0 font-medium tabular-nums text-text">
        {row.value}
      </span>
      {row.delta === 'baseline' ? (
        <span data-delta className="min-w-[4.5rem] shrink-0 text-right text-xs text-muted">
          baseline
        </span>
      ) : (
        <span
          data-delta
          data-tone={row.delta?.tone}
          className={`min-w-[4.5rem] shrink-0 text-right tabular-nums ${row.delta ? TONE_CLASS[row.delta.tone] : ''}`}
        >
          {row.delta?.text}
        </span>
      )}
    </li>
  );
}

export function SummaryCards() {
  const analysis = useStore((s) => s.analysis);
  const units = useStore((s) => s.units);
  const cards = useMemo(() => (analysis ? summaryCards(analysis, units) : []), [analysis, units]);
  if (cards.length === 0) return null;

  return (
    <div>
      <h2 className="sr-only">Summary</h2>
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 min-[769px]:grid-cols-3">
        {cards.map((card) => (
          <article key={card.id} data-card={card.id} className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-medium text-muted">{card.title}</h3>
            <ul className="space-y-2">
              {card.rows.map((row) => (
                <Row key={row.attemptId} row={row} />
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
