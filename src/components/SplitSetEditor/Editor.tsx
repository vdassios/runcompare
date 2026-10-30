/**
 * "Add a split set": a pro's splits or a goal, typed as rows, pasted, or built from a target time,
 * then added to the comparison, used to update an existing split-set attempt, or saved to the
 * library. Which attempt is being edited is component state; the store only sees finished sets.
 */
import { useState, type ReactNode } from 'react';
import { formatDistance, formatDuration, formatPace, parseDuration } from '../../format';
import type { Attempt, AttemptId, Baseline, SplitSet, SplitsAttempt, UnitSystem } from '../../model/types';
import { deleteSplitSet, listSplitSets, saveSplitSet } from '../../store/splitLibrary';
import { useStore } from '../../store/useStore';
import { Button, FOCUS_RING, Tooltip } from '../ui';
import {
  buildSplitSet,
  emptyDraft,
  type BuiltDraft,
  emptyRow,
  loadDraft,
  type EditorDraft,
  type EditorMode,
} from './draft';
import { choiceDistance, unitLabel } from './fields';
import { DistanceInput, DistanceSelect, Field, INPUT } from './inputs';

const TABS: readonly { mode: EditorMode; label: string }[] = [
  { mode: 'rows', label: 'Rows' },
  { mode: 'paste', label: 'Paste' },
  { mode: 'target', label: 'Target time' },
];

const NO_ELEVATION = 'GAP needs a course baseline with elevation; this baseline has none.';

/** GAP interpolation needs the shared elevation of a GPS course baseline. */
function baselineHasElevation(attempts: Attempt[], baseline: Baseline | null): boolean {
  const attempt = attempts.find((a) => a.id === baseline?.attemptId);
  return baseline?.kind === 'course' && attempt?.kind === 'gps' && attempt.activity.ele !== null;
}

export function Editor() {
  const units = useStore((s) => s.units);
  const attempts = useStore((s) => s.attempts);
  const baseline = useStore((s) => s.baseline);
  const addSplitSet = useStore((s) => s.addSplitSet);
  const updateSplitSet = useStore((s) => s.updateSplitSet);

  const gapAvailable = baselineHasElevation(attempts, baseline);
  const [draft, setDraft] = useState<EditorDraft>(() => emptyDraft(units, 'gap'));
  const [editingId, setEditingId] = useState<AttemptId | null>(null);
  const [library, setLibrary] = useState(listSplitSets);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const splitAttempts = attempts.filter((a): a is SplitsAttempt => a.kind === 'splits');
  const editing = splitAttempts.find((a) => a.id === editingId) ?? null;
  const interpolation = gapAvailable ? draft.interpolation : 'linear';
  const built = buildSplitSet({ ...draft, interpolation });
  const update = (patch: Partial<EditorDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const reset = () => {
    setDraft(emptyDraft(units, draft.interpolation));
    setEditingId(null);
  };

  const storeLibrary = (ok: boolean) => {
    setLibrary(listSplitSets());
    setLibraryError(ok ? null : "Couldn't save to this browser's storage; the library is unavailable here.");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-sm font-semibold">{editing ? `Edit ${editing.label}` : 'Add a split set'}</h3>

      <div role="tablist" aria-label="Input mode" className="inline-flex w-fit rounded-md border border-border p-0.5">
        {TABS.map((t) => (
          <button
            key={t.mode}
            type="button"
            role="tab"
            data-tab={t.mode}
            aria-selected={draft.mode === t.mode}
            onClick={() => update({ mode: t.mode })}
            className={`rounded px-2.5 py-1 text-sm ${FOCUS_RING} ${draft.mode === t.mode ? 'bg-background font-medium text-text shadow-sm' : 'text-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" data-panel={draft.mode} className="flex min-w-0 flex-col gap-3">
        {draft.mode === 'rows' && <RowsTab draft={draft} problems={built.problems} units={units} update={update} />}
        {draft.mode === 'paste' && <PasteTab built={built} units={units} draft={draft} update={update} />}
        {draft.mode === 'target' && <TargetTab draft={draft} units={units} update={update} />}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Field label="Name">
          <input
            name="name"
            value={draft.name}
            placeholder={draft.mode === 'target' ? built.set.name : 'e.g. Pro 2025'}
            onChange={(e) => update({ name: e.currentTarget.value })}
            className={`${INPUT} h-9 w-48`}
          />
        </Field>
        {draft.mode !== 'target' && (
          <DistanceSelect
            name="official"
            label="Official distance"
            noneLabel="None"
            value={draft.official}
            units={units}
            onChange={(official) => update({ official })}
            hint={
              draft.official && baseline?.kind === 'course' ? 'Markers will be scaled onto your course length.' : null
            }
          />
        )}
        <fieldset className="flex min-w-0 flex-col gap-1 text-sm">
          <legend className="mb-1 font-medium">Interpolation</legend>
          <div className="flex h-9 items-center gap-4">
            <InterpolationOption
              value="gap"
              label="GAP"
              checked={interpolation === 'gap'}
              disabled={!gapAvailable}
              onPick={() => update({ interpolation: 'gap' })}
            />
            <InterpolationOption
              value="linear"
              label="Linear"
              checked={interpolation === 'linear'}
              disabled={false}
              onPick={() => update({ interpolation: 'linear' })}
            />
          </div>
        </fieldset>
      </div>

      {built.problems.some((p) => !p.startsWith('Split ')) && (
        <ul data-problems="" className="list-disc pl-5 text-sm text-muted">
          {built.problems
            .filter((p) => !p.startsWith('Split '))
            .map((p) => (
              <li key={p}>{p}</li>
            ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {editing && (
          <Button
            variant="primary"
            disabled={!built.ok}
            onClick={() => {
              updateSplitSet(editing.id, built.set);
              reset();
            }}
          >
            Update
          </Button>
        )}
        <Button
          variant={editing ? 'secondary' : 'primary'}
          disabled={!built.ok}
          onClick={() => {
            addSplitSet(built.set);
            reset();
          }}
        >
          Add to comparison
        </Button>
        <Button disabled={!built.ok} onClick={() => storeLibrary(saveSplitSet(built.set))}>
          Save to library
        </Button>
        {editing && (
          <Button variant="ghost" onClick={reset}>
            Cancel
          </Button>
        )}
      </div>
      {libraryError && (
        <p role="alert" className="text-sm text-behind">
          {libraryError}
        </p>
      )}

      {splitAttempts.length > 0 && (
        <SetList title="In the comparison" testId="split-attempts">
          {splitAttempts.map((a) => (
            <SetItem key={a.id} name={a.label} set={a.splitSet} units={units}>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Edit ${a.label}`}
                aria-pressed={a.id === editingId}
                onClick={() => {
                  setDraft(loadDraft(draft, a.splitSet));
                  setEditingId(a.id);
                }}
              >
                Edit
              </Button>
            </SetItem>
          ))}
        </SetList>
      )}

      <SetList title="Library" testId="library">
        {library.length === 0 && <li className="text-sm text-muted">Saved split sets appear here.</li>}
        {library.map((set) => (
          <SetItem key={set.name} name={set.name} set={set} units={units}>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Load ${set.name}`}
              onClick={() => setDraft(loadDraft(draft, set))}
            >
              Load
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${set.name}`}
              onClick={() => storeLibrary(deleteSplitSet(set.name))}
            >
              Delete
            </Button>
          </SetItem>
        ))}
      </SetList>
    </div>
  );
}

interface TabProps {
  draft: EditorDraft;
  units: UnitSystem;
  update(patch: Partial<EditorDraft>): void;
}

function RowsTab({ draft, units, update, problems }: TabProps & { problems: string[] }) {
  const { rows } = draft;
  const setRows = (next: EditorDraft['rows']) => update({ rows: next });
  const move = (from: number, to: number) => {
    const next = [...rows];
    next.splice(to, 0, ...next.splice(from, 1));
    setRows(next);
  };

  return (
    <>
      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const rowProblems = problems.filter((p) => p.startsWith(`Split ${i + 1} `));
          const label = `Split ${i + 1}`;
          return (
            <li key={row.key} data-row={i} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-6 text-right text-sm tabular-nums text-muted">{i + 1}</span>
                <DistanceInput
                  name="row-distance"
                  ariaLabel={`${label} distance (${unitLabel(units)})`}
                  value={row.distance}
                  units={units}
                  onChange={(distance) => setRows(rows.map((r) => (r.key === row.key ? { ...r, distance } : r)))}
                />
                <input
                  name="row-time"
                  aria-label={`${label} time`}
                  placeholder="h:mm:ss"
                  value={row.time}
                  aria-invalid={row.time.trim() !== '' && parseDuration(row.time) === null}
                  onChange={(e) => {
                    const time = e.currentTarget.value;
                    setRows(rows.map((r) => (r.key === row.key ? { ...r, time } : r)));
                  }}
                  className={`${INPUT} h-9 w-24`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${label} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Move ${label} down`}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${label}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                >
                  Remove
                </Button>
              </div>
              {rowProblems.length > 0 && <p className="pl-8 text-xs text-behind">{rowProblems.join(' ')}</p>}
            </li>
          );
        })}
      </ol>
      <Button size="sm" className="w-fit" onClick={() => setRows([...rows, emptyRow()])}>
        Add split
      </Button>
    </>
  );
}

function PasteTab({ draft, units, update, built }: TabProps & { built: BuiltDraft }) {
  const { text } = draft.paste;
  // Plain numbers are read in the units the text was typed in, which the hint names.
  const readAs = text.trim() === '' ? units : draft.paste.units;
  const parsed = built.parsed;
  return (
    <>
      <Field
        label="Cumulative splits"
        hint={`One split per line or comma, e.g. “10 30:00, 15 1:02:00”. Numbers without a unit are read as ${unitLabel(readAs)}.`}
      >
        <textarea
          name="paste"
          rows={4}
          value={text}
          onChange={(e) => update({ paste: { text: e.currentTarget.value, units } })}
          className={`${INPUT} py-1.5 font-mono`}
        />
      </Field>
      {text.trim() !== '' && parsed?.ok === false && (
        <ul data-paste-errors="" className="flex flex-col gap-0.5 text-sm text-behind">
          {parsed.errors.map((e, i) => (
            <li key={i}>
              Line {e.line}: {e.message}
            </li>
          ))}
        </ul>
      )}
      {parsed?.ok && (
        <ol data-parsed-rows="" className="flex flex-col gap-0.5 text-sm tabular-nums">
          {parsed.markers.map((m, i) => (
            <li key={i}>
              {i + 1}. {formatDistance(m.distance, units)} · {formatDuration(m.time)}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function TargetTab({ draft, units, update }: TabProps) {
  const { target } = draft;
  const distance = choiceDistance(target.distance);
  const time = parseDuration(target.time) ?? NaN;
  return (
    <div className="flex flex-wrap items-start gap-4">
      <DistanceSelect
        name="target-distance"
        label="Distance"
        value={target.distance}
        units={units}
        onChange={(choice) => choice && update({ target: { ...target, distance: choice } })}
      />
      <Field label="Target time">
        <input
          name="target-time"
          placeholder="h:mm:ss"
          value={target.time}
          aria-invalid={target.time.trim() !== '' && !(time > 0)}
          onChange={(e) => update({ target: { ...target, time: e.currentTarget.value } })}
          className={`${INPUT} h-9 w-28`}
        />
      </Field>
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Average pace</span>
        <output data-field="average-pace" className="flex h-9 items-center tabular-nums">
          {formatPace(time / distance, units)}
        </output>
      </div>
    </div>
  );
}

interface InterpolationOptionProps {
  value: SplitSet['interpolation'];
  label: string;
  checked: boolean;
  disabled: boolean;
  onPick(): void;
}

function InterpolationOption({ value, label, checked, disabled, onPick }: InterpolationOptionProps) {
  const option = (
    <label className={`flex items-center gap-1.5 ${disabled ? 'text-muted' : 'cursor-pointer'}`}>
      <input
        type="radio"
        name="interpolation"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onPick}
        className={`h-4 w-4 accent-accent ${FOCUS_RING}`}
      />
      {label}
    </label>
  );
  return disabled ? <Tooltip content={NO_ELEVATION}>{option}</Tooltip> : option;
}

function SetList({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <div data-list={testId} className="flex min-w-0 flex-col gap-1">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="flex flex-col divide-y divide-border">{children}</ul>
    </div>
  );
}

function SetItem({
  name,
  set,
  units,
  children,
}: {
  name: string;
  set: SplitSet;
  units: UnitSystem;
  children: ReactNode;
}) {
  const last = set.markers[set.markers.length - 1];
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <span className="min-w-0 truncate text-sm">
        <span className="font-medium">{name}</span>
        {last && (
          <span className="text-muted">
            {' '}
            · {formatDistance(last.distance, units)} · {formatDuration(last.time)}
          </span>
        )}
      </span>
      <span className="flex gap-1">{children}</span>
    </li>
  );
}
