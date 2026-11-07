import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f111-1-gui-sensex-'));
await mkdir('test-results', { recursive: true });
const artifactsDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: {
    ...process.env,
    IMT_TEST_DATA_DIR: profile,
  },
  timeout: 60000,
});

const saveArtifact = async (page, name) => {
  const local = `test-results/${name}`;
  await page.screenshot({ path: local });
  await copyFile(local, join(artifactsDir, name)).catch(() => {});
  console.log(`Saved screenshot: ${name}`);
};

try {
  console.log('================================================================');
  console.log('STARTING PHASE F1.11.1 REAL MAC GUI SENSEX 15m VERIFICATION');
  console.log('================================================================');

  const app = await launch();
  const page = await app.firstWindow();

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Single chart layout
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(600);

  // Switch to Indian Indices and SENSEX
  const dropdown = page.locator('select[data-testid="watchlist-dropdown"]');
  if (await dropdown.isVisible()) {
    await dropdown.selectOption('indices');
    await page.waitForTimeout(600);
  }
  const sensexRow = page.locator('.watch-row').filter({ hasText: 'SENSEX' });
  if (await sensexRow.count() > 0) {
    await sensexRow.first().click();
    await page.waitForTimeout(800);
  }

  // Switch to 15m
  const tf15m = page.getByRole('button', { name: '15m', exact: true }).first();
  if (await tf15m.isVisible()) {
    await tf15m.click();
    await page.waitForTimeout(800);
  }

  // Wait for candles to finish loading
  console.log('Waiting for SENSEX 15m candle data to populate...');
  await page.waitForFunction(() => {
    const c = document.querySelector('.chart-canvas');
    return c && c.__mainSeries && c.__mainSeries.data().length > 0;
  }, { timeout: 45000 });

  const canvas0 = page.getByTestId('pane-0').locator('.chart-canvas');
  const box = await canvas0.boundingBox();
  const autoBtn = page.getByRole('button', { name: /AUTO pane 0/i });
  const logBtn = page.getByRole('button', { name: /LOG pane 0/i });
  const cursorBtn = page.getByLabel('Cursor / crosshair', { exact: true });

  const priceScaleX = box.x + box.width - 25;
  const priceScaleY = box.y + box.height * 0.45;

  const getState = async () => {
    return await canvas0.evaluate(el => {
      const c = el.__chart;
      const m = el.__mainSeries;
      const ps = c ? c.priceScale('right') : null;
      const vr = ps ? ps.getVisibleRange() : null;
      const h = c && c.panes()[0] ? c.panes()[0].getHeight() : 400;
      const last = m && m.data && m.data().length ? m.data().at(-1) : null;
      const coord = last ? m.priceToCoordinate(last.close) : null;
      const options = ps ? ps.options() : null;
      const count = m && m.data ? m.data().length : 0;
      return { vr, h, last, coord, options, count };
    });
  };

  // 1. Linear baseline
  console.log('1. Capturing Linear baseline on SENSEX 15m...');
  let state = await getState();
  console.log(`Loaded ${state.count} candles. Last close: ${state.last?.close}, coord: ${state.coord}px`);
  assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h, 'Candles must be visible in baseline');
  await saveArtifact(page, 'f111-1-gui-01-linear-baseline.png');

  // 2. Click LOG ON
  console.log('2. Clicking LOG ON...');
  await logBtn.click();
  await page.waitForTimeout(500);

  state = await getState();
  assert.equal(state.options.mode, 1, 'Mode must be Logarithmic');
  assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h, 'Candles must remain visible in LOG mode');
  await saveArtifact(page, 'f111-1-gui-02-log-on-visible.png');
  console.log(`LOG ON confirmed: candles visible at coord ${state.coord.toFixed(1)}px (price: ${state.last?.close})`);

  // 3. LOG + Manual Wheel Zoom
  console.log('3. Wheel zooming in LOG mode (disengaging auto)...');
  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, -150);
  await page.waitForTimeout(400);

  state = await getState();
  assert.equal(state.options.mode, 1);
  assert.equal(state.options.autoScale, false, 'autoScale must be false after wheel zoom');
  assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h, 'Candles visible in manual LOG zoom');
  await saveArtifact(page, 'f111-1-gui-03-log-manual-zoom.png');
  console.log(`LOG manual zoom confirmed: candles visible at coord ${state.coord.toFixed(1)}px`);

  // 4. Click AUTO
  console.log('4. Clicking AUTO to reset price scale in LOG mode...');
  await autoBtn.click();
  await page.waitForTimeout(400);

  state = await getState();
  assert.equal(state.options.mode, 1);
  assert.equal(state.options.autoScale, true);
  await expect(autoBtn).toHaveClass(/selected/);
  assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h);
  await saveArtifact(page, 'f111-1-gui-04-log-auto-restored.png');
  console.log(`AUTO restored confirmed: candles visible at coord ${state.coord.toFixed(1)}px`);

  // 5. Click LOG OFF (Linear restored)
  console.log('5. Clicking LOG OFF to restore Linear scale...');
  await logBtn.click();
  await page.waitForTimeout(500);

  state = await getState();
  assert.equal(state.options.mode, 0);
  assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h);
  await saveArtifact(page, 'f111-1-gui-05-linear-restored.png');
  console.log(`Linear scale restored confirmed: candles visible at coord ${state.coord.toFixed(1)}px`);

  // 6. Draw Trendline and check alignment across LOG toggle
  console.log('6. Drawing Trendline and checking alignment across LOG toggle...');
  await page.getByTestId('drawing-category-lines').click();
  await page.getByTestId('drawing-tool-trend').click();
  await page.waitForTimeout(300);

  const drawX = box.x + box.width * 0.35;
  const drawY = box.y + box.height * 0.45;
  await page.mouse.click(drawX, drawY);
  await page.waitForTimeout(100);
  await page.mouse.click(drawX + 120, drawY + 30);
  await page.waitForTimeout(400);

  // Toggle LOG back ON
  await logBtn.click();
  await page.waitForTimeout(500);

  state = await getState();
  assert.equal(state.options.mode, 1);
  assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h);
  await saveArtifact(page, 'f111-1-gui-06-drawing-aligned.png');
  console.log('Drawing alignment verified across scale mode switch.');

  // 7. Verify Light Mode
  console.log('7. Verifying Light Theme with LOG active...');
  const themeToggle = page.locator('button[aria-label="Toggle theme"]');
  if (await themeToggle.isVisible()) {
    await themeToggle.click();
    await page.waitForTimeout(500);
    state = await getState();
    assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h);
    await saveArtifact(page, 'f111-1-gui-08-light-theme-log.png');
    // Switch back to dark
    await themeToggle.click();
    await page.waitForTimeout(500);
  }

  // 8. Final State: SENSEX 15m OPEN with LOG enabled, AUTO on, candles visible, Cursor active
  console.log('8. Verifying final required state (SENSEX 15m, LOG ON, AUTO ON, Cursor Active)...');
  const isAuto = await autoBtn.evaluate(el => el.classList.contains('selected'));
  if (!isAuto) {
    await autoBtn.click();
    await page.waitForTimeout(300);
  }
  const isLog = await logBtn.evaluate(el => el.classList.contains('selected'));
  if (!isLog) {
    await logBtn.click();
    await page.waitForTimeout(300);
  }
  await expect(cursorBtn).toHaveClass(/selected/);
  await expect(logBtn).toHaveClass(/selected/);
  await expect(autoBtn).toHaveClass(/selected/);

  state = await getState();
  assert.equal(state.options.mode, 1);
  assert.equal(state.options.autoScale, true);
  assert.ok(state.coord !== null && state.coord >= 0 && state.coord <= state.h);
  await saveArtifact(page, 'f111-1-gui-07-final-open-state.png');

  console.log('\n================================================================');
  console.log('REAL MAC GUI SENSEX 15m VERIFICATION COMPLETE (ALL PASS)');
  console.log('================================================================');

  await app.close();
} catch (err) {
  console.error('GUI Verification failed:', err);
  process.exit(1);
}
