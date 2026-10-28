/**
 * Insight rule runner (PLAN §5.11): every file in `./rules/` default-exports one `InsightRule`.
 * All rules run, a rule that throws is logged and skipped, and the insights come back strongest first.
 */
import type { AnalysisResult, AnalysisSettings, Insight, InsightRule } from '../../model/types';

// Rule tests sit next to their rules; loading one as a rule would run its describe() blocks.
const modules = import.meta.glob<{ default: InsightRule }>(['./rules/*.ts', '!./rules/*.test.ts'], { eager: true });

export const RULES: InsightRule[] = Object.values(modules).map((m) => m.default);

const SEVERITY_ORDER: Record<Insight['severity'], number> = { strong: 0, warn: 1, info: 2 };

export function runInsights(
  result: Omit<AnalysisResult, 'insights'>,
  settings: AnalysisSettings,
  rules: InsightRule[] = RULES,
): Insight[] {
  const insights: Insight[] = [];
  for (const rule of rules) {
    try {
      insights.push(...rule.run(result, settings));
    } catch (error) {
      console.error(`Insight rule "${rule.id}" failed and was skipped`, error);
    }
  }
  return insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
