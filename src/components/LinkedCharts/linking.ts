/**
 * Glue between ECharts events and the store's shared view state (hoverDistance,
 * zoomRange), kept free of React and DOM so it can be tested directly. ECharts
 * replays our own actions back as events, so every path here guards against echoes.
 */
import type { CourseGrid } from '../../model/types';
import { nearestIndex } from './lookup';
import type { Range } from './options';

/** The fields of ECharts' `updateAxisPointer` event we read. */
export interface AxisPointerEvent {
  axesInfo?: { axisDim: string; axisIndex: number; value: number }[];
}

/** The fields of ECharts' `datazoom` event we read: percentages or values, possibly batched. */
export interface DataZoomEvent {
  start?: number;
  end?: number;
  startValue?: number;
  endValue?: number;
  batch?: DataZoomEvent[];
}

export type ShowTipAction = { type: 'showTip'; seriesIndex: number; dataIndex: number };
export type HideTipAction = { type: 'hideTip' };
export type DataZoomAction =
  { type: 'dataZoom'; startValue: number; endValue: number } | { type: 'dataZoom'; start: number; end: number };

export const HIDE_TIP: HideTipAction = { type: 'hideTip' };

/** Course distance under the crosshair, or null when the pointer left the plot. */
export function axisPointerDistance(event: AxisPointerEvent): number | null {
  const x = event.axesInfo?.find((a) => a.axisDim === 'x');
  return x && Number.isFinite(x.value) ? x.value : null;
}

/** Shows the crosshair at `d`: the anchor series (index 0 in every chart) at the nearest grid point. */
export function showTipAction(grid: CourseGrid, d: number): ShowTipAction {
  return { type: 'showTip', seriesIndex: 0, dataIndex: nearestIndex(grid.d, d) };
}

/** The visible course range after a zoom; null when the whole course is visible. */
export function zoomFromEvent(event: DataZoomEvent, length: number): Range | null {
  const e = event.batch?.[0] ?? event;
  let from: number;
  let to: number;
  if (typeof e.startValue === 'number' && typeof e.endValue === 'number') {
    from = e.startValue;
    to = e.endValue;
  } else if (typeof e.start === 'number' && typeof e.end === 'number') {
    // Every chart's x axis spans exactly [0, length], so percentages map directly.
    from = (e.start / 100) * length;
    to = (e.end / 100) * length;
  } else {
    return null;
  }
  from = Math.max(0, from);
  to = Math.min(length, to);
  return from <= 0.5 && to >= length - 0.5 ? null : { from, to };
}

export function zoomAction(range: Range | null): DataZoomAction {
  return range
    ? { type: 'dataZoom', startValue: range.from, endValue: range.to }
    : { type: 'dataZoom', start: 0, end: 100 };
}

/** Equal within half a metre; null means the whole course. */
export function sameRange(a: Range | null, b: Range | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a.from - b.from) < 0.5 && Math.abs(a.to - b.to) < 0.5;
}

export interface HoverSyncDeps {
  getHover(): number | null;
  setHover(d: number | null): void;
  /** Sends an action to the charts (one chart is enough: `echarts.connect` relays it). */
  dispatch(action: ShowTipAction | HideTipAction): void;
  grid(): CourseGrid | null;
  /** Defers a store write to the next frame; `requestAnimationFrame` in the app. */
  schedule(callback: () => void): void;
}

/**
 * Two-way hover link. Crosshair moves go to `setHover`, at most once per frame. An
 * external `hoverDistance` (the map) shows the crosshair there, unless it is the value
 * the charts just reported themselves.
 */
export function createHoverSync(deps: HoverSyncDeps) {
  let reported: number | null | undefined;
  let scheduled = false;

  return {
    onAxisPointer(event: AxisPointerEvent): void {
      reported = axisPointerDistance(event);
      if (scheduled) return;
      scheduled = true;
      deps.schedule(() => {
        scheduled = false;
        const d = reported ?? null;
        if (d !== deps.getHover()) deps.setHover(d);
      });
    },
    onStoreHover(d: number | null): void {
      if (d === reported) return;
      reported = undefined;
      const grid = deps.grid();
      if (d === null) deps.dispatch(HIDE_TIP);
      else if (grid) deps.dispatch(showTipAction(grid, d));
    },
  };
}
