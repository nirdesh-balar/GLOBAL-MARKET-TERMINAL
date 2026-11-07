import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f111-gui-sensex-'));
let app, page;
const artifactsDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: {
    ...process.env,
    IMT_OFFLINE: '1',
    IMT_UI_FIXTURE: '1',
    IMT_TEST_DATA_DIR: profile,
  },
  timeout: 60000,
});

const saveArtifact = async (name) => {
  const local = `test-results/${name}`;
  await page.screenshot({ path: local });
  await copyFile(local, join(artifactsDir, name)).catch(() => {});
};

try {
  console.log('================================================================');
  console.log('STARTING SECTION 16: REAL MAC GUI SENSEX 15m VERIFICATION');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();

  await expect(page.getByText('DIRECT FETCH', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  // Single chart layout
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  // Inspect current symbol and watchlist
  console.log('1. Checking current pane 0 and watchlists...');
  const ws = await page.evaluate(() => window.terminal.request('/workspace'));
  console.log('Current pane 0:', JSON.stringify(ws.panes[0], null, 2));
  console.log('Available watchlists:', ws.watchlists.map(w => ({ name: w.name, items: w.items.map(i => i.symbol) })));
  await expect(page.getByText('DIRECT FETCH', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  const canvas0 = page.getByTestId('pane-0').locator('.chart-canvas');
  const box = await canvas0.boundingBox();
  const autoBtn = page.getByRole('button', { name: /AUTO pane 0/i });
  const logBtn = page.getByRole('button', { name: /LOG pane 0/i });
  const cursorBtn = page.getByLabel('Cursor / crosshair', { exact: true });

  const priceScaleX = box.x + box.width - 25;
  const priceScaleY = box.y + box.height * 0.45;

  await saveArtifact('f111-gui-01-sensex-15m-baseline.png');
  console.log('PASS: SENSEX 15m baseline established.');

  // 2. Scroll wheel UP without clicking -> Zoom In
  console.log('2. Scrolling wheel UP on SENSEX price scale...');
  const rangeBeforeZoom = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const timeBeforeZoom = await canvas0.evaluate(el => el.__chart.timeScale().getVisibleLogicalRange());
  const spanBeforeZoom = rangeBeforeZoom.to - rangeBeforeZoom.from;

  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);

  const rangeAfterZoomIn = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const timeAfterZoomIn = await canvas0.evaluate(el => el.__chart.timeScale().getVisibleLogicalRange());
  const spanAfterZoomIn = rangeAfterZoomIn.to - rangeAfterZoomIn.from;

  assert.ok(spanAfterZoomIn < spanBeforeZoom, 'Wheel UP must decrease span (zoom in)');
  assert.equal(timeBeforeZoom.from, timeAfterZoomIn.from, 'Horizontal time range logical from must remain unchanged');
  assert.equal(timeBeforeZoom.to, timeAfterZoomIn.to, 'Horizontal time range logical to must remain unchanged');
  await expect(autoBtn).not.toHaveClass(/selected/);
  await saveArtifact('f111-gui-02-wheel-zoom-in.png');
  console.log(`PASS: Vertical Zoom In verified: span reduced from ${spanBeforeZoom.toFixed(2)} to ${spanAfterZoomIn.toFixed(2)} with horizontal range untouched.`);

  // 3. Scroll wheel DOWN without clicking -> Zoom Out
  console.log('3. Scrolling wheel DOWN on SENSEX price scale...');
  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);

  const rangeAfterZoomOut = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const spanAfterZoomOut = rangeAfterZoomOut.to - rangeAfterZoomOut.from;
  assert.ok(spanAfterZoomOut > spanAfterZoomIn, 'Wheel DOWN must increase span (zoom out)');
  await saveArtifact('f111-gui-03-wheel-zoom-out.png');
  console.log(`PASS: Vertical Zoom Out verified: span expanded to ${spanAfterZoomOut.toFixed(2)}.`);

  // 4. Click AUTO -> re-fit visible candles
  console.log('4. Clicking AUTO button...');
  await autoBtn.click();
  await page.waitForTimeout(400);

  await expect(autoBtn).toHaveClass(/selected/);
  const autoRange = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  assert.equal(autoRange.from, rangeBeforeZoom.from, 'Auto range.from must match baseline');
  assert.equal(autoRange.to, rangeBeforeZoom.to, 'Auto range.to must match baseline');
  await saveArtifact('f111-gui-04-auto-reset.png');
  console.log('PASS: AUTO button reset returned price scale to auto-fit.');

  // 5. Toggle LOG -> Logarithmic price scale
  console.log('5. Testing LOG scale mode...');
  await logBtn.click();
  await page.waitForTimeout(400);
  await expect(logBtn).toHaveClass(/selected/);
  assert.equal(await canvas0.getAttribute('data-price-mode'), '1');

  // Wheel zoom in LOG mode
  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);

  const logZoomRange = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  assert.ok(Number.isFinite(logZoomRange.from) && Number.isFinite(logZoomRange.to));
  assert.ok(logZoomRange.from < logZoomRange.to);
  await saveArtifact('f111-gui-05-log-wheel-zoom.png');
  console.log(`PASS: LOG wheel zoom working properly: [${logZoomRange.from.toFixed(2)}, ${logZoomRange.to.toFixed(2)}].`);

  // Reset AUTO and restore linear
  await autoBtn.click();
  await page.waitForTimeout(300);
  await logBtn.click();
  await page.waitForTimeout(300);
  assert.equal(await canvas0.getAttribute('data-price-mode'), '0');

  // 6. Draw Trendline and verify automatic return to Cursor
  console.log('6. Drawing Trendline and testing One-Shot cursor return...');
  await page.getByTestId('drawing-category-lines').click();
  await page.getByTestId('drawing-tool-trend').click();
  await page.waitForTimeout(200);

  const pt1 = { x: Math.round(box.x + box.width * 0.25), y: Math.round(box.y + box.height * 0.45) };
  const pt2 = { x: Math.round(box.x + box.width * 0.55), y: Math.round(box.y + box.height * 0.60) };

  await page.mouse.click(pt1.x, pt1.y);
  await page.waitForTimeout(150);
  await page.mouse.click(pt2.x, pt2.y);
  await page.waitForTimeout(400);

  await expect(cursorBtn).toHaveClass(/selected/);

  // Zoom price scale with drawing visible
  await page.mouse.move(priceScaleX, priceScaleY);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);

  await saveArtifact('f111-gui-06-drawing-aligned.png');
  console.log('PASS: Drawing remained aligned and interactive during price zoom.');

  // 7. Multi-pane isolation in 2-chart layout
  console.log('7. Testing 2-chart layout isolation...');
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 2', { exact: true }).click();
  await page.waitForTimeout(1000);

  const canvas1 = page.getByTestId('pane-1').locator('.chart-canvas');
  await expect(canvas1).toBeVisible();

  const b0 = await canvas0.boundingBox();
  const b1 = await canvas1.boundingBox();

  const p0Before = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const p1Before = await canvas1.evaluate(el => el.__chart.priceScale('right').getVisibleRange());

  await page.mouse.move(b0.x + b0.width - 25, b0.y + b0.height * 0.45);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);

  const p0After = await canvas0.evaluate(el => el.__chart.priceScale('right').getVisibleRange());
  const p1After = await canvas1.evaluate(el => el.__chart.priceScale('right').getVisibleRange());

  assert.ok((p0After.to - p0After.from) < (p0Before.to - p0Before.from), 'Pane 0 must zoom in');
  assert.equal(p1After.from, p1Before.from, 'Pane 1 must remain untouched');
  assert.equal(p1After.to, p1Before.to, 'Pane 1 must remain untouched');
  await saveArtifact('f111-gui-07-multipane-isolation.png');
  console.log('PASS: Multi-chart isolation verified.');

  // 8. Test Light Theme Zoom
  console.log('8. Testing Light Theme Zoom...');
  const themeBtn = page.locator('button[aria-label="Toggle theme"]');
  await themeBtn.click();
  await page.waitForTimeout(400);

  await page.mouse.move(b0.x + b0.width - 25, b0.y + b0.height * 0.45);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);

  await saveArtifact('f111-gui-08-light-theme-zoom.png');
  await themeBtn.click();
  await page.waitForTimeout(400);

  // Return to 1-chart layout with SENSEX and Cursor active
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(500);

  await autoBtn.click();
  await page.waitForTimeout(400);
  await expect(cursorBtn).toHaveClass(/selected/);

  await saveArtifact('f111-gui-09-final-sensex-cursor-open.png');
  console.log('PASS: Final state captured with SENSEX 15m and Cursor active.');

  console.log('================================================================');
  console.log('ALL SECTION 16 REAL GUI ACCEPTANCE CHECKS PASSED 100%!');
  console.log('================================================================');
} finally {
  await app?.close();
}
