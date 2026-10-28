# RunCompare

RunCompare compares GPS attempts of the same race (FIT or GPX), plus pro or target split sets, by position on the course rather than by time. It lines every attempt up against one baseline, plots elevation, pace, grade-adjusted pace, heart rate, cadence and the running time delta on one shared axis, and explains where time was gained or lost. It's a static site: every file stays in your browser.

```sh
npm i && npm run dev
```

See [`PLAN.md`](PLAN.md) for the design and [`tasks/`](tasks/README.md) for how the work is split up. MIT licensed.
