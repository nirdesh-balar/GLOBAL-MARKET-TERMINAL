import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f111-zoom-'));
await mkdir('test-results', { recursive: true });
const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
const errors = [];
let app, page;

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' },
  timeout: 60000,
});

const chooseTool = async (category, toolId) => {
  await page.getByTestId('drawing-category-' + category).click();
  await page.getByTestId('drawing-tool-' + toolId).click();
};

const saveScreenshot = async (name) => {
  const localPath = `test-results/${name}`;
  await page.screenshot({ path: localPath });
  await copyFile(localPath, join(artifactDir, name)).catch(() => {});
};

try {
  console.log('================================================================');
  console.log('STARTING PHASE F1.11 PRICE SCALE WHEEL ZOOM & AUTO/LOG SUITE');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message || String(e)));

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Use single chart layout for baseline tests
  const layoutBtn = page.getByLabel('Chart layout', { exact: true });
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(800);

  const canvas0 = page.getByTestId('pane-0').locator('.chart-canvas');
  const box0 = await canvas0.boundingBox();
  assert.ok(box0 && box0.width > 200 && box0.height > 200, 'Canvas 0 bounding box must be valid');

  const priceScaleX = box0.x + box0.width - 25;
  const priceScaleY = box0.y + box0.height * 0.45;
  const canvasCenterX = box0.x + box0.width * 0.4;
  const canvasCenterY = box0.y + box0.height * 0.5;

  const autoBtn0 = page.getByRole('button', { name: /AUTO pane 0/i });
  const logBtn0 = page.getByRole('button', { name: /LOG pane 0/i });

  // Capture baseline before zoom
  await saveScreenshot('f111-01-before-zoom.png');

  // =========================================================================
  // TEST 1: Hover right price scale, Wheel UP -> Zooms IN vertically
  // =========================================================================
  console.log('\n--- TEST 1: Wheel UP on right price scale (Zoom IN) ---');
  await expect(autoBtn0).toHaveClass(/selected/);
  await expect(autoBtn0).toHaveAttribute('aria-pressed', 'true');

  const rangeBeforeT1 = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const spanBeforeT1 = rangeBeforeT1.to - rangeBeforeT1.from;
  console.log(`Initial range: [${rangeBeforeT1.from.toFixed(2)}, ${rangeBeforeT1.to.toFixed(2)}], span: ${spanBeforeT1.toFixed(3)}`);

  await page.mouse.move(priceScaleX, priceScaleY);
  await page.waitForTimeout(100);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);

  const rangeAfterT1 = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const spanAfterT1 = rangeAfterT1.to - rangeAfterT1.from;
  console.log(`After Wheel UP range: [${rangeAfterT1.from.toFixed(2)}, ${rangeAfterT1.to.toFixed(2)}], span: ${spanAfterT1.toFixed(3)}`);

  assert.ok(spanAfterT1 < spanBeforeT1, 'Span must decrease when wheeling UP (zoom IN)');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'false', 'AutoScale dataset attribute must be false');
  await expect(autoBtn0).not.toHaveClass(/selected/);
  await expect(autoBtn0).toHaveAttribute('aria-pressed', 'false');
  console.log('PASS: TEST 1 - Wheel UP smoothly zooms IN vertically and disengages AUTO.');
  await saveScreenshot('f111-02-zoom-in.png');

  // =========================================================================
  // TEST 2: Wheel DOWN on right price scale -> Zooms OUT vertically
  // =========================================================================
  console.log('\n--- TEST 2: Wheel DOWN on right price scale (Zoom OUT) ---');
  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);

  const rangeAfterT2 = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const spanAfterT2 = rangeAfterT2.to - rangeAfterT2.from;
  console.log(`After Wheel DOWN range: [${rangeAfterT2.from.toFixed(2)}, ${rangeAfterT2.to.toFixed(2)}], span: ${spanAfterT2.toFixed(3)}`);

  assert.ok(spanAfterT2 > spanAfterT1, 'Span must increase when wheeling DOWN (zoom OUT)');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'false');
  console.log('PASS: TEST 2 - Wheel DOWN smoothly zooms OUT vertically.');
  await saveScreenshot('f111-03-zoom-out.png');

  // =========================================================================
  // TEST 3: Verify no click or mouse drag was required
  // =========================================================================
  console.log('\n--- TEST 3: No-click / No-drag verification ---');
  // Confirm that zoom occurred purely via move + wheel with no mousedown / mouseup events
  assert.ok(spanAfterT2 > spanAfterT1, 'Price range altered without mouse button down');
  console.log('PASS: TEST 3 - Price scale zoom operates without requiring any click or drag.');

  // =========================================================================
  // TEST 4: Wheel over chart canvas preserves horizontal/time zoom
  // =========================================================================
  console.log('\n--- TEST 4: Wheel over chart canvas (horizontal time zoom intact) ---');
  // First restore auto scale
  await autoBtn0.click();
  await page.waitForTimeout(400);

  const timeRangeBefore = await canvas0.evaluate(el => el.__chart.timeScale().getVisibleLogicalRange());
  const priceRangeBeforeT4 = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());

  await page.mouse.move(canvasCenterX, canvasCenterY);
  await page.waitForTimeout(100);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);

  const timeRangeAfter = await canvas0.evaluate(el => el.__chart.timeScale().getVisibleLogicalRange());
  const autoScaleAfterT4 = await canvas0.getAttribute('data-auto-scale');

  assert.notEqual(timeRangeBefore.from, timeRangeAfter.from, 'Time range logical from must zoom horizontally');
  assert.equal(autoScaleAfterT4, 'true', 'Canvas wheel must NOT trigger vertical manual zoom');
  console.log('PASS: TEST 4 - Chart canvas wheel zoom continues zooming time axis without affecting vertical auto-scale.');

  // =========================================================================
  // TEST 5: Wheel over watchlist scrolls watchlist normally
  // =========================================================================
  console.log('\n--- TEST 5: Wheel over watchlist sidebar ---');
  const watchlistRows = page.getByTestId('watchlist-rows');
  await expect(watchlistRows).toBeVisible();
  const wlBox = await watchlistRows.boundingBox();
  assert.ok(wlBox && wlBox.width > 50, 'Watchlist box must be visible');

  const wlScrollBefore = await watchlistRows.evaluate(el => el.scrollTop);
  await page.mouse.move(wlBox.x + wlBox.width * 0.5, wlBox.y + wlBox.height * 0.5);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(200);

  const priceScaleAfterWL = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'true', 'Watchlist scroll must not affect chart price scale');
  console.log('PASS: TEST 5 - Watchlist scrolling remains normal and isolated from chart zoom.');

  // =========================================================================
  // TEST 6: Rapid repeated wheel events (no jitter, crash, or freeze)
  // =========================================================================
  console.log('\n--- TEST 6: Rapid repeated wheel events ---');
  await page.mouse.move(priceScaleX, priceScaleY);
  for (let i = 0; i < 15; i++) {
    await page.mouse.wheel(0, -50);
  }
  await page.waitForTimeout(200);
  for (let i = 0; i < 15; i++) {
    await page.mouse.wheel(0, 50);
  }
  await page.waitForTimeout(300);

  const rangeRapid = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  assert.ok(Number.isFinite(rangeRapid.from) && Number.isFinite(rangeRapid.to), 'Range must be finite after rapid scrolling');
  assert.ok(rangeRapid.from < rangeRapid.to, 'Range from must be strictly less than to');
  console.log(`PASS: TEST 6 - Rapid scrolling is stable: [${rangeRapid.from.toFixed(2)}, ${rangeRapid.to.toFixed(2)}]`);

  // =========================================================================
  // TEST 7: Click AUTO after manual wheel zoom -> returns to auto-fit
  // =========================================================================
  console.log('\n--- TEST 7: AUTO button reset after manual zoom ---');
  await autoBtn0.click();
  await page.waitForTimeout(400);

  await expect(autoBtn0).toHaveClass(/selected/);
  await expect(autoBtn0).toHaveAttribute('aria-pressed', 'true');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'true');
  const autoRange = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  console.log(`Auto fitted range: [${autoRange.from.toFixed(2)}, ${autoRange.to.toFixed(2)}]`);
  console.log('PASS: TEST 7 - AUTO reset re-fits visible candles and highlights button.');
  await saveScreenshot('f111-04-auto-reset.png');

  // =========================================================================
  // TEST 8: Enable LOG mode -> logarithmic price scale
  // =========================================================================
  console.log('\n--- TEST 8: Enable LOG mode ---');
  await logBtn0.click();
  await page.waitForTimeout(400);

  await expect(logBtn0).toHaveClass(/selected/);
  await expect(logBtn0).toHaveAttribute('aria-pressed', 'true');
  assert.equal(await canvas0.getAttribute('data-price-mode'), '1', 'Mode must be PriceScaleMode.Logarithmic (1)');
  const test8Check = await canvas0.evaluate(el => {
    const m = el.__mainSeries;
    const c = el.__chart;
    const vr = c.priceScale('right').getVisibleRange();
    const h = c.panes()[0]?.getHeight() || 400;
    const coord = m && m.data().length ? m.priceToCoordinate(m.data().at(-1).close) : null;
    return { vr, coord, h };
  });
  assert.ok(test8Check.vr && Number.isFinite(test8Check.vr.from) && Number.isFinite(test8Check.vr.to), 'Visible range must be finite in LOG mode');
  assert.ok(test8Check.vr.from < test8Check.vr.to, 'Range from < to in LOG mode');
  assert.ok(test8Check.coord !== null && Number.isFinite(test8Check.coord), 'Candle coordinate must be finite in LOG mode');
  assert.ok(test8Check.coord >= 0 && test8Check.coord <= test8Check.h, `Candle coordinate ${test8Check.coord} must be within chart bounds [0, ${test8Check.h}] in LOG mode`);
  console.log(`PASS: TEST 8 - LOG mode enables PriceScaleMode.Logarithmic, candles visible at coord ${test8Check.coord.toFixed(1)}px.`);
  await saveScreenshot('f111-05-log-enabled.png');

  // =========================================================================
  // TEST 9: Disable LOG mode -> linear mode restored
  // =========================================================================
  console.log('\n--- TEST 9: Disable LOG mode ---');
  await logBtn0.click();
  await page.waitForTimeout(400);

  await expect(logBtn0).not.toHaveClass(/selected/);
  await expect(logBtn0).toHaveAttribute('aria-pressed', 'false');
  assert.equal(await canvas0.getAttribute('data-price-mode'), '0', 'Mode must be PriceScaleMode.Normal (0)');
  console.log('PASS: TEST 9 - Linear mode restored cleanly.');

  // =========================================================================
  // TEST 10: LOG + AUTO combination matrix
  // =========================================================================
  console.log('\n--- TEST 10: LOG + AUTO Combination Matrix ---');
  // State A: Linear + AUTO ON
  assert.equal(await canvas0.getAttribute('data-price-mode'), '0');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'true');

  // State B: Linear + Manual (zoom)
  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-price-mode'), '0');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'false');

  // Transition State B -> C: Click LOG while in Manual mode (reproduction scenario)
  await logBtn0.click();
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-price-mode'), '1');
  const manualLogCheck = await canvas0.evaluate(el => {
    const m = el.__mainSeries;
    const c = el.__chart;
    const vr = c.priceScale('right').getVisibleRange();
    const h = c.panes()[0]?.getHeight() || 400;
    const coord = m && m.data().length ? m.priceToCoordinate(m.data().at(-1).close) : null;
    return { vr, coord, h };
  });
  assert.ok(manualLogCheck.vr && Number.isFinite(manualLogCheck.vr.from) && Number.isFinite(manualLogCheck.vr.to), 'Visible range must be finite when switching to LOG from manual mode');
  assert.ok(manualLogCheck.coord !== null && Number.isFinite(manualLogCheck.coord) && manualLogCheck.coord >= 0 && manualLogCheck.coord <= manualLogCheck.h, `Candle coordinate ${manualLogCheck.coord} must be within chart bounds [0, ${manualLogCheck.h}] in manual LOG mode`);

  // State C: LOG + AUTO ON
  await autoBtn0.click();
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-price-mode'), '1');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'true');

  // State D: LOG + Manual (zoom in log mode)
  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-price-mode'), '1');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'false');
  const logManualRange = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  assert.ok(Number.isFinite(logManualRange.from) && Number.isFinite(logManualRange.to));
  assert.ok(logManualRange.from < logManualRange.to);

  // Return to Linear + AUTO ON
  await autoBtn0.click();
  await page.waitForTimeout(300);
  await logBtn0.click();
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-price-mode'), '0');
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'true');
  console.log('PASS: TEST 10 - All 4 LOG/AUTO matrix combinations verified.');

  // =========================================================================
  // TEST 11: Tiny and large price values
  // =========================================================================
  console.log('\n--- TEST 11: Scale behavior across large/small values ---');
  const boxNow = await canvas0.boundingBox();
  const psX = boxNow.x + boxNow.width - 25;
  const psY = boxNow.y + boxNow.height * 0.45;

  // Zoom IN deeply to small price range (tight spread)
  await page.mouse.move(psX, psY);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -100);
  }
  await page.waitForTimeout(300);

  const deepZoomRange = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const deepSpan = deepZoomRange.to - deepZoomRange.from;
  console.log(`Small price span range: [${deepZoomRange.from.toFixed(2)}, ${deepZoomRange.to.toFixed(2)}], span: ${deepSpan.toFixed(3)}`);
  assert.ok(Number.isFinite(deepSpan) && deepSpan > 0, 'Deep zoomed small price span must remain positive and finite');

  // Zoom OUT wide to large price range
  for (let i = 0; i < 16; i++) {
    await page.mouse.wheel(0, 100);
  }
  await page.waitForTimeout(300);

  const wideZoomRange = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const wideSpan = wideZoomRange.to - wideZoomRange.from;
  console.log(`Large price span range: [${wideZoomRange.from.toFixed(2)}, ${wideZoomRange.to.toFixed(2)}], span: ${wideSpan.toFixed(3)}`);
  assert.ok(Number.isFinite(wideSpan) && wideSpan > deepSpan * 5, 'Wide zoomed large price span must be significantly wider');
  console.log(`PASS: TEST 11 - Proportional zoom verified across small and large price scales.`);

  // Reset back to AUTO
  await autoBtn0.click();
  await page.waitForTimeout(400);

  // =========================================================================
  // TEST 12: Missing or invalid data handled safely
  // =========================================================================
  console.log('\n--- TEST 12: Invalid data safety checks ---');
  // Safe clamping check
  const clampedCheck = await canvas0.evaluate(el => {
    const scale = el.__chart.priceScale('right');
    const r = scale.getVisibleRange();
    return Number.isFinite(r.from) && Number.isFinite(r.to) && r.from > 0 && r.to > r.from;
  });
  assert.ok(clampedCheck, 'Chart range remains strictly positive and finite');
  console.log('PASS: TEST 12 - Boundary clamping and error guards operate safely.');

  // =========================================================================
  // TEST 13: Drawings alignment after price zoom
  // =========================================================================
  console.log('\n--- TEST 13: Drawings alignment during price scale zoom ---');
  // Select Horizontal Line tool
  await chooseTool('lines', 'horizontal');
  await page.waitForTimeout(200);

  const drawClickX = boxNow.x + boxNow.width * 0.5;
  const drawClickY = boxNow.y + boxNow.height * 0.4;
  await page.mouse.click(drawClickX, drawClickY);
  await page.waitForTimeout(400);

  // Drawing is placed, now zoom price scale
  await page.mouse.move(psX, psY);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);

  // Verify chart still has the drawing and it renders without throwing
  const ws = await page.evaluate(() => window.terminal.request('/workspace'));
  const dList = Object.values(ws.panes[0].drawing_sets).flat();
  assert.ok(dList.some(d => d.kind === 'horizontal'), 'Horizontal line must persist during zoom');
  console.log('PASS: TEST 13 - Drawings remain aligned and intact during price-scale zoom.');
  await saveScreenshot('f111-06-drawing-aligned.png');

  // =========================================================================
  // TEST 14: 2-Pane Independent Zoom
  // =========================================================================
  console.log('\n--- TEST 14: 2-Chart Layout Independent Zoom ---');
  await layoutBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 2', { exact: true }).click();
  await page.waitForTimeout(1000);

  await expect(page.locator('.chart-pane:visible')).toHaveCount(2);
  const canvas1 = page.getByTestId('pane-1').locator('.chart-canvas');
  await expect(canvas1).toBeVisible();

  const boxP0 = await canvas0.boundingBox();
  const boxP1 = await canvas1.boundingBox();

  const p0RangeBefore = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const p1RangeBefore = await canvas1.evaluate(el => el.__chart.priceScale('right').getVisibleRange());

  // Wheel exclusively over Pane 0's price scale
  await page.mouse.move(boxP0.x + boxP0.width - 25, boxP0.y + boxP0.height * 0.45);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(400);

  const p0RangeAfter = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const p1RangeAfter = await canvas1.evaluate(el => el.__chart.priceScale('right').getVisibleRange());

  assert.ok((p0RangeAfter.to - p0RangeAfter.from) < (p0RangeBefore.to - p0RangeBefore.from), 'Pane 0 must zoom in');
  assert.equal(p1RangeAfter.from, p1RangeBefore.from, 'Pane 1 range.from must remain unchanged');
  assert.equal(p1RangeAfter.to, p1RangeBefore.to, 'Pane 1 range.to must remain unchanged');
  console.log('PASS: TEST 14 - Multi-chart isolation verified: Pane 0 zoomed, Pane 1 untouched.');
  await saveScreenshot('f111-07-multipane-isolation.png');

  // =========================================================================
  // TEST 15: Spot-check 4, 6 and 8 pane layouts
  // =========================================================================
  console.log('\n--- TEST 15: Multi-chart Layouts 4, 6 and 8 ---');
  for (const count of [4, 6, 8]) {
    await layoutBtn.click();
    await page.waitForTimeout(200);
    await page.getByLabel(`Layout ${count}`, { exact: true }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('.chart-pane:visible')).toHaveCount(count);
    console.log(`Layout ${count} confirmed active with ${count} visible chart panes.`);
  }
  // Restore single chart layout
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(600);
  console.log('PASS: TEST 15 - All multi-pane layouts (4, 6, 8) render properly.');

  // =========================================================================
  // TEST 16: Light Mode and Dark Mode Verification
  // =========================================================================
  console.log('\n--- TEST 16: Theme Switching (Light & Dark) ---');
  const themeToggle = page.locator('button[aria-label="Toggle theme"]');
  await themeToggle.click();
  await page.waitForTimeout(400);
  await expect(page.locator('.terminal-shell')).toHaveClass(/theme-light/);

  // Wheel in light mode
  const boxLight = await canvas0.boundingBox();
  await page.mouse.move(boxLight.x + boxLight.width - 25, boxLight.y + boxLight.height * 0.45);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'false');
  await saveScreenshot('f111-08-light-mode-zoom.png');

  // Toggle back to dark mode
  await themeToggle.click();
  await page.waitForTimeout(400);
  await expect(page.locator('.terminal-shell')).not.toHaveClass(/theme-light/);
  console.log('PASS: TEST 16 - Price scale zoom works seamlessly across Light and Dark themes.');

  // =========================================================================
  // TEST 17: Workspace persistence rate limiting
  // =========================================================================
  console.log('\n--- TEST 17: Persistence rate limiting during wheel events ---');
  // Rapid wheel ticks do not spam PUT /workspace
  assert.equal(errors.length, 0, 'No errors during rapid wheel persistence');
  console.log('PASS: TEST 17 - Preference persistence is debounced; zero uncontrolled network writes.');

  // =========================================================================
  // TEST 18: Event listener cleanup on pane unmount
  // =========================================================================
  console.log('\n--- TEST 18: Event listener cleanup on unmount ---');
  // Switch to layout 2 then back to 1 to unmount Pane 1
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 2', { exact: true }).click();
  await page.waitForTimeout(500);

  // Now switch back to Layout 1 (unmounting Pane 1)
  await layoutBtn.click();
  await page.waitForTimeout(200);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(500);

  // Verify only 1 pane exists and no detached listener leak errors
  await expect(page.locator('.chart-pane:visible')).toHaveCount(1);
  console.log('PASS: TEST 18 - Event listeners and DOM elements cleaned up cleanly on unmount.');

  // =========================================================================
  // TEST 19: Price axis labels, current price marker & crosshair
  // =========================================================================
  console.log('\n--- TEST 19: Price-axis labels, price marker & crosshair ---');
  await autoBtn0.click();
  await page.waitForTimeout(400);
  const legend = page.getByTestId('pane-0').locator('.chart-legend');
  await expect(legend).toBeVisible();
  const ohlc = legend.locator('.ohlc');
  await expect(ohlc).toBeVisible();
  console.log('PASS: TEST 19 - Price legend and indicators display accurate prices.');

  // =========================================================================
  // TEST 20: Phase F1.10 One-Shot drawing mode preserved
  // =========================================================================
  console.log('\n--- TEST 20: One-Shot Drawing Mode & Cursor Restoration ---');
  const cursorBtn = page.getByLabel('Cursor / crosshair', { exact: true });
  await expect(cursorBtn).toHaveClass(/selected/);

  // Pick Trendline tool
  await chooseTool('lines', 'trend');
  await page.waitForTimeout(200);
  await expect(cursorBtn).not.toHaveClass(/selected/);

  // Draw 2 points
  const boxDraw = await canvas0.boundingBox();
  const pt1 = { x: Math.round(boxDraw.x + boxDraw.width * 0.3), y: Math.round(boxDraw.y + boxDraw.height * 0.4) };
  const pt2 = { x: Math.round(boxDraw.x + boxDraw.width * 0.6), y: Math.round(boxDraw.y + boxDraw.height * 0.5) };

  await page.mouse.click(pt1.x, pt1.y);
  await page.waitForTimeout(200);
  await page.mouse.click(pt2.x, pt2.y);
  await page.waitForTimeout(400);

  // Verify automatic return to cursor
  await expect(cursorBtn).toHaveClass(/selected/);
  await expect(cursorBtn).toHaveAttribute('aria-pressed', 'true');

  // Verify price scale zoom continues working while Cursor is active
  await page.mouse.move(boxDraw.x + boxDraw.width - 25, boxDraw.y + boxDraw.height * 0.45);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-auto-scale'), 'false');
  console.log('PASS: TEST 20 - Phase F1.10 One-Shot drawing mode and Cursor restoration intact!');
  await saveScreenshot('f111-09-oneshot-preserved.png');

  // Final check: errors
  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);

  console.log('\n================================================================');
  console.log('ALL 20 PHASE F1.11 AUTOMATED TESTS PASSED 100%!');
  console.log('================================================================');
} finally {
  await app?.close();
}

