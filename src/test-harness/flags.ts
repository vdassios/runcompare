import type { useStore } from '../store/useStore';

declare global {
  interface Window {
    /** Set by the test harness before the app renders. Read it through `isTestHarness()`. */
    __RC_TEST__?: boolean;
    /** The app store, exposed by the test harness so Playwright can read and set state. */
    __RC_STORE__?: typeof useStore;
  }
}

/**
 * True when the app runs under the visual test harness. Components use it to turn off
 * animations. Safe to import anywhere: it never pulls in the harness bundle, and it is
 * false in workers, in Node and in production.
 */
export function isTestHarness(): boolean {
  return typeof window !== 'undefined' && window.__RC_TEST__ === true;
}
