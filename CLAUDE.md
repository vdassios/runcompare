# RunCompare

Read [`PLAN.md`](PLAN.md) for the product and algorithms, then [`tasks/README.md`](tasks/README.md) for the rules every builder agent follows, then your task file and `src/model/types.ts` (the shared contract; don't change it inside another task).

- SI units internally (m, s, m/s, °C, pace in s/m); everything shown to the user goes through `src/format/`.
- Delta = attempt − baseline at the same course distance; positive means behind. Behind is orange, ahead is blue.
- Analysis code is pure TypeScript (no DOM, no React), on typed arrays: `NaN` for a missing sample, `null` for a missing stream.
- No `any`. Colours come from `src/theme/` tokens.
- Done means `npm run lint && npm run typecheck && npm test` pass; one branch `task/NN-slug` and one PR per task, never push to or merge into `main`.

## Git

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) as linted by [commitlint](https://github.com/conventional-changelog/commitlint)'s `config-conventional`:

```text
feat(05): add smoothing, grade and GAP

    - interp.ts: interpolateAt, resampleOnto, rollingMean, rollingMedian and bridgeNaN
    - gap.ts: minettiCost, gapFactor and gapPace

Refs: #2
```

- Header: `type(scope): subject`. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`. The scope is the task number (`05`) for task work, otherwise the area (`tasks`). Subject in lower case, imperative, no full stop. Lines stay within 100 characters.
- Body: terse bullets, each one core change, indented four spaces then `- `.
- Footer: `Refs: #N` for every issue or PR the commit addresses; leave it out when there are none.
- Commits and PR descriptions end with the footer: no `Co-Authored-By` trailer and no "Generated with" line.

**Pull requests** start the description with the merge line, a one-line summary of the whole PR in the same header format:

```text
Merge: feat(05): smoothing, grade and GAP building blocks for the analysis pipeline
```

Rewrite it whenever new commits change what the PR does. The owner merges with a merge commit (never fast-forward or squash) whose message is that line as the header and `Refs: #<PR>` as the footer.

**Cleanup**: once a task's PR is merged or closed, remove its worktree (`git worktree remove`) and delete its local branch before starting the next task.
