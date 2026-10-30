/**
 * Linked charts (PLAN §6): elevation, pace/GAP, heart rate, cadence and time delta on one
 * course axis, with one zoom and one crosshair shared with each other and, through the
 * store's `hoverDistance` and `zoomRange`, with the map and the insights panel.
 */
import type { EChartsType } from 'echarts/core';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { useStore } from '../../store/useStore';
import { useResolvedTheme } from '../../theme';
import { EChart } from './EChart';
import { CHART_GROUP } from './echarts';
import { HoverReadout } from './HoverReadout';
import {
  createHoverSync,
  sameRange,
  zoomAction,
  zoomFromEvent,
  type AxisPointerEvent,
  type DataZoomEvent,
} from './linking';
import {
  CHART_TITLES,
  GRID,
  buildChart,
  chartContext,
  highlightPatch,
  zoomPatch,
  type ChartContext,
  type ChartId,
  type ChartSpec,
  type Range,
} from './options';
import { hoverReadout } from './readout';

const FILL: CSSProperties = { width: '100%', height: '100%' };

export function LinkedCharts() {
  const analysis = useStore((s) => s.analysis);
  const units = useStore((s) => s.units);
  const xAxis = useStore((s) => s.xAxis);
  const setXAxis = useStore((s) => s.setXAxis);
  const theme = useResolvedTheme();
  const [gapToggle, setGapToggle] = useState(false);

  const ctx = useMemo(
    () => (analysis && analysis.attempts.length > 0 ? chartContext(analysis, units, theme, xAxis) : null),
    [analysis, units, theme, xAxis],
  );
  const hasGap = ctx?.analysis.attempts.some((a) => a.kind === 'gps' && a.series.gap !== null) ?? false;
  const showGap = gapToggle && hasGap;
  const charts = useChartSpecs(ctx, showGap);
  if (!ctx) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <div role="group" aria-label="X axis" className="inline-flex overflow-hidden rounded-md border border-border">
          {(['distance', 'time'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={xAxis === mode}
              onClick={() => setXAxis(mode)}
              className={
                xAxis === mode
                  ? 'bg-accent px-3 py-1 font-medium text-surface'
                  : 'bg-surface px-3 py-1 text-text hover:bg-background'
              }
            >
              {mode === 'distance' ? 'Distance' : 'Time'}
            </button>
          ))}
        </div>
        <label className={`inline-flex items-center gap-1.5 ${hasGap ? 'text-text' : 'opacity-50'}`}>
          <input
            type="checkbox"
            className="accent-accent"
            checked={showGap}
            disabled={!hasGap}
            onChange={(e) => setGapToggle(e.target.checked)}
          />
          Show GAP <span className="text-muted">(dashed)</span>
        </label>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Attempts">
          {ctx.analysis.attempts.map((a) => (
            <li key={a.attemptId} className="inline-flex items-center gap-1.5 text-text">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: a.color }} />
              {a.label}
              {a.attemptId === ctx.analysis.baseline.attemptId && <span className="text-muted">(baseline)</span>}
            </li>
          ))}
        </ul>
      </div>
      <ChartStack ctx={ctx} charts={charts} showGap={showGap} />
    </div>
  );
}

/** One option per visible chart, each rebuilt only when its own inputs change (only pace reads `showGap`). */
function useChartSpecs(ctx: ChartContext | null, showGap: boolean): ChartSpec[] {
  const others = useMemo(
    () => new Map(ctx ? ctx.visible.filter((id) => id !== 'pace').map((id) => [id, buildChart(id, ctx)]) : []),
    [ctx],
  );
  const pace = useMemo(
    () => (ctx?.visible.includes('pace') ? buildChart('pace', ctx, { showGap }) : null),
    [ctx, showGap],
  );
  return useMemo(
    () => (ctx ? ctx.visible.map((id) => ({ id, option: id === 'pace' ? pace! : others.get(id)! })) : []),
    [ctx, others, pace],
  );
}

const COARSE_POINTER = '(pointer: coarse)';

function ChartStack({ ctx, charts, showGap }: { ctx: ChartContext; charts: ChartSpec[]; showGap: boolean }) {
  const instances = useRef(new Map<ChartId, EChartsType>());
  const ctxRef = useRef(ctx);
  const shownZoom = useRef<Range | null>(null);
  const hoverSync = useRef<ReturnType<typeof createHoverSync> | null>(null);
  const [marker, setMarker] = useState<{ d: number; x: number; width: number } | null>(null);
  const [pointerY, setPointerY] = useState<number | null>(null);
  const pointerFrame = useRef(0);

  useLayoutEffect(() => {
    ctxRef.current = ctx;
  });

  const liveEntries = useCallback(
    () => [...instances.current.entries()].filter(([, chart]) => !chart.isDisposed()),
    [],
  );
  const live = useCallback(() => liveEntries().map(([, chart]) => chart), [liveEntries]);

  /** Positions the readout next to the crosshair; hidden when `d` is outside the visible window. */
  const placeReadout = useCallback(
    (d: number | null) => {
      const chart = live()[0];
      if (d === null || !chart) return setMarker(null);
      const x = chart.convertToPixel({ xAxisIndex: 0 }, d);
      const width = chart.getWidth();
      const inside = typeof x === 'number' && x >= GRID.left - 1 && x <= width - GRID.right + 1;
      setMarker(inside ? { d, x, width } : null);
    },
    [live],
  );

  /** Re-applies the store's zoom ticks and highlights, which a fresh option (notMerge) wipes. */
  const applyView = useCallback((id: ChartId, chart: EChartsType) => {
    const { zoomRange, highlightRanges } = useStore.getState();
    const c = ctxRef.current;
    const coarse = globalThis.matchMedia?.(COARSE_POINTER).matches ?? false;
    chart.setOption(
      {
        ...highlightPatch(highlightRanges, c.colors),
        ...zoomPatch(id, c, zoomRange),
        // On touch, one-finger drags scroll the page; the slider and pinch still zoom.
        dataZoom: [{ id: 'inside', moveOnMouseMove: !coarse }],
      },
      { lazyUpdate: true },
    );
  }, []);

  const onZoom = useCallback(
    (event: DataZoomEvent, source: EChartsType) => {
      const c = ctxRef.current;
      const range = zoomFromEvent(event, c.analysis.grid.length);
      // Every chart reports the zoom it was handed; act on the first report only.
      if (sameRange(range, shownZoom.current)) return;
      shownZoom.current = range;
      for (const [id, chart] of liveEntries()) {
        chart.setOption(zoomPatch(id, c, range), { lazyUpdate: true });
        // `echarts.connect` relays a zoom by dataZoom id, and only the bottom chart has the
        // slider, so pass every zoom on by value.
        if (chart !== source) chart.dispatchAction(zoomAction(range));
      }
      const store = useStore.getState();
      if (!sameRange(range, store.zoomRange)) store.setZoom(range);
      placeReadout(store.hoverDistance);
    },
    [liveEntries, placeReadout],
  );

  const onEvents = useMemo(
    () => ({
      updateAxisPointer: (event: AxisPointerEvent) => hoverSync.current?.onAxisPointer(event),
      datazoom: onZoom,
    }),
    [onZoom],
  );

  // Store → charts: external hover (the map), zoom (insights) and highlights.
  useEffect(() => {
    const sync = createHoverSync({
      getHover: () => useStore.getState().hoverDistance,
      setHover: (d) => useStore.getState().setHover(d),
      dispatch: (action) => live()[0]?.dispatchAction(action),
      grid: () => ctxRef.current.analysis.grid,
      schedule: (callback) => requestAnimationFrame(callback),
    });
    hoverSync.current = sync;
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.hoverDistance !== prev.hoverDistance) {
        sync.onStoreHover(s.hoverDistance);
        placeReadout(s.hoverDistance);
      }
      if (s.zoomRange !== prev.zoomRange && !sameRange(s.zoomRange, shownZoom.current)) {
        live()[0]?.dispatchAction(zoomAction(s.zoomRange));
      }
      if (s.highlightRanges !== prev.highlightRanges) {
        const patch = highlightPatch(s.highlightRanges, ctxRef.current.colors);
        for (const chart of live()) chart.setOption(patch, { lazyUpdate: true });
      }
    });
    return () => {
      unsubscribe();
      hoverSync.current = null;
    };
  }, [live, placeReadout]);

  // A rebuilt option resets its chart's zoom and patches; restore them from the store.
  useEffect(() => {
    shownZoom.current = null;
    const shown = liveEntries();
    for (const [id, chart] of shown) applyView(id, chart);
    const { zoomRange } = useStore.getState();
    if (zoomRange) shown[0]?.[1].dispatchAction(zoomAction(zoomRange));
  }, [charts, liveEntries, applyView]);

  const onReady = useCallback(
    (id: ChartId, chart: EChartsType) => {
      chart.group = CHART_GROUP;
      instances.current.set(id, chart);
      applyView(id, chart);
      const { zoomRange } = useStore.getState();
      if (zoomRange) chart.dispatchAction(zoomAction(zoomRange));
    },
    [applyView],
  );

  const onUnmount = useCallback((id: ChartId) => instances.current.delete(id), []);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = requestAnimationFrame(() => setPointerY(y));
  };
  const onPointerLeave = () => {
    cancelAnimationFrame(pointerFrame.current);
    setPointerY(null);
  };

  const last = charts[charts.length - 1]?.id;
  return (
    <div className="relative" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      {charts.map((spec) => (
        <ChartBox
          key={spec.id}
          spec={spec}
          slider={spec.id === last}
          onReady={onReady}
          onUnmount={onUnmount}
          onEvents={onEvents}
        />
      ))}
      {marker && (
        <HoverReadout
          readout={hoverReadout(ctx.analysis, marker.d, ctx.units, showGap)}
          x={marker.x}
          width={marker.width}
          y={pointerY}
        />
      )}
    </div>
  );
}

interface ChartBoxProps {
  spec: ChartSpec;
  slider: boolean;
  onReady(id: ChartId, chart: EChartsType): void;
  onUnmount(id: ChartId): void;
  onEvents: Record<string, (event: never, chart: EChartsType) => void>;
}

const ChartBox = memo(function ChartBox({ spec, slider, onReady, onUnmount, onEvents }: ChartBoxProps) {
  const { id } = spec;
  useEffect(() => () => onUnmount(id), [id, onUnmount]);
  return (
    <div
      data-chart={id}
      role="img"
      aria-label={`${CHART_TITLES[id]} chart`}
      // 180 px per chart on desktop, 150 px on mobile; the bottom chart adds the slider's 40 px.
      className={slider ? 'h-[190px] md:h-[220px]' : 'h-[150px] md:h-[180px]'}
    >
      <EChart
        option={spec.option}
        style={FILL}
        onEvents={onEvents}
        onChartReady={(chart: EChartsType) => onReady(id, chart)}
      />
    </div>
  );
});
