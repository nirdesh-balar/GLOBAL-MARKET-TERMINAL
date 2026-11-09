import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { tmpdir } from 'node:os';

const artifactDir = process.env.GMT_ARTIFACT_DIR || path.resolve('test-results');
const testRoot = process.env.GMT_TEST_PROFILE_DIR || path.join(tmpdir(), 'gmt-windows-vol-test');
const profileDir = path.join(testRoot, 'profile');
const tempDir = path.join(testRoot, 'temp');

await mkdir(profileDir, { recursive: true });
await mkdir(tempDir, { recursive: true });
await mkdir('test-results', { recursive: true });

// Seed profile database if available
const candidateDbs = [
  process.env.GMT_SEED_DB,
  path.resolve('release-candidate-rc5/portable/GLOBAL-MARKET-TERMINAL-1.1.0-rc.5-win-x64-portable/GMT-Portable-Data/profile/terminal.sqlite3'),
  '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL/terminal.sqlite3'
];
for (const dbPath of candidateDbs) {
  if (dbPath && existsSync(dbPath)) {
    await copyFile(dbPath, path.join(profileDir, 'terminal.sqlite3')).catch(() => {});
    break;
  }
}

console.log('================================================================');
console.log('PHASE UI-2: NATIVE WINDOWS VOLUME TOGGLE & SCALE MATRIX TEST');
console.log('Profile Dir: ', profileDir);
console.log('Temp Dir:    ', tempDir);
console.log('Artifact Dir:', artifactDir);
console.log('================================================================\n');

const saveScreenshot = async (name, targetPage) => {
  const localPath = `test-results/${name}`;
  await targetPage.screenshot({ path: localPath });
  await copyFile(localPath, path.join(artifactDir, name)).catch(() => {});
  console.log(`  -> Screenshot saved: ${name}`);
};

const errors = [];
let app, page;

try {
  const launchEnv = {
    ...process.env,
    TEMP: testRoot,
    TMP: testRoot,
    IMT_TEST_DATA_DIR: profileDir,
  };
  delete launchEnv.IMT_AUTOMATED_TEST;
  delete launchEnv.IMT_EXPECT_PREVIEW;
  delete launchEnv.IMT_UI_FIXTURE;
  delete launchEnv.GMT_TEST_APP_DATA_ROOT;

  app = await electron.launch({
    args: ['.'],
    env: launchEnv,
    timeout: 60000,
  });

  page = await app.firstWindow();
  page.on('pageerror', e => {
    console.error('PAGE ERROR:', e);
    errors.push(e.message);
  });

  const sidebar = page.getByTestId('watchlist-sidebar');
  await sidebar.waitFor({ state: 'visible', timeout: 60000 });
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2000);

  // Configure Pane 0 with volume = true
  await page.evaluate(async () => {
    const ws = await window.terminal.request('/workspace');
    ws.panes[0].volume = true;
    ws.panes[0].indicators_hidden = false;
    await window.terminal.request('/workspace', 'PUT', ws);
  });
  await page.waitForTimeout(1500);

  const inspect = async () => {
    return await page.evaluate(async () => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const mainSeries = el?.__mainSeries;
      const panes = chart ? chart.panes() : [];
      const volBtn = document.querySelector('[aria-label="Volume pane 0"]');
      const logBtn = document.querySelector('[aria-label="LOG pane 0"]');
      const autoBtn = document.querySelector('[aria-label="AUTO pane 0"]');
      const pctBtn = document.querySelector('[aria-label="Percent pane 0"]');

      let priceRange = null;
      try {
        priceRange = chart ? chart.priceScale('right')?.getVisibleRange() : null;
      } catch (e) {}
      let timeRange = null;
      try {
        timeRange = chart ? chart.timeScale()?.getVisibleLogicalRange() : null;
      } catch (e) {}

      return {
        panesCount: panes.length,
        candlesCount: mainSeries ? mainSeries.data().length : 0,
        volBtnSelected: volBtn ? volBtn.classList.contains('selected') : false,
        logSelected: logBtn ? logBtn.classList.contains('selected') : false,
        autoSelected: autoBtn ? autoBtn.classList.contains('selected') : false,
        pctSelected: pctBtn ? pctBtn.classList.contains('selected') : false,
        hasMainSeries: !!mainSeries,
        priceRange,
        timeRange,
      };
    });
  };

  // Baseline inspection
  const baseline = await inspect();
  console.log('Baseline inspection:', JSON.stringify(baseline, null, 2));
  assert.equal(baseline.volBtnSelected, true, 'Volume button must be selected');
  assert.equal(baseline.panesCount, 2, 'Volume ON must have 2 panes (price + volume)');
  assert.ok(baseline.candlesCount > 0, 'Must have candles loaded');
  await saveScreenshot('ui2-01-vol-baseline-on.png', page);

  const initialCandles = baseline.candlesCount;

  // --- 20-CYCLE RAPID VOLUME TOGGLE VERIFICATION ---
  console.log('\n--- Running 20-Cycle Volume Toggle Stress Test ---');
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });

  for (let i = 1; i <= 20; i++) {
    // 1. Toggle OFF
    await volBtn.click();
    await page.waitForTimeout(150);
    const off = await inspect();
    assert.equal(off.volBtnSelected, false, `Cycle ${i}: volume button selected must be false`);
    assert.equal(off.panesCount, 1, `Cycle ${i}: volume OFF must have 1 pane`);
    assert.equal(off.candlesCount, initialCandles, `Cycle ${i}: candles count must not change when volume OFF`);
    assert.ok(off.hasMainSeries, `Cycle ${i}: mainSeries must remain visible`);

    // 2. Toggle ON
    await volBtn.click();
    await page.waitForTimeout(150);
    const on = await inspect();
    assert.equal(on.volBtnSelected, true, `Cycle ${i}: volume button selected must be true`);
    assert.equal(on.panesCount, 2, `Cycle ${i}: volume ON must have 2 panes`);
    assert.equal(on.candlesCount, initialCandles, `Cycle ${i}: candles count must not change when volume ON`);
    assert.ok(on.hasMainSeries, `Cycle ${i}: mainSeries must remain visible`);

    if (i % 5 === 0 || i === 20) {
      console.log(`  ✔ Completed cycle ${i}/20: Candles=${on.candlesCount}, Panes=${on.panesCount}, ButtonSelected=${on.volBtnSelected}`);
    }
  }
  console.log('✔ 20/20 Rapid Volume Toggle cycles PASSED with zero candle loss or pane desync!\n');
  await saveScreenshot('ui2-02-vol-after-20-cycles.png', page);

  // --- VOLUME INDEPENDENCE FROM INDICATOR HIDDEN STATE ---
  console.log('--- Testing Volume Independence from Indicators Hidden ---');
  const visMenu = page.getByLabel('Visibility menu', { exact: true });
  await visMenu.click();
  await page.waitForTimeout(300);
  const hideIndBtn = page.getByLabel('Hide indicators', { exact: true });
  await hideIndBtn.click();
  await page.waitForTimeout(500);

  let state = await inspect();
  console.log('State with indicators HIDDEN via UI:', { panes: state.panesCount, candles: state.candlesCount });
  assert.equal(state.panesCount, 2, 'Volume pane must REMAIN VISIBLE (2 panes) even when indicators are hidden!');
  assert.equal(state.candlesCount, initialCandles, 'Candles must remain fully intact');
  await saveScreenshot('ui2-03-vol-on-indicators-hidden.png', page);

  // Toggle volume OFF while indicators hidden
  console.log('Toggling volume OFF while indicators remain hidden...');
  await volBtn.click();
  await page.waitForTimeout(500);
  state = await inspect();
  assert.equal(state.volBtnSelected, false, 'Volume button must be unselected');
  assert.equal(state.panesCount, 1, 'Panes count must decrease to 1');
  assert.equal(state.candlesCount, initialCandles, 'Candles must remain visible');

  // Toggle volume back ON while indicators still hidden
  console.log('Toggling volume back ON while indicators still hidden...');
  await volBtn.click();
  await page.waitForTimeout(500);
  state = await inspect();
  assert.equal(state.volBtnSelected, true, 'Volume button must be selected');
  assert.equal(state.panesCount, 2, 'Volume pane must return to 2 panes');

  // Verify indicators are still hidden in visibility menu
  await visMenu.click();
  await page.waitForTimeout(300);
  const isIndHiddenPressed = await page.getByLabel('Hide indicators', { exact: true }).getAttribute('aria-pressed');
  assert.equal(isIndHiddenPressed, 'true', 'indicators_hidden must remain true while volume is toggled');
  // Unhide indicators
  await page.getByLabel('Hide indicators', { exact: true }).click();
  await page.waitForTimeout(500);
  console.log('✔ Volume is 100% independent of indicator hidden state!');

  // --- SCALE MATRIX: LOG, AUTO, PERCENTAGE VIA UI BUTTONS ---
  console.log('\n--- Testing Scale Modes (LOG, AUTO, Percent) with Volume Toggle ---');
  const logBtn = page.getByLabel('LOG pane 0', { exact: true });
  const autoBtn = page.getByLabel('AUTO pane 0', { exact: true });
  const pctBtn = page.getByLabel('Percent pane 0', { exact: true });

  // 1. LOG mode
  console.log('Testing LOG scale mode...');
  await logBtn.click();
  await page.waitForTimeout(500);
  let s = await inspect();
  assert.equal(s.logSelected, true, 'LOG must be active');
  assert.equal(s.panesCount, 2, 'LOG: Volume ON must have 2 panes');
  assert.equal(s.candlesCount, initialCandles, 'LOG: Candles intact');

  await volBtn.click();
  await page.waitForTimeout(400);
  s = await inspect();
  assert.equal(s.panesCount, 1, 'LOG: Volume OFF must have 1 pane');
  assert.equal(s.candlesCount, initialCandles);

  await volBtn.click();
  await page.waitForTimeout(400);
  s = await inspect();
  assert.equal(s.panesCount, 2, 'LOG: Volume restored');
  await logBtn.click(); // turn off LOG
  await page.waitForTimeout(300);

  // 2. Percentage mode
  console.log('Testing Percentage scale mode...');
  await pctBtn.click();
  await page.waitForTimeout(500);
  s = await inspect();
  assert.equal(s.pctSelected, true, 'Percent must be active');
  assert.equal(s.panesCount, 2, 'Percent: Volume ON must have 2 panes');

  await volBtn.click();
  await page.waitForTimeout(400);
  s = await inspect();
  assert.equal(s.panesCount, 1, 'Percent: Volume OFF must have 1 pane');
  assert.equal(s.candlesCount, initialCandles);

  await volBtn.click();
  await page.waitForTimeout(400);
  s = await inspect();
  assert.equal(s.panesCount, 2, 'Percent: Volume restored');
  await pctBtn.click(); // turn off Percent
  await page.waitForTimeout(300);

  // 3. AUTO toggle
  console.log('Testing AUTO scale toggle...');
  await autoBtn.click(); // toggle off auto
  await page.waitForTimeout(400);
  s = await inspect();
  assert.equal(s.autoSelected, false, 'AUTO must be off');
  assert.equal(s.panesCount, 2);

  await volBtn.click();
  await page.waitForTimeout(400);
  s = await inspect();
  assert.equal(s.panesCount, 1);

  await volBtn.click();
  await page.waitForTimeout(400);
  s = await inspect();
  assert.equal(s.panesCount, 2);
  await autoBtn.click(); // restore auto
  await page.waitForTimeout(300);
  console.log('✔ All scale modes passed volume toggle verification.');
  await saveScreenshot('ui2-04-vol-scale-modes.png', page);

  // --- THEME SWITCHING (LIGHT <-> DARK) WITH VOLUME ---
  console.log('\n--- Testing Theme Changes with Volume Active ---');
  const themeBtn = page.getByLabel('Toggle theme', { exact: true });
  await themeBtn.click();
  await page.waitForTimeout(1000);
  let themeState = await inspect();
  assert.equal(themeState.panesCount, 2, 'Light Mode: Volume must remain 2 panes');
  assert.equal(themeState.candlesCount, initialCandles, 'Light Mode: Candles must remain intact');
  await saveScreenshot('ui2-05-vol-light-theme.png', page);

  // Toggle volume OFF in light theme
  await volBtn.click();
  await page.waitForTimeout(500);
  themeState = await inspect();
  assert.equal(themeState.panesCount, 1, 'Light Mode: Volume OFF must have 1 pane');
  assert.equal(themeState.candlesCount, initialCandles);

  // Toggle volume ON in light theme
  await volBtn.click();
  await page.waitForTimeout(500);
  themeState = await inspect();
  assert.equal(themeState.panesCount, 2);

  // Restore dark theme
  await themeBtn.click();
  await page.waitForTimeout(1000);
  console.log('✔ Theme switching with volume toggle verified.');

  // --- MULTI-PANE INDEPENDENT VOLUME (1, 2, 4, 6, 8 PANES) ---
  console.log('\n--- Testing Multi-Chart Layouts & Independent Volume ---');
  const layoutBtn = page.getByLabel('Chart layout', { exact: true });
  const layouts = [1, 2, 4, 6, 8];

  for (const count of layouts) {
    console.log(`Setting layout: ${count} panes...`);
    await layoutBtn.click();
    await page.waitForTimeout(300);
    await page.getByLabel(`Layout ${count}`, { exact: true }).click();
    await page.waitForTimeout(1500);

    const renderedPanes = await page.locator('section.chart-pane').count();
    assert.equal(renderedPanes, count, `Layout ${count}: must render ${count} chart panes`);

    if (count >= 2) {
      const vol0 = page.getByLabel('Volume pane 0', { exact: true });
      const vol1 = page.getByLabel('Volume pane 1', { exact: true });

      const v0_init = await vol0.evaluate(el => el.classList.contains('selected'));
      const v1_init = await vol1.evaluate(el => el.classList.contains('selected'));

      // Toggle pane 1 volume
      await vol1.click();
      await page.waitForTimeout(500);
      const v0_after = await vol0.evaluate(el => el.classList.contains('selected'));
      const v1_after = await vol1.evaluate(el => el.classList.contains('selected'));

      assert.equal(v0_after, v0_init, `Pane 0 volume must NOT change when Pane 1 volume is toggled`);
      assert.notEqual(v1_after, v1_init, `Pane 1 volume must have toggled`);

      // Restore pane 1 volume
      await vol1.click();
      await page.waitForTimeout(500);
    }
    console.log(`  ✔ Layout ${count} panes verified with independent pane controls.`);
  }
  await saveScreenshot('ui2-06-vol-layout-8panes.png', page);

  // Reset to 1 pane
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(1500);

  // --- DRAWING STABILITY DURING VOLUME TOGGLE ---
  console.log('\n--- Testing Drawing Stability During Volume Toggle ---');
  let initialDrawings = await page.evaluate(async () => {
    const ws = await window.terminal.request('/workspace');
    return Object.values(ws.panes[0].drawing_sets || {}).flat().length;
  });
  console.log(`Initial drawing objects on pane 0: ${initialDrawings}`);

  // Toggle Volume OFF then ON
  await volBtn.click();
  await page.waitForTimeout(500);
  await volBtn.click();
  await page.waitForTimeout(500);

  let afterDrawings = await page.evaluate(async () => {
    const ws = await window.terminal.request('/workspace');
    return Object.values(ws.panes[0].drawing_sets || {}).flat().length;
  });
  assert.equal(afterDrawings, initialDrawings, 'Drawing objects count must persist across volume toggles');
  console.log('✔ Drawing objects remain 100% stable during volume toggle.');

  console.log('\n================================================================');
  console.log('ALL WINDOWS VOLUME TOGGLE & SCALE MATRIX TESTS PASSED (100%)!');
  console.log('================================================================');

} finally {
  await app?.close();
}
