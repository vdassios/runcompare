/**
 * One ECharts instance on a div: init on mount, `setOption(notMerge)` whenever the option object
 * changes, resize with its box, dispose on unmount. Replaces echarts-for-react, whose CommonJS
 * build and `echarts` prop kept tslib, size-sensor, fast-deep-equal and all of echarts/core.
 */
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { echarts } from './echarts';

interface EChartProps {
  option: EChartsCoreOption;
  style?: CSSProperties;
  onEvents: Record<string, (event: never, chart: EChartsType) => void>;
  /** Called once per instance, after its first option is set. */
  onChartReady(chart: EChartsType): void;
}

export function EChart({ option, style, onEvents, onChartReady }: EChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const instance = useRef<{ chart: EChartsType; ready: boolean } | null>(null);
  const onReady = useRef(onChartReady);
  useLayoutEffect(() => {
    onReady.current = onChartReady;
  });

  useLayoutEffect(() => {
    const chart = echarts.init(el.current!);
    instance.current = { chart, ready: false };
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el.current!);
    return () => {
      observer.disconnect();
      chart.dispose();
      instance.current = null;
    };
  }, []);

  // Bound before the first option, so events raised by onChartReady's patches are seen.
  useLayoutEffect(() => {
    const { chart } = instance.current!;
    const bound = Object.entries(onEvents).map(([name, handler]) => {
      const listener = (event: unknown) => handler(event as never, chart);
      chart.on(name, listener);
      return () => chart.off(name, listener);
    });
    return () => bound.forEach((off) => off());
  }, [onEvents]);

  useLayoutEffect(() => {
    const current = instance.current!;
    current.chart.setOption(option, { notMerge: true });
    if (!current.ready) {
      current.ready = true;
      onReady.current(current.chart);
    }
  }, [option]);

  return <div ref={el} style={style} />;
}
