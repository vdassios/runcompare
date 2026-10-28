/**
 * Colour tokens. tokens.css mirrors these as CSS variables (a test keeps the two in
 * sync); use Tailwind classes (`bg-surface`, `text-behind`) in components and these
 * values only where CSS can't reach, such as ECharts and Leaflet.
 */
export type ColorToken =
  'background' | 'surface' | 'text' | 'muted' | 'border' | 'accent' | 'ahead' | 'behind' | 'off-course' | 'estimated';

export type ResolvedTheme = 'light' | 'dark';

export const TOKENS: Readonly<Record<ResolvedTheme, Readonly<Record<ColorToken, string>>>> = {
  light: {
    background: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    border: '#e2e8f0',
    accent: '#0f766e',
    ahead: '#2563eb', // blue: faster than the baseline
    behind: '#ea580c', // orange: slower than the baseline
    'off-course': '#94a3b8',
    estimated: '#7c3aed',
  },
  dark: {
    background: '#0b1120',
    surface: '#111a2e',
    text: '#e2e8f0',
    muted: '#94a3b8',
    border: '#1e293b',
    accent: '#2dd4bf',
    ahead: '#60a5fa',
    behind: '#fb923c',
    'off-course': '#64748b',
    estimated: '#a78bfa',
  },
};

/** "#2563eb" → "37 99 235", the channel form tokens.css stores. */
export function hexToChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
