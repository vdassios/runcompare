/// <reference types="node" />
/**
 * The real fixtures run through the pipeline in-process, as test data for every later test:
 * `useStore.getState().loadScenario(...Object.values(loadFixture('fit-two-attempts')))` or
 * pick fields by name. Results are cached, so treat them as read-only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../analysis/pipeline';
import { targetTimeSplitSet } from '../analysis/splitSets';
import {
  DEFAULT_SETTINGS,
  DISTANCE_PRESETS,
  type Activity,
  type AnalysisResult,
  type Attempt,
  type Baseline,
  type GpsAttempt,
  type SplitSet,
  type SplitsAttempt,
} from '../model/types';
import { parseFile } from '../parsers';
import { attemptLabel } from '../store/useStore';
import { nextAttemptColor } from '../theme';

export interface Fixture<A extends Attempt = Attempt> {
  attempts: A[];
  baseline: Baseline;
  analysis: AnalysisResult;
}

const GPS_SCENARIOS = {
  'fit-two-attempts': ['trail-2024.fit', 'trail-2025.fit'],
  'gpx-two-attempts': ['trail-2024-head.gpx', 'trail-2025-head.gpx'],
} as const;

/** A pro on the 54 km trail race, for `fit-vs-pro`. */
export const PRO_SPLIT_SET: SplitSet = {
  name: 'Pro',
  markers: [
    { distance: 10_000, time: 55 * 60 },
    { distance: 25_000, time: 2.5 * 3600 },
    { distance: 54_000, time: 5.5 * 3600 },
  ],
  officialDistance: 54_000,
  interpolation: 'gap',
};

/** A pro over 10K, for `splits-only-10k`. */
export const PRO_10K_SPLIT_SET: SplitSet = {
  name: 'Pro 10K',
  markers: [
    { distance: 5000, time: 14 * 60 + 10 },
    { distance: 10_000, time: 28 * 60 + 30 },
  ],
  officialDistance: null,
  interpolation: 'gap',
};

type GpsFixtureName = keyof typeof GPS_SCENARIOS;
export type FixtureName = GpsFixtureName | 'fit-vs-pro' | 'splits-only-10k';

const FIXTURES_DIR = join(import.meta.dirname, '..', '..', 'fixtures');
const cache = new Map<FixtureName, Fixture>();
const activities = new Map<string, Activity>();

/**
 * - `fit-two-attempts`, `gpx-two-attempts`: two GPS attempts on a 2024 course baseline.
 * - `fit-vs-pro`: both FIT attempts plus the split set `pro`, on the 2024 course baseline.
 * - `splits-only-10k`: split sets only, `target` (40:00, the 10K distance baseline) and `pro`.
 *
 * GPS attempt ids are the file names without extension, e.g. `trail-2024`.
 */
export function loadFixture(name: GpsFixtureName): Fixture<GpsAttempt>;
export function loadFixture(name: FixtureName): Fixture;
export function loadFixture(name: FixtureName): Fixture {
  const cached = cache.get(name);
  if (cached) return cached;

  const { attempts, baseline } = scenario(name);
  const fixture = { attempts, baseline, analysis: analyze({ attempts, baseline, settings: DEFAULT_SETTINGS }) };
  cache.set(name, fixture);
  return fixture;
}

function scenario(name: FixtureName): { attempts: Attempt[]; baseline: Baseline } {
  switch (name) {
    case 'fit-two-attempts':
    case 'gpx-two-attempts': {
      const attempts = gpsAttempts(GPS_SCENARIOS[name]);
      return { attempts, baseline: { kind: 'course', attemptId: attempts[0]!.id } };
    }
    case 'fit-vs-pro': {
      const attempts: Attempt[] = gpsAttempts(GPS_SCENARIOS['fit-two-attempts']);
      attempts.push(splitsAttempt('pro', PRO_SPLIT_SET, attempts));
      return { attempts, baseline: { kind: 'course', attemptId: attempts[0]!.id } };
    }
    case 'splits-only-10k': {
      const { distance } = DISTANCE_PRESETS['10k'];
      const attempts: Attempt[] = [];
      attempts.push(splitsAttempt('target', targetTimeSplitSet(distance, 40 * 60), attempts));
      attempts.push(splitsAttempt('pro', PRO_10K_SPLIT_SET, attempts));
      return { attempts, baseline: { kind: 'distance', attemptId: 'target', preset: '10k', distance } };
    }
  }
}

function gpsAttempts(files: readonly string[]): GpsAttempt[] {
  const attempts: GpsAttempt[] = [];
  for (const file of files) {
    const activity = readActivity(file);
    attempts.push({
      id: file.replace(/(-head)?\.\w+$/, ''),
      kind: 'gps',
      label: attemptLabel(activity.startTime),
      color: nextAttemptColor(attempts.map((a) => a.color)),
      activity,
    });
  }
  return attempts;
}

function splitsAttempt(id: string, splitSet: SplitSet, others: Attempt[]): SplitsAttempt {
  const color = nextAttemptColor(others.map((a) => a.color));
  return { id, kind: 'splits', label: splitSet.name, color, splitSet };
}

/** Parsed once per file: several scenarios share the FIT fixtures. */
function readActivity(file: string): Activity {
  let activity = activities.get(file);
  if (!activity) {
    activity = parseFile(new Uint8Array(readFileSync(join(FIXTURES_DIR, file))).buffer, file);
    activities.set(file, activity);
  }
  return activity;
}
