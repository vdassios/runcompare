import { defineConfig, type Project } from '@playwright/test';

/**
 * Visual and e2e suites. Run them through `npm run test:visual` / `npm run test:e2e`, which
 * use the official Playwright Docker image so macOS and Linux CI render the same pixels
 * (scripts/playwright-docker.sh).
 *
 * The visual projects only match tests/visual/**; the `e2e` project only matches tests/e2e/**.
 */
const PORT = 4173;
const CI = !!process.env.CI;

const desktop = { width: 1280, height: 800 };
const mobile = { width: 390, height: 844 };

const visual = (name: string, viewport: typeof desktop, colorScheme: 'light' | 'dark'): Project => ({
  name,
  testDir: './tests/visual',
  use: { viewport, colorScheme },
});

export default defineConfig({
  forbidOnly: CI,
  retries: 0, // snapshots are deterministic; a retry would only hide flakiness
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    timezoneId: 'UTC',
    locale: 'en-GB',
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [
    visual('desktop-light', desktop, 'light'),
    visual('desktop-dark', desktop, 'dark'),
    visual('mobile-light', mobile, 'light'),
    visual('mobile-dark', mobile, 'dark'),
    { name: 'e2e', testDir: './tests/e2e', use: { viewport: desktop, colorScheme: 'light' } },
  ],
  webServer: {
    // The harness build goes to its own folder so it never mixes with a production dist/.
    command: `npx vite build --outDir dist/harness && npx vite preview --outDir dist/harness --port ${PORT} --strictPort`,
    env: { VITE_TEST_HARNESS: '1' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
