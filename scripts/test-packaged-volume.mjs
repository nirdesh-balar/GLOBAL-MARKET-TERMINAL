import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = '/Users/nirdeshbalar/Documents/GMT-Private-Release-1.1.0-rc.4/macOS/mac-arm64/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL';
const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-pkg-vol-'));
await cp(backupDir, profile, { recursive: true });

console.log('Testing packaged rc.4 with profile:', profile);

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
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e);
    errors.push(e.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
  });

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(4000);

  // Search and select ADANIENT
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN', { exact: true }).fill('ADANIENT');
  await page.waitForTimeout(1000);
  await page.locator('.search-result').first().click();
  await page.waitForTimeout(2000);

  // Select 15m timeframe
  const tf15m = page.getByLabel('15m timeframe pane 0', { exact: true });
  if (await tf15m.count() > 0) await tf15m.click();
  else {
    const btn = page.locator('button:has-text("15m")').first();
    if (await btn.count() > 0) await btn.click();
  }
  await page.waitForTimeout(3000);

  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  const isSelected = await volBtn.evaluate(el => el.classList.contains('selected'));
  console.log('Volume button is selected:', isSelected);

  // If not selected, select it first
  if (!isSelected) {
    console.log('Selecting volume...');
    await volBtn.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'test-results/pkg-adanient-15m-vol-on.png' });

  // Toggle Volume OFF
  console.log('Toggling volume OFF in packaged app...');
  await volBtn.click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'test-results/pkg-adanient-15m-vol-off.png' });

  // Toggle Volume ON
  console.log('Toggling volume ON in packaged app...');
  await volBtn.click();
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'test-results/pkg-adanient-15m-vol-on2.png' });

  console.log('Errors:', errors);

} finally {
  await app?.close();
}

