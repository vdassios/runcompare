/**
 * Pure ECharts option builders for the linked charts: elevation, pace/GAP, heart rate,
 * cadence and time delta, stacked on one course-distance axis. Everything is a function
 * of (analysis, units, theme, xAxis) plus the GAP toggle; zoom and highlights are applied
 * later as small patches (linking.ts) so they never rebuild the series.
 *
 * Every chart has the same layout: a fixed-width grid so the axes line up, an invisible
 * `anchor` series first (see `anchorSeries`), then the visible series.
 */
import { quantileSorted } from 'd3-array';
import type {
  EChartsOption,
  LineSeriesOption,
  MarkAreaComponentOption,
  ScatterSeriesOption,
  SeriesOption,
  XAXisComponentOption,
} from 'echarts';
import {
  formatDelta,
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
  formatPace,
  splitLength,
} from '../../format';
import type { AnalysisResult, AttemptAnalysis, UnitSystem } from '../../model/types';
import type { AppState } from '../../store/useStore';
import { TOKENS, type ColorToken, type ResolvedTheme } from '../../theme/tokens';
import { inverseAt, valueAt } from './lookup';

export type ChartId = 'elevation' | 'pace' | 'hr' | 'cadence' | 'delta';
export type XAxisMode = AppState['xAxis'];
export interface Range {
  from: number;
  to: number;
}

export const CHART_ORDER: readonly ChartId[] = ['elevation', 'pace', 'hr', 'cadence', 'delta'];

export const CHART_TITLES: Record<ChartId, string> = {
  elevation: 'Elevation',
  pace: 'Pace',
  hr: 'Heart rate',
  cadence: 'Cadence',
  delta: 'Time delta',
};

/** Pixel layout shared by every chart, so their plot areas line up vertically. */
export const GRID = { left: 76, right: 16, top: 30, bottom: 26 } as const;
/** Extra height the bottom chart gets for the zoom slider. */
export const SLIDER_SPACE = 40;

/** Everything the builders read, resolved once per (analysis, units, theme, xAxis). */
export interface ChartContext {
  analysis: AnalysisResult;
  units: UnitSystem;
  colors: Readonly<Record<ColorToken, string>>;
  xAxis: XAxisMode;
  /** The baseline's elapsed time at each grid point; null without a baseline series. */
  baselineTime: Float64Array | null;
  /** Charts that have data, top to bottom. The last one carries the zoom slider. */
  visible: ChartId[];
}

export interface ChartSpec {
  id: ChartId;
  option: EChartsOption;
}

export interface ChartOptions {
  showGap: boolean;
}

type Point = [number, number];
type MarkAreaData = NonNullable<MarkAreaComponentOption['data']>;

export function chartContext(
  analysis: AnalysisResult,
  units: UnitSystem,
  theme: ResolvedTheme,
  xAxis: XAxisMode,
): ChartContext {
  const baseline = analysis.attempts.find((a) => a.attemptId === analysis.baseline.attemptId);
  return {
    analysis,
    units,
    colors: TOKENS[theme],
    xAxis,
    baselineTime: baseline ? baseline.series.time : null,
    visible: visibleCharts(analysis),
  };
}

/** A chart is shown only when some attempt has its data. */
export function visibleCharts(analysis: AnalysisResult): ChartId[] {
  const { attempts, grid } = analysis;
  if (attempts.length === 0) return [];
  const has: Record<ChartId, boolean> = {
    elevation: grid.ele !== null,
    pace: true,
    hr: attempts.some((a) => a.kind === 'gps' && a.series.hr !== null),
    cadence: attempts.some((a) => a.kind === 'gps' && a.series.cad !== null),
    delta: attempts.some((a) => a.delta !== null),
  };
  return CHART_ORDER.filter((id) => has[id]);
}

/** Every visible chart's option. The component memoises per chart; tests use this. */
export function buildCharts(
  analysis: AnalysisResult,
  units: UnitSystem,
  theme: ResolvedTheme,
  xAxis: XAxisMode,
  opts: ChartOptions = { showGap: false },
): ChartSpec[] {
  const ctx = chartContext(analysis, units, theme, xAxis);
  return ctx.visible.map((id) => ({ id, option: buildChart(id, ctx, opts) }));
}

export function buildChart(id: ChartId, ctx: ChartContext, opts: ChartOptions = { showGap: false }): EChartsOption {
  switch (id) {
    case 'elevation':
      return elevationChart(ctx);
    case 'pace':
      return paceChart(ctx, opts.showGap);
    case 'hr':
      return streamChart(ctx, 'hr', (a) => a.series.hr, 'bpm');
    case 'cadence':
      return streamChart(ctx, 'cadence', (a) => a.series.cad, 'spm');
    case 'delta':
      return deltaChart(ctx);
  }
}

// ---------- Charts ----------

function elevationChart(ctx: ChartContext): EChartsOption {
  const { grid, segments } = ctx.analysis;
  const { colors } = ctx;
  const bands: MarkAreaData = [
    ...segments.map((s) => band(s, colors.accent, s.kind === 'climb' ? 0.12 : 0.05)),
    ...offCourseRanges(ctx.analysis).map((r) => band(r, colors['off-course'], 0.3)),
  ];
  const series: LineSeriesOption = {
    ...line('elevation', 'Elevation', colors.muted, points(grid.d, grid.ele!)),
    areaStyle: { color: colors.muted, opacity: 0.2, origin: 'start' },
    markArea: { silent: true, data: bands },
  };
  return chart(ctx, 'elevation', { scale: true }, [series], (v) => formatElevation(v, ctx.units));
}

function paceChart(ctx: ChartContext, showGap: boolean): EChartsOption {
  const { attempts, grid } = ctx.analysis;
  const series: SeriesOption[] = [];
  const values: number[] = [];
  for (const a of attempts) {
    series.push(...attemptLines(a, 'pace', grid.d, a.series.pace));
    pushPositive(values, a.series.pace);
    if (showGap && a.kind === 'gps' && a.series.gap) {
      series.push(line(`${a.attemptId}/gap`, `${a.label} GAP`, a.color, points(grid.d, a.series.gap), 'dashed'));
      pushPositive(values, a.series.gap);
    }
    const markers = markerSeries(a, 'pace', grid.d, a.series.pace, ctx.colors.surface);
    if (markers) series.push(markers);
  }
  const axis = paceAxis(values, ctx.units);
  const yAxis: YAxisSpec = { inverse: true, ...axis }; // inverse: faster is higher
  return chart(ctx, 'pace', yAxis, series, (v) => formatPace(v, ctx.units), showGap ? 'Pace and GAP' : 'Pace');
}

function streamChart(
  ctx: ChartContext,
  id: 'hr' | 'cadence',
  stream: (a: AttemptAnalysis) => Float32Array | null,
  unit: string,
): EChartsOption {
  const { attempts, grid } = ctx.analysis;
  const series: SeriesOption[] = [];
  for (const a of attempts) {
    const ys = a.kind === 'gps' ? stream(a) : null;
    if (ys) series.push(line(`${a.attemptId}/${id}`, a.label, a.color, points(grid.d, ys)));
  }
  return chart(ctx, id, { scale: true }, series, (v) => `${formatNumber(v)} ${unit}`);
}

function deltaChart(ctx: ChartContext): EChartsOption {
  const { attempts, grid } = ctx.analysis;
  const { colors } = ctx;
  const series: SeriesOption[] = [];
  for (const a of attempts) {
    if (!a.delta) continue;
    // Tints between the line and zero: orange where behind, blue where ahead.
    series.push(
      tint(
        `${a.attemptId}/delta/behind`,
        points(grid.d, a.delta, (v) => Math.max(v, 0)),
        colors.behind,
      ),
      tint(
        `${a.attemptId}/delta/ahead`,
        points(grid.d, a.delta, (v) => Math.min(v, 0)),
        colors.ahead,
      ),
    );
  }
  for (const a of attempts) {
    if (!a.delta) continue;
    series.push(...attemptLines(a, 'delta', grid.d, a.delta));
    const markers = markerSeries(a, 'delta', grid.d, a.delta, colors.surface);
    if (markers) series.push(markers);
  }
  const zero: LineSeriesOption = {
    id: 'zero',
    type: 'line',
    data: [],
    silent: true,
    markLine: {
      silent: true,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: colors.muted, type: 'solid', width: 1 },
      data: [{ yAxis: 0 }],
    },
  };
  return chart(ctx, 'delta', { scale: false, ticks: deltaTicks(ctx, null) }, [zero, ...series], formatDelta);
}

// ---------- Shared layout ----------

interface YAxisSpec {
  scale?: boolean;
  inverse?: boolean;
  min?: number;
  max?: number;
  ticks?: number[];
}

function chart(
  ctx: ChartContext,
  id: ChartId,
  yAxis: YAxisSpec,
  series: SeriesOption[],
  yLabel?: (v: number) => string,
  title = CHART_TITLES[id],
): EChartsOption {
  const { colors } = ctx;
  const slider = ctx.visible[ctx.visible.length - 1] === id;
  return {
    animation: false,
    textStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
    title: { text: title, left: 8, top: 6, textStyle: { color: colors.text, fontSize: 12, fontWeight: 600 } },
    grid: {
      left: GRID.left,
      right: GRID.right,
      top: GRID.top,
      bottom: GRID.bottom + (slider ? SLIDER_SPACE : 0),
      outerBoundsMode: 'none',
    },
    // The tooltip only drives the crosshair; the shared readout is HTML (HoverReadout).
    tooltip: {
      trigger: 'axis',
      showContent: false,
      axisPointer: { type: 'line', snap: true, lineStyle: { color: colors.muted, width: 1 }, label: { show: false } },
    },
    xAxis: xAxisOption(ctx, null),
    yAxis: [
      {
        type: 'value',
        scale: yAxis.scale,
        inverse: yAxis.inverse,
        min: yAxis.min,
        max: yAxis.max,
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { customValues: yAxis.ticks },
        axisLabel: { color: colors.muted, fontSize: 11, formatter: yLabel, customValues: yAxis.ticks },
        splitLine: { lineStyle: { color: colors.border } },
      },
      { type: 'value', show: false, min: 0, max: 1 },
    ],
    dataZoom: [
      {
        id: 'inside',
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'filter',
        // Plain wheel keeps scrolling the page; ctrl+wheel (and trackpad pinch) zooms.
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseWheel: false,
        moveOnMouseMove: true,
      },
      ...(slider
        ? [
            {
              id: 'slider',
              type: 'slider' as const,
              xAxisIndex: 0,
              filterMode: 'filter' as const,
              left: GRID.left,
              right: GRID.right,
              bottom: 8,
              height: 22,
              borderColor: colors.border,
              fillerColor: hexAlpha(colors.accent, 0.15),
              handleStyle: { color: colors.surface, borderColor: colors.muted },
              moveHandleStyle: { color: colors.muted },
              textStyle: { color: colors.muted, fontSize: 11 },
              dataBackground: { lineStyle: { color: colors.muted }, areaStyle: { color: colors.muted, opacity: 0.1 } },
              labelFormatter: (value: number) => xLabel(ctx)(value),
            },
          ]
        : []),
    ],
    series: [anchorSeries(ctx), ...series],
  };
}

/**
 * Series 0 of every chart: one point per grid point on a hidden 0–1 axis. `echarts.connect`
 * replays the crosshair in the other charts by (seriesIndex, dataIndex), and the axis
 * pointer snaps to the first series with the nearest point, so every chart needs the same
 * full series at index 0. It also carries the highlight bands (`highlightPatch`).
 */
function anchorSeries(ctx: ChartContext): LineSeriesOption {
  const { d } = ctx.analysis.grid;
  const data: Point[] = Array.from(d, (x) => [x, 0]);
  return {
    id: 'anchor',
    type: 'line',
    yAxisIndex: 1,
    data,
    symbol: 'none',
    silent: true,
    emphasis: { disabled: true },
    lineStyle: { opacity: 0 },
    markArea: { silent: true, data: [] },
  };
}

function xAxisOption(ctx: ChartContext, range: Range | null): XAXisComponentOption {
  const { colors } = ctx;
  const ticks = xTicks(ctx, range);
  return {
    type: 'value',
    min: 0,
    max: ctx.analysis.grid.length,
    axisLine: { lineStyle: { color: colors.border } },
    axisTick: { lineStyle: { color: colors.border }, customValues: ticks.values },
    axisLabel: {
      color: colors.muted,
      fontSize: 11,
      hideOverlap: true,
      customValues: ticks.values,
      formatter: ticks.label,
    },
    splitLine: { show: false },
  };
}

// ---------- X axis ----------

const DISTANCE_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]; // km or mi
const TIME_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600]; // s
const MAX_X_TICKS = 6;

function pickStep(span: number, steps: readonly number[], maxTicks: number): number {
  return steps.find((s) => span / s <= maxTicks) ?? steps[steps.length - 1]!;
}

/** Multiples of `step` within [lo, hi]. */
function multiples(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const eps = step * 1e-9;
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + eps; k++) out.push(k * step || 0); // no −0
  return out;
}

/** Full-precision label for any course distance: distance, or the baseline's elapsed time there. */
export function xLabel(ctx: ChartContext): (d: number) => string {
  const { baselineTime, analysis, units } = ctx;
  if (ctx.xAxis === 'time' && baselineTime) return (d) => formatDuration(valueAt(analysis.grid.d, baselineTime, d));
  return (d) => formatDistance(d, units);
}

/**
 * Tick positions (course m) and labels for the visible `range` (null = whole course).
 * Distance ticks fall on round km or mi; time ticks fall where the baseline's elapsed
 * time is round (PLAN §6), so the series stay on the distance axis either way.
 */
export function xTicks(ctx: ChartContext, range: Range | null): { values: number[]; label: (d: number) => string } {
  const { grid } = ctx.analysis;
  const from = range?.from ?? 0;
  const to = range?.to ?? grid.length;
  const { baselineTime } = ctx;
  if (ctx.xAxis === 'time' && baselineTime) {
    const t0 = valueAt(grid.d, baselineTime, from);
    const t1 = valueAt(grid.d, baselineTime, to);
    const step = pickStep(t1 - t0, TIME_STEPS, MAX_X_TICKS);
    return {
      values: multiples(t0, t1, step).map((t) => inverseAt(grid.d, baselineTime, t)),
      label: xLabel(ctx),
    };
  }
  const unit = splitLength(ctx.units);
  const step = pickStep((to - from) / unit, DISTANCE_STEPS, MAX_X_TICKS);
  const decimals = String(step).split('.')[1]?.length ?? 0;
  return {
    values: multiples(from / unit, to / unit, step).map((k) => k * unit),
    label: (d) => formatDistance(d, ctx.units, { decimals }),
  };
}

/** Patch for a chart after a zoom, so its ticks stay round inside the window. */
export function zoomPatch(id: ChartId, ctx: ChartContext, range: Range | null): EChartsOption {
  const x = xTicks(ctx, range);
  const xAxis: XAXisComponentOption = {
    axisLabel: { customValues: x.values, formatter: x.label },
    axisTick: { customValues: x.values },
  };
  if (id !== 'delta') return { xAxis };
  const y = deltaTicks(ctx, range);
  return { xAxis, yAxis: [{ axisLabel: { customValues: y }, axisTick: { customValues: y } }] };
}

// ---------- Y axis ----------

const PACE_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]; // s per km or mi
const MAX_PACE_TICKS = 4;
const DELTA_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200]; // s
const MAX_DELTA_TICKS = 4;

/** Delta ticks on round durations (not ECharts' 1-2-5 seconds) across the visible deltas and zero. */
export function deltaTicks(ctx: ChartContext, range: Range | null): number[] {
  const { d } = ctx.analysis.grid;
  const from = range?.from ?? 0;
  const to = range?.to ?? ctx.analysis.grid.length;
  let lo = 0;
  let hi = 0;
  for (const a of ctx.analysis.attempts) {
    if (!a.delta) continue;
    for (let i = 0; i < d.length; i++) {
      const v = a.delta[i]!;
      if (d[i]! < from || d[i]! > to || !Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const step = pickStep(hi - lo, DELTA_STEPS, MAX_DELTA_TICKS);
  return multiples(Math.floor(lo / step) * step, Math.ceil(hi / step) * step, step);
}

/**
 * Pace axis clipped to the 2nd–98th percentile of `values` (s/m, all attempts pooled), plus
 * 4 % headroom, so stops don't flatten everything; ticks fall on round minutes per km or mile.
 */
export function paceAxis(values: number[], units: UnitSystem): { min: number; max: number; ticks: number[] } | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  let min = quantileSorted(sorted, 0.02)!;
  let max = quantileSorted(sorted, 0.98)!;
  // A little headroom so the clipped extremes don't read as a flat ceiling.
  const pad = max - min < 1e-6 ? min * 0.05 : (max - min) * 0.04;
  min = Math.max(0, min - pad);
  max += pad;
  const split = splitLength(units);
  const step = pickStep((max - min) * split, PACE_STEPS, MAX_PACE_TICKS);
  const ticks = multiples(min * split, max * split, step).map((s) => s / split);
  return { min, max, ticks };
}

function pushPositive(out: number[], ys: ArrayLike<number>): void {
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i]!;
    if (Number.isFinite(y) && y > 0) out.push(y);
  }
}

// ---------- Series ----------

function points(d: Float64Array, ys: ArrayLike<number>, map?: (y: number) => number): Point[] {
  const out: Point[] = new Array<Point>(d.length);
  for (let i = 0; i < d.length; i++) out[i] = [d[i]!, map ? map(ys[i]!) : ys[i]!];
  return out;
}

function line(
  id: string,
  name: string,
  color: string,
  data: Point[],
  type: 'solid' | 'dashed' = 'solid',
): LineSeriesOption {
  return {
    id,
    name,
    type: 'line',
    data,
    showSymbol: false,
    sampling: 'lttb',
    emphasis: { disabled: true },
    itemStyle: { color },
    lineStyle: { color, width: 1.5, type },
  };
}

function tint(id: string, data: Point[], color: string): LineSeriesOption {
  return {
    id,
    type: 'line',
    data,
    symbol: 'none',
    sampling: 'lttb',
    silent: true,
    emphasis: { disabled: true },
    lineStyle: { width: 0, opacity: 0 },
    areaStyle: { color, opacity: 0.18, origin: 0 },
  };
}

/**
 * An attempt's line, solid where measured and dashed where `estimated` (split sets between
 * markers). A segment is estimated when either end is; the two series share the joints.
 */
export function attemptLines(a: AttemptAnalysis, stream: string, d: Float64Array, ys: ArrayLike<number>) {
  const est = a.series.estimated;
  const n = d.length;
  const segEstimated = (i: number) => est[i] === 1 || est[i + 1] === 1;
  const solid: Point[] = new Array<Point>(n);
  const dashed: Point[] = new Array<Point>(n);
  let anySolid = false;
  let anyDashed = false;
  for (let i = 0; i < n; i++) {
    const left = i > 0 ? segEstimated(i - 1) : null;
    const right = i < n - 1 ? segEstimated(i) : null;
    const inSolid = left === false || right === false || (left === null && right === null && est[i] !== 1);
    const inDashed = left === true || right === true || (left === null && right === null && est[i] === 1);
    anySolid ||= inSolid;
    anyDashed ||= inDashed;
    solid[i] = [d[i]!, inSolid ? ys[i]! : NaN];
    dashed[i] = [d[i]!, inDashed ? ys[i]! : NaN];
  }
  const out: LineSeriesOption[] = [];
  if (anySolid) out.push(line(`${a.attemptId}/${stream}`, a.label, a.color, solid));
  if (anyDashed) out.push(line(`${a.attemptId}/${stream}/estimated`, a.label, a.color, dashed, 'dashed'));
  return out;
}

/** Dots at a split set's markers, on the line they belong to. */
function markerSeries(
  a: AttemptAnalysis,
  stream: string,
  d: Float64Array,
  ys: ArrayLike<number>,
  outline: string,
): ScatterSeriesOption | null {
  if (a.kind !== 'splits' || !a.markers || a.markers.length === 0) return null;
  return {
    id: `${a.attemptId}/${stream}/markers`,
    name: a.label,
    type: 'scatter',
    data: a.markers.map((m): Point => [m.distance, valueAt(d, ys, m.distance)]),
    symbolSize: 7,
    silent: true,
    emphasis: { disabled: true },
    itemStyle: { color: a.color, borderColor: outline, borderWidth: 1 },
  };
}

// ---------- Bands ----------

function band(r: Range, color: string, opacity: number): MarkAreaData[number] {
  return [{ xAxis: r.from, itemStyle: { color, opacity } }, { xAxis: r.to }];
}

/** Course ranges where any attempt is off course; each flagged grid point covers its cell (± step/2). */
export function offCourseRanges(analysis: AnalysisResult): Range[] {
  const { d, step, length } = analysis.grid;
  const n = d.length;
  const off = new Uint8Array(n);
  for (const a of analysis.attempts) {
    const flags = a.series.offCourse;
    for (let i = 0; i < n; i++) off[i] = off[i]! | flags[i]!;
  }
  const ranges: Range[] = [];
  for (let i = 0; i < n; i++) {
    if (!off[i]) continue;
    let j = i;
    while (j + 1 < n && off[j + 1]) j++;
    ranges.push({ from: Math.max(0, d[i]! - step / 2), to: Math.min(length, d[j]! + step / 2) });
    i = j;
  }
  return ranges;
}

/** Patch that draws `ranges` as bands on a chart (on the anchor series, which every chart has). */
export function highlightPatch(ranges: Range[], colors: ChartContext['colors']): EChartsOption {
  const color = colors.accent;
  return { series: [{ id: 'anchor', markArea: { silent: true, data: ranges.map((r) => band(r, color, 0.18)) } }] };
}

/** "#0f766e" + 0.15 → "rgba(15, 118, 110, 0.15)". */
function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
