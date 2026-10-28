/**
 * Visual test harness (task 02). Only bundled when VITE_TEST_HARNESS=1: `main.tsx` imports
 * it dynamically behind that flag, so production builds never contain it.
 *
 * `/?fixture=<name>` loads a registered scenario into the store before the first render.
 * Once the app has rendered (fonts loaded, two frames painted), `<html data-ready="1">`
 * is set; on failure it is `data-ready="error"` with the message in `data-ready-error`.
 */
import { useStore } from '../store/useStore';
import { SCENARIOS } from '../test/factories';
import { getScenario, registerScenario, scenarioNames } from './registry';

export { registerScenario, scenarioNames } from './registry';

for (const scenario of SCENARIOS) registerScenario(scenario.name, scenario.build);

// Real-file scenarios from later tasks (09, 21) register themselves on import.
import.meta.glob('/src/**/*.scenario.ts', { eager: true });

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function loadFixture(name: string): Promise<void> {
  const loader = getScenario(name);
  if (!loader) throw new Error(`Unknown fixture "${name}". Known: ${scenarioNames().join(', ')}`);
  const { attempts, baseline, analysis } = await loader();
  useStore.getState().loadScenario(attempts, baseline, analysis);
}

export async function startHarness(render: () => void): Promise<void> {
  window.__RC_TEST__ = true;
  window.__RC_STORE__ = useStore;
  const html = document.documentElement;
  let error: unknown = null;
  try {
    const fixture = new URLSearchParams(window.location.search).get('fixture');
    if (fixture) await loadFixture(fixture);
  } catch (err) {
    error = err;
  }
  render();
  await document.fonts.ready;
  await nextFrame();
  await nextFrame();
  if (error) {
    console.error(error);
    html.dataset.readyError = String(error);
    html.dataset.ready = 'error';
  } else {
    html.dataset.ready = '1';
  }
}
