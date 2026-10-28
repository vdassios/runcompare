/**
 * Full-page snapshots of the app shell. Written by task 02 while every section is still a
 * placeholder; task 10 owns this spec from then on, and later UI tasks are expected to move
 * these pixels.
 */
import { expect, test } from '@playwright/test';
import { gotoScenario, section, stubTiles } from './helpers';

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
});

test('empty app', async ({ page }) => {
  await gotoScenario(page);
  await expect(section(page, 'header')).toHaveCount(1);
  await expect(page).toHaveScreenshot('empty.png', { fullPage: true });
});

test('synthetic-two-attempts', async ({ page }) => {
  await gotoScenario(page, 'synthetic-two-attempts');
  const status = await page.evaluate(() => window.__RC_STORE__?.getState().status);
  expect(status).toBe('ready');
  await expect(page).toHaveScreenshot('synthetic-two-attempts.png', { fullPage: true });
});

test.describe('harness', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop-light', 'Behaviour, not pixels: one project is enough');
  });

  test('every synthetic scenario loads', async ({ page }) => {
    for (const name of ['synthetic-two-attempts', 'synthetic-gpx', 'synthetic-splits-only', 'synthetic-off-course']) {
      await gotoScenario(page, name);
      const attempts = await page.evaluate(() => window.__RC_STORE__?.getState().analysis?.attempts.length);
      expect(attempts, name).toBe(2);
    }
  });

  test('an unknown fixture reports an error', async ({ page }) => {
    await page.goto('/?fixture=does-not-exist');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'error');
    await expect(page.locator('html')).toHaveAttribute('data-ready-error', /Unknown fixture "does-not-exist"/);
  });
});
