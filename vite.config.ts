/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  test: {
    // Analysis code is DOM-free, so the default is node. Component and store
    // tests opt in with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Lets tests import stylesheets with ?raw (tokens.test.ts checks tokens.css).
    css: { include: [/tokens\.css/] },
  },
});
