import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AttemptAnalysis, AttemptMetrics } from '../../model/types';
import { loadFixture } from '../../test/fixtures';
import { summaryCards, type Card, type MetricId } from './cards';

const fit = loadFixture('fit-two-attempts').analysis;
const gpx = loadFixture('gpx-two-attempts').analysis;

function card(cards: Card[], id: MetricId): Card {
  const found = cards.find((c) => c.id === id);
  if (!found) throw new Error(`no ${id} card`);
  return found;
}

function row(cards: Card[], id: MetricId, attemptId: string) {
  const found = card(cards, id).rows.find((r) => r.attemptId === attemptId);
  if (!found) throw new Error(`no ${attemptId} row on ${id}`);
  return found;
}

/** The fixture analysis with some of each attempt's metrics replaced. */
function withMetrics(analysis: AnalysisResult, patch: Record<string, Partial<AttemptMetrics>>): AnalysisResult {
  return {
    ...analysis,
    attempts: analysis.attempts.map((a) =>
      a.metrics && patch[a.attemptId] ? { ...a, metrics: { ...a.metrics, ...patch[a.attemptId] } } : a,
    ),
  };
}

describe('summaryCards', () => {
  it('lists the cards in order, each with every attempt', () => {
    const cards = summaryCards(fit, 'metric');
    expect(cards.map((c) => c.id)).toEqual(['time', 'moving', 'stopped', 'ascent', 'avgHr', 'walking']);
    for (const c of cards) expect(c.rows.map((r) => r.attemptId)).toEqual(['trail-2024', 'trail-2025']);
    expect(row(cards, 'time', 'trail-2025')).toMatchObject({ label: '1 Nov 2025', color: '#c06c9b' });
  });

  it('gives time-like deltas a sign and behind/ahead tone, and the baseline row the word baseline', () => {
    const cards = summaryCards(fit, 'metric');
    expect(row(cards, 'time', 'trail-2024').delta).toBe('baseline');
    expect(row(cards, 'time', 'trail-2024').value).toBe('7:08:54');
    expect(row(cards, 'time', 'trail-2025').delta).toEqual({ text: '+9:05', tone: 'behind' });
    expect(row(cards, 'moving', 'trail-2025').delta).toEqual({ text: '+8:41', tone: 'behind' });
    expect(row(cards, 'stopped', 'trail-2025').delta).toEqual({ text: '+0:24', tone: 'behind' });

    const gpxCards = summaryCards(gpx, 'metric');
    expect(row(gpxCards, 'time', 'trail-2025').delta).toEqual({ text: '−0:46', tone: 'ahead' });
    expect(row(gpxCards, 'stopped', 'trail-2025').delta).toEqual({ text: '±0:00', tone: 'neutral' });
  });

  it('shows D+, average HR and walking deltas signed but neutral', () => {
    const cards = summaryCards(fit, 'metric');
    expect(row(cards, 'ascent', 'trail-2025')).toMatchObject({
      value: '2,742 m',
      delta: { text: '+13 m', tone: 'neutral' },
    });
    expect(row(cards, 'avgHr', 'trail-2025')).toMatchObject({
      value: '142 bpm',
      delta: { text: '−2 bpm', tone: 'neutral' },
    });
    expect(row(cards, 'walking', 'trail-2025')).toMatchObject({
      value: '37.8%',
      delta: { text: '−5.5%', tone: 'neutral' },
    });
  });

  it('shows D+ in feet for imperial units', () => {
    const cards = summaryCards(fit, 'imperial');
    expect(row(cards, 'ascent', 'trail-2024').value).toBe('8,951 ft');
    expect(row(cards, 'ascent', 'trail-2025').delta).toEqual({ text: '+44 ft', tone: 'neutral' });
  });

  it('hides a row whose value is null, and a card whose values are all null', () => {
    const oneMissing = summaryCards(withMetrics(fit, { 'trail-2025': { avgHr: null } }), 'metric');
    expect(card(oneMissing, 'avgHr').rows.map((r) => r.attemptId)).toEqual(['trail-2024']);

    const allMissing = summaryCards(
      withMetrics(fit, { 'trail-2024': { avgHr: null, ascent: null }, 'trail-2025': { avgHr: null, ascent: null } }),
      'metric',
    );
    expect(allMissing.map((c) => c.id)).toEqual(['time', 'moving', 'stopped', 'walking']);
  });

  it('leaves the delta out when the baseline has no value', () => {
    const cards = summaryCards(withMetrics(fit, { 'trail-2024': { avgHr: null } }), 'metric');
    expect(card(cards, 'avgHr').rows).toMatchObject([{ attemptId: 'trail-2025', value: '142 bpm', delta: null }]);
  });

  it('puts a split-set attempt on the Time card only, at its interpolated finish time', () => {
    const fromFit = fit.attempts[1]!;
    const splits: AttemptAnalysis = { ...fromFit, attemptId: 'splits', kind: 'splits', metrics: null };
    const cards = summaryCards({ ...fit, attempts: [...fit.attempts, splits] }, 'metric');
    const finish = fromFit.series.time[fromFit.series.time.length - 1]!;
    expect(finish).toBe(26116);
    expect(row(cards, 'time', 'splits')).toMatchObject({
      value: '7:15:16',
      delta: { text: '+6:22', tone: 'behind' },
    });
    for (const c of cards.filter((c) => c.id !== 'time')) {
      expect(c.rows.map((r) => r.attemptId)).not.toContain('splits');
    }
  });

  it('flags estimated walking only on the walking card', () => {
    const cards = summaryCards(gpx, 'metric');
    expect(card(cards, 'walking').rows.every((r) => r.estimated)).toBe(true);
    expect(card(cards, 'time').rows.some((r) => r.estimated)).toBe(false);
    expect(card(summaryCards(fit, 'metric'), 'walking').rows.some((r) => r.estimated)).toBe(false);
  });
});
