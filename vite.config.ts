/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fitProfile } from './scripts/fitProfile.ts';

export default defineConfig({
  plugins: [react(), fitProfile()],
  // Worker bundles don't inherit `plugins`.
  worker: { plugins: () => [fitProfile()] },
  build: {
    // The lazy ECharts chunk is ~580 kB on its own and can't be split further usefully.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // React changes far less often than the app: keep it in its own long-cached chunk.
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },
  test: {
    // Analysis code is DOM-free, so the default is node. Component and store
    // tests opt in with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Lets tests import stylesheets with ?raw (tokens.test.ts checks tokens.css).
    css: { include: [/tokens\.css/] },
    // Inline the FIT SDK so its profile goes through fitProfile() here too.
    server: { deps: { inline: ['@garmin/fitsdk'] } },
  },
});
