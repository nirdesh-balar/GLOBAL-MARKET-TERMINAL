import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-user-test-'));
await cp(backupDir, profile, { recursive: true });

console.log('Copied user profile to isolated test dir:', profile);

const errors = [];
let app, page;

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_TEST_DATA_DIR: profile },
  timeout: 60000,
});

try {
  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e);
    errors.push(e.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
  });

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  console.log('Pane 0 visible. Waiting for chart overlay to clear (or 5s)...');
  await page.waitForTimeout(5000);

  // Take screenshot of current state
  await page.screenshot({ path: 'test-results/user-state-start.png' });

  // Let's see what symbol is currently on pane 0
  const currentSymbol = await page.evaluate(() => {
    return document.querySelector('[data-testid="pane-0"] .pane-symbol')?.textContent || 'unknown';
  });
  console.log('Current symbol on pane 0:', currentSymbol);

  // If not ADANIENT, let's select ADANIENT from the watchlist or search!
  // In the user's watchlist, is ADANIENT there?
  const adanientInWatchlist = page.getByTestId('watchlist-symbol-ADANIENT-EQ');
  if (await adanientInWatchlist.count() > 0) {
    console.log('Found ADANIENT in watchlist! Clicking...');
    await adanientInWatchlist.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('Searching for ADANIENT...');
    await page.getByLabel('Search stocks and indices', { exact: true }).click();
    await page.getByPlaceholder('Search symbol, company, index or ISIN', { exact: true }).fill('ADANIENT');
    await page.waitForTimeout(1000);
    const searchRes = page.locator('.search-result').first();
    await searchRes.click();
    await page.waitForTimeout(3000);
  }

  // Switch timeframe to 15m if not already
  console.log('Selecting 15m timeframe...');
  const tf15m = page.getByLabel('15m timeframe pane 0', { exact: true });
  if (await tf15m.count() > 0) {
    await tf15m.click();
  } else {
    // maybe header timeframe
    const header15m = page.locator('button:has-text("15m")').first();
    if (await header15m.count() > 0) await header15m.click();
  }
  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'test-results/adanient-15m-start.png' });

  // Now inspect pane 0 state
  const inspectState = async (label) => {
    const res = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const mainSeries = el?.__mainSeries;
      const panes = chart ? chart.panes() : [];
      return {
        hasChart: !!chart,
        hasMainSeries: !!mainSeries,
        panesCount: panes.length,
        paneHeights: panes.map(p => p.getHeight()),
        stretchFactors: panes.map(p => p.getStretchFactor()),
        mainSeriesDataLen: mainSeries ? mainSeries.data().length : 0,
        visibleLogicalRange: chart ? chart.timeScale().getVisibleLogicalRange() : null,
        priceVisibleRange: chart ? chart.priceScale('right').getVisibleRange() : null,
        mainSeriesMarkers: mainSeries ? (mainSeries.markers ? mainSeries.markers() : null) : null,
        canvasBoundingBox: el ? el.getBoundingClientRect() : null,
        canvasChildrenCount: el ? el.children.length : 0,
      };
    });
    console.log(`${label}:`, JSON.stringify(res, null, 2));
    return res;
  };

  await inspectState('ADANIENT 15m before volume toggle');

  // Find volume button
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  console.log('Volume button found. Selected?', await volBtn.evaluate(el => el.classList.contains('selected')));

  // Toggle Volume OFF
  console.log('CLICKING VOLUME BUTTON (TOGGLE OFF)...');
  await volBtn.click();
  await page.waitForTimeout(1500);

  await inspectState('ADANIENT 15m after volume toggle OFF');
  await page.screenshot({ path: 'test-results/adanient-15m-volume-off.png' });

  // Toggle Volume ON
  console.log('CLICKING VOLUME BUTTON (TOGGLE ON)...');
  await volBtn.click();
  await page.waitForTimeout(1500);

  await inspectState('ADANIENT 15m after volume toggle ON');
  await page.screenshot({ path: 'test-results/adanient-15m-volume-on.png' });

  console.log('Errors:', errors);

} finally {
  await app?.close();
}
