import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';

const exe = resolve('/Users/nirdeshbalar/Documents/GMT-Private-Release-1.1.0-rc.5/macOS/mac-arm64/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL');
const backupDb = resolve('/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL/terminal.sqlite3');
const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';

console.log('=== PHASE UI-1: PACKAGED APP ACCEPTANCE VERIFICATION ===');
console.log('Target Exe: ', exe);
console.log('Backup DB:  ', backupDb);
console.log('ArtifactDir:', artifactDir);

assert.ok(existsSync(exe), 'Packaged executable must exist at ' + exe);
assert.ok(existsSync(backupDb), 'Backup database must exist at ' + backupDb);

const testProfile = join(tmpdir(), 'gmt-ui1-acceptance-profile');
await rm(testProfile, { recursive: true, force: true });
mkdirSync(testProfile, { recursive: true, mode: 0o700 });
copyFileSync(backupDb, join(testProfile, 'terminal.sqlite3'));

console.log('Launching isolated packaged app...');
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
  await page.waitForTimeout(4000);

  // Check version from status bar or health
  const statusTime = await page.locator('.status-time').textContent();
  console.log('Status bar info:', statusTime);

  // Search and select ADANIENT to test real market series
  console.log('Selecting ADANIENT 15m...');
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN', { exact: true }).fill('ADANIENT');
  await page.waitForTimeout(1000);
  await page.locator('.search-result').first().click();
  await page.waitForTimeout(2000);

  const tf15m = page.getByLabel('15m timeframe pane 0', { exact: true });
  if (await tf15m.count() > 0) await tf15m.click();
  await page.waitForTimeout(3000);

  const countCandles = async () => {
    return await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      return el?.__mainSeries ? el.__mainSeries.data().length : 0;
    });
  };

  const countPanes = async () => {
    return await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      return el?.__chart ? el.__chart.panes().length : 0;
    });
  };

  const initialPanes = await countPanes();
  const initialCandles = await countCandles();
  console.log(`Initial: Panes = ${initialPanes}, Candles = ${initialCandles}`);
  assert.ok(initialCandles > 0, 'Candlesticks must be loaded and visible');

  const volBtn = page.getByLabel('Volume pane 0', { exact: true });

  // Toggle Volume ON if not selected
  const isVolSelected = await volBtn.evaluate(el => el.classList.contains('selected'));
  if (!isVolSelected) {
    console.log('Toggling Volume ON...');
    await volBtn.click();
    await page.waitForTimeout(2000);
  }

  const volOnPanes = await countPanes();
  const volOnCandles = await countCandles();
  console.log(`Volume ON: Panes = ${volOnPanes}, Candles = ${volOnCandles}`);
  assert.equal(volOnPanes, 2, 'Volume pane must be present (2 panes)');
  assert.equal(volOnCandles, initialCandles, 'Candles must not disappear when Volume is ON');

  await page.screenshot({ path: join(artifactDir, 'phase-ui1-packaged-vol-on.png') });
  console.log('Saved phase-ui1-packaged-vol-on.png');

  // Toggle Volume OFF
  console.log('Toggling Volume OFF...');
  await volBtn.click();
  await page.waitForTimeout(2000);

  const volOffPanes = await countPanes();
  const volOffCandles = await countCandles();
  console.log(`Volume OFF: Panes = ${volOffPanes}, Candles = ${volOffCandles}`);
  assert.equal(volOffPanes, 1, 'Volume pane must be removed (1 pane)');
  assert.equal(volOffCandles, initialCandles, 'Candles must remain visible when Volume is OFF');

  await page.screenshot({ path: join(artifactDir, 'phase-ui1-packaged-vol-off.png') });
  console.log('Saved phase-ui1-packaged-vol-off.png');

  // Toggle Volume ON again
  console.log('Toggling Volume ON again...');
  await volBtn.click();
  await page.waitForTimeout(2000);

  const volOn2Panes = await countPanes();
  const volOn2Candles = await countCandles();
  console.log(`Volume ON (Repeat): Panes = ${volOn2Panes}, Candles = ${volOn2Candles}`);
  assert.equal(volOn2Panes, 2, 'Volume pane must return (2 panes)');
  assert.equal(volOn2Candles, initialCandles, 'Candles must remain visible');

  await page.screenshot({ path: join(artifactDir, 'phase-ui1-packaged-verified.png') });
  console.log('Saved phase-ui1-packaged-verified.png');

  console.log('✔ Packaged GUI Volume acceptance tests PASSED 100%!');
} finally {
  await app.close();
  await rm(testProfile, { recursive: true, force: true }).catch(() => {});
}
