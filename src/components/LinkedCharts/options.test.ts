import type { EChartsOption, LineSeriesOption, MarkAreaComponentOption, XAXisComponentOption } from 'echarts';
import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, formatPace } from '../../format';
import type { AnalysisResult, AttemptAnalysis } from '../../model/types';
import { loadFixture } from '../../test/fixtures';
import { TOKENS } from '../../theme/tokens';
import { zoomAction } from './linking';
import { valueAt } from './lookup';
import {
  buildCharts,
  deltaTicks,
  chartContext,
  highlightPatch,
  offCourseRanges,
  paceAxis,
  visibleCharts,
  zoomPatch,
  xTicks,
  type ChartId,
  type ChartSpec,
} from './options';

type Series = LineSeriesOption & { id: string };

/** Options hold formatter closures, so compare them by their data. */
const json = (value: unknown) => JSON.stringify(value);

const fit = loadFixture('fit-two-attempts').analysis;
const gpx = loadFixture('gpx-two-attempts').analysis;

function chartOf(specs: ChartSpec[], id: ChartId): EChartsOption {
  const spec = specs.find((s) => s.id === id);
  if (!spec) throw new Error(`no ${id} chart`);
  return spec.option;
}

function seriesOf(option: EChartsOption): Series[] {
  return option.series as Series[];
}

function seriesIds(option: EChartsOption): string[] {
  return seriesOf(option).map((s) => s.id);
}

function sliders(option: EChartsOption): unknown[] {
  return (option.dataZoom as { type: string }[]).filter((z) => z.type === 'slider');
}

function xAxisOf(option: EChartsOption): XAXisComponentOption & { axisLabel: { formatter: (d: number) => string } } {
  return option.xAxis as XAXisComponentOption & { axisLabel: { formatter: (d: number) => string } };
}

function bands(option: EChartsOption, seriesId: string) {
  const s = seriesOf(option).find((x) => x.id === seriesId)!;
  return (s.markArea as MarkAreaComponentOption).data as [
    { xAxis: number; itemStyle: { color: string } },
    { xAxis: number },
  ][];
}

/** A copy of `analysis` with one attempt's analysis patched. */
function withAttempt(
  analysis: AnalysisResult,
  id: string,
  patch: (a: AttemptAnalysis) => AttemptAnalysis,
): AnalysisResult {
  return { ...analysis, attempts: analysis.attempts.map((a) => (a.attemptId === id ? patch(a) : a)) };
}

describe('buildCharts on the FIT fixture', () => {
  const specs = buildCharts(fit, 'metric', 'light', 'distance');

  it('stacks elevation, pace, HR, cadence and delta, with the slider on the bottom chart only', () => {
    expect(specs.map((s) => s.id)).toEqual(['elevation', 'pace', 'hr', 'cadence', 'delta']);
    expect(specs.map((s) => sliders(s.option).length)).toEqual([0, 0, 0, 0, 1]);
  });

  it('gives every chart the anchor first, the same grid and the same x extent', () => {
    for (const { option } of specs) {
      const [anchor] = seriesOf(option);
      expect(anchor!.id).toBe('anchor');
      expect((anchor!.data as unknown[]).length).toBe(fit.grid.d.length);
      expect(option.grid).toMatchObject({ left: 76, right: 16 });
      expect(xAxisOf(option)).toMatchObject({ type: 'value', min: 0, max: fit.grid.length });
      expect(option.dataZoom).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'inside' })]));
    }
  });

  it('draws one line per attempt for pace, HR and cadence, and one delta line for 2025', () => {
    expect(seriesIds(chartOf(specs, 'pace'))).toEqual(['anchor', 'trail-2024/pace', 'trail-2025/pace']);
    expect(seriesIds(chartOf(specs, 'hr'))).toEqual(['anchor', 'trail-2024/hr', 'trail-2025/hr']);
    expect(seriesIds(chartOf(specs, 'cadence'))).toEqual(['anchor', 'trail-2024/cadence', 'trail-2025/cadence']);
    expect(seriesIds(chartOf(specs, 'delta'))).toEqual([
      'anchor',
      'zero',
      'trail-2025/delta/behind',
      'trail-2025/delta/ahead',
      'trail-2025/delta',
    ]);
  });

  it('uses the attempt colours, no symbols and LTTB sampling on every line', () => {
    const pace = seriesOf(chartOf(specs, 'pace'));
    expect(pace[1]!.lineStyle!.color).toBe(fit.attempts[0]!.color);
    expect(pace[2]!.lineStyle!.color).toBe(fit.attempts[1]!.color);
    for (const { option } of specs) {
      for (const s of seriesOf(option).filter((x) => x.id !== 'anchor' && x.id !== 'zero')) {
        expect(s.showSymbol === false || s.symbol === 'none').toBe(true);
        expect(s.sampling).toBe('lttb');
      }
    }
  });

  it('fills the course profile from grid.ele', () => {
    const [, elevation] = seriesOf(chartOf(specs, 'elevation'));
    const data = elevation!.data as [number, number][];
    expect(data[100]).toEqual([fit.grid.d[100], fit.grid.ele![100]]);
    expect(elevation!.areaStyle).toBeDefined();
    expect(bands(chartOf(specs, 'elevation'), 'elevation')).toEqual([]); // no segments until M3, no off-course
  });

  it('tints the delta orange above zero and blue below, with a zero line', () => {
    const option = chartOf(specs, 'delta');
    const delta = fit.attempts[1]!.delta!;
    const behind = seriesOf(option).find((s) => s.id === 'trail-2025/delta/behind')!;
    const ahead = seriesOf(option).find((s) => s.id === 'trail-2025/delta/ahead')!;
    expect(behind.areaStyle!.color).toBe(TOKENS.light.behind);
    expect(ahead.areaStyle!.color).toBe(TOKENS.light.ahead);
    const last = delta.length - 1;
    expect((behind.data as [number, number][])[last]![1]).toBe(Math.max(delta[last]!, 0));
    expect((ahead.data as [number, number][])[last]![1]).toBe(Math.min(delta[last]!, 0));
    const zero = seriesOf(option).find((s) => s.id === 'zero')!;
    expect(zero.markLine!.data).toEqual([{ yAxis: 0 }]);
  });

  it('formats the delta axis with formatDelta', () => {
    const yAxis = (chartOf(specs, 'delta').yAxis as { axisLabel: { formatter: (v: number) => string } }[])[0]!;
    expect(yAxis.axisLabel.formatter(383)).toBe('+6:23');
    expect(yAxis.axisLabel.formatter(-42)).toBe('−0:42');
  });

  it('inverts the pace axis and clips it to the 2nd–98th percentile of both attempts', () => {
    type PaceYAxis = { inverse: boolean; min: number; max: number; axisTick: { customValues: number[] } };
    const yAxis = (chartOf(specs, 'pace').yAxis as PaceYAxis[])[0]!;
    const pooled = fit.attempts.flatMap((a) => Array.from(a.series.pace)).filter((v) => v > 0);
    const expected = paceAxis(pooled, 'metric')!;
    expect(yAxis.inverse).toBe(true);
    expect([yAxis.min, yAxis.max, yAxis.axisTick.customValues]).toEqual([expected.min, expected.max, expected.ticks]);
    expect(expected.ticks.map((t) => formatPace(t, 'metric'))).toEqual(['5:00 /km', '10:00 /km', '15:00 /km']);
    const fastest = Math.min(...pooled);
    const slowest = Math.max(...pooled);
    expect(yAxis.min).toBeGreaterThan(fastest);
    expect(yAxis.max).toBeLessThan(slowest);
  });

  it('adds dashed GAP lines only when asked', () => {
    const withGap = buildCharts(fit, 'metric', 'light', 'distance', { showGap: true });
    const gap = seriesOf(chartOf(withGap, 'pace')).filter((s) => s.id.endsWith('/gap'));
    expect(gap.map((s) => s.id)).toEqual(['trail-2024/gap', 'trail-2025/gap']);
    expect(gap.every((s) => s.lineStyle!.type === 'dashed')).toBe(true);
    // The other charts don't depend on the toggle.
    expect(json(chartOf(withGap, 'hr'))).toBe(json(chartOf(specs, 'hr')));
  });
});

describe('buildCharts on the GPX fixture', () => {
  it('has no cadence chart', () => {
    const specs = buildCharts(gpx, 'metric', 'light', 'distance');
    expect(specs.map((s) => s.id)).toEqual(['elevation', 'pace', 'hr', 'delta']);
    expect(sliders(chartOf(specs, 'delta'))).toHaveLength(1);
  });
});

describe('off-course bands', () => {
  const offCourse = new Uint8Array(fit.grid.d.length);
  offCourse.fill(1, 2000, 2101); // 20,000–21,000 m
  const patched = withAttempt(fit, 'trail-2025', (a) => ({ ...a, series: { ...a.series, offCourse } }));

  it('grey-bands the stretch where any attempt is off course', () => {
    expect(offCourseRanges(patched)).toEqual([{ from: 19995, to: 21005 }]);
    const elevation = chartOf(buildCharts(patched, 'metric', 'dark', 'distance'), 'elevation');
    const [band] = bands(elevation, 'elevation');
    expect(band![0]).toMatchObject({ xAxis: 19995, itemStyle: { color: TOKENS.dark['off-course'] } });
    expect(band![1]).toEqual({ xAxis: 21005 });
  });

  it('shades climbs and descents from analysis.segments', () => {
    const withSegments: AnalysisResult = {
      ...fit,
      segments: [{ kind: 'climb', from: 1000, to: 3000, elevationChange: 300, avgGrade: 0.15 }],
    };
    const elevation = chartOf(buildCharts(withSegments, 'metric', 'light', 'distance'), 'elevation');
    expect(bands(elevation, 'elevation').map(([a, b]) => [a.xAxis, b.xAxis])).toEqual([[1000, 3000]]);
  });
});

describe('zoomed to 3–6 km', () => {
  const range = { from: 3000, to: 6000 };

  it('zooms every chart to the range by value', () => {
    expect(zoomAction(range)).toEqual({ type: 'dataZoom', startValue: 3000, endValue: 6000 });
    expect(zoomAction(null)).toEqual({ type: 'dataZoom', start: 0, end: 100 });
  });

  it('puts distance ticks on round half-kilometres inside the window', () => {
    const patch = zoomPatch('pace', chartContext(fit, 'metric', 'light', 'distance'), range) as {
      xAxis: { axisLabel: { customValues: number[]; formatter: (d: number) => string } };
      yAxis?: unknown;
    };
    expect(patch.xAxis.axisLabel.customValues).toEqual([3000, 3500, 4000, 4500, 5000, 5500, 6000]);
    expect(patch.xAxis.axisLabel.formatter(3500)).toBe('3.5 km');
    expect(patch.yAxis).toBeUndefined();
  });

  it('re-ticks the delta axis on round durations for the deltas inside the window', () => {
    const ctx = chartContext(fit, 'metric', 'light', 'distance');
    const delta = fit.attempts[1]!.delta!.slice(300, 601);
    const ticks = deltaTicks(ctx, range);
    expect(ticks).toContain(0);
    expect(ticks[0]).toBeLessThanOrEqual(Math.min(0, ...delta));
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(Math.max(0, ...delta));
    expect(ticks.length).toBeLessThanOrEqual(6);
    const patch = zoomPatch('delta', ctx, range) as { yAxis: { axisLabel: { customValues: number[] } }[] };
    expect(patch.yAxis[0]!.axisLabel.customValues).toEqual(ticks);
    // Whole course, about −1:00 to +7:00: whole minutes.
    expect(deltaTicks(ctx, null).every((t) => t % 60 === 0)).toBe(true);
  });

  it('puts time ticks where the baseline time is round, labelled with that time', () => {
    const ctx = chartContext(fit, 'metric', 'light', 'time');
    const { values, label } = xTicks(ctx, range);
    const baseline = fit.attempts[0]!.series.time;
    const t0 = valueAt(fit.grid.d, baseline, 3000);
    const t1 = valueAt(fit.grid.d, baseline, 6000);
    expect(values.length).toBeGreaterThanOrEqual(2);
    for (const d of values) {
      expect(d).toBeGreaterThanOrEqual(3000);
      expect(d).toBeLessThanOrEqual(6000);
      const t = valueAt(fit.grid.d, baseline, d);
      expect(t).toBeGreaterThanOrEqual(t0);
      expect(t).toBeLessThanOrEqual(t1);
      expect(Math.round(t) % 300).toBe(0); // 5-minute ticks across a ~25-minute window
      expect(label(d)).toBe(formatDuration(t));
    }
  });
});

describe('x axis', () => {
  it('labels distance with formatDistance in the chosen units', () => {
    const ticks = xTicks(chartContext(fit, 'imperial', 'light', 'distance'), null);
    // 33.6 mi of course: a tick every 10 mi.
    expect(ticks.values).toEqual([0, 10, 20, 30].map((mi) => mi * 1609.344));
    expect(ticks.label(10 * 1609.344)).toBe(formatDistance(10 * 1609.344, 'imperial', { decimals: 0 }));
    expect(ticks.label(10 * 1609.344)).toBe('10 mi');
  });

  it('on the time axis keeps the distance positions and labels them with the baseline elapsed time', () => {
    const specs = buildCharts(fit, 'metric', 'light', 'time');
    const xAxis = xAxisOf(chartOf(specs, 'pace'));
    expect(xAxis).toMatchObject({ type: 'value', min: 0, max: fit.grid.length });
    const baseline = fit.attempts[0]!.series.time;
    expect(xAxis.axisLabel.formatter(fit.grid.d[1000]!)).toBe(formatDuration(baseline[1000]!));
    // The series stay on course distance.
    const [, pace] = seriesOf(chartOf(specs, 'pace'));
    expect((pace!.data as [number, number][])[1000]![0]).toBe(fit.grid.d[1000]);
    // Whole-course ticks every two hours of the baseline's 7:08:53.
    const { values, label } = xTicks(chartContext(fit, 'metric', 'light', 'time'), null);
    expect(values.map(label)).toEqual(['0:00', '2:00:00', '4:00:00', '6:00:00']);
  });
});

describe('purity', () => {
  it('returns equal options for equal inputs and never mutates the analysis', () => {
    const before = fit.attempts.map((a) => a.series.pace.slice());
    expect(json(buildCharts(fit, 'metric', 'light', 'distance'))).toBe(
      json(buildCharts(fit, 'metric', 'light', 'distance')),
    );
    fit.attempts.forEach((a, i) => expect(a.series.pace).toEqual(before[i]));
  });

  it('re-themes from the tokens', () => {
    const light = chartOf(buildCharts(fit, 'metric', 'light', 'distance'), 'delta');
    const dark = chartOf(buildCharts(fit, 'metric', 'dark', 'distance'), 'delta');
    const behind = (o: EChartsOption) => seriesOf(o).find((s) => s.id === 'trail-2025/delta/behind')!.areaStyle!.color;
    expect(behind(light)).toBe(TOKENS.light.behind);
    expect(behind(dark)).toBe(TOKENS.dark.behind);
  });

  it('formats the pace axis in the chosen units', () => {
    const yAxis = (o: EChartsOption) => (o.yAxis as { axisLabel: { formatter: (v: number) => string } }[])[0]!;
    const metric = yAxis(chartOf(buildCharts(fit, 'metric', 'light', 'distance'), 'pace'));
    const imperial = yAxis(chartOf(buildCharts(fit, 'imperial', 'light', 'distance'), 'pace'));
    expect(metric.axisLabel.formatter(0.3)).toBe(formatPace(0.3, 'metric'));
    expect(imperial.axisLabel.formatter(0.3)).toBe(formatPace(0.3, 'imperial'));
  });
});

describe('paceAxis', () => {
  it('clips to the 2nd and 98th percentiles, plus 4 % headroom', () => {
    // 1..101 s/km over 101 values: p2 = 3 and p98 = 99, padded by 0.04 × 96.
    const values = Array.from({ length: 101 }, (_, i) => (i + 1) / 1000);
    const axis = paceAxis(values, 'metric')!;
    expect(axis.min).toBe(0); // never below zero
    expect(axis.max).toBeCloseTo(0.099 + 0.00384, 9);
  });

  it('puts ticks on round minutes per km inside the clipped range', () => {
    // 4:00–19:50 /km plus one stop far slower; clipped to 4:19–19:41 /km, padded to 3:42–20:18 /km.
    const values = [...Array.from({ length: 100 }, (_, i) => (240 + i * 9.6) / 1000), 5];
    const axis = paceAxis(values, 'metric')!;
    expect(axis.ticks.map((t) => formatPace(t, 'metric'))).toEqual(['5:00 /km', '10:00 /km', '15:00 /km', '20:00 /km']);
    expect(axis.max).toBeLessThan(5);
  });

  it('returns null without data', () => {
    expect(paceAxis([], 'metric')).toBeNull();
  });
});

describe('hidden charts', () => {
  it('hides elevation without grid.ele, HR and cadence without the streams, delta with only the baseline', () => {
    const noEle = { ...fit, grid: { ...fit.grid, ele: null } };
    expect(visibleCharts(noEle)).toEqual(['pace', 'hr', 'cadence', 'delta']);
    const noHr = withAttempt(
      withAttempt(fit, 'trail-2024', (a) => ({ ...a, series: { ...a.series, hr: null } })),
      'trail-2025',
      (a) => ({ ...a, series: { ...a.series, hr: null } }),
    );
    expect(visibleCharts(noHr)).toEqual(['elevation', 'pace', 'cadence', 'delta']);
    const baselineOnly = { ...fit, attempts: fit.attempts.slice(0, 1) };
    const specs = buildCharts(baselineOnly, 'metric', 'light', 'distance');
    expect(specs.map((s) => s.id)).toEqual(['elevation', 'pace', 'hr', 'cadence']);
    expect(sliders(chartOf(specs, 'cadence'))).toHaveLength(1);
    expect(visibleCharts({ ...fit, attempts: [] })).toEqual([]);
  });
});

describe('split-set attempts', () => {
  // The 2025 attempt recast as a split set with markers every 10 km: exact at markers, estimated between.
  const markers = [10000, 20000, 30000, 40000, 50000].map((distance) => ({
    distance,
    time: valueAt(fit.grid.d, fit.attempts[1]!.series.time, distance),
  }));
  const estimated = new Uint8Array(fit.grid.d.length).fill(1);
  for (const m of markers) estimated[m.distance / 10] = 0;
  const splits = withAttempt(fit, 'trail-2025', (a) => ({
    ...a,
    kind: 'splits',
    series: { ...a.series, hr: null, cad: null, ele: null, moving: null, walking: null, estimated },
    metrics: null,
    markers,
  }));
  const specs = buildCharts(splits, 'metric', 'light', 'distance', { showGap: true });

  it('appear only on the pace and delta charts', () => {
    for (const id of ['hr', 'cadence'] as const) {
      expect(seriesIds(chartOf(specs, id)).some((s) => s.startsWith('trail-2025'))).toBe(false);
    }
    expect(seriesIds(chartOf(specs, 'pace')).filter((s) => s.startsWith('trail-2025'))).toEqual([
      'trail-2025/pace/estimated',
      'trail-2025/pace/markers',
    ]);
    expect(seriesIds(chartOf(specs, 'delta'))).toEqual(
      expect.arrayContaining(['trail-2025/delta/estimated', 'trail-2025/delta/markers']),
    );
  });

  it('are dashed where estimated, with a dot at each marker', () => {
    const pace = seriesOf(chartOf(specs, 'pace'));
    expect(pace.find((s) => s.id === 'trail-2025/pace/estimated')!.lineStyle!.type).toBe('dashed');
    const dots = pace.find((s) => s.id === 'trail-2025/pace/markers')!.data as [number, number][];
    expect(dots.map(([d]) => d)).toEqual([10000, 20000, 30000, 40000, 50000]);
    const delta = seriesOf(chartOf(specs, 'delta'));
    const deltaDots = delta.find((s) => s.id === 'trail-2025/delta/markers')!.data as [number, number][];
    expect(deltaDots[0]![1]).toBeCloseTo(fit.attempts[1]!.delta![1000]!, 6);
  });

  it('draw solid where measured: a GPS attempt has no estimated line', () => {
    const pace = buildCharts(fit, 'metric', 'light', 'distance');
    expect(seriesIds(chartOf(pace, 'pace')).some((id) => id.endsWith('/estimated'))).toBe(false);
  });
});

describe('highlightPatch', () => {
  it('draws the store highlights as bands on every chart’s anchor series', () => {
    const patch = highlightPatch([{ from: 3000, to: 6000 }], TOKENS.dark);
    expect(patch.series).toEqual([
      {
        id: 'anchor',
        markArea: {
          silent: true,
          data: [[{ xAxis: 3000, itemStyle: { color: TOKENS.dark.accent, opacity: 0.18 } }, { xAxis: 6000 }]],
        },
      },
    ]);
  });
});
