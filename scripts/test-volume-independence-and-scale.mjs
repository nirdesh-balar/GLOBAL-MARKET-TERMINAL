import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-vol-indep-'));
await cp(backupDir, profile, { recursive: true });

console.log('=== Testing Volume Independence & Scale Matrix ===');
console.log('Isolated profile:', profile);

const errors = [];
let app, page;

try {
  app = await electron.launch({
    executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    env: { ...process.env, IMT_TEST_DATA_DIR: profile },
    timeout: 60000,
  });

  page = await app.firstWindow();
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e);
    errors.push(e.message);
  });

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // 1. Select ADANIENT 15m
  console.log('1. Selecting ADANIENT 15m...');
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN', { exact: true }).fill('ADANIENT');
  await page.waitForTimeout(1000);
  await page.locator('.search-result').first().click();
  await page.waitForTimeout(2000);

  const tf15m = page.getByLabel('15m timeframe pane 0', { exact: true });
  if (await tf15m.count() > 0) await tf15m.click();
  await page.waitForTimeout(3000);

  const inspect = async () => {
    return await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const mainSeries = el?.__mainSeries;
      const panes = chart ? chart.panes() : [];
      const workspace = await window.terminal.request('/workspace');
      const pane = workspace.panes[0];
      return {
        panesCount: panes.length,
        candlesCount: mainSeries ? mainSeries.data().length : 0,
        paneVolume: pane.volume,
        indicatorsHidden: !!pane.indicators_hidden,
        scaleMode: pane.scale.logarithmic ? 'logarithmic' : pane.scale.percentage ? 'percentage' : 'linear',
        scaleAuto: pane.scale.auto,
      };
    });
  };

  // Test with indicators_hidden = true
  console.log('2. Ensuring indicators_hidden = true...');
  let st = await inspect();
  if (!st.indicatorsHidden) {
    await page.getByLabel('Visibility menu', { exact: true }).click();
    await page.getByLabel('Hide indicators', { exact: true }).click();
    await page.waitForTimeout(1000);
    st = await inspect();
  }
  console.log('State after Hide Indicators:', st);
  assert.equal(st.indicatorsHidden, true, 'indicators_hidden must be true');

  const volBtn = page.getByLabel('Volume pane 0', { exact: true });

  // Toggle Volume ON while indicators_hidden is true
  console.log('3. Toggling Volume ON while indicators are hidden...');
  if (!st.paneVolume) {
    await volBtn.click();
    await page.waitForTimeout(1500);
  }
  st = await inspect();
  console.log('State with Volume ON (indicators hidden):', st);
  assert.equal(st.paneVolume, true, 'Volume must be enabled');
  assert.equal(st.indicatorsHidden, true, 'indicators_hidden MUST REMAIN true (not prematurely unhidden)');
  assert.equal(st.panesCount, 2, 'Volume pane must be rendered (2 panes)');
  assert.ok(st.candlesCount > 1000, `Candles must remain visible (got ${st.candlesCount})`);

  // Toggle Volume OFF while indicators_hidden is true
  console.log('4. Toggling Volume OFF while indicators are hidden...');
  await volBtn.click();
  await page.waitForTimeout(1500);
  st = await inspect();
  console.log('State with Volume OFF (indicators hidden):', st);
  assert.equal(st.paneVolume, false, 'Volume must be disabled');
  assert.equal(st.indicatorsHidden, true, 'indicators_hidden MUST REMAIN true');
  assert.equal(st.panesCount, 1, 'Volume pane must be removed (1 pane)');
  assert.ok(st.candlesCount > 1000, `Candles must remain visible (got ${st.candlesCount})`);

  // 5. Test Scale Modes (LOG and AUTO)
  console.log('5. Testing LOG scale mode...');
  // Open Chart Settings and change price scale to Logarithmic
  await page.evaluate(async () => {
    const w = await window.terminal.request('/workspace');
    w.panes[0].scale.logarithmic = true;
    w.panes[0].scale.auto = true;
    await window.terminal.request('/workspace', 'PUT', w);
  });
  await page.reload();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  st = await inspect();
  console.log('State in LOG mode:', st);
  assert.equal(st.scaleMode, 'logarithmic', 'Scale must be logarithmic');
  const initialBars = st.candlesCount;

  // Toggle Volume repeatedly in LOG mode
  console.log('6. Toggling Volume 10 times in LOG mode...');
  for (let i = 1; i <= 10; i++) {
    const btn = page.getByLabel('Volume pane 0', { exact: true });
    await btn.click();
    await page.waitForTimeout(300);
    const curr = await inspect();
    assert.equal(curr.candlesCount, initialBars, `Candle count changed on iteration ${i}!`);
  }
  console.log('✔ Logarithmic volume toggles PASSED without candle loss or corruption!');

  console.log('7. Testing AUTO scale OFF (manual scale drag)...');
  await page.evaluate(async () => {
    const w = await window.terminal.request('/workspace');
    w.panes[0].scale.auto = false;
    await window.terminal.request('/workspace', 'PUT', w);
  });
  await page.reload();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // Toggle Volume in manual scale mode
  console.log('8. Toggling Volume in manual scale mode...');
  for (let i = 1; i <= 6; i++) {
    const btn = page.getByLabel('Volume pane 0', { exact: true });
    await btn.click();
    await page.waitForTimeout(300);
    const curr = await inspect();
    assert.equal(curr.candlesCount, initialBars, `Candle count changed in manual scale iteration ${i}!`);
  }
  console.log('✔ Manual scale volume toggles PASSED!');

  assert.equal(errors.length, 0, 'No uncaught page errors allowed');
  console.log('=== ALL VOLUME INDEPENDENCE AND SCALE TESTS PASSED 100% ===');
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
