/// <reference types="node" />
/**
 * The real fixtures run through the pipeline in-process, as test data for every later test:
 * `useStore.getState().loadScenario(...Object.values(loadFixture('fit-two-attempts')))` or
 * pick fields by name. Results are cached, so treat them as read-only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../analysis/pipeline';
import { DEFAULT_SETTINGS, type AnalysisResult, type Baseline, type GpsAttempt } from '../model/types';
import { parseFile } from '../parsers';
import { attemptLabel } from '../store/useStore';
import { nextAttemptColor } from '../theme';

export interface Fixture {
  attempts: GpsAttempt[];
  baseline: Baseline;
  analysis: AnalysisResult;
}

const SCENARIOS = {
  'fit-two-attempts': ['trail-2024.fit', 'trail-2025.fit'],
  'gpx-two-attempts': ['trail-2024-head.gpx', 'trail-2025-head.gpx'],
} as const;

export type FixtureName = keyof typeof SCENARIOS;

const FIXTURES_DIR = join(import.meta.dirname, '..', '..', 'fixtures');
const cache = new Map<FixtureName, Fixture>();

/** Attempt ids are the file names without extension, e.g. `trail-2024`; 2024 is the course baseline. */
export function loadFixture(name: FixtureName): Fixture {
  const cached = cache.get(name);
  if (cached) return cached;

  const attempts: GpsAttempt[] = [];
  for (const file of SCENARIOS[name]) {
    const activity = parseFile(new Uint8Array(readFileSync(join(FIXTURES_DIR, file))).buffer, file);
    const color = nextAttemptColor(attempts.map((a) => a.color));
    attempts.push({
      id: file.replace(/(-head)?\.\w+$/, ''),
      kind: 'gps',
      label: attemptLabel(activity.startTime),
      color,
      activity,
    });
  }
  const baseline: Baseline = { kind: 'course', attemptId: attempts[0]!.id };
  const fixture = { attempts, baseline, analysis: analyze({ attempts, baseline, settings: DEFAULT_SETTINGS }) };
  cache.set(name, fixture);
  return fixture;
}
