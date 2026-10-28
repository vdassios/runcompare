import css from './tokens.css?raw';
import { describe, expect, it } from 'vitest';
import { ATTEMPT_PALETTE, nextAttemptColor } from './palette';
import { TOKENS, hexToChannels, type ColorToken } from './tokens';

function cssBlock(css: string, selector: string): Record<string, string> {
  const body = css.split(`${selector} {`)[1]?.split('}')[0] ?? '';
  return Object.fromEntries([...body.matchAll(/--rc-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
}

describe('tokens.css', () => {
  it.each([
    ['light', ':root'],
    ['dark', '.dark'],
  ] as const)('matches tokens.ts for %s', (theme, selector) => {
    const expected = Object.fromEntries(Object.entries(TOKENS[theme]).map(([k, v]) => [k, hexToChannels(v)]));
    expect(cssBlock(css, selector)).toEqual(expected);
  });
});

// WCAG relative luminance and contrast, and CIE76 ΔE for "looks different".
const channels = (hex: string) => hexToChannels(hex).split(' ').map(Number);
const linear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function lab(hex: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = channels(hex).map(linear);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - (lab(b)[i] ?? 0)));

describe('ATTEMPT_PALETTE', () => {
  const backgrounds: ColorToken[] = ['background', 'surface'];
  const semantic: ColorToken[] = ['ahead', 'behind'];

  it('has 8 distinct lowercase colours', () => {
    expect(ATTEMPT_PALETTE).toHaveLength(8);
    expect(new Set(ATTEMPT_PALETTE).size).toBe(8);
    for (const c of ATTEMPT_PALETTE) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(ATTEMPT_PALETTE)('%s has 3:1 contrast on both themes', (color) => {
    for (const theme of ['light', 'dark'] as const) {
      for (const bg of backgrounds) expect(contrast(color, TOKENS[theme][bg])).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(ATTEMPT_PALETTE)('%s stays clear of ahead and behind', (color) => {
    for (const theme of ['light', 'dark'] as const) {
      for (const token of semantic) expect(deltaE(color, TOKENS[theme][token])).toBeGreaterThanOrEqual(20);
    }
  });

  it('colours are pairwise distinguishable', () => {
    ATTEMPT_PALETTE.forEach((a, i) =>
      ATTEMPT_PALETTE.slice(i + 1).forEach((b) => expect(deltaE(a, b)).toBeGreaterThanOrEqual(20)),
    );
  });
});

describe('nextAttemptColor', () => {
  it('takes the first free colour', () => {
    expect(nextAttemptColor([])).toBe(ATTEMPT_PALETTE[0]);
    expect(nextAttemptColor([ATTEMPT_PALETTE[0]])).toBe(ATTEMPT_PALETTE[1]);
    expect(nextAttemptColor([ATTEMPT_PALETTE[1]])).toBe(ATTEMPT_PALETTE[0]);
    expect(nextAttemptColor([ATTEMPT_PALETTE[0].toUpperCase(), '#123456'])).toBe(ATTEMPT_PALETTE[1]);
  });

  it('cycles once every colour is used', () => {
    const all = [...ATTEMPT_PALETTE];
    expect(nextAttemptColor(all)).toBe(ATTEMPT_PALETTE[0]);
    expect(nextAttemptColor([...all, ATTEMPT_PALETTE[0]])).toBe(ATTEMPT_PALETTE[1]);
  });
});
