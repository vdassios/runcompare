import { describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../../test/fixtures';
import {
  HIDE_TIP,
  axisPointerDistance,
  createHoverSync,
  sameRange,
  showTipAction,
  zoomFromEvent,
  type HideTipAction,
  type ShowTipAction,
} from './linking';

const { grid } = loadFixture('fit-two-attempts').analysis;

/** An `updateAxisPointer` event as ECharts emits it with the crosshair at `d`. */
const pointerAt = (d: number) => ({
  type: 'updateAxisPointer',
  seriesIndex: 0,
  dataIndex: d / 10,
  axesInfo: [{ axisDim: 'x', axisIndex: 0, value: d }],
});

function harness(initialHover: number | null = null) {
  let hover = initialHover;
  const frames: (() => void)[] = [];
  const dispatched: (ShowTipAction | HideTipAction)[] = [];
  const setHover = vi.fn((d: number | null) => {
    hover = d;
  });
  const sync = createHoverSync({
    getHover: () => hover,
    setHover,
    dispatch: (action) => dispatched.push(action),
    grid: () => grid,
    schedule: (callback) => frames.push(callback),
  });
  const flush = () => frames.splice(0).forEach((f) => f());
  return { sync, setHover, dispatched, flush };
}

describe('axis pointer → store', () => {
  it('reads the x value of an updateAxisPointer event', () => {
    expect(axisPointerDistance(pointerAt(12340))).toBe(12340);
    expect(axisPointerDistance({ axesInfo: [{ axisDim: 'y', axisIndex: 0, value: 3 }] })).toBeNull();
    expect(axisPointerDistance({})).toBeNull(); // the pointer left the plot
  });

  it('calls setHover(d) once per animation frame with the latest position', () => {
    const { sync, setHover, flush } = harness();
    sync.onAxisPointer(pointerAt(1000));
    sync.onAxisPointer(pointerAt(1010));
    sync.onAxisPointer(pointerAt(1020));
    expect(setHover).not.toHaveBeenCalled();
    flush();
    expect(setHover).toHaveBeenCalledExactlyOnceWith(1020);
    sync.onAxisPointer({});
    flush();
    expect(setHover).toHaveBeenLastCalledWith(null);
  });

  it('skips the store write when the value is unchanged (connected charts all report the same move)', () => {
    const { sync, setHover, flush } = harness(1000);
    sync.onAxisPointer(pointerAt(1000));
    flush();
    expect(setHover).not.toHaveBeenCalled();
  });
});

describe('store → charts', () => {
  it('shows the tip at an external hoverDistance (the map) on the nearest grid point', () => {
    const { sync, dispatched } = harness();
    sync.onStoreHover(12344);
    expect(dispatched).toEqual([{ type: 'showTip', seriesIndex: 0, dataIndex: 1234 }]);
    sync.onStoreHover(null);
    expect(dispatched[1]).toEqual(HIDE_TIP);
  });

  it('does not echo the charts’ own hover back to them', () => {
    const { sync, dispatched, flush } = harness();
    sync.onAxisPointer(pointerAt(5000));
    flush();
    sync.onStoreHover(5000);
    expect(dispatched).toEqual([]);
  });

  it('settles after the charts snap an external hover to the grid', () => {
    const { sync, setHover, dispatched, flush } = harness();
    sync.onStoreHover(12344); // from the map
    sync.onAxisPointer(pointerAt(12340)); // ECharts answers the showTip
    flush();
    expect(setHover).toHaveBeenCalledExactlyOnceWith(12340);
    sync.onStoreHover(12340); // the store echoes the snapped value
    expect(dispatched).toHaveLength(1);
  });

  it('clamps the tip to the ends of the course', () => {
    expect(showTipAction(grid, -50).dataIndex).toBe(0);
    expect(showTipAction(grid, 1e9).dataIndex).toBe(grid.d.length - 1);
  });
});

describe('zoom', () => {
  const length = 10000;

  it('turns slider and inside-zoom percentages into a course range', () => {
    expect(zoomFromEvent({ start: 30, end: 60 }, length)).toEqual({ from: 3000, to: 6000 });
    expect(zoomFromEvent({ batch: [{ start: 10, end: 20 }] }, length)).toEqual({ from: 1000, to: 2000 });
  });

  it('reads values when the zoom came from a dispatched action', () => {
    expect(zoomFromEvent({ startValue: 3000, endValue: 6000 }, length)).toEqual({ from: 3000, to: 6000 });
  });

  it('reports the whole course as null', () => {
    expect(zoomFromEvent({ start: 0, end: 100 }, length)).toBeNull();
    expect(zoomFromEvent({}, length)).toBeNull();
  });

  it('compares ranges to within half a metre', () => {
    expect(sameRange({ from: 3000, to: 6000 }, { from: 3000.2, to: 5999.9 })).toBe(true);
    expect(sameRange({ from: 3000, to: 6000 }, { from: 3010, to: 6000 })).toBe(false);
    expect(sameRange(null, null)).toBe(true);
    expect(sameRange(null, { from: 0, to: 1 })).toBe(false);
  });
});
