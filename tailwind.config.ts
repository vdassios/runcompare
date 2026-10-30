import type { Config } from 'tailwindcss';

// Every colour is a CSS variable from src/theme/tokens.css, stored as RGB channels
// so Tailwind's opacity modifiers (`bg-behind/20`) work.
const token = (name: string) => `rgb(var(--rc-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: token('background'),
        surface: token('surface'),
        text: token('text'),
        muted: token('muted'),
        border: token('border'),
        accent: token('accent'),
        ahead: token('ahead'),
        behind: token('behind'),
        'off-course': token('off-course'),
        estimated: token('estimated'),
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
