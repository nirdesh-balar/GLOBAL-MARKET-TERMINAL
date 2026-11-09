import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-responsive-audit-'));
await cp(backupDir, profile, { recursive: true });

console.log('===============================================================');
console.log('GLOBAL MARKET TERMINAL — RESPONSIVE UI AUDIT');
console.log('Testing Viewports: 1024px, 1280px, 1440px, 1600px');
console.log('===============================================================\n');

let app, page;
const viewports = [
  { width: 1600, height: 1000 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 }
];

const auditResults = {};

try {
  app = await electron.launch({
    executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    env: { ...process.env, IMT_TEST_DATA_DIR: profile },
    timeout: 60000,
  });

  page = await app.firstWindow();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  for (const vp of viewports) {
    console.log(`\n--- Auditing Viewport: ${vp.width} x ${vp.height} ---`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(1000);

    const checks = {
      settings: await page.getByLabel('Settings', { exact: true }).isVisible(),
      symbolSearch: await page.getByLabel('Search stocks and indices', { exact: true }).isVisible(),
      indicatorsHeader: await page.getByLabel('Active chart indicators', { exact: true }).isVisible(),
      volume: await page.getByLabel('Volume pane 0', { exact: true }).isVisible(),
      layoutSelector: await page.getByLabel('Chart layout', { exact: true }).isVisible(),
      themeToggle: await page.getByLabel('Toggle theme', { exact: true }).isVisible(),
      watchlistToggle: await page.getByLabel('Toggle sidebar', { exact: true }).isVisible(),
      createAlert: await page.getByLabel('Create alert from active chart', { exact: true }).isVisible(),
      screenerWorkspace: await page.getByLabel('Screener workspace', { exact: true }).isVisible(),
      alertsWorkspace: await page.getByLabel('Alerts workspace', { exact: true }).isVisible(),
    };

    auditResults[`${vp.width}x${vp.height}`] = checks;
    console.log(`Results for ${vp.width}x${vp.height}:`, JSON.stringify(checks, null, 2));
  }

  console.log('\n===============================================================');
  console.log('RESPONSIVE AUDIT SUMMARY MATRIX');
  console.log('===============================================================');
  console.table(auditResults);

} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

