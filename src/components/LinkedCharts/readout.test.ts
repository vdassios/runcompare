import { describe, expect, it } from 'vitest';
import { formatDelta, formatDuration, formatElevation, formatPace } from '../../format';
import { loadFixture } from '../../test/fixtures';
import { hoverReadout } from './readout';

const fit = loadFixture('fit-two-attempts').analysis;
const gpx = loadFixture('gpx-two-attempts').analysis;

describe('hoverReadout', () => {
  it('lists every attempt at the nearest grid point, formatted, with the delta', () => {
    const r = hoverReadout(fit, 20003, 'metric', false);
    const [base, other] = fit.attempts;
    expect(r.distance).toBe('20.00 km');
    expect(r.time).toBe(formatDuration(base!.series.time[2000]!));
    expect(r.elevation).toBe(formatElevation(fit.grid.ele![2000]!, 'metric'));
    expect(r.columns).toEqual({ gap: false, hr: true, cad: true, delta: true });
    expect(r.rows.map((row) => row.label)).toEqual([base!.label, other!.label]);
    expect(r.rows[0]).toMatchObject({ isBaseline: true, delta: null, deltaSign: null });
    expect(r.rows[0]!.pace).toBe(formatPace(base!.series.pace[2000]!, 'metric'));
    expect(r.rows[1]!.hr).toMatch(/^\d+ bpm$/);
    expect(r.rows[1]!.cad).toMatch(/^\d+ spm$/);
    const delta = other!.delta![2000]!;
    expect(r.rows[1]).toMatchObject({ delta: formatDelta(delta), deltaSign: Math.sign(Math.round(delta)) });
  });

  it('shows the 2025 finish 6:23 behind', () => {
    const r = hoverReadout(fit, fit.grid.length, 'imperial', true);
    expect(r.rows[1]).toMatchObject({ delta: '+6:23', deltaSign: 1 });
    expect(r.columns.gap).toBe(true);
    expect(r.rows[1]!.pace).toMatch(/\/mi$/);
  });

  it('drops the cadence column for GPX', () => {
    const r = hoverReadout(gpx, 1000, 'metric', false);
    expect(r.columns.cad).toBe(false);
    expect(r.rows.every((row) => row.cad === null)).toBe(true);
  });
});
