import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f18-ui-'));
await mkdir('test-results', { recursive: true });
const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
const errors = [];
let app, page;

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' },
  timeout: 60000,
});

try {
  console.log('================================================================');
  console.log('STARTING PHASE F1.8 CLEAN CHART BOTTOM (NO DEBUG / META TEXT) TESTS');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  const checkPaneCleanliness = async (paneId, label) => {
    const pane = page.getByTestId(`pane-${paneId}`);
    await expect(pane).toBeVisible();

    const metaVisible = await pane.locator('.history-meta').isVisible();
    const dataNoticeVisible = await pane.locator('.data-notice').isVisible();
    assert.equal(metaVisible, false, `${label}: .history-meta must NOT be visible`);
    assert.equal(dataNoticeVisible, false, `${label}: .data-notice must NOT be visible`);

    // Verify top OHLC legend IS visible
    const legendVisible = await pane.locator('.chart-legend').isVisible();
    assert.equal(legendVisible, true, `${label}: Top OHLC chart-legend MUST remain visible`);

    // Verify bottom timeframe toolbar IS visible
    const bottomToolbar = pane.locator('.bottom-chart-toolbar');
    assert.equal(await bottomToolbar.isVisible(), true, `${label}: Bottom toolbar MUST remain visible`);
    assert.equal(await bottomToolbar.locator('.range-toolbar').isVisible(), true, `${label}: Range toolbar buttons MUST remain visible`);

    // Verify PriceScaleControls are visible
    assert.equal(await bottomToolbar.locator('button:has-text("Data")').isVisible(), true, `${label}: Data button MUST remain visible`);

    // Verify no forbidden strings are visible inside the chart area
    const chartScrollText = await pane.locator('.chart-scroll').innerText();
    assert.ok(!chartScrollText.includes('memory cache'), `${label}: Must NOT contain 'memory cache'`);
    assert.ok(!chartScrollText.includes('bars ·'), `${label}: Must NOT contain 'bars ·'`);
    assert.ok(!chartScrollText.includes('Updated at'), `${label}: Must NOT contain 'Updated at'`);
    assert.ok(!chartScrollText.includes('Last candle'), `${label}: Must NOT contain 'Last candle'`);

    console.log(`PASS: ${label} verified clean! No bottom debug/meta text visible.`);
  };

  // =========================================================================
  // TEST 1: Indian Stock Chart (RELIANCE 1D and 1h)
  // =========================================================================
  console.log('1. Testing Indian Stock Chart (RELIANCE 1D and 1h)...');
  await page.getByTestId('watchlist-dropdown').selectOption('favourites');
  await page.waitForTimeout(600);
  await page.locator('.watch-row').first().locator('.watch-select').click();
  await page.waitForTimeout(600);

  // Timeframe 1D
  await page.getByRole('button', { name: 'Active timeframe 1d' }).click();
  await page.waitForTimeout(500);
  await checkPaneCleanliness(0, 'Indian Stock RELIANCE (1D)');

  // Timeframe 1h
  await page.getByRole('button', { name: 'Active timeframe 1h' }).click();
  await page.waitForTimeout(500);
  await checkPaneCleanliness(0, 'Indian Stock RELIANCE (1h)');

  await page.screenshot({ path: 'test-results/chart-f18-indian-stock-clean.png' });
  await copyFile('test-results/chart-f18-indian-stock-clean.png', join(artifactDir, 'chart-f18-indian-stock-clean.png')).catch(() => {});

  // =========================================================================
  // TEST 2: US Stock Chart (AAPL 1D and 1h)
  // =========================================================================
  console.log('2. Testing US Stock Chart (AAPL 1D and 1h)...');
  await page.getByTestId('watchlist-dropdown').selectOption('us');
  await page.waitForTimeout(600);
  const usRows = page.getByTestId('watchlist-rows').locator('.watch-row');
  await usRows.first().locator('.watch-select').click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'Active timeframe 1d' }).click();
  await page.waitForTimeout(500);
  await checkPaneCleanliness(0, 'US Stock AAPL (1D)');

  await page.getByRole('button', { name: 'Active timeframe 1h' }).click();
  await page.waitForTimeout(500);
  await checkPaneCleanliness(0, 'US Stock AAPL (1h)');

  await page.screenshot({ path: 'test-results/chart-f18-us-stock-clean.png' });
  await copyFile('test-results/chart-f18-us-stock-clean.png', join(artifactDir, 'chart-f18-us-stock-clean.png')).catch(() => {});

  // =========================================================================
  // TEST 3: Crypto Chart (Crypto watchlist / Hyperliquid)
  // =========================================================================
  console.log('3. Testing Crypto Chart (1D and 1h)...');
  await page.getByTestId('watchlist-dropdown').selectOption('crypto');
  await page.waitForTimeout(600);
  const cryptoRows = page.getByTestId('watchlist-rows').locator('.watch-row');
  if (await cryptoRows.count() > 0) {
    await cryptoRows.first().locator('.watch-select').click();
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Active timeframe 1d' }).click();
    await page.waitForTimeout(500);
    await checkPaneCleanliness(0, 'Crypto (1D)');

    await page.getByRole('button', { name: 'Active timeframe 1h' }).click();
    await page.waitForTimeout(500);
    await checkPaneCleanliness(0, 'Crypto (1h)');
  }

  await page.screenshot({ path: 'test-results/chart-f18-crypto-clean.png' });
  await copyFile('test-results/chart-f18-crypto-clean.png', join(artifactDir, 'chart-f18-crypto-clean.png')).catch(() => {});

  // =========================================================================
  // TEST 4: Multi-Pane Layout (2-chart layout)
  // =========================================================================
  console.log('4. Testing Multi-Pane Layout (2-Chart Layout)...');
  const layoutBtn = page.getByLabel('Chart layout', { exact: true });
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 2').click();
  await page.waitForTimeout(1000);

  await expect(page.locator('.chart-pane:visible')).toHaveCount(2);
  await checkPaneCleanliness(0, 'Multi-Pane Pane 0');
  await checkPaneCleanliness(1, 'Multi-Pane Pane 1');

  await page.screenshot({ path: 'test-results/chart-f18-multipane-clean.png' });
  await copyFile('test-results/chart-f18-multipane-clean.png', join(artifactDir, 'chart-f18-multipane-clean.png')).catch(() => {});

  // Switch back to single chart layout
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 1').click();
  await page.waitForTimeout(600);

  // =========================================================================
  // TEST 5: Light Theme Verification
  // =========================================================================
  console.log('5. Testing Light Theme Cleanliness...');
  const themeBtn = page.locator('button[aria-label="Toggle theme"]');
  await themeBtn.click();
  await page.waitForTimeout(400);

  await expect(page.locator('.terminal-shell')).toHaveClass(/theme-light/);
  await checkPaneCleanliness(0, 'Light Theme Pane 0');

  // Toggle back to dark theme
  await themeBtn.click();
  await page.waitForTimeout(300);

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);

  console.log('================================================================');
  console.log('ALL PHASE F1.8 CLEAN CHART BOTTOM TESTS PASSED 100%!');
  console.log('================================================================');
} finally {
  await app?.close();
}
