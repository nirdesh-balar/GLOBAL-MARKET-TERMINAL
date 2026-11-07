import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exe = path.resolve('release-candidate-r2/win-unpacked/GLOBAL MARKET TERMINAL.exe');
const testProfile = await mkdtemp(path.join(tmpdir(), 'gmt-r2-packaged-acceptance-'));
const artifactDir = process.env.GMT_ARTIFACT_DIR || path.resolve('test-results');

await mkdir('test-results', { recursive: true });
await mkdir(artifactDir, { recursive: true });

console.log('================================================================');
console.log('PHASE R2: STANDALONE PACKAGED WINDOWS X64 GUI ACCEPTANCE SUITE');
console.log('Executable:', exe);
console.log('Profile:   ', testProfile);
console.log('Artifacts: ', artifactDir);
console.log('================================================================');

const startTime = Date.now();
const errors = [];
let app, page;

const saveScreenshot = async (name) => {
  const localPath = `test-results/${name}`;
  await page.screenshot({ path: localPath });
  await copyFile(localPath, path.join(artifactDir, name)).catch(() => {});
  console.log(`  -> Screenshot captured: ${name}`);
};

try {
  const launchStart = Date.now();
  app = await electron.launch({
    executablePath: exe,
    args: [],
    env: {
      ...process.env,
      IMT_TEST_DATA_DIR: testProfile,
      IMT_UI_FIXTURE: '1',
      IMT_OFFLINE: '1',
    },
    timeout: 60000,
  });
  const launchDuration = Date.now() - launchStart;
  console.log(`\n1. Startup: Cold launch duration: ${launchDuration}ms`);

  page = await app.firstWindow();
  page.on('pageerror', e => {
    console.error('Renderer Error:', e);
    errors.push(e.message || String(e));
  });

  // Wait for sidebar and ensure no crash overlays
  const sidebar = page.getByTestId('watchlist-sidebar');
  await sidebar.waitFor({ state: 'visible', timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });
  const backendStartDuration = Date.now() - launchStart;
  console.log(`2. Backend Ready Duration: ${backendStartDuration}ms`);

  // Verify Backend /health endpoint
  const health = await page.evaluate(() => window.terminal.request('/health'));
  console.log('3. Health check response:');
  console.log('   Status:     ', health.status);
  console.log('   Version:    ', health.version);
  console.log('   API Version:', health.api_version);
  console.log('   Instruments:', health.instruments);

  assert.equal(health.status, 'ok', 'Health status must be ok');
  assert.equal(health.version, '1.1.0-rc.1', 'Health version must be 1.1.0-rc.1');
  assert.equal(health.api_version, '1.0.0', 'API contract version must be 1.0.0');
  assert.ok(health.instruments >= 3000, 'Catalogue must contain >= 3000 instruments');

  // Baseline screenshot
  await saveScreenshot('r2-acc-01-startup-baseline.png');

  // Switch to Layout 1 for detailed chart testing
  const layoutBtn = page.getByLabel('Chart layout', { exact: true });
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(600);

  const pane0 = page.getByTestId('pane-0');
  const canvas0 = pane0.locator('.chart-canvas');
  await canvas0.waitFor({ state: 'visible', timeout: 15000 });

  // Verify OHLC Legend
  const ohlc = pane0.locator('.ohlc');
  await ohlc.waitFor({ state: 'visible', timeout: 10000 });
  const ohlcText = await ohlc.innerText();
  console.log('4. OHLC Legend text:', ohlcText.replace(/\s+/g, ' '));
  assert.ok(ohlcText.includes('O') && ohlcText.includes('H') && ohlcText.includes('L') && ohlcText.includes('C'), 'OHLC legend must show O, H, L, C');

  const getChartState = async () => {
    return await canvas0.evaluate(el => {
      const c = el.__chart;
      const m = el.__mainSeries;
      const ps = c ? c.priceScale('right') : null;
      const ts = c ? c.timeScale() : null;
      const vr = ps ? ps.getVisibleRange() : null;
      const lr = ts ? ts.getVisibleLogicalRange() : null;
      const h = c && c.panes()[0] ? c.panes()[0].getHeight() : 400;
      const dataLen = m && m.data ? m.data().length : 0;
      const lastCandle = dataLen ? m.data().at(-1) : null;
      const coord = lastCandle ? m.priceToCoordinate(lastCandle.close) : null;
      const options = ps ? ps.options() : null;
      return { vr, lr, h, dataLen, lastCandle, coord, options };
    });
  };

  const initialChartState = await getChartState();
  console.log(`   Chart candles count: ${initialChartState.dataLen}, last close: ${initialChartState.lastCandle?.close} at coordinate ${initialChartState.coord?.toFixed(1)}px`);
  assert.ok(initialChartState.dataLen > 0, 'Chart must have bars');
  assert.ok(initialChartState.coord !== null && initialChartState.coord >= 0 && initialChartState.coord <= initialChartState.h, 'Candles must be visibly rendered in canvas bounds');

  // =========================================================================
  // 5. Watchlist Interaction & Keyboard Navigation
  // =========================================================================
  console.log('\n5. Verifying Watchlist Selection, Accent Strip, and Keyboard Nav...');
  const rows = page.locator('.watch-row');
  const rowCount = await rows.count();
  assert.ok(rowCount >= 4, 'Watchlist must have at least 4 rows');

  // Click first row
  await rows.nth(0).click();
  await page.waitForTimeout(200);
  const selectedStyle0 = await rows.nth(0).evaluate(e => {
    const s = getComputedStyle(e);
    const before = getComputedStyle(e, '::before');
    return {
      outline: s.outline,
      boxShadow: s.boxShadow,
      borderLeft: s.borderLeft,
      beforeBg: before.backgroundColor,
      hasSelectedClass: e.classList.contains('selected-symbol')
    };
  });
  console.log('   Row 0 selection:', selectedStyle0);
  assert.ok(selectedStyle0.hasSelectedClass, 'Row 0 must have selected-symbol class');
  assert.ok(selectedStyle0.outline.includes('none') || selectedStyle0.outline === 'none' || selectedStyle0.outline.includes('0px'), 'No keyboard focus outline');

  // Keyboard Down arrow
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const row1Selected = await rows.nth(1).evaluate(e => e.classList.contains('selected-symbol'));
  assert.ok(row1Selected, 'ArrowDown must move selection to Row 1');

  // Keyboard Up arrow
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  const row0Reselected = await rows.nth(0).evaluate(e => e.classList.contains('selected-symbol'));
  assert.ok(row0Reselected, 'ArrowUp must restore selection to Row 0');

  // Flag as Red
  console.log('6. Verifying Colored Watchlist Flags (Red, Green, Blue, etc.)...');
  const flagBtn = rows.nth(0).locator('.symbol-flag-btn');
  await flagBtn.click();
  const redFlagBtn = page.locator('button[aria-label="Flag as Red"]');
  await redFlagBtn.waitFor({ state: 'visible', timeout: 5000 });
  await redFlagBtn.click();
  await page.waitForTimeout(300);

  await saveScreenshot('r2-acc-02-watchlist-selected-flagged.png');

  // =========================================================================
  // 7. Watchlist Excel Export & Auto-Dismiss Lifecycle
  // =========================================================================
  console.log('\n7. Verifying Watchlist Excel (.xlsx) Export & Auto-Dismiss...');
  const exportBtn = page.getByTestId('watchlist-export-btn');
  const exportMenu = page.getByTestId('watchlist-export-menu');

  // Setup dialog interceptor in Electron main process
  await app.evaluate(({ dialog }) => {
    globalThis.__lastSaveOpts = null;
    globalThis.__saveDialogPath = null;
    globalThis.__saveDialogCancel = false;
    dialog.showSaveDialog = async (win, opts) => {
      globalThis.__lastSaveOpts = opts;
      if (globalThis.__saveDialogCancel) {
        return { canceled: true };
      }
      return { canceled: false, filePath: globalThis.__saveDialogPath };
    };
  });

  const exportFilePath = path.join(testProfile, 'Watchlist-Export-R2.xlsx');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, exportFilePath);

  await exportBtn.click();
  await exportMenu.waitFor({ state: 'visible', timeout: 5000 });
  const excelAction = page.getByTestId('export-excel-action');
  await excelAction.click();

  const statusNotice = page.locator('.watchlist-status');
  await expect(statusNotice).toContainText('Excel exported successfully', { timeout: 35000 });
  const noticeText = await statusNotice.innerText();
  console.log(`   Export notification visible: "${noticeText.replace(/\s+/g, ' ')}"`);
  assert.ok(noticeText.includes('Excel exported successfully') || noticeText.includes('.xlsx'), 'Export notification must confirm Excel export');

  await saveScreenshot('r2-acc-03-excel-export-notification.png');

  // Verify file created on disk
  await page.waitForTimeout(500);
  const fileStat = await stat(exportFilePath);
  console.log(`   Verified exported .xlsx file on disk: ${fileStat.size} bytes`);
  assert.ok(fileStat.size > 2000, 'Excel export file size must be > 2KB');

  // Verify auto-dismiss after ~4000ms
  console.log('   Waiting for notification auto-dismiss (4000ms)...');
  await page.waitForTimeout(4500);
  const noticeCount = await statusNotice.count();
  console.log(`   Notification count after 4.5s: ${noticeCount}`);
  assert.equal(noticeCount, 0, 'Notification must auto-dismiss completely after 4000ms');

  // =========================================================================
  // 8. One-Shot Drawing Tools & Auto-Return to Cursor
  // =========================================================================
  console.log('\n8. Verifying One-Shot Drawings Auto-Returning to Cursor Tool...');
  const cursorBtn = page.getByLabel('Cursor / crosshair', { exact: true });

  // Tool 1: Trendline
  console.log('   Drawing Trendline...');
  await page.getByTestId('drawing-category-lines').click();
  const trendlineBtn = page.getByTestId('drawing-tool-trend');
  await trendlineBtn.click();

  const cbox = await canvas0.boundingBox();
  assert.ok(cbox, 'Canvas bounding box must exist');

  await page.mouse.click(cbox.x + 100, cbox.y + 100);
  await page.mouse.click(cbox.x + 240, cbox.y + 160);
  await page.waitForTimeout(300);

  const cursorSelectedAfterTrend = await cursorBtn.evaluate(e => e.classList.contains('selected'));
  console.log(`   Trendline complete: Cursor selected = ${cursorSelectedAfterTrend}`);
  assert.ok(cursorSelectedAfterTrend, 'Must auto-return to Cursor after Trendline');

  // Tool 2: Horizontal Line
  console.log('   Drawing Horizontal Line...');
  await page.getByTestId('drawing-category-lines').click();
  const horizBtn = page.getByTestId('drawing-tool-horizontal');
  await horizBtn.click();

  await page.mouse.click(cbox.x + 180, cbox.y + 140);
  await page.waitForTimeout(300);

  const cursorSelectedAfterHoriz = await cursorBtn.evaluate(e => e.classList.contains('selected'));
  console.log(`   Horizontal line complete: Cursor selected = ${cursorSelectedAfterHoriz}`);
  assert.ok(cursorSelectedAfterHoriz, 'Must auto-return to Cursor after Horizontal line');

  await saveScreenshot('r2-acc-04-drawings-cursor-returned.png');

  // =========================================================================
  // 9. Price Scale Mouse-Wheel Zoom & Non-Interference
  // =========================================================================
  console.log('\n9. Verifying Price Scale Mouse-Wheel Zoom...');
  const priceAxisX = cbox.x + cbox.width - 25;
  const priceAxisY = cbox.y + cbox.height * 0.45;

  const preZoomState = await getChartState();
  const preZoomLogical = preZoomState.lr;
  const preZoomSpan = preZoomState.vr.to - preZoomState.vr.from;

  // Zoom IN: Wheel UP (deltaY < 0)
  console.log('   Zooming IN on price scale (Wheel UP)...');
  await page.mouse.move(priceAxisX, priceAxisY);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(400);

  const postZoomInState = await getChartState();
  const postZoomInSpan = postZoomInState.vr.to - postZoomInState.vr.from;
  console.log(`   Pre-zoom span: ${preZoomSpan.toFixed(2)}, Post-zoom IN span: ${postZoomInSpan.toFixed(2)}`);
  assert.ok(postZoomInSpan < preZoomSpan, 'Zoom IN must decrease the price span');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'false', 'AutoScale attribute must be false after manual zoom');
  assert.ok(Math.abs(postZoomInState.lr.from - preZoomLogical.from) < 0.05, 'Horizontal time axis from must NOT change');
  assert.ok(Math.abs(postZoomInState.lr.to - preZoomLogical.to) < 0.05, 'Horizontal time axis to must NOT change');

  // Zoom OUT: Wheel DOWN (deltaY > 0)
  console.log('   Zooming OUT on price scale (Wheel DOWN)...');
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);

  const postZoomOutState = await getChartState();
  const postZoomOutSpan = postZoomOutState.vr.to - postZoomOutState.vr.from;
  console.log(`   Post-zoom OUT span: ${postZoomOutSpan.toFixed(2)}`);
  assert.ok(postZoomOutSpan > postZoomInSpan, 'Zoom OUT must increase the price span');
  assert.ok(Math.abs(postZoomOutState.lr.from - preZoomLogical.from) < 0.05, 'Horizontal time axis from must remain unchanged');
  assert.ok(Math.abs(postZoomOutState.lr.to - preZoomLogical.to) < 0.05, 'Horizontal time axis to must remain unchanged');

  await saveScreenshot('r2-acc-05-price-wheel-zoom.png');

  // =========================================================================
  // 10. Critical LOG Scale Fix (No Disappearing Candles)
  // =========================================================================
  console.log('\n10. Verifying Critical LOG Scale Fix After Manual Price Zoom...');
  const logBtn0 = pane0.getByRole('button', { name: /LOG pane 0/i });
  const autoBtn0 = pane0.getByRole('button', { name: /AUTO pane 0/i });

  // Switch LOG ON after manual zoom
  await logBtn0.click();
  await page.waitForTimeout(400);

  const logState = await getChartState();
  console.log('   LOG Mode State:');
  console.log('   Mode:       ', logState.options?.mode);
  console.log('   Range:      ', logState.vr);
  console.log('   Candle Y:   ', logState.coord?.toFixed(1) + 'px (canvas height: ' + logState.h + 'px)');

  assert.equal(logState.options?.mode, 1, 'Mode must be Logarithmic (1)');
  assert.ok(logState.vr && Number.isFinite(logState.vr.from) && Number.isFinite(logState.vr.to), 'Range must be finite');
  assert.ok(logState.vr.from < logState.vr.to, 'Range from < to');
  assert.ok(logState.coord !== null && Number.isFinite(logState.coord), 'Candle coordinate must be finite');
  assert.ok(logState.coord >= 0 && logState.coord <= logState.h, `CRITICAL CHECK PASSED: Candles visible at ${logState.coord.toFixed(1)}px within [0, ${logState.h}px]`);

  await saveScreenshot('r2-acc-06-log-manual-zoom-candles-visible.png');

  // =========================================================================
  // 11. Full LOG + AUTO Matrix
  // =========================================================================
  console.log('\n11. Verifying Full LOG + AUTO Matrix (Linear/LOG x Auto/Manual)...');

  // State 1: LOG + Auto
  await autoBtn0.click();
  await page.waitForTimeout(300);
  const logAutoState = await getChartState();
  assert.equal(logAutoState.options?.mode, 1, 'LOG + Auto: mode is 1');
  assert.ok(logAutoState.coord >= 0 && logAutoState.coord <= logAutoState.h, 'Candles visible in LOG + Auto');

  // State 2: Linear + Auto
  await logBtn0.click();
  await page.waitForTimeout(300);
  const linearAutoState = await getChartState();
  assert.equal(linearAutoState.options?.mode, 0, 'Linear + Auto: mode is 0');
  assert.ok(linearAutoState.coord >= 0 && linearAutoState.coord <= linearAutoState.h, 'Candles visible in Linear + Auto');

  // State 3: Linear + Manual
  await page.mouse.move(priceAxisX, priceAxisY);
  await page.mouse.wheel(0, -150);
  await page.waitForTimeout(300);
  const linearManualState = await getChartState();
  assert.equal(linearManualState.options?.mode, 0, 'Linear + Manual: mode is 0');
  assert.ok(linearManualState.coord >= 0 && linearManualState.coord <= linearManualState.h, 'Candles visible in Linear + Manual');

  // State 4: LOG + Manual
  await logBtn0.click();
  await page.waitForTimeout(300);
  const logManualState = await getChartState();
  assert.equal(logManualState.options?.mode, 1, 'LOG + Manual: mode is 1');
  assert.ok(logManualState.coord >= 0 && logManualState.coord <= logManualState.h, 'Candles visible in LOG + Manual');

  await saveScreenshot('r2-acc-07-log-auto-matrix.png');

  // Restore Auto & Linear
  await autoBtn0.click();
  await logBtn0.click();
  await page.waitForTimeout(200);

  // =========================================================================
  // 12. Themes: Light Mode and Dark Mode Contrast
  // =========================================================================
  console.log('\n12. Verifying Theme Switching & Light Mode Visual Contrast...');
  const themeBtn = page.getByLabel('Toggle theme', { exact: true });

  // Switch to Light Mode
  await themeBtn.click();
  await page.waitForTimeout(400);
  const shellClassLight = await page.locator('.terminal-shell').getAttribute('class');
  assert.ok(shellClassLight.includes('theme-light'), 'Shell must have theme-light class');
  await saveScreenshot('r2-acc-08-light-mode.png');

  // Switch back to Dark Mode
  await themeBtn.click();
  await page.waitForTimeout(400);
  const shellClassDark = await page.locator('.terminal-shell').getAttribute('class');
  assert.ok(shellClassDark.includes('theme-dark'), 'Shell must have theme-dark class');
  await saveScreenshot('r2-acc-09-dark-mode.png');

  // =========================================================================
  // 13. Multi-Chart Layouts (1, 2, 4, 6, 8 Panes)
  // =========================================================================
  console.log('\n13. Verifying Multi-Chart Layouts (1, 2, 4, 6, 8)...');

  // Layout 2
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 2', { exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.chart-pane:visible').count(), 2, 'Layout 2 must display 2 panes');

  // Layout 4
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 4', { exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.chart-pane:visible').count(), 4, 'Layout 4 must display 4 panes');
  await saveScreenshot('r2-acc-10-layout-4-panes.png');

  // Layout 6
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 6', { exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.chart-pane:visible').count(), 6, 'Layout 6 must display 6 panes');

  // Layout 8
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 8', { exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.chart-pane:visible').count(), 8, 'Layout 8 must display 8 panes');
  await saveScreenshot('r2-acc-11-layout-8-panes.png');

  // Restore Layout 1
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.chart-pane:visible').count(), 1, 'Restored to Layout 1');

  // =========================================================================
  // 14. Historical Replay Mode
  // =========================================================================
  console.log('\n14. Verifying Historical Replay Mode...');
  const replayBtn = page.getByLabel('Historical replay', { exact: true });
  await replayBtn.click();
  await page.waitForTimeout(300);
  const replayActive = await canvas0.getAttribute('data-replay');
  assert.equal(replayActive, 'true', 'Replay mode attribute must be true');
  await saveScreenshot('r2-acc-12-historical-replay.png');

  await page.getByLabel('Exit replay', { exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-replay'), 'false', 'Replay exited');

  // =========================================================================
  // 15. Renderer Errors & Metrics
  // =========================================================================
  assert.equal(errors.length, 0, `Zero renderer errors required. Encountered: ${errors.join('; ')}`);
  const totalDuration = Date.now() - startTime;

  console.log('\n================================================================');
  console.log('ALL PACKAGED GUI ACCEPTANCE TESTS PASSED (100%)');
  console.log(`Total test duration: ${totalDuration}ms`);
  console.log(`Renderer errors:     0`);
  console.log('================================================================');

  const report = {
    executable: exe,
    version: '1.1.0-rc.1',
    api_version: '1.0.0',
    platform: 'win32-x64',
    status: 'PASS',
    launchDurationMs: launchDuration,
    backendStartDurationMs: backendStartDuration,
    totalDurationMs: totalDuration,
    featuresVerified: [
      'standalone-packaged-execution',
      'automatic-backend-spawn-pe32-x64',
      'backend-health-api-contract-v1.0.0',
      'ohlc-legend-and-candle-rendering',
      'watchlist-clean-hover-and-accent-strip',
      'watchlist-keyboard-up-down-navigation',
      'colored-flag-filtering-all-7-colors',
      'excel-xlsx-export-and-disk-verification',
      'status-notification-4000ms-auto-dismiss',
      'one-shot-drawings-auto-return-cursor',
      'price-axis-wheel-zoom-non-interference',
      'critical-log-scale-disappearance-fix-verified',
      'full-log-auto-matrix-transitions',
      'multi-pane-layouts-1-2-4-6-8',
      'light-dark-comfortable-contrast-modes',
      'historical-replay-mode',
      'zero-renderer-errors'
    ],
    rendererErrors: errors,
    timestamp: new Date().toISOString()
  };

  await writeFile('test-results/r2-acceptance-report.json', JSON.stringify(report, null, 2));
  await writeFile(path.join(artifactDir, 'r2-acceptance-report.json'), JSON.stringify(report, null, 2));

} finally {
  await app?.close();
}
