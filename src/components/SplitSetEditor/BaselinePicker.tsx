/**
 * "Baseline": compare against a GPS attempt's course, or against a split-set attempt on a fixed
 * distance (PLAN §1.3). Picking the course applies at once; a fixed distance is applied with a
 * button, so typing a custom distance doesn't re-run the analysis on every key.
 */
import { useState } from 'react';
import type { AttemptId, Baseline, GpsAttempt, SplitsAttempt } from '../../model/types';
import { useStore } from '../../store/useStore';
import { Button, FOCUS_RING } from '../ui';
import { choiceDistance, choiceFor, setDistance, type DistanceChoice } from './fields';
import { DistanceSelect, Field, INPUT } from './inputs';

const NEEDS_SPLITS = 'Add a split set or a target time first.';
const NEEDS_GPS = 'Upload a FIT or GPX file first.';

interface Fixed {
  attemptId: AttemptId | null;
  distance: DistanceChoice;
}

/** The fixed-distance fields: the current distance baseline, else the first split set's distance. */
function initialFixed(baseline: Baseline | null, splits: SplitsAttempt[]): Fixed {
  if (baseline?.kind === 'distance') {
    return { attemptId: baseline.attemptId, distance: { preset: baseline.preset, custom: baseline.distance } };
  }
  const first = splits[0];
  return { attemptId: first?.id ?? null, distance: first ? choiceFor(setDistance(first.splitSet)) : choiceFor(10_000) };
}

export function BaselinePicker() {
  const attempts = useStore((s) => s.attempts);
  const baseline = useStore((s) => s.baseline);
  const units = useStore((s) => s.units);
  const setBaseline = useStore((s) => s.setBaseline);

  const gps = attempts.filter((a): a is GpsAttempt => a.kind === 'gps');
  const splits = attempts.filter((a): a is SplitsAttempt => a.kind === 'splits');

  const [kind, setKind] = useState<Baseline['kind']>(baseline?.kind ?? 'course');
  const [fixed, setFixed] = useState<Fixed>(() => initialFixed(baseline, splits));
  // The baseline can also change elsewhere (the attempts list); follow it.
  const [seen, setSeen] = useState(baseline);
  if (seen !== baseline) {
    setSeen(baseline);
    if (baseline) setKind(baseline.kind);
    if (baseline?.kind === 'distance') setFixed(initialFixed(baseline, splits));
  }

  const attemptId = splits.some((a) => a.id === fixed.attemptId) ? fixed.attemptId : (splits[0]?.id ?? null);
  const distance = choiceDistance(fixed.distance);
  const payload: Baseline | null =
    attemptId !== null && distance > 0
      ? { kind: 'distance', attemptId, preset: fixed.distance.preset, distance }
      : null;
  const applied = payload !== null && JSON.stringify(payload) === JSON.stringify(baseline);

  const pickCourse = () => {
    setKind('course');
    if (baseline?.kind !== 'course' && gps[0]) setBaseline({ kind: 'course', attemptId: gps[0].id });
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 text-sm font-semibold">Baseline</legend>
      <Choice
        value="course"
        label="A GPS attempt (course)"
        checked={kind === 'course'}
        disabledHint={gps.length === 0 ? NEEDS_GPS : null}
        onPick={pickCourse}
      />
      {kind === 'course' && gps.length > 0 && (
        <p className="pl-6 text-xs text-muted">Pick which GPS attempt in the attempts list.</p>
      )}
      <Choice
        value="distance"
        label="A fixed distance"
        checked={kind === 'distance'}
        disabledHint={splits.length === 0 ? NEEDS_SPLITS : null}
        onPick={() => setKind('distance')}
      />
      {kind === 'distance' && splits.length > 0 && (
        <div className="flex flex-col gap-3 pl-6">
          <DistanceSelect
            name="baseline-distance"
            label="Distance"
            value={fixed.distance}
            units={units}
            onChange={(choice) => choice && setFixed({ ...fixed, distance: choice })}
          />
          <Field label="Split set">
            <select
              name="baseline-attempt"
              value={attemptId ?? ''}
              onChange={(e) => setFixed({ ...fixed, attemptId: e.currentTarget.value })}
              className={`${INPUT} h-9`}
            >
              {splits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Button
            variant="primary"
            className="w-fit"
            disabled={payload === null || applied}
            onClick={() => payload && setBaseline(payload)}
          >
            {applied ? 'In use' : 'Use as baseline'}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

interface ChoiceProps {
  value: Baseline['kind'];
  label: string;
  checked: boolean;
  disabledHint: string | null;
  onPick(): void;
}

function Choice({ value, label, checked, disabledHint, onPick }: ChoiceProps) {
  const disabled = disabledHint !== null;
  return (
    <label className={`flex flex-col gap-0.5 text-sm ${disabled ? 'text-muted' : 'cursor-pointer'}`}>
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="baseline-kind"
          value={value}
          checked={checked && !disabled}
          disabled={disabled}
          onChange={onPick}
          className={`h-4 w-4 accent-accent ${FOCUS_RING}`}
        />
        <span className="font-medium">{label}</span>
      </span>
      {disabledHint && <span className="pl-6 text-xs">{disabledHint}</span>}
    </label>
  );
}
