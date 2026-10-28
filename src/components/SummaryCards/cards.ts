/**
 * The KPI cards as plain data: for each headline metric, every attempt's formatted value and its
 * delta against the baseline. Pure, so the sign, colour and hiding rules are tested without a DOM.
 */
import { MINUS, formatDelta, formatDuration, formatElevation, formatNumber, formatPercent } from '../../format';
import type { AnalysisResult, AttemptAnalysis, AttemptId, UnitSystem } from '../../model/types';

export type MetricId = 'time' | 'moving' | 'stopped' | 'ascent' | 'avgHr' | 'walking';

/** `behind`/`ahead` only for time-like metrics; the rest never judge. */
export type DeltaTone = 'behind' | 'ahead' | 'neutral';

export interface CardRow {
  attemptId: AttemptId;
  label: string;
  color: string;
  value: string;
  /** `null` when the baseline has no value for this metric, so there is nothing to compare with. */
  delta: { text: string; tone: DeltaTone } | 'baseline' | null;
  /** Walking share derived from speed and grade because the file has no cadence. */
  estimated: boolean;
}

export interface Card {
  id: MetricId;
  title: string;
  rows: CardRow[];
}

interface Metric {
  id: MetricId;
  title: string;
  timeLike: boolean;
  value(a: AttemptAnalysis): number | null;
  format(value: number, units: UnitSystem): string;
  formatDelta(delta: number, units: UnitSystem): string;
}

/** Prefixes "+" to a formatted positive difference that doesn't round to zero. */
function signed(text: string): string {
  return /[1-9]/.test(text) && !text.startsWith(MINUS) ? `+${text}` : text;
}

const bpm = (value: number) => `${formatNumber(value)} bpm`;
const duration = (value: number) => formatDuration(value);

/** A split set's finish is its interpolated time at the course end; GPS attempts use their elapsed time. */
function finishTime(a: AttemptAnalysis): number | null {
  if (a.kind === 'gps') return a.metrics?.elapsed ?? null;
  const t = a.series.time[a.series.time.length - 1];
  return t !== undefined && Number.isFinite(t) ? t : null;
}

const METRICS: readonly Metric[] = [
  { id: 'time', title: 'Time', timeLike: true, value: finishTime, format: duration, formatDelta },
  {
    id: 'moving',
    title: 'Moving time',
    timeLike: true,
    value: (a) => a.metrics?.moving ?? null,
    format: duration,
    formatDelta,
  },
  {
    id: 'stopped',
    title: 'Stopped',
    timeLike: true,
    value: (a) => a.metrics?.stopped ?? null,
    format: duration,
    formatDelta,
  },
  {
    id: 'ascent',
    title: 'D+',
    timeLike: false,
    value: (a) => a.metrics?.ascent ?? null,
    format: formatElevation,
    formatDelta: (d, units) => signed(formatElevation(d, units)),
  },
  {
    id: 'avgHr',
    title: 'Avg HR',
    timeLike: false,
    value: (a) => a.metrics?.avgHr ?? null,
    format: bpm,
    formatDelta: (d) => signed(bpm(d)),
  },
  {
    id: 'walking',
    title: 'Walking',
    timeLike: false,
    value: (a) => a.metrics?.walkingShare ?? null,
    format: (share) => formatPercent(share),
    formatDelta: (d) => formatPercent(d, { sign: true }),
  },
];

function tone(metric: Metric, delta: number): DeltaTone {
  if (!metric.timeLike || Math.round(delta) === 0) return 'neutral';
  return delta > 0 ? 'behind' : 'ahead';
}

/** Cards in display order. A card whose every value is null is left out, as is a row whose value is null. */
export function summaryCards(analysis: AnalysisResult, units: UnitSystem): Card[] {
  const baselineId = analysis.baseline.attemptId;
  const baseline = analysis.attempts.find((a) => a.attemptId === baselineId);

  return METRICS.flatMap((metric) => {
    const baselineValue = baseline ? metric.value(baseline) : null;
    const rows = analysis.attempts.flatMap((a): CardRow[] => {
      const value = metric.value(a);
      if (value === null) return [];
      let delta: CardRow['delta'] = null;
      if (a.attemptId === baselineId) {
        delta = 'baseline';
      } else if (baselineValue !== null) {
        const d = value - baselineValue;
        delta = { text: metric.formatDelta(d, units), tone: tone(metric, d) };
      }
      return [
        {
          attemptId: a.attemptId,
          label: a.label,
          color: a.color,
          value: metric.format(value, units),
          delta,
          estimated: metric.id === 'walking' && (a.metrics?.walkingEstimated ?? false),
        },
      ];
    });
    return rows.length > 0 ? [{ id: metric.id, title: metric.title, rows }] : [];
  });
}
