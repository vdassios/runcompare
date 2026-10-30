import { describe, expect, it } from 'vitest';
import { fillTemplate } from '../../../format';
import { DEFAULT_SETTINGS, type AlignedSeries } from '../../../model/types';
import { loadFixture } from '../../../test/fixtures';
import {
  comparison,
  courseRange,
  maskUnusable,
  meanOver,
  rollingMedianOnGrid,
  runsWhere,
  splitByDistance,
  splitByMovingTime,
  stepTimes,
  timesOver,
} from './_helpers';
import cadenceFade from './cadenceFade';
import cardiacDrift from './cardiacDrift';
import lostGround from './lostGround';
import pacing from './pacing';

/** 10 s per grid point, with a stop over points 3–4 and point 1 off-course. */
const series: AlignedSeries = {
  time: Float64Array.from([0, 10, 20, 30, 40, 50, 60, 70, 80]),
  ele: null,
  hr: null,
  cad: null,
  pace: new Float32Array(9).fill(1),
  gap: null,
  moving: Uint8Array.from([1, 1, 1, 0, 0, 1, 1, 1, 1]),
  walking: null,
  offCourse: Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0]),
  estimated: new Uint8Array(9),
};

describe('rule helpers', () => {
  it('compares the GPS attempts other than a course baseline with it', () => {
    const { analysis } = loadFixture('gpx-two-attempts');
    const [a, b] = analysis.attempts;
    const c = comparison(analysis);
    expect(c?.baseline.attemptId).toBe('trail-2024');
    expect(c?.attempts.map((x) => x.attemptId)).toEqual(['trail-2025']);
    expect(comparison({ ...analysis, attempts: [a!, { ...b!, kind: 'splits' as const }] })?.attempts).toEqual([]);
    const onDistance = {
      ...analysis,
      baseline: { kind: 'distance' as const, attemptId: 'trail-2024', preset: 'custom' as const, distance: 1000 },
    };
    expect(comparison(onDistance)).toBeNull();
  });

  it('masks off-course and stopped points', () => {
    expect(Array.from(maskUnusable(series, [1, 2, 3, 4, 5, 6, 7, 8, 9]))).toEqual([1, NaN, 3, NaN, NaN, 6, 7, 8, 9]);
  });

  it('times each step while moving, with stops at 0 and off-course steps left out', () => {
    expect(Array.from(stepTimes(series))).toEqual([NaN, NaN, 0, 0, 10, 10, 10, 10, NaN]);
    const baseline = Float64Array.from([10, 10, 5, 5, 5, NaN, 5, 5, NaN]);
    expect(timesOver(stepTimes(series), baseline, { start: 0, end: 9 })).toEqual({ attempt: 30, baseline: 25 });
  });

  it('cuts by course distance', () => {
    expect(splitByDistance(10, 3)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 10 },
    ]);
  });

  it('cuts by moving time, so a stop stretches the part it falls in', () => {
    // 60 s moving: halves end where the clock reaches 30 s, which is point 5 after the 20 s stop.
    expect(splitByMovingTime(series, 2)).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 9 },
    ]);
    expect(splitByMovingTime(series, 3).map((r) => r.end)).toEqual([2, 6, 9]);
  });

  it('turns index ranges into course metres and means', () => {
    const d = Float64Array.from([0, 10, 20, 30, 40]);
    expect(courseRange(d, { start: 1, end: 3 })).toEqual({ from: 10, to: 30 });
    expect(courseRange(d, { start: 3, end: 5 })).toEqual({ from: 30, to: 40 });
    expect(meanOver([1, NaN, 3, 100], { start: 0, end: 3 })).toBe(2);
    expect(meanOver([NaN], { start: 0, end: 1 })).toBeNaN();
  });

  it('smooths over course metres with a median and finds runs', () => {
    const spiky = [1, 1, 9, 1, 1, 5, 5, 5, 1];
    expect(Array.from(rollingMedianOnGrid(spiky, 10, 30))).toEqual([1, 1, 1, 1, 1, 5, 5, 5, 3]);
    expect(runsWhere([0, 2, 2, NaN, 2, 0, 2], (v) => v > 1)).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 5 },
      { start: 6, end: 7 },
    ]);
  });
});

describe('effort and fade rules on the FIT fixtures, 2025 against 2024', () => {
  it('logs what fires, for the owner to review', () => {
    const { analysis } = loadFixture('fit-two-attempts');
    for (const rule of [pacing, lostGround, cardiacDrift, cadenceFade]) {
      const insights = rule.run(analysis, DEFAULT_SETTINGS);
      console.log(`${rule.id}: ${insights.length} fired`);
      for (const i of insights) {
        const ranges = i.ranges.map((r) => `${Math.round(r.from)}–${Math.round(r.to)} m`).join(', ');
        console.log(
          `  ${i.id} [${i.severity}] ${i.title}: ${fillTemplate(i.template, i.values, 'metric')} (${ranges})`,
        );
      }
    }
  });
});
