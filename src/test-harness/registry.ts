import type { ScenarioData } from '../test/factories';

export type ScenarioLoader = () => ScenarioData | Promise<ScenarioData>;

const scenarios = new Map<string, ScenarioLoader>();

/**
 * Adds a scenario that `/?fixture=<name>` can load. Later tasks register real-file
 * scenarios from a `src/**\/*.scenario.ts` file (the harness imports every one of them);
 * loaders may be async, e.g. to fetch and parse a fixture.
 */
export function registerScenario(name: string, loader: ScenarioLoader): void {
  if (scenarios.has(name)) throw new Error(`Scenario "${name}" is already registered`);
  scenarios.set(name, loader);
}

export function getScenario(name: string): ScenarioLoader | undefined {
  return scenarios.get(name);
}

export function scenarioNames(): string[] {
  return [...scenarios.keys()];
}
