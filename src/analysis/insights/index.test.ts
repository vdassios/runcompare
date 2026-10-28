import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Insight, type InsightRule } from '../../model/types';
import { loadFixture } from '../../test/fixtures';
import { runInsights } from '.';

const rule = (id: string, severity: Insight['severity']): InsightRule => ({
  id,
  run: () => [{ id, ruleId: id, attemptId: 'trail-2025', severity, title: id, template: '', values: {}, ranges: [] }],
});

describe('runInsights', () => {
  const { analysis } = loadFixture('gpx-two-attempts');

  it('skips a rule that throws, runs the rest and sorts strong, warn, info', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: InsightRule = {
      id: 'broken',
      run: () => {
        throw new Error('boom');
      },
    };
    const rules = [rule('a', 'info'), broken, rule('b', 'strong'), rule('c', 'warn')];
    expect(runInsights(analysis, DEFAULT_SETTINGS, rules).map((i) => i.ruleId)).toEqual(['b', 'c', 'a']);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
