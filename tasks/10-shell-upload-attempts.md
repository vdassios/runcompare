# 10 · App shell, upload and attempts list

**Milestone** M1 · **Depends on** 02 · **Parallel with** 11, 12, 13 · **Branch** `task/10-shell-upload-attempts`

## Goal
Build the frame of the app: header with the units and theme toggles, responsive dashboard layout, file drop zone, and the attempts list where each attempt is labelled, coloured, set as baseline or removed.

## Read first
`tasks/README.md`, `PLAN.md` §1.3, §1.4, §1.7 and §6, `src/store/useStore.ts`, and `src/test/factories.ts`.

## You own
- `src/components/Dashboard.tsx`
- `src/components/Header.tsx`
- `src/components/UploadPanel.tsx`
- `src/components/AttemptList.tsx`
- `src/components/ui/**`: small shared primitives (Button, Toggle, Badge, Card, Tooltip). Other UI tasks may *use* them but don't edit them.
- `tests/visual/shell.spec.ts` (taken over from 02)
- `tests/visual/attempts.spec.ts`

## Requirements
- **Header:**
  - app name "RunCompare" and a one-line tagline
  - units toggle (metric / imperial), which calls `setUnits`
  - theme control (system / light / dark), which calls `setTheme`
  - the resolved theme applied through `useResolvedTheme`
- **Layout:**
  - sections in PLAN §6 order
  - desktop width `max-w-7xl`
  - below 768 px everything is one column with a 16 px gutter
  - no horizontal page scroll at 390 px
- **Empty state** (no attempts): a large drop zone, one paragraph on what the app does, a privacy line ("Files never leave your browser"), and the supported formats.
- **UploadPanel:**
  - drag and drop plus a file picker for multiple `.fit` and `.gpx` files (`accept=".fit,.gpx"`), calling `addFiles`
  - shows `status` (parsing / analysing)
  - each entry in `errors[]` is a dismissible alert
  - once attempts exist, it collapses to a compact "Add files" button
- **AttemptList**, one row per attempt:
  - colour swatch, opening a palette picker that calls `updateAttempt`
  - label, editable inline (Enter or blur saves, Escape cancels)
  - kind badge: FIT, GPX or Splits
  - baseline radio, which calls `setBaseline({ kind: 'course', attemptId })`. It's only offered on GPS attempts. When the baseline is a distance baseline, show a chip "Baseline: 10K · <split set label>"; choosing a GPS radio switches back to a course baseline.
  - watch distance and elapsed time, formatted
  - overlap % when it's below 99 %
  - a warnings disclosure listing that attempt's `analysis.warnings`
  - a remove button with **no browser dialog**: the first click turns it into an inline "Remove?" confirm, which reverts after 3 s or on blur, and the second click calls `removeAttempt`
- **Accessibility:** every control reachable by keyboard and labelled. The radio group has a legend.

## Acceptance
- Visual specs:
  - `shell.spec.ts`: the empty app and `synthetic-two-attempts`, full page, all four projects
  - `attempts.spec.ts`: the attempts section for `synthetic-two-attempts`, `synthetic-gpx` and `synthetic-splits-only`
- Component tests (Vitest + Testing Library): label edit, Escape cancels, baseline radio calls `setBaseline`, remove needs the inline confirm, and errors can be dismissed.
- No horizontal scroll at 390 px. Assert in Playwright that `document.documentElement.scrollWidth <= 390`.

## Out of scope
Any section other than the header, upload panel and attempts list, and the distance baseline picker (22).
