# 22 · Split-set editor and baseline picker

**Milestone** M2 · **Depends on** 20, 21 · **Branch** `task/22-split-set-editor`

## Goal
Let users enter a pro's split times (rows, paste or a target time), keep a small library of saved sets, and choose a **distance baseline** (5K, 10K, half, marathon or custom).

## Read first
`tasks/README.md`, `PLAN.md` §1.3, §1.4, §5.7 and §6, `src/analysis/splitSets.ts`, and `src/store/useStore.ts`.

## You own
`src/components/SplitSetEditor/**` and `src/store/splitLibrary.ts` (+ test).

## Requirements
- **The section** (`data-section="split-set-editor"`) has two parts: "Add a split set" and "Baseline".
- **Editor**, with three input modes as tabs:
  1. **Rows:** distance and time inputs in the active units, plus add, remove and reorder. Each row is validated live with `validateSplitSet`.
  2. **Paste:** a textarea parsed with `parseSplitList` as you type, showing the parsed rows or errors with their line numbers. A hint says which unit plain numbers are read in ("Numbers without a unit are read as km").
  3. **Target:** a distance (preset select, or a custom value in the active units) and a target time, which gives `targetTimeSplitSet`. Show the resulting average pace.

  Common fields:
  - name
  - optional official distance: a preset or a custom value. **On a course baseline** it explains "markers will be scaled onto your course length".
  - interpolation: GAP or linear. GAP is disabled with a tooltip when the current baseline has no elevation.

  Buttons:
  - **Add to comparison** calls `addSplitSet`.
  - **Update** calls `updateSplitSet` when editing an existing split attempt. The section lists the current split-set attempts, each with an **Edit** button that loads it into the editor (component state only, no new store fields).
- **Library (`splitLibrary.ts`):**
  - Save, list and delete named sets in `localStorage` under `rc.splitSets.v1`, with try/catch and a `{version, sets}` schema.
  - "Load" fills the editor with a saved set.
  - No sample pro data is bundled.
- **Baseline picker:**
  - Radio: "A GPS attempt (course)" or "A fixed distance".
  - The fixed distance takes a preset select (`DISTANCE_PRESETS`) or a custom distance, plus a select of the split-set attempts. Then it calls `setBaseline({ kind: 'distance', … })`.
  - Disabled with a hint when there are no split-set attempts ("Add a split set or a target time first").
- **Units:** all distances are shown and entered in the active units and stored in metres. Switching units while editing converts the visible values without changing the stored metres.

## Acceptance
- Component tests:
  - the section renders for `loadFixture('fit-two-attempts')` (course baseline) and `loadFixture('splits-only-10k')` (distance baseline), in each tab, including one paste-error state
  - pasting `10 30:00, 15 1:02:00` gives two rows
  - imperial paste `6 36:00` stores 9,656.064 m
  - the target time 10K in 40:00 shows `4:00 /km`
  - the library survives a remount and handles `localStorage` throwing
  - the baseline picker calls `setBaseline` with the right payload

## Out of scope
Pipeline behaviour (21) and editing GPS attempts.
