import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';

const exe = resolve('/Users/nirdeshbalar/Documents/GMT-Private-Release-1.1.0-rc.6/macOS/mac-arm64/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL');
const backupDb = resolve('/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL/terminal.sqlite3');
const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';

console.log('=== PHASE UI-4A: PACKAGED RC.6 ACCEPTANCE VERIFICATION ===');
console.log('Target Exe: ', exe);
console.log('Backup DB:  ', backupDb);
console.log('ArtifactDir:', artifactDir);

assert.ok(existsSync(exe), 'Packaged executable must exist at ' + exe);
assert.ok(existsSync(backupDb), 'Backup database must exist at ' + backupDb);

const testProfile = join(tmpdir(), 'gmt-ui4a-acceptance-profile');
await rm(testProfile, { recursive: true, force: true });
mkdirSync(testProfile, { recursive: true, mode: 0o700 });
copyFileSync(backupDb, join(testProfile, 'terminal.sqlite3'));

console.log('Launching isolated packaged rc.6 app...');
const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: {
    ...process.env,
    GMT_MAC_TEST_EXE: exe,
    IMT_EXPECT_PREVIEW: 'stable-v1.0.0',
    IMT_TEST_DATA_DIR: testProfile
  },
  timeout: 60000
});

try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // 1. Desktop mode (1440px)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1000);
  console.log('1. Verifying Desktop mode (1440px)...');
  await expect(page.locator('.desktop-workspace-nav')).toBeVisible();
  await expect(page.locator('.responsive-workspace-nav')).not.toBeVisible();
  await page.screenshot({ path: join(artifactDir, 'phase-ui4a-packaged-desktop-1440.png') });
  console.log('✔ Desktop mode verified at 1440px');

  // 2. Narrow mode (1024px)
  console.log('2. Verifying Narrow Responsive mode (1024px)...');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(1000);
  await expect(page.locator('.desktop-workspace-nav')).not.toBeVisible();
  await expect(page.locator('.responsive-workspace-nav')).toBeVisible();

  const menuBtn = page.getByLabel('Workspaces menu', { exact: true });
  await expect(menuBtn).toBeVisible();

  // Open menu
  await menuBtn.click();
  const menu = page.getByRole('menu', { name: 'Workspaces' });
  await expect(menu).toBeVisible();
  await page.screenshot({ path: join(artifactDir, 'phase-ui4a-packaged-dropdown-open.png') });
  console.log('✔ Workspaces dropdown opened and captured');

  // 3. Navigate to Screener from dropdown
  console.log('3. Navigating to Screener...');
  const itemScreener = page.getByRole('menuitem', { name: /Screener/i });
  await itemScreener.click();
  await expect(page.getByTestId('screener-page')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: join(artifactDir, 'phase-ui4a-packaged-screener.png') });
  console.log('✔ Screener page active');

  // 4. Navigate to Alerts from Screener using Workspaces menu
  console.log('4. Navigating to Alerts from Screener...');
  await menuBtn.click();
  await expect(menu).toBeVisible();
  const itemAlerts = page.getByRole('menuitem', { name: /Alerts/i });
  await itemAlerts.click();
  await expect(page.getByTestId('alerts-page')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: join(artifactDir, 'phase-ui4a-packaged-alerts.png') });
  console.log('✔ Alerts page active');

  // 5. Return to Charts from Alerts
  console.log('5. Returning to Charts...');
  await menuBtn.click();
  await expect(menu).toBeVisible();
  const itemCharts = page.getByRole('menuitem', { name: /Charts/i });
  await itemCharts.click();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 15000 });
  console.log('✔ Charts layout restored');

  // 6. Test Volume toggle in packaged app
  console.log('6. Verifying Volume toggle in packaged app...');
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  await expect(volBtn).toBeVisible();
  const canvas = page.getByTestId('pane-0').locator('.chart-canvas');
  await expect(canvas).toBeVisible();

  const countPanes = async () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    return el?.__chart ? el.__chart.panes().length : 0;
  });
  const countCandles = async () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    return el?.__mainSeries ? el.__mainSeries.data().length : 0;
  });

  const candlesBefore = await countCandles();
  const panesBefore = await countPanes();
  console.log(`Volume test: panesBefore=${panesBefore}, candlesBefore=${candlesBefore}`);
  assert.ok(candlesBefore > 0, 'Candlesticks must be loaded and visible');

  // Toggle Volume
  await volBtn.click();
  await page.waitForTimeout(1000);
  const panesToggled = await countPanes();
  const candlesToggled = await countCandles();
  console.log(`Volume test: panesToggled=${panesToggled}, candlesToggled=${candlesToggled}`);
  assert.equal(candlesToggled, candlesBefore, 'Candlesticks must NEVER be removed when volume is toggled');

  // Toggle Volume back
  await volBtn.click();
  await page.waitForTimeout(1000);
  const panesRestored = await countPanes();
  const candlesRestored = await countCandles();
  console.log(`Volume test: panesRestored=${panesRestored}, candlesRestored=${candlesRestored}`);
  assert.equal(candlesRestored, candlesBefore, 'Candlesticks must remain preserved');
  assert.equal(panesRestored, panesBefore, 'Panes count restored');
  console.log('✔ Volume toggle orthogonality verified in packaged app');

  // 7. Test Light Mode at 1024px
  console.log('7. Verifying Light Mode...');
  const themeToggle = page.getByLabel('Toggle theme', { exact: true });
  await themeToggle.click();
  await page.waitForTimeout(500);
  await expect(page.locator('.terminal-shell.theme-light')).toBeVisible();

  await menuBtn.click();
  await expect(menu).toBeVisible();
  await page.screenshot({ path: join(artifactDir, 'phase-ui4a-packaged-light-dropdown.png') });
  await menuBtn.click(); // close menu

  // Restore dark theme
  await themeToggle.click();
  await page.waitForTimeout(500);
  console.log('✔ Light Mode styling and toggle verified');

  // 8. Test 768px minimum width
  console.log('8. Verifying 768px minimum width...');
  await page.setViewportSize({ width: 768, height: 650 });
  await page.waitForTimeout(500);
  await menuBtn.click();
  await expect(menu).toBeVisible();
  await page.screenshot({ path: join(artifactDir, 'phase-ui4a-packaged-768px.png') });
  await menuBtn.click();
  console.log('✔ 768px minimum width verified');

  console.log('\n=== ALL PACKAGED RC.6 ACCEPTANCE CHECKS PASSED 100% ===');
} finally {
  await app?.close();
}

