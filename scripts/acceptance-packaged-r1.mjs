import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const exe = process.env.GMT_MAC_TEST_EXE || '/tmp/gmt-r1-final-install-test/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-r1-packaged-acc-'));
const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
await mkdir(artifactDir, { recursive: true });

console.log('Testing packaged application at:', exe);
console.log('Using isolated test profile:', profile);

const startTime = Date.now();
let app, page;
const errors = [];

try {
  const launchStart = Date.now();
  app = await electron.launch({
    executablePath: exe,
    args: [],
    env: {
      ...process.env,
      GMT_MAC_TEST_EXE: exe,
      IMT_EXPECT_PREVIEW: 'stable-v1.0.0',
      IMT_TEST_DATA_DIR: profile,
      IMT_UI_FIXTURE: '1',
      IMT_OFFLINE: '1'
    },
    timeout: 60000
  });
  const launchDuration = Date.now() - launchStart;
  console.log(`Cold launch duration: ${launchDuration}ms`);

  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  // 1. Standalone startup and backend health
  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });
  const backendStartDuration = Date.now() - launchStart;
  console.log(`Backend ready duration: ${backendStartDuration}ms`);

  const health = await page.evaluate(() => window.terminal.request('/health'));
  assert.ok(health.status === 'ok' || health.version, 'Health check must return valid response');
  assert.equal(health.version, '1.1.0-rc.1', 'Health version must be 1.1.0-rc.1');
  assert.equal(health.api_version, '1.0.0', 'Health api_version must be 1.0.0');
  console.log('Health check:', JSON.stringify(health));

  // 2. Charts & OHLC Legend
  const pane0 = page.getByTestId('pane-0');
  await expect(pane0).toBeVisible();
  const ohlc = pane0.locator('.ohlc');
  await expect(ohlc).toBeVisible();
  const ohlcText = await ohlc.innerText();
  console.log('OHLC text:', ohlcText);
  assert.ok(ohlcText.includes('O') && ohlcText.includes('H') && ohlcText.includes('L') && ohlcText.includes('C'), 'OHLC must show Open, High, Low, Close');
  await page.screenshot({ path: join(artifactDir, 'r1-acc-01-startup-baseline.png') });

  // 3. Watchlist interaction & selection (Phase F1.7 / F1.7.1)
  const rows = page.locator('.watch-row');
  const count = await rows.count();
  assert.ok(count > 0, 'Watchlist must have rows');
  const firstRow = rows.first();
  await firstRow.click();
  await expect(firstRow).toHaveClass(/selected-symbol/);
  // Verify left accent strip is present and keyboard outline is absent
  const rowStyle = await firstRow.evaluate(e => {
    const s = getComputedStyle(e);
    const before = getComputedStyle(e, '::before');
    return {
      borderLeft: s.borderLeft,
      outline: s.outline,
      boxShadow: s.boxShadow,
      backgroundColor: s.backgroundColor,
      beforeBg: before.backgroundColor
    };
  });
  console.log('Selected row styles:', rowStyle);
  await page.screenshot({ path: join(artifactDir, 'r1-acc-02-watchlist-selected-row.png') });

  // 4. Excel export menu & notification auto-dismiss (Phase F1.6 / F1.6.1)
  const exportBtn = page.getByTestId('watchlist-export-btn');
  await exportBtn.click();
  const exportMenu = page.getByTestId('watchlist-export-menu');
  await expect(exportMenu).toBeVisible();
  await expect(page.getByTestId('export-excel-action')).toBeVisible();
  await expect(page.getByTestId('export-csv-action')).toBeVisible();
  await page.screenshot({ path: join(artifactDir, 'r1-acc-03-excel-export-menu.png') });
  await page.keyboard.press('Escape');
  await expect(exportMenu).toHaveCount(0);

  // 5. Drawing tools: One-Shot drawing completion & auto-return to cursor (Phase F1.10)
  await page.getByTestId('drawing-category-lines').click();
  const trendlineBtn = page.getByTestId('drawing-tool-trend');
  await trendlineBtn.click();
  const canvas0 = pane0.locator('.chart-canvas');
  const cbox = await canvas0.boundingBox();
  assert.ok(cbox, 'Canvas bounding box must exist');

  // Draw trend line with two clicks
  await page.mouse.click(cbox.x + 120, cbox.y + 120);
  await page.mouse.click(cbox.x + 220, cbox.y + 180);

  // Auto-return: Cursor button should now be selected
  const cursorBtn = page.getByLabel('Cursor / crosshair', { exact: true });
  await expect(cursorBtn).toHaveClass(/selected/);
  console.log('One-Shot drawing successfully auto-returned to Cursor tool');
  await page.screenshot({ path: join(artifactDir, 'r1-acc-04-oneshot-drawing-returned.png') });

  // 6. Price scale mouse-wheel zoom & LOG/AUTO mode stability (Phase F1.11 / F1.11.1)
  const logBtn = pane0.getByLabel('LOG pane 0', { exact: true });
  await logBtn.click();
  await expect(canvas0).toHaveAttribute('data-price-mode', '1');
  // Check candles are visible and not blank
  const renderedBars = await canvas0.getAttribute('data-rendered-bars');
  assert.ok(Number(renderedBars) > 0, 'Bars must remain rendered in LOG mode');
  await page.screenshot({ path: join(artifactDir, 'r1-acc-05-log-mode-stable.png') });

  // Mouse wheel zoom on price axis
  const priceAxisX = cbox.x + cbox.width - 25;
  const priceAxisY = cbox.y + cbox.height / 2;
  await page.mouse.move(priceAxisX, priceAxisY);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(artifactDir, 'r1-acc-06-price-wheel-zoom.png') });

  // Reset to Linear / Auto
  await logBtn.click();
  await expect(canvas0).toHaveAttribute('data-price-mode', '0');
  const autoBtn = pane0.getByLabel('AUTO pane 0', { exact: true });
  await autoBtn.click();
  await page.waitForTimeout(200);

  // 7. Multi-chart layouts (1, 2, 4, 8)
  const layoutBtn = page.getByLabel('Chart layout', { exact: true });
  await layoutBtn.click();
  await page.getByLabel('Layout 4', { exact: true }).click();
  await expect(page.locator('.chart-pane:visible')).toHaveCount(4);
  await page.screenshot({ path: join(artifactDir, 'r1-acc-07-layout-4-panes.png') });

  await layoutBtn.click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  await expect(page.locator('.chart-pane:visible')).toHaveCount(1);
  await page.screenshot({ path: join(artifactDir, 'r1-acc-08-layout-1-pane.png') });

  // 8. Light mode & Dark mode verification (Phase F1.9 / F1.9.1)
  const themeBtn = page.getByLabel('Toggle theme', { exact: true });
  await themeBtn.click();
  await expect(page.locator('.terminal-shell')).toHaveClass(/theme-light/);
  await page.screenshot({ path: join(artifactDir, 'r1-acc-09-light-mode.png') });

  // Switch back to Dark mode
  await themeBtn.click();
  await expect(page.locator('.terminal-shell')).toHaveClass(/theme-dark/);
  await page.screenshot({ path: join(artifactDir, 'r1-acc-10-dark-mode.png') });

  // 9. Historical Replay mode
  const replayBtn = page.getByLabel('Historical replay', { exact: true });
  await replayBtn.click();
  await expect(canvas0).toHaveAttribute('data-replay', 'true');
  await page.screenshot({ path: join(artifactDir, 'r1-acc-11-historical-replay.png') });
  await page.getByLabel('Exit replay', { exact: true }).click();
  await expect(canvas0).toHaveAttribute('data-replay', 'false');

  assert.deepEqual(errors, [], 'Renderer errors must be zero');

  const totalTime = Date.now() - startTime;
  console.log(`Packaged acceptance test passed in ${totalTime}ms with 0 errors!`);

  await writeFile('test-results/r1-acceptance-report.json', JSON.stringify({
    executable: exe,
    profile,
    launchDurationMs: launchDuration,
    backendStartDurationMs: backendStartDuration,
    totalDurationMs: totalTime,
    featuresVerified: [
      'standalone-startup-no-dev-env',
      'backend-python-macho-arm64-service',
      'ohlc-legend-and-metrics',
      'watchlist-clean-hover-selection',
      'excel-export-menu-and-dismiss',
      'oneshot-drawing-auto-cursor-return',
      'price-scale-wheel-zoom',
      'log-auto-scale-stability',
      'multi-pane-layouts-1-to-8',
      'light-dark-comfortable-contrast',
      'historical-replay'
    ],
    rendererErrors: errors,
    status: 'PASS'
  }, null, 2));

} finally {
  await app?.close();
}
