# RunCompare

Read [`PLAN.md`](PLAN.md) for the product and algorithms, then [`tasks/README.md`](tasks/README.md) for the rules every builder agent follows, then your task file and `src/model/types.ts` (the shared contract; don't change it inside another task).

- SI units internally (m, s, m/s, °C, pace in s/m); everything shown to the user goes through `src/format/`.
- Delta = attempt − baseline at the same course distance; positive means behind. Behind is orange, ahead is blue.
- Analysis code is pure TypeScript (no DOM, no React), on typed arrays: `NaN` for a missing sample, `null` for a missing stream.
- No `any`. Colours come from `src/theme/` tokens.
- Done means `npm run lint && npm run typecheck && npm test && npm run test:visual` pass; one branch `task/NN-slug` and one PR per task, never push to or merge into `main`.
