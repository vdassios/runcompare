/**
 * One row per attempt: colour, label, kind, baseline choice, distance and time, overlap,
 * warnings and remove. Edits go straight to the store; nothing here asks the browser for a dialog.
 */
import { useEffect, useRef, useState } from 'react';
import { formatDistance, formatDuration, formatPercent } from '../format';
import {
  DISTANCE_PRESETS,
  type AnalysisWarning,
  type Attempt,
  type AttemptAnalysis,
  type Baseline,
  type UnitSystem,
} from '../model/types';
import { useStore } from '../store/useStore';
import { ATTEMPT_PALETTE } from '../theme';
import { Badge, Button, Card, FOCUS_RING, Tooltip } from './ui';

const REMOVE_CONFIRM_MS = 3000;
const SHOW_OVERLAP_BELOW = 0.99;

export function AttemptList() {
  const attempts = useStore((s) => s.attempts);
  const baseline = useStore((s) => s.baseline);
  const analysis = useStore((s) => s.analysis);
  const units = useStore((s) => s.units);
  if (attempts.length === 0) return null;

  const analysed = new Map(analysis?.attempts.map((a) => [a.attemptId, a]));
  const warnings = analysis?.warnings ?? [];

  return (
    <Card>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-base font-semibold">Attempts</legend>
        <p className="mb-3 text-sm text-muted">
          Every attempt is compared with the baseline. Pick a GPS attempt to use its course.
        </p>
        {baseline?.kind === 'distance' && (
          <div className="mb-3">
            <Badge tone="accent">{distanceBaselineText(baseline, attempts, units)}</Badge>
          </div>
        )}
        <ul className="flex flex-col divide-y divide-border">
          {attempts.map((a) => (
            <AttemptRow
              key={a.id}
              attempt={a}
              analysis={analysed.get(a.id) ?? null}
              warnings={warnings.filter((w) => w.attemptId === a.id)}
              isBaseline={baseline?.kind === 'course' && baseline.attemptId === a.id}
              units={units}
            />
          ))}
        </ul>
      </fieldset>
    </Card>
  );
}

function distanceBaselineText(
  baseline: Extract<Baseline, { kind: 'distance' }>,
  attempts: Attempt[],
  units: UnitSystem,
): string {
  const distance =
    baseline.preset === 'custom' ? formatDistance(baseline.distance, units) : DISTANCE_PRESETS[baseline.preset].label;
  const label = attempts.find((a) => a.id === baseline.attemptId)?.label;
  return label ? `Baseline: ${distance} · ${label}` : `Baseline: ${distance}`;
}

/** Watch distance and elapsed time: the analysis metrics when available, else the raw file. */
function totals(attempt: Attempt, analysis: AttemptAnalysis | null): { distance: number; elapsed: number } {
  if (analysis?.metrics) return { distance: analysis.metrics.distance, elapsed: analysis.metrics.elapsed };
  if (attempt.kind === 'gps') {
    const { dist, t } = attempt.activity;
    return { distance: dist[dist.length - 1] ?? NaN, elapsed: t[t.length - 1] ?? NaN };
  }
  const last = attempt.splitSet.markers.at(-1);
  return { distance: last?.distance ?? NaN, elapsed: last?.time ?? NaN };
}

function kindLabel(attempt: Attempt): string {
  return attempt.kind === 'gps' ? attempt.activity.source.toUpperCase() : 'Splits';
}

interface RowProps {
  attempt: Attempt;
  analysis: AttemptAnalysis | null;
  warnings: AnalysisWarning[];
  isBaseline: boolean;
  units: UnitSystem;
}

function AttemptRow({ attempt, analysis, warnings, isBaseline, units }: RowProps) {
  const updateAttempt = useStore((s) => s.updateAttempt);
  const setBaseline = useStore((s) => s.setBaseline);
  const removeAttempt = useStore((s) => s.removeAttempt);
  const { distance, elapsed } = totals(attempt, analysis);
  const overlap = analysis?.overlap ?? null;

  return (
    <li data-attempt-id={attempt.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-2">
          {attempt.kind === 'gps' ? (
            <input
              type="radio"
              name="baseline"
              checked={isBaseline}
              onChange={() => setBaseline({ kind: 'course', attemptId: attempt.id })}
              aria-label={`Use ${attempt.label} as the baseline`}
              className={`h-4 w-4 shrink-0 accent-accent ${FOCUS_RING}`}
            />
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          <ColorPicker
            label={attempt.label}
            color={attempt.color}
            onPick={(color) => updateAttempt(attempt.id, { color })}
          />
          <LabelEditor label={attempt.label} onSave={(label) => updateAttempt(attempt.id, { label })} />
          <Badge>{kindLabel(attempt)}</Badge>
        </div>
        <RemoveButton label={attempt.label} onRemove={() => removeAttempt(attempt.id)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-sm text-muted">
        {isBaseline && <Badge tone="accent">Baseline</Badge>}
        <span>{formatDistance(distance, units)}</span>
        <span>{formatDuration(elapsed)}</span>
        {overlap !== null && overlap < SHOW_OVERLAP_BELOW && (
          <Tooltip content="Share of this attempt that follows the baseline course. Off-course stretches are left out of the comparison.">
            <span className="underline decoration-dotted underline-offset-2">{formatPercent(overlap)} overlap</span>
          </Tooltip>
        )}
        {warnings.length > 0 && <Warnings warnings={warnings} />}
      </div>
    </li>
  );
}

function Warnings({ warnings }: { warnings: AnalysisWarning[] }) {
  return (
    <details className="basis-full">
      <summary className={`w-fit cursor-pointer rounded font-medium text-text ${FOCUS_RING}`}>
        {warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`}
      </summary>
      <ul className="mt-1 list-disc pl-5 text-text">
        {warnings.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
    </details>
  );
}

function ColorPicker({ label, color, onPick }: { label: string; color: string; onPick(color: string): void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  return (
    <div
      className="relative shrink-0"
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Colour of ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-6 w-6 items-center justify-center rounded-full border border-border ${FOCUS_RING}`}
      >
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: color }} />
      </button>
      {open && (
        <div
          role="group"
          aria-label={`Colours for ${label}`}
          className="absolute left-0 top-full z-20 mt-1 grid w-max grid-cols-4 gap-1.5 rounded-md border border-border bg-surface p-2 shadow-md"
        >
          {ATTEMPT_PALETTE.map((c, i) => {
            const selected = c.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${i + 1}`}
                aria-pressed={selected}
                onClick={() => {
                  onPick(c);
                  close(true);
                }}
                className={`h-7 w-7 rounded-full ${selected ? 'ring-2 ring-text ring-offset-2 ring-offset-surface' : ''} ${FOCUS_RING}`}
                style={{ backgroundColor: c }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function LabelEditor({ label, onSave }: { label: string; onSave(label: string): void }) {
  const [editing, setEditing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  // Enter or Escape unmounts the input, and some browsers then fire blur: only the first outcome counts.
  const settled = useRef(false);

  // Return focus to the label after an edit, so keyboard users stay in place.
  useEffect(() => {
    if (wasEditing.current && !editing) buttonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Rename ${label}`}
        onClick={() => {
          settled.current = false;
          setEditing(true);
        }}
        className={`min-w-0 max-w-full truncate rounded text-left font-medium hover:underline ${FOCUS_RING}`}
      >
        {label}
      </button>
    );
  }

  const finish = (value: string | null) => {
    if (settled.current) return;
    settled.current = true;
    const next = value?.trim();
    if (next && next !== label) onSave(next);
    setEditing(false);
  };
  return (
    <input
      autoFocus
      defaultValue={label}
      aria-label="Attempt label"
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(e.currentTarget.value);
        if (e.key === 'Escape') finish(null);
      }}
      onFocus={(e) => e.currentTarget.select()}
      className={`min-w-0 flex-1 basis-40 rounded border border-border bg-background px-1.5 py-0.5 font-medium ${FOCUS_RING}`}
    />
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove(): void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), REMOVE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <Button
      variant={confirming ? 'secondary' : 'ghost'}
      size="sm"
      aria-label={confirming ? `Confirm removing ${label}` : `Remove ${label}`}
      onClick={() => (confirming ? onRemove() : setConfirming(true))}
      onBlur={() => setConfirming(false)}
      className={confirming ? 'border-text font-semibold' : ''}
    >
      {confirming ? 'Remove?' : 'Remove'}
    </Button>
  );
}
