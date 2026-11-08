import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-vol-debug-'));
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

  // Set pane 0 to ADANIENT, 15m, logarithmic, auto: false
  console.log('Testing auto: false with logarithmic scale...');
  await page.evaluate(async () => {
    const w = await window.terminal.request('/workspace');
    w.panes[0].symbol = 'ADANIENT';
    w.panes[0].timeframe = '15m';
    w.panes[0].volume = true;
    w.panes[0].indicators_hidden = false;
    w.panes[0].scale = { logarithmic: true, auto: false, percentage: false };
    if (w.panes[0].canonical_id) w.panes[0].instrument_id = w.panes[0].canonical_id;
    await window.terminal.request('/workspace', 'PUT', w);
  });
  await page.reload();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(4000);

  const getPriceRange = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    const chart = el?.__chart;
    const ps = chart?.priceScale('right');
    return {
      autoScale: ps?.options().autoScale,
      mode: ps?.options().mode,
      vr: ps?.getVisibleRange(),
    };
  });

  console.log('Price range before toggle:', await getPriceRange());

  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  await volBtn.click();
  await page.waitForTimeout(1000);

  console.log('Price range after toggle OFF:', await getPriceRange());
  await page.screenshot({ path: 'test-results/debug-vol-off-manual.png' });

  await volBtn.click();
  await page.waitForTimeout(1000);
  console.log('Price range after toggle ON:', await getPriceRange());
  await page.screenshot({ path: 'test-results/debug-vol-on-manual.png' });

} finally {
  await app?.close();
}

