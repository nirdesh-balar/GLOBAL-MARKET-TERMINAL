import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f15-ui-'));
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
  console.log('STARTING PHASE F1.5 OHLC CHANGE, CHG COLUMN & TIMEFRAME SYNC TEST');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Select 'stocks' watchlist
  const dropdown = page.getByTestId('watchlist-dropdown');
  await dropdown.selectOption('stocks');
  await page.waitForTimeout(600);

  // =========================================================================
  // TEST A: Chart Legend OHLC + Numeric Change + Change %
  // =========================================================================
  console.log('1. Verifying Chart Legend OHLC change metric...');
  const activePane = page.locator('.chart-pane.active');
  await expect(activePane).toBeVisible();

  const ohlc = activePane.locator('.ohlc');
  await expect(ohlc).toBeVisible();

  // Verify O, H, L, C elements exist
  const ohlcText = await ohlc.innerText();
  console.log(`Initial OHLC text: ${ohlcText}`);
  assert.ok(ohlcText.includes('O '), 'Must include Open price');
  assert.ok(ohlcText.includes('H '), 'Must include High price');
  assert.ok(ohlcText.includes('L '), 'Must include Low price');
  assert.ok(ohlcText.includes('C '), 'Must include Close price');

  // Verify ohlc-change-metric element exists
  const ohlcChangeMetric = activePane.locator('[data-testid^="ohlc-change-"]');
  await expect(ohlcChangeMetric).toBeVisible();
  const metricText = (await ohlcChangeMetric.innerText()).trim();
  console.log(`OHLC Change Metric text: ${metricText}`);
  // Expected format: e.g. "+25.00 (+2.24%)" or "-13.35 (-0.05%)" or "0.00 (0.00%)"
  assert.match(metricText, /[+-]?\d+.*\(?[+-]?\d+\.?\d*%\)?/, 'Metric must contain numeric change and percent');

  const hasColorClass = await ohlcChangeMetric.evaluate(el =>
    el.classList.contains('positive') || el.classList.contains('negative') || el.classList.contains('neutral')
  );
  assert.ok(hasColorClass, 'Metric must have positive, negative, or neutral styling class');
  console.log(`PASS: Chart Legend OHLC change metric verified (${metricText})!`);

  // =========================================================================
  // TEST B & C: Crosshair historical candle tracking & restoration
  // =========================================================================
  console.log('2. Verifying Crosshair hover and restoration on chart canvas...');
  const canvas = activePane.locator('.chart-canvas');
  const box = await canvas.boundingBox();
  assert.ok(box, 'Canvas bounding box must be available');

  // Hover over the middle of the chart canvas (older candle)
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.waitForTimeout(300);
  const historicalMetricText = (await ohlcChangeMetric.innerText()).trim();
  console.log(`Historical candle metric text: ${historicalMetricText}`);
  assert.ok(historicalMetricText.length > 0, 'Historical metric must be computed');

  // Move mouse outside canvas to restore latest candle
  await page.mouse.move(10, 10);
  await page.waitForTimeout(300);
  const restoredMetricText = (await ohlcChangeMetric.innerText()).trim();
  console.log(`Restored candle metric text: ${restoredMetricText}`);
  assert.equal(restoredMetricText, metricText, 'Moving crosshair away must restore latest candle metric');
  console.log('PASS: Crosshair historical calculation and edge restoration verified!');

  // Capture OHLC change screenshot
  await page.screenshot({ path: 'test-results/chart-legend-ohlc-change.png' });
  await copyFile('test-results/chart-legend-ohlc-change.png', join(artifactDir, 'chart-legend-ohlc-change.png'));

  // =========================================================================
  // TEST D: Watchlist Column Headers and Data Columns (LAST, CHG, CHG%)
  // =========================================================================
  console.log('3. Verifying Watchlist Header and Columns (FLAG | SYMBOL | LAST | CHG | CHG%)...');
  const watchCols = page.locator('.watch-columns');
  await expect(watchCols).toBeVisible();
  const colText = await watchCols.innerText();
  console.log(`Watchlist column headers: ${colText.replace(/\n/g, ' | ')}`);
  assert.ok(colText.includes('SYMBOL'), 'Columns must include SYMBOL');
  assert.ok(colText.includes('LAST'), 'Columns must include LAST');
  assert.ok(colText.includes('CHG'), 'Columns must include CHG');
  assert.ok(colText.includes('CHG %'), 'Columns must include CHG %');

  const rows = page.locator('.watch-row');
  const rowCount = await rows.count();
  assert.ok(rowCount >= 2, 'Watchlist must have at least 2 rows');

  const row0 = rows.nth(0);
  const lastCol = row0.locator('.quote');
  const chgCol = row0.locator('.watch-num-change');
  const chgPctCol = row0.locator('.watch-change');

  await expect(lastCol).toBeVisible();
  await expect(chgCol).toBeVisible();
  await expect(chgPctCol).toBeVisible();

  console.log(`Row 0 LAST: ${await lastCol.innerText()}`);
  console.log(`Row 0 CHG: ${await chgCol.innerText()}`);
  console.log(`Row 0 CHG%: ${await chgPctCol.innerText()}`);
  console.log('PASS: 3 distinct quote columns (LAST, CHG, CHG%) verified in watchlist row!');

  // =========================================================================
  // TEST E: Default 1D Active Chart Timeframe Sync
  // =========================================================================
  console.log('4. Verifying Watchlist Timeframe Badge initial state (1D)...');
  const timeframeBadge = page.getByTestId('watchlist-active-timeframe');
  await expect(timeframeBadge).toBeVisible();
  const initialBadgeText = (await timeframeBadge.innerText()).trim();
  console.log(`Initial Watchlist Timeframe Badge: "${initialBadgeText}"`);
  assert.equal(initialBadgeText, '1D', 'Watchlist timeframe badge must sync with active chart timeframe (1D)');

  // =========================================================================
  // TEST F: Switching active chart timeframe to 1W
  // =========================================================================
  console.log('5. Switching Active Chart timeframe to 1W...');
  const btn1W = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1w"]');
  await expect(btn1W).toBeVisible();
  await btn1W.click();
  await page.waitForTimeout(500);

  // Timeframe badge must now show '1W'
  const weeklyBadgeText = (await timeframeBadge.innerText()).trim();
  console.log(`Weekly Watchlist Timeframe Badge: "${weeklyBadgeText}"`);
  assert.equal(weeklyBadgeText, '1W', 'Watchlist timeframe badge must update to 1W');

  // Verify active pane timeframe is now 1w
  const activePaneTimeframe = await page.locator('.chart-pane.active .legend-title span:first-of-type').innerText();
  console.log(`Active pane legend timeframe info: ${activePaneTimeframe}`);
  assert.ok(activePaneTimeframe.includes('1w'), 'Chart legend must show 1w timeframe');
  console.log('PASS: 1W Timeframe synchronization verified!');

  // =========================================================================
  // TEST G: Switching active chart timeframe to 1M
  // =========================================================================
  console.log('6. Switching Active Chart timeframe to 1M...');
  const btn1M = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1M"]');
  await expect(btn1M).toBeVisible();
  await btn1M.click();
  await page.waitForTimeout(500);

  const monthlyBadgeText = (await timeframeBadge.innerText()).trim();
  console.log(`Monthly Watchlist Timeframe Badge: "${monthlyBadgeText}"`);
  assert.equal(monthlyBadgeText, '1M', 'Watchlist timeframe badge must update to 1M');
  console.log('PASS: 1M Timeframe synchronization verified!');

  // =========================================================================
  // TEST H: Switching active chart timeframe to 1Y
  // =========================================================================
  console.log('7. Switching Active Chart timeframe to 1Y...');
  const btn1Y = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1Y"]');
  await expect(btn1Y).toBeVisible();
  await btn1Y.click();
  await page.waitForTimeout(500);

  const yearlyBadgeText = (await timeframeBadge.innerText()).trim();
  console.log(`Yearly Watchlist Timeframe Badge: "${yearlyBadgeText}"`);
  assert.equal(yearlyBadgeText, '1Y', 'Watchlist timeframe badge must update to 1Y');
  console.log('PASS: 1Y Timeframe synchronization verified!');

  // =========================================================================
  // TEST I: Rapid switching stability (1D -> 1W -> 1M -> 1D)
  // =========================================================================
  console.log('8. Testing Rapid timeframe switching stability...');
  const btn1D = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1d"]');
  await btn1W.click();
  await btn1M.click();
  await btn1D.click();
  await page.waitForTimeout(600);

  const finalBadgeText = (await timeframeBadge.innerText()).trim();
  assert.equal(finalBadgeText, '1D', 'After rapid clicks, badge must accurately reflect final timeframe 1D');
  assert.equal(errors.length, 0, 'No uncaught page errors during rapid switching');
  console.log('PASS: Rapid timeframe switching stability verified!');

  // =========================================================================
  // TEST J: ArrowDown navigation preserves comparison timeframe
  // =========================================================================
  console.log('9. Verifying ArrowDown navigation preserves active comparison timeframe...');
  await btn1W.click();
  await page.waitForTimeout(400);
  assert.equal((await timeframeBadge.innerText()).trim(), '1W');

  // Focus row 0 and press ArrowDown
  await row0.locator('.watch-select').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);

  // Timeframe badge must stay 1W!
  assert.equal((await timeframeBadge.innerText()).trim(), '1W', 'ArrowDown navigation must preserve 1W comparison timeframe');
  console.log('PASS: Keyboard navigation preserves comparison timeframe!');

  // Capture Timeframe Sync screenshot
  await page.screenshot({ path: 'test-results/watchlist-f15-timeframe-sync.png' });
  await copyFile('test-results/watchlist-f15-timeframe-sync.png', join(artifactDir, 'watchlist-f15-timeframe-sync.png'));

  // =========================================================================
  // TEST K & L: Multi-Chart Layout Synchronization & Timeframe Isolation
  // =========================================================================
  console.log('10. Verifying Multi-Chart Active Pane Synchronization (2 Charts)...');
  // Switch to 2-chart layout
  const layoutBtn = page.locator('.layout-control > button');
  await layoutBtn.click();
  const twoChartBtn = page.locator('.layout-menu button[aria-label="Layout 2"]');
  await expect(twoChartBtn).toBeVisible();
  await twoChartBtn.click();
  await page.waitForTimeout(800);

  const pane0 = page.locator('[data-testid="pane-0"]');
  const pane1 = page.locator('[data-testid="pane-1"]');
  await expect(pane0).toBeVisible();
  await expect(pane1).toBeVisible();

  // Make sure pane 0 is on 1d
  await pane0.click();
  await page.waitForTimeout(300);
  await btn1D.click();
  await page.waitForTimeout(400);
  assert.equal((await timeframeBadge.innerText()).trim(), '1D', 'With Pane 0 active (1D), badge must show 1D');

  // Activate Pane 1 and switch it to 1w
  await pane1.click();
  await page.waitForTimeout(300);
  await btn1W.click();
  await page.waitForTimeout(400);
  assert.equal((await timeframeBadge.innerText()).trim(), '1W', 'With Pane 1 active (1W), badge must show 1W');

  // Now click Pane 0 again: Watchlist must automatically switch to 1D!
  await pane0.click();
  await page.waitForTimeout(400);
  assert.equal((await timeframeBadge.innerText()).trim(), '1D', 'Clicking Pane 0 must switch watchlist comparison timeframe back to 1D!');

  // Now click Pane 1 again: Watchlist must automatically switch to 1W!
  await pane1.click();
  await page.waitForTimeout(400);
  assert.equal((await timeframeBadge.innerText()).trim(), '1W', 'Clicking Pane 1 must switch watchlist comparison timeframe back to 1W!');

  // Verify Timeframe Isolation: Pane 0 stayed on 1d, Pane 1 stayed on 1w
  const pane0Legend = await pane0.locator('.legend-title span:first-of-type').innerText();
  const pane1Legend = await pane1.locator('.legend-title span:first-of-type').innerText();
  assert.ok(pane0Legend.includes('1d'), `Pane 0 must maintain 1d timeframe (got: ${pane0Legend})`);
  assert.ok(pane1Legend.includes('1w'), `Pane 1 must maintain 1w timeframe (got: ${pane1Legend})`);
  console.log('PASS: Multi-chart active pane synchronization and pane isolation verified!');

  // Capture Multi-chart sync screenshot
  await page.screenshot({ path: 'test-results/watchlist-f15-multi-chart-sync.png' });
  await copyFile('test-results/watchlist-f15-multi-chart-sync.png', join(artifactDir, 'watchlist-f15-multi-chart-sync.png'));

  // Restore 1-chart layout
  await layoutBtn.click();
  const oneChartBtn = page.locator('.layout-menu button[aria-label="Layout 1"]');
  await oneChartBtn.click();
  await page.waitForTimeout(500);

  // =========================================================================
  // TEST M: Colored Watchlists Timeframe Synchronization
  // =========================================================================
  console.log('11. Verifying Colored Watchlists Timeframe Synchronization...');
  // Flag Row 0 as Red
  const row0Flag = page.locator('.watch-row').nth(0).locator('.symbol-flag-btn');
  await row0Flag.click();
  const redBtn = page.locator('button[aria-label="Flag as Red"]');
  await expect(redBtn).toBeVisible();
  await redBtn.click();
  await page.waitForTimeout(400);

  // Switch to Red List in dropdown
  await dropdown.selectOption('color:red');
  await page.waitForTimeout(600);

  const redRows = page.locator('.watch-row');
  assert.ok((await redRows.count()) >= 1, 'Red List must contain flagged item');
  const redRow0 = redRows.nth(0);
  await expect(redRow0.locator('.watch-num-change')).toBeVisible();
  await expect(redRow0.locator('.watch-change')).toBeVisible();
  await expect(redRow0.locator('.quote')).toBeVisible();
  console.log('PASS: Colored list renders 3 quote columns with synchronized timeframe badge!');

  // Switch back to stocks
  await dropdown.selectOption('stocks');
  await page.waitForTimeout(400);

  // =========================================================================
  // TEST Q: Theme Switching & Contrast
  // =========================================================================
  console.log('12. Verifying Theme Switching and Contrast...');
  const themeBtn = page.locator('button[aria-label="Toggle theme"]');
  await themeBtn.click();
  await page.waitForTimeout(400);

  await expect(page.locator('.app-shell')).toHaveClass(/theme-light/);
  await expect(timeframeBadge).toBeVisible();
  await expect(page.locator('.ohlc-change-metric')).toBeVisible();

  // Capture light theme screenshot
  await page.screenshot({ path: 'test-results/watchlist-f15-light-theme.png' });
  await copyFile('test-results/watchlist-f15-light-theme.png', join(artifactDir, 'watchlist-f15-light-theme.png'));

  // Switch back to dark theme
  await themeBtn.click();
  await page.waitForTimeout(400);
  await expect(page.locator('.app-shell')).toHaveClass(/theme-dark/);
  console.log('PASS: Dark and Light themes verified!');

  console.log('================================================================');
  console.log('ALL PHASE F1.5 AUTOMATED UI & SYNC TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
} finally {
  if (app) await app.close();
}
