# 05 · Smoothing, grade and GAP

**Milestone** M1 · **Depends on** 00 · **Parallel with** 01, 02 · **Branch** `task/05-smoothing-gap`

## Goal
Provide the numeric building blocks used everywhere else: robust elevation smoothing, grade, ascent and descent with hysteresis, and grade-adjusted pace.

## Read first
`tasks/README.md`, `PLAN.md` §3, §5.2 and §5.3.

## You own
`src/analysis/smoothing.ts`, `src/analysis/gap.ts`, `src/analysis/interp.ts`, and their `*.test.ts` files.

## Requirements
All functions are pure, allocate typed arrays, and handle `NaN` by skipping or bridging it (never by propagating it across the whole array).

`interp.ts` contains shared helpers used by later tasks:
- `interpolateAt(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number`: linear interpolation, where `xs` is non-decreasing. Plateaus return the **first** x reached. Values outside the range clamp to the ends.
- `resampleOnto(xs, ys, targetXs): Float32Array`
- `rollingMean(ys, window): Float32Array` (centred, ignores `NaN`)
- `rollingMedian(ys, window)`
- `bridgeNaN(ys)`: linear fill of internal gaps; leading and trailing gaps take the nearest value.

`smoothing.ts`:
- `smoothElevationByDistance(dist, ele, opts?): { d: Float64Array; ele: Float32Array }`: median filter (5 samples), then resample on a fixed distance step (default 10 m), then a moving average over 50 m.
- `gradeFromElevation(ele, step, window = 50): Float32Array`: central difference over ±window/2, clamped to ±0.45, with ends handled one-sided.
- `ascentDescent(ele, hysteresis = 3): { ascent; descent }`.

`gap.ts`:
- `minettiCost(i)`: J/kg/m.
- `gapFactor(i) = minettiCost(clamp(i, −0.45, 0.45)) / 3.6`.
- `gapPace(pace, grade): Float32Array`: element-wise `pace / gapFactor(grade)`.

## Acceptance
- `gapFactor(0) === 1`. `gapFactor(0.10)` ≈ 1.659 (±0.005). `gapFactor(−0.10)` ≈ 0.598. `gapFactor(−0.20)` ≈ 0.500. Clamping above 0.45 holds.
- Smoothing a synthetic 1,000 m climb of exactly 100 m with ±2 m noise gives `ascentDescent` = 100 m ±5, and the grade median in the middle section ≈ 0.10.
- A flat profile with ±1.5 m noise gives an ascent < 5 m: hysteresis works.
- `interpolateAt` plateau rule: xs `[0,10,10,20]`, ys `[0,1,5,6]`, x = 10 gives 1.
- `NaN` handling is covered for every helper.
- 30,000-sample inputs run in under 50 ms each (log, don't assert).

## Out of scope
Using these in alignment or metrics. Other tasks do that.
