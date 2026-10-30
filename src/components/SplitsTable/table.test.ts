import { describe, expect, it } from 'vitest';
import type { AnalysisResult, CourseSegment } from '../../model/types';
import { TOKENS, type ResolvedTheme } from '../../theme';
import { loadFixture } from '../../test/fixtures';
import { MAX_HEAT_ALPHA, availableModes, baselineOf, buildSplitsTable, heat, type SplitsMode } from './table';

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** The non-baseline attempt's delta at the last grid point. */
function deltaEnd(analysis: AnalysisResult): number {
  const delta = analysis.attempts.find((a) => a.delta)!.delta!;
  return delta[delta.length - 1]!;
}

const climb: CourseSegment = { kind: 'climb', from: 1200, to: 3400, elevationChange: 310, avgGrade: 0.14 };

describe.each(['fit-two-attempts', 'gpx-two-attempts'] as const)('%s', (name) => {
  const { analysis } = loadFixture(name);
  const modes: SplitsMode[] = name === 'fit-two-attempts' ? ['distance', 'laps'] : ['distance'];

  it('offers only the modes the data supports', () => {
    expect(availableModes(analysis)).toEqual(modes);
  });

  it.each(modes.flatMap((mode) => (['metric', 'imperial'] as const).map((units) => [mode, units] as const)))(
    'has a totals row equal to delta[end], and %s rows (%s) that add up to it',
    (mode, units) => {
      const table = buildSplitsTable(analysis, mode, units);
      const total = table.totals[1]!;
      expect(total.delta).toBeCloseTo(deltaEnd(analysis), 6);
      expect(sum(table.rows.map((r) => r.cells[1]!.delta!))).toBeCloseTo(total.delta!, 6);
      expect(sum(table.rows.map((r) => r.cells[0]!.time))).toBeCloseTo(table.totals[0]!.time, 6);
      expect(table.totals[0]!.delta).toBeNull();
    },
  );
});

describe('fit-two-attempts', () => {
  const { analysis } = loadFixture('fit-two-attempts');

  it('puts the baseline first and gives the +6:23 ghost delta at the finish', () => {
    const table = buildSplitsTable(analysis, 'distance', 'metric');
    expect(table.columns.map((c) => c.attemptId)).toEqual(['trail-2024', 'trail-2025']);
    expect(table.totals[1]!.delta).toBeCloseTo(383, 0);
  });

  it('splits per km or per mile, the last split the remainder', () => {
    const km = buildSplitsTable(analysis, 'distance', 'metric').rows;
    const mi = buildSplitsTable(analysis, 'distance', 'imperial').rows;
    expect(km).toHaveLength(Math.ceil(analysis.grid.length / 1000));
    expect(mi).toHaveLength(Math.ceil(analysis.grid.length / 1609.344));
    expect(km[11]).toMatchObject({ number: 12, from: 11000, to: 12000 });
    expect(km.at(-1)!.to).toBe(analysis.grid.length);
  });

  it('gives one row per baseline lap, starting where each lap starts', () => {
    const laps = baselineOf(analysis)!.laps;
    const rows = buildSplitsTable(analysis, 'laps', 'metric').rows;
    expect(rows).toHaveLength(laps.length);
    expect(rows.map((r) => r.from)).toEqual(laps.map((l) => l.from));
    expect(rows.every((r) => r.kind === 'lap')).toBe(true);
  });

  it('hides laps when the baseline has fewer than 2', () => {
    const oneLap: AnalysisResult = {
      ...analysis,
      attempts: analysis.attempts.map((a) => (a === baselineOf(analysis) ? { ...a, laps: a.laps.slice(0, 1) } : a)),
    };
    expect(availableModes(oneLap)).toEqual(['distance']);
  });

  it('hides climbs with no segments and shows one row per segment otherwise', () => {
    expect(analysis.segments).toEqual([]);
    expect(availableModes(analysis)).not.toContain('climbs');
    const withClimb = { ...analysis, segments: [climb] };
    expect(availableModes(withClimb)).toContain('climbs');
    const rows = buildSplitsTable(withClimb, 'climbs', 'metric').rows;
    expect(rows).toMatchObject([{ kind: 'climb', number: 1, from: 1200, to: 3400 }]);
  });

  it('scales the heat to the largest |delta| per metre, ignoring off-course cells', () => {
    const table = buildSplitsTable(analysis, 'distance', 'metric');
    const cells = table.rows.map((r) => r.cells[1]!);
    const alphas = cells.map((c) => heat(c, table.maxRate)?.alpha ?? 0);
    expect(Math.max(...alphas)).toBeCloseTo(MAX_HEAT_ALPHA, 9);
    for (const c of cells) {
      if (c.delta) expect(heat(c, table.maxRate)!.token).toBe(c.delta > 0 ? 'behind' : 'ahead');
    }
    expect(heat(table.rows[0]!.cells[0]!, table.maxRate)).toBeNull(); // the baseline has no delta
    expect(heat({ ...cells[0]!, offCourse: true }, table.maxRate)).toBeNull();
  });
});

/** WCAG relative luminance of `#rrggbb`, optionally blended at `alpha` over `under`. */
function luminance(hex: string, alpha = 1, under = '#000000'): number {
  const channel = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 1, 2].map((i) => lin(alpha * channel(hex, i) + (1 - alpha) * channel(under, i)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

it.each(['light', 'dark'] as ResolvedTheme[])('keeps text at 4.5:1 on the strongest heat (%s)', (theme) => {
  const t = TOKENS[theme];
  for (const token of ['ahead', 'behind'] as const) {
    const bg = luminance(t[token], MAX_HEAT_ALPHA, t.surface);
    const fg = luminance(t.text);
    expect((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
