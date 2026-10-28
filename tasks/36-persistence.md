# 36 · Session persistence

**Milestone** M3 · **Depends on** 21 · **Parallel with** 30–35 · **Branch** `task/36-persistence`

## Goal
A reload keeps the session: attempts, the baseline and settings are restored from IndexedDB, so nobody has to drop their files again.

## Read first
`tasks/README.md`, `PLAN.md` §1.1, and `src/store/useStore.ts`.

## You own
- `src/store/persistence.ts` (+ test)
- the store wiring: one subscription and one hydration call, added to `src/store/useStore.ts` with minimal changes
- a "Clear session" control in `src/components/Header.tsx` (one button, nothing else)

Add `idb-keyval` (exact version).

## Requirements
- **Saved under `rc.session.v1`:** `{ version: 1, attempts, baseline, settings }`. `Activity` typed arrays are stored as they are, since IndexedDB clones typed arrays. **Don't** save the analysis; re-run it after hydration.
- **When to save:** debounced 500 ms after `attempts`, `baseline` or `settings` change. Skip saving while `status` is `parsing`.
- **Hydrate on startup,** before the first analysis. If there's anything saved, status goes `'analyzing'`, then `'ready'`.
  - A version mismatch or corrupt data: discard it and add a one-time info message to `errors`: "Couldn't restore your last session".
  - Any IndexedDB failure (private mode, blocked): fall back silently to no persistence.
- **Clear session** wipes the saved key and resets the data state. It uses the same inline confirm as removing an attempt (no browser dialog).
- **Test harness:** disabled when `isTestHarness()`, so harness scenarios never pick up stale state.
- **Privacy:** add a line in the upload panel's empty state: "Your files are kept in this browser only. Clear them any time." This is the only edit allowed in `UploadPanel.tsx`.

## Acceptance
- Unit (with `fake-indexeddb` as a dev dependency):
  - save, then hydrate, round-trips the attempts with identical typed arrays
  - the debounce holds
  - a version mismatch is discarded with the message
  - an IndexedDB error falls back silently
- E2E (`tests/e2e/persistence.spec.ts`, which you own): upload two FIT files, reload, and the same attempts and `+9:05` are back. Clear session, reload, and the app is empty.

## Out of scope
Sync across devices and exporting or importing sessions.
