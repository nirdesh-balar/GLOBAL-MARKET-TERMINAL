import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-vol-test-'));
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
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e);
    errors.push(e.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
  });

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  console.log('App ready. Pane 0 visible.');

  // Let's inspect the chart state before toggling volume
  const infoBefore = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    const chart = el?.__chart;
    const mainSeries = el?.__mainSeries;
    return {
      hasChart: !!chart,
      hasMainSeries: !!mainSeries,
      panesCount: chart ? chart.panes().length : 0,
      stretchFactors: chart ? chart.panes().map(p => p.getStretchFactor()) : [],
      mainSeriesDataLen: mainSeries ? mainSeries.data().length : 0,
    };
  });
  console.log('Before toggle:', JSON.stringify(infoBefore, null, 2));

  // Find the volume button
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  console.log('Volume button is selected:', await volBtn.evaluate(el => el.classList.contains('selected')));

  // Click volume button to toggle OFF
  console.log('Clicking Volume button to toggle OFF...');
  await volBtn.click();
  await page.waitForTimeout(1000);

  const infoAfterToggleOff = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    const chart = el?.__chart;
    const mainSeries = el?.__mainSeries;
    return {
      hasChart: !!chart,
      hasMainSeries: !!mainSeries,
      panesCount: chart ? chart.panes().length : 0,
      stretchFactors: chart ? chart.panes().map(p => p.getStretchFactor()) : [],
      mainSeriesDataLen: mainSeries ? mainSeries.data().length : 0,
    };
  });
  console.log('After toggle OFF:', JSON.stringify(infoAfterToggleOff, null, 2));

  // Take a screenshot of the chart
  await page.screenshot({ path: 'test-results/reproduce-volume-off.png' });

  // Click volume button to toggle ON
  console.log('Clicking Volume button to toggle ON again...');
  await volBtn.click();
  await page.waitForTimeout(1000);

  const infoAfterToggleOn = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    const chart = el?.__chart;
    const mainSeries = el?.__mainSeries;
    return {
      hasChart: !!chart,
      hasMainSeries: !!mainSeries,
      panesCount: chart ? chart.panes().length : 0,
      stretchFactors: chart ? chart.panes().map(p => p.getStretchFactor()) : [],
      mainSeriesDataLen: mainSeries ? mainSeries.data().length : 0,
    };
  });
  console.log('After toggle ON:', JSON.stringify(infoAfterToggleOn, null, 2));

  await page.screenshot({ path: 'test-results/reproduce-volume-on.png' });

  console.log('Errors:', errors);
} finally {
  await app?.close();
}

