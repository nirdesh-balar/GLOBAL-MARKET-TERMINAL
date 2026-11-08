import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-user-test-2-'));
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
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e);
    errors.push(e.message);
  });

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // Search and select ADANIENT to ensure canonical metadata is clean
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

  // Unhide indicators if hidden
  await page.evaluate(async () => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    // Check if pane has indicators_hidden
    const w = await window.terminal.request('/workspace');
    w.panes[0].indicators_hidden = false;
    w.panes[0].volume = true;
    // ensure pane 0 instrument_id matches its canonical_id or is clean
    if (w.panes[0].canonical_id) w.panes[0].instrument_id = w.panes[0].canonical_id;
    try {
      await window.terminal.request('/workspace', 'PUT', w);
    } catch(e) {
      console.error('Workspace PUT error:', e);
    }
  });

  await page.reload();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(4000);

  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  console.log('Volume button is selected:', await volBtn.evaluate(el => el.classList.contains('selected')));

  const inspect = async (lbl) => {
    const data = await page.evaluate((label) => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const mainSeries = el?.__mainSeries;
      const panes = chart ? chart.panes() : [];
      return {
        label,
        panesCount: panes.length,
        paneHeights: panes.map(p => p.getHeight()),
        stretchFactors: panes.map(p => p.getStretchFactor()),
        mainSeriesDataLen: mainSeries ? mainSeries.data().length : 0,
        mainSeriesVisible: mainSeries ? mainSeries.options().visible : null,
        mainSeriesPriceScaleId: mainSeries ? String(mainSeries.priceScale()) : null,
        priceScaleRange: chart ? chart.priceScale('right').getVisibleRange() : null,
        timeScaleRange: chart ? chart.timeScale().getVisibleLogicalRange() : null,
      };
    }, lbl);
    console.log(JSON.stringify(data, null, 2));
    return data;
  };

  await inspect('STATE WITH VOLUME ON');
  await page.screenshot({ path: 'test-results/adanient-vol-on.png' });

  // Toggle Volume OFF
  console.log('Toggling Volume OFF...');
  await volBtn.click();
  await page.waitForTimeout(1000);

  await inspect('STATE WITH VOLUME OFF');
  await page.screenshot({ path: 'test-results/adanient-vol-off.png' });

  // Toggle Volume ON
  console.log('Toggling Volume ON...');
  await volBtn.click();
  await page.waitForTimeout(1000);

  await inspect('STATE WITH VOLUME ON AGAIN');
  await page.screenshot({ path: 'test-results/adanient-vol-on2.png' });

} finally {
  await app?.close();
}
