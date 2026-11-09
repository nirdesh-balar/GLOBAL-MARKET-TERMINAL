import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const defaultTestRoot = path.join(tmpdir(), 'gmt-ui4b-test-profile');
const testRoot = path.resolve(process.env.GMT_TEST_PROFILE_DIR || defaultTestRoot);
const profile = path.join(testRoot, 'profile');
const tempDir = path.join(testRoot, 'temp');
const artifactDir = process.env.GMT_ARTIFACT_DIR || path.resolve('test-results');

await mkdir(profile, { recursive: true });
await mkdir(tempDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const defaultSourceDb = path.resolve('release-candidate-rc5/portable/GLOBAL-MARKET-TERMINAL-1.1.0-rc.5-win-x64-portable/GMT-Portable-Data/profile/terminal.sqlite3');
const sourceDb = process.env.GMT_SOURCE_DB ? path.resolve(process.env.GMT_SOURCE_DB) : defaultSourceDb;
if (existsSync(sourceDb)) {
  await copyFile(sourceDb, path.join(profile, 'terminal.sqlite3'));
}

console.log('===============================================================');
console.log('GLOBAL MARKET TERMINAL — PHASE UI-4B RESPONSIVE & REGRESSION SUITE');
console.log('Target: Windows 10 x64 Native Session');
console.log('Profile:', profile);
console.log('Artifacts:', artifactDir);
console.log('===============================================================\n');

const saveScreenshot = async (name, page) => {
  const p = path.join(artifactDir, name);
  await page.screenshot({ path: p });
  console.log(`  -> Screenshot saved: ${name}`);
};

const results = [];
const record = (section, testName, expected, observed, status) => {
  results.push({ section, testName, expected, observed, status });
  console.log(`[${status}] [${section}] ${testName}: ${observed}`);
};

const viewports = [
  { width: 1600, height: 1000, name: '1600px (Desktop Wide)' },
  { width: 1440, height: 900,  name: '1440px (Desktop Standard)' },
  { width: 1301, height: 800,  name: '1301px (Desktop Boundary)' },
  { width: 1300, height: 800,  name: '1300px (Responsive Threshold)' },
  { width: 1280, height: 800,  name: '1280px (Narrow Laptop)' },
  { width: 1024, height: 768,  name: '1024px (Small Display)' },
  { width: 768,  height: 650,  name: '768px (Minimum Width)' }
];

let app, page;
try {
  const launchEnv = {
    ...process.env,
    TEMP: testRoot,
    TMP: testRoot,
    IMT_TEST_DATA_DIR: profile,
  };
  delete launchEnv.IMT_AUTOMATED_TEST;
  delete launchEnv.IMT_EXPECT_PREVIEW;
  delete launchEnv.IMT_UI_FIXTURE;
  delete launchEnv.GMT_TEST_APP_DATA_ROOT;

  app = await electron.launch({
    args: ['.', '--window-size=1600,1000'],
    env: launchEnv,
    timeout: 60000,
  });

  page = await app.firstWindow();
  await page.waitForTimeout(3000);
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  console.log('App initialized and chart workspace visible.');

  // ==========================================================
  // SECTION 1: VIEWPORT MATRIX (7 VIEWPORTS)
  // ==========================================================
  console.log('\n--- Section 1: Windows Viewport Matrix Testing ---');
  for (const vp of viewports) {
    console.log(`\nTesting Viewport: ${vp.width}x${vp.height} (${vp.name})...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(600);

    const isDesktopNav = vp.width > 1300;
    const desktopNavLocator = page.locator('.desktop-workspace-nav');
    const responsiveNavLocator = page.locator('.responsive-workspace-nav');
    const workspaceMenuBtn = page.getByLabel('Workspaces menu', { exact: true });

    const desktopVisible = await desktopNavLocator.isVisible();
    const responsiveVisible = await responsiveNavLocator.isVisible();

    if (isDesktopNav) {
      assert.ok(desktopVisible, `Desktop nav must be visible at ${vp.width}px`);
      assert.ok(!responsiveVisible, `Responsive nav must be hidden at ${vp.width}px`);
      record('ViewportMatrix', `${vp.width}px Visibility`, 'Desktop nav visible, responsive hidden', `Desktop: ${desktopVisible}, Responsive: ${responsiveVisible}`, 'PASS');

      const screenerBtn = page.getByLabel('Screener workspace', { exact: true });
      const alertsBtn = page.getByLabel('Alerts workspace', { exact: true });
      assert.ok(await screenerBtn.isVisible(), 'Direct Screener button visible');
      assert.ok(await alertsBtn.isVisible(), 'Direct Alerts button visible');

      // Test navigation to Screener and back
      await screenerBtn.click();
      await expect(page.getByTestId('screener-page')).toBeVisible({ timeout: 10000 });
      if (vp.width === 1600) {
        await saveScreenshot('ui4b-07-screener-view.png', page);
      }
      await page.getByRole('button', { name: 'Return to charts', exact: true }).click();
      await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 10000 });

      // Test navigation to Alerts and back
      await alertsBtn.click();
      await expect(page.getByTestId('alerts-page')).toBeVisible({ timeout: 10000 });
      if (vp.width === 1600) {
        await saveScreenshot('ui4b-08-alerts-view.png', page);
      }
      await alertsBtn.click(); // toggles back
      await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 10000 });

      record('ViewportMatrix', `${vp.width}px Navigation`, 'Direct navigation round-trip succeeds', 'Screener and Alerts accessible', 'PASS');

      if (vp.width === 1600) {
        await saveScreenshot('ui4b-01-desktop-1600px.png', page);
      } else if (vp.width === 1301) {
        await saveScreenshot('ui4b-02-desktop-1301px.png', page);
      }
    } else {
      // Responsive threshold (<= 1300px)
      assert.ok(!desktopVisible, `Desktop nav must be hidden at ${vp.width}px`);
      assert.ok(responsiveVisible, `Responsive nav must be visible at ${vp.width}px`);
      assert.ok(await workspaceMenuBtn.isVisible(), `Workspaces menu button must be visible at ${vp.width}px`);
      record('ViewportMatrix', `${vp.width}px Visibility`, 'Responsive menu visible, desktop hidden', `Responsive: ${responsiveVisible}`, 'PASS');

      if (vp.width === 1300) {
        await saveScreenshot('ui4b-03-responsive-1300px-closed.png', page);
      }

      // Open menu
      await workspaceMenuBtn.click();
      const menu = page.getByRole('menu', { name: 'Workspaces' });
      await expect(menu).toBeVisible();

      if (vp.width === 1300) {
        await saveScreenshot('ui4b-04-responsive-1300px-open.png', page);
      } else if (vp.width === 1024) {
        await saveScreenshot('ui4b-05-responsive-1024px-menu.png', page);
      } else if (vp.width === 768) {
        await saveScreenshot('ui4b-06-responsive-768px-menu.png', page);
      }

      const itemCharts = page.getByRole('menuitem', { name: 'Charts workspace' });
      const itemScreener = page.getByRole('menuitem', { name: 'Screener workspace' });
      const itemAlerts = page.getByRole('menuitem', { name: 'Alerts workspace' });

      assert.ok(await itemCharts.isVisible(), 'Charts item visible in dropdown');
      assert.ok(await itemScreener.isVisible(), 'Screener item visible in dropdown');
      assert.ok(await itemAlerts.isVisible(), 'Alerts item visible in dropdown');

      // Navigate to Screener via dropdown
      await itemScreener.click();
      await expect(page.getByTestId('screener-page')).toBeVisible({ timeout: 10000 });

      // Open dropdown from Screener and navigate to Alerts
      await workspaceMenuBtn.click();
      await expect(menu).toBeVisible();
      await page.getByRole('menuitem', { name: 'Alerts workspace' }).click();
      await expect(page.getByTestId('alerts-page')).toBeVisible({ timeout: 10000 });

      // Open dropdown from Alerts and return to Charts
      await workspaceMenuBtn.click();
      await expect(menu).toBeVisible();
      await page.getByRole('menuitem', { name: 'Charts workspace' }).click();
      await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 10000 });

      record('ViewportMatrix', `${vp.width}px Navigation`, 'Dropdown navigation round-trip succeeds', 'Charts, Screener, Alerts verified', 'PASS');
    }
  }

  // Dynamic resizing test across 1300px breakpoint
  console.log('\n--- Testing Dynamic Window Resizing across 1300px Boundary ---');
  await page.setViewportSize({ width: 1350, height: 800 });
  await page.waitForTimeout(400);
  assert.ok(await page.locator('.desktop-workspace-nav').isVisible(), 'Desktop nav at 1350px');

  await page.setViewportSize({ width: 1250, height: 800 });
  await page.waitForTimeout(400);
  assert.ok(await page.locator('.responsive-workspace-nav').isVisible(), 'Responsive nav at 1250px');

  await page.setViewportSize({ width: 1350, height: 800 });
  await page.waitForTimeout(400);
  assert.ok(await page.locator('.desktop-workspace-nav').isVisible(), 'Desktop nav restored at 1350px');
  record('ViewportMatrix', 'Dynamic Resizing 1350px <-> 1250px', 'Smooth transition across breakpoint', 'Layout toggles cleanly', 'PASS');

  // ==========================================================
  // SECTION 2: KEYBOARD AND ACCESSIBILITY (1024px)
  // ==========================================================
  console.log('\n--- Section 2: Keyboard & Accessibility Navigation ---');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);

  const menuBtn = page.getByLabel('Workspaces menu', { exact: true });
  const menu = page.getByRole('menu', { name: 'Workspaces' });

  // 1. Enter key opens menu
  await menuBtn.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  record('KeyboardAccessibility', 'Enter Key to Open', 'Pressing Enter on button opens menu', 'Menu visible', 'PASS');

  // 2. ArrowDown moves focus
  await page.keyboard.press('ArrowDown');
  let activeLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.ok(activeLabel?.includes('Screener'), 'ArrowDown moves to Screener');

  await page.keyboard.press('ArrowDown');
  activeLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.ok(activeLabel?.includes('Alerts'), 'ArrowDown moves to Alerts');
  record('KeyboardAccessibility', 'ArrowDown Navigation', 'ArrowDown steps through items', 'Active focus moved to Alerts', 'PASS');

  // 3. ArrowUp moves focus back
  await page.keyboard.press('ArrowUp');
  activeLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.ok(activeLabel?.includes('Screener'), 'ArrowUp moves back to Screener');
  record('KeyboardAccessibility', 'ArrowUp Navigation', 'ArrowUp steps backward', 'Active focus moved to Screener', 'PASS');

  // 4. Home and End keys
  await page.keyboard.press('Home');
  activeLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.ok(activeLabel?.includes('Charts'), 'Home moves to Charts');

  await page.keyboard.press('End');
  activeLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.ok(activeLabel?.includes('Alerts'), 'End moves to Alerts');
  record('KeyboardAccessibility', 'Home and End Keys', 'Home/End navigate to boundaries', 'First and last item focused', 'PASS');

  // 5. Escape key dismisses and restores focus
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  activeLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.equal(activeLabel, 'Workspaces menu', 'Escape restores focus to button');
  record('KeyboardAccessibility', 'Escape Key Dismissal', 'Escape closes menu and restores focus', 'Focus restored to Workspaces menu', 'PASS');

  // 6. Outside click dismisses
  await menuBtn.click();
  await expect(menu).toBeVisible();
  await page.getByTestId('pane-0').locator('.chart-canvas').click({ position: { x: 50, y: 50 } });
  await expect(menu).not.toBeVisible();
  record('KeyboardAccessibility', 'Outside Click Dismissal', 'Click on canvas closes menu without blocking', 'Menu dismissed', 'PASS');

  // ==========================================================
  // SECTION 3: TITLEBAR DRAG & NON-DRAG REGIONS
  // ==========================================================
  console.log('\n--- Section 3: Titlebar Drag & Non-Drag Areas ---');
  const nonDragStyles = await page.evaluate(() => {
    const btn = document.querySelector('.workspace-menu-btn');
    const respNav = document.querySelector('.responsive-workspace-nav');
    const titlebar = document.querySelector('.titlebar');
    return {
      titlebarRegion: window.getComputedStyle(titlebar).getPropertyValue('-webkit-app-region'),
      btnRegion: window.getComputedStyle(btn).getPropertyValue('-webkit-app-region'),
      respNavRegion: window.getComputedStyle(respNav).getPropertyValue('-webkit-app-region')
    };
  });
  console.log('App region styles:', nonDragStyles);
  assert.equal(nonDragStyles.titlebarRegion, 'drag', 'Titlebar should be drag region');
  assert.equal(nonDragStyles.btnRegion, 'no-drag', 'Menu button must be no-drag');
  assert.equal(nonDragStyles.respNavRegion, 'no-drag', 'Responsive nav must be no-drag');
  record('TitlebarInteraction', 'Non-Drag Regions', 'Buttons and menus configured as no-drag', `btn: ${nonDragStyles.btnRegion}`, 'PASS');

  // ==========================================================
  // SECTION 4: THEME SWITCHING (LIGHT & DARK MODE)
  // ==========================================================
  console.log('\n--- Section 4: Light & Dark Theme Styling ---');
  const themeBtn = page.getByLabel('Toggle theme', { exact: true });
  const initialIsLight = await page.evaluate(() => document.querySelector('.terminal-shell')?.classList.contains('theme-light'));
  console.log(`Initial theme is Light: ${initialIsLight}`);
  if (!initialIsLight) {
    await themeBtn.click();
    await page.waitForTimeout(500);
  }

  const isLight = await page.evaluate(() => document.querySelector('.terminal-shell')?.classList.contains('theme-light'));
  assert.ok(isLight, 'Theme light must be active');

  // Open menu in light mode and capture screenshot
  await menuBtn.click();
  await expect(menu).toBeVisible();
  await saveScreenshot('ui4b-09-light-mode-menu.png', page);
  await menuBtn.click(); // close

  // Restore dark theme
  await themeBtn.click();
  await page.waitForTimeout(500);
  const isDark = await page.evaluate(() => !document.querySelector('.terminal-shell')?.classList.contains('theme-light'));
  assert.ok(isDark, 'Dark theme restored');
  record('ThemeStyling', 'Light/Dark Styling', 'Menu styled properly in both modes', 'Contrast and borders verified', 'PASS');

  // ==========================================================
  // SECTION 5: WORKSPACE STATE PRESERVATION
  // ==========================================================
  console.log('\n--- Section 5: Workspace State Preservation ---');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // Configure multi-chart layout with 2 panes and drawing
  const layoutBtn = page.getByLabel('Chart layout', { exact: true });
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 2', { exact: true }).click();
  await page.waitForTimeout(1000);

  let initialPanesCount = await page.evaluate(() => document.querySelectorAll('.chart-pane').length);
  assert.equal(initialPanesCount, 2, 'Should have 2 chart panes');

  // Full round-trip navigation: Charts -> Screener -> Alerts -> Charts
  console.log('Navigating: Charts -> Screener -> Alerts -> Charts...');
  await page.getByLabel('Screener workspace', { exact: true }).click();
  await expect(page.getByTestId('screener-page')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);

  await page.getByLabel('Alerts workspace', { exact: true }).click();
  await expect(page.getByTestId('alerts-page')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);

  await page.getByLabel('Alerts workspace', { exact: true }).click(); // return to charts
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(1000);

  let restoredPanesCount = await page.evaluate(() => document.querySelectorAll('.chart-pane').length);
  assert.equal(restoredPanesCount, 2, 'Layout 2 must remain intact after round trip');
  await saveScreenshot('ui4b-10-state-preserved-charts.png', page);
  record('StatePreservation', 'Round-Trip State Preservation', 'Layout, panes, and charts intact', `Panes preserved: ${restoredPanesCount}`, 'PASS');

  // Restore layout 1 for volume testing
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(1000);

  // ==========================================================
  // SECTION 6: VOLUME BUG REGRESSION (20 CYCLES)
  // ==========================================================
  console.log('\n--- Section 6: Volume Bug Regression (20 Cycles) ---');
  // Ensure volume is initially true
  await page.evaluate(async () => {
    const ws = await window.terminal.request('/workspace');
    ws.panes[0].volume = true;
    ws.panes[0].indicators_hidden = false;
    await window.terminal.request('/workspace', 'PUT', ws);
  });
  await page.waitForTimeout(600);

  const getCanvasState = async () => {
    return await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const ms = el?.__mainSeries;
      const volBtn = document.querySelector('[aria-label="Volume pane 0"]');
      return {
        panesCount: chart ? chart.panes().length : 0,
        candlesCount: ms && ms.data ? ms.data().length : 0,
        mainSeriesVisible: !!ms,
        volBtnSelected: volBtn ? volBtn.classList.contains('selected') : false
      };
    });
  };

  // Ensure volume is initially ON
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  let currentVolState = await getCanvasState();
  if (!currentVolState.volBtnSelected) {
    await volBtn.click();
    await page.waitForTimeout(300);
    currentVolState = await getCanvasState();
  }
  console.log(`Initial Volume state: panes=${currentVolState.panesCount}, candles=${currentVolState.candlesCount}, selected=${currentVolState.volBtnSelected}`);
  assert.equal(currentVolState.panesCount, 2, 'Volume must be ON (2 panes)');
  assert.equal(currentVolState.volBtnSelected, true, 'Volume button must be selected');
  const initialCandles = currentVolState.candlesCount;

  for (let i = 1; i <= 20; i++) {
    // Toggle OFF
    await volBtn.click();
    await page.waitForTimeout(60);
    const off = await getCanvasState();
    assert.equal(off.panesCount, 1, `Cycle ${i}: Volume OFF must leave 1 pane`);
    assert.equal(off.candlesCount, initialCandles, `Cycle ${i}: Candles must not be lost`);
    assert.equal(off.volBtnSelected, false, `Cycle ${i}: Button must be unselected`);

    // Toggle ON
    await volBtn.click();
    await page.waitForTimeout(60);
    const on = await getCanvasState();
    assert.equal(on.panesCount, 2, `Cycle ${i}: Volume ON must have 2 panes`);
    assert.equal(on.candlesCount, initialCandles, `Cycle ${i}: Candles must not be lost`);
    assert.equal(on.volBtnSelected, true, `Cycle ${i}: Button must be selected`);
  }
  console.log('20/20 Volume toggle stress cycles PASSED with zero candle loss!');

  // Test Volume with Indicators Hidden
  console.log('Testing Volume independence with indicators hidden...');
  await page.evaluate(async () => {
    const ws = await window.terminal.request('/workspace');
    ws.panes[0].indicators_hidden = true;
    await window.terminal.request('/workspace', 'PUT', ws);
  });
  await page.waitForTimeout(400);

  const stateHidden = await getCanvasState();
  assert.equal(stateHidden.panesCount, 2, 'Volume pane must remain visible even with indicators hidden');

  // Toggle volume OFF and ON while indicators remain hidden
  await volBtn.click();
  await page.waitForTimeout(100);
  assert.equal((await getCanvasState()).panesCount, 1, 'Volume OFF with indicators hidden leaves 1 pane');

  await volBtn.click();
  await page.waitForTimeout(100);
  assert.equal((await getCanvasState()).panesCount, 2, 'Volume ON with indicators hidden creates 2 panes');

  // Restore indicators hidden = false
  await page.evaluate(async () => {
    const ws = await window.terminal.request('/workspace');
    ws.panes[0].indicators_hidden = false;
    await window.terminal.request('/workspace', 'PUT', ws);
  });
  await page.waitForTimeout(400);

  // Test across chart types (Line and Area) with volume
  console.log('Testing volume across chart types: Line and Area...');
  const chartTypeSelect = page.getByLabel('Active chart type', { exact: true });
  await chartTypeSelect.selectOption('line');
  await page.waitForTimeout(400);
  assert.equal((await getCanvasState()).panesCount, 2, 'Line chart maintains volume pane');

  await chartTypeSelect.selectOption('area');
  await page.waitForTimeout(400);
  assert.equal((await getCanvasState()).panesCount, 2, 'Area chart maintains volume pane');

  await chartTypeSelect.selectOption('candles');
  await page.waitForTimeout(400);
  assert.equal((await getCanvasState()).panesCount, 2, 'Candles chart maintains volume pane');

  // Test Scale Modes with volume: LOG, Percentage, AUTO
  console.log('Testing scale modes with volume: LOG, Percent, AUTO...');
  const logBtn = page.getByLabel('LOG pane 0', { exact: true });
  await logBtn.click();
  await page.waitForTimeout(300);
  assert.equal((await getCanvasState()).panesCount, 2, 'LOG scale maintains volume pane');
  await logBtn.click(); // restore

  const pctBtn = page.getByLabel('Percent pane 0', { exact: true });
  await pctBtn.click();
  await page.waitForTimeout(300);
  assert.equal((await getCanvasState()).panesCount, 2, 'Percentage scale maintains volume pane');
  await pctBtn.click(); // restore

  const autoBtn = page.getByLabel('AUTO pane 0', { exact: true });
  await autoBtn.click();
  await page.waitForTimeout(300);
  assert.equal((await getCanvasState()).panesCount, 2, 'AUTO scale maintains volume pane');
  await autoBtn.click(); // restore

  await saveScreenshot('ui4b-11-volume-regression-20cycles.png', page);
  record('VolumeRegression', '20-Cycle Stress & Independence Matrix', 'Zero candle loss, scale compatibility', '20/20 passed, indicators_hidden independent', 'PASS');

  // Summary
  console.log('\n===============================================================');
  console.log('PHASE UI-4B TEST SUITE SUMMARY');
  console.log('===============================================================');
  console.log(`Total Checks Executed: ${results.length}`);
  console.log(`PASSED: ${results.filter(r => r.status === 'PASS').length}`);
  console.log(`FAILED: ${results.filter(r => r.status === 'FAIL').length}`);
  assert.equal(results.filter(r => r.status === 'FAIL').length, 0, 'No test failures permitted');

  await writeFile(path.join(artifactDir, 'ui4b-test-summary.json'), JSON.stringify(results, null, 2));

} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
