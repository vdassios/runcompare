/**
 * The ECharts build the linked charts use: only the pieces they need, registered once,
 * and the connect group that shares one zoom and one crosshair between the charts.
 */
import { LineChart, ScatterChart } from 'echarts/charts';
import {
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import EChartsReactImport from 'echarts-for-react/lib/core';

echarts.use([
  LineChart,
  ScatterChart,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export const CHART_GROUP = 'runcompare-linked-charts';
echarts.connect(CHART_GROUP);

// echarts-for-react ships CommonJS only; depending on the bundler's interop the class is
// the default import itself or that import's `default`.
type EChartsReactClass = typeof EChartsReactImport;
export const EChartsReact: EChartsReactClass =
  (EChartsReactImport as unknown as { default?: EChartsReactClass }).default ?? EChartsReactImport;

export { echarts };
