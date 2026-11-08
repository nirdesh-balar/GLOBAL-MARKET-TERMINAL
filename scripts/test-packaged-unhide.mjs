import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = '/Users/nirdeshbalar/Documents/GMT-Private-Release-1.1.0-rc.4/macOS/mac-arm64/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL';
const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-pkg-unhide-'));
await cp(backupDir, profile, { recursive: true });

console.log('Testing packaged rc.4 unhidden indicators with profile:', profile);

const errors = [];
let app, page;

try {
  app = await electron.launch({
    executablePath: exe,
    args: [],
    env: {
      ...process.env,
      GMT_MAC_TEST_EXE: exe,
      IMT_EXPECT_PREVIEW: 'stable-v1.0.0',
      IMT_TEST_DATA_DIR: profile,
    },
    timeout: 60000,
  });

  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // Unhide indicators by clicking hide-indicators on drawing toolbar
  console.log('Unhiding indicators...');
  const hideIndBtn = page.getByLabel('Hide indicators', { exact: true });
  const showIndBtn = page.getByLabel('Show indicators', { exact: true });
  if (await showIndBtn.count() > 0) {
    await showIndBtn.click();
  } else if (await hideIndBtn.count() > 0) {
    // maybe it is currently hide
  }

  // Also select ADANIENT 15m
  console.log('Selecting ADANIENT 15m...');
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN', { exact: true }).fill('ADANIENT');
  await page.waitForTimeout(1000);
  await page.locator('.search-result').first().click();
  await page.waitForTimeout(2000);

  const tf15m = page.getByLabel('15m timeframe pane 0', { exact: true });
  if (await tf15m.count() > 0) await tf15m.click();
  await page.waitForTimeout(3000);

  // Turn volume ON if not on
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  if (!(await volBtn.evaluate(el => el.classList.contains('selected')))) {
    console.log('Toggling Volume ON...');
    await volBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'test-results/unhide-vol-on.png' });

  // Now toggle Volume OFF
  console.log('Toggling Volume OFF...');
  await volBtn.click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'test-results/unhide-vol-off.png' });

  // Toggle Volume ON again
  console.log('Toggling Volume ON again...');
  await volBtn.click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'test-results/unhide-vol-on2.png' });

  console.log('Errors:', errors);

} finally {
  await app?.close();
}
