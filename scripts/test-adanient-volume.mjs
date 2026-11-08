import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-vol-adanient-'));
const errors = [];
let app, page;

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' },
  timeout: 60000,
});

try {
  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Update pane 0 to ADANIENT on 15m
  console.log('Setting pane 0 to ADANIENT 15m...');
  await page.evaluate(async () => {
    const res = await window.terminal.request('/workspace');
    res.panes[0].symbol = 'ADANIENT';
    res.panes[0].timeframe = '15m';
    res.panes[0].volume = true;
    await window.terminal.request('/workspace', 'PUT', res);
  });
  await page.reload();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2000);

  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  console.log('Volume selected before click:', await volBtn.evaluate(el => el.classList.contains('selected')));
  await page.screenshot({ path: 'test-results/adanient-15m-vol-on-fixture.png' });

  // Click to toggle volume OFF
  console.log('Toggling volume OFF...');
  await volBtn.click();
  await page.waitForTimeout(1000);

  const infoOff = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    const chart = el?.__chart;
    const mainSeries = el?.__mainSeries;
    return {
      panesCount: chart ? chart.panes().length : 0,
      stretchFactors: chart ? chart.panes().map(p => p.getStretchFactor()) : [],
      mainSeriesDataLen: mainSeries ? mainSeries.data().length : 0,
      visibleLogicalRange: chart ? chart.timeScale().getVisibleLogicalRange() : null,
      priceVisibleRange: chart ? chart.priceScale('right').getVisibleRange() : null,
      dataset: el ? { ...el.dataset } : {},
    };
  });
  console.log('After toggle OFF (fixture):', JSON.stringify(infoOff, null, 2));
  await page.screenshot({ path: 'test-results/adanient-15m-vol-off-fixture.png' });

} finally {
  await app?.close();
}

