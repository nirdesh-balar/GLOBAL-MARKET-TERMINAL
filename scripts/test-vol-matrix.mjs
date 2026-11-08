import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-vol-matrix-'));
await cp(backupDir, profile, { recursive: true });

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
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // Search and select ADANIENT from search modal
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN', { exact: true }).fill('ADANIENT');
  await page.waitForTimeout(1000);
  await page.locator('.search-result').first().click();
  await page.waitForTimeout(2000);

  // 15m timeframe
  const tf15m = page.getByLabel('15m timeframe pane 0', { exact: true });
  if (await tf15m.count() > 0) await tf15m.click();
  else {
    const btn = page.locator('button:has-text("15m")').first();
    if (await btn.count() > 0) await btn.click();
  }
  await page.waitForTimeout(3000);

  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  const logBtn = page.getByLabel('Logarithmic scale pane 0', { exact: true });
  const autoBtn = page.getByLabel('Auto scale pane 0', { exact: true });

  const checkCandles = async (label) => {
    const res = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const mainSeries = el?.__mainSeries;
      const ps = chart ? chart.priceScale('right') : null;
      const ts = chart ? chart.timeScale() : null;
      return {
        hasChart: !!chart,
        hasMainSeries: !!mainSeries,
        priceMode: ps ? ps.options().mode : null,
        autoScale: ps ? ps.options().autoScale : null,
        priceRange: ps ? ps.getVisibleRange() : null,
        logicalRange: ts ? ts.getVisibleLogicalRange() : null,
        seriesDataLen: mainSeries ? mainSeries.data().length : 0,
      };
    });
    console.log(`${label}:`, JSON.stringify(res));
    return res;
  };

  // Turn volume ON if not already
  if (!(await volBtn.evaluate(el => el.classList.contains('selected')))) {
    console.log('Turning volume ON...');
    await volBtn.click();
    await page.waitForTimeout(1000);
  }

  console.log('\n--- Test 1: Current scale settings (as is) ---');
  await checkCandles('Before toggle');
  await volBtn.click(); // Toggle OFF
  await page.waitForTimeout(1000);
  const r1Off = await checkCandles('After toggle OFF');
  await page.screenshot({ path: 'test-results/matrix-1-off.png' });
  await volBtn.click(); // Toggle ON
  await page.waitForTimeout(1000);
  await checkCandles('After toggle ON');

  console.log('\n--- Test 2: Drag/zoom price scale to make AUTO = false ---');
  // Drag price scale on pane 0
  const box = await page.getByTestId('pane-0').locator('.chart-canvas').boundingBox();
  const rightEdge = box.x + box.width - 30;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(rightEdge, centerY);
  await page.mouse.down();
  await page.mouse.move(rightEdge, centerY - 50);
  await page.mouse.up();
  await page.waitForTimeout(500);

  await checkCandles('After manual price scale drag (AUTO should be false)');
  await volBtn.click(); // Toggle OFF
  await page.waitForTimeout(1000);
  const r2Off = await checkCandles('After toggle OFF with manual price scale');
  await page.screenshot({ path: 'test-results/matrix-2-off-manual.png' });
  await volBtn.click(); // Toggle ON
  await page.waitForTimeout(1000);
  await checkCandles('After toggle ON with manual price scale');

  console.log('Errors:', errors);

} finally {
  await app?.close();
}
