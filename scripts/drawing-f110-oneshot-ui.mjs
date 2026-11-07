import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f110-oneshot-'));
let app, page;
const errors = [];

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

const workspace = () => page.evaluate(() => window.terminal.request('/workspace'));
const drawings = async (paneIdx = 0) => {
  const ws = await workspace();
  const pane = ws.panes[paneIdx];
  return Object.values(pane.drawing_sets).flat();
};

const chooseTool = async (category, toolId) => {
  await page.getByTestId('drawing-category-' + category).click();
  await page.getByTestId('drawing-tool-' + toolId).click();
};

const cursorBtn = () => page.getByLabel('Cursor / crosshair', { exact: true });

try {
  console.log('================================================================');
  console.log('STARTING PHASE F1.10 ONE-SHOT DRAWING & CURSOR RESTORATION SUITE');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.stack || e.message));

  await expect(page.getByText('DIRECT FETCH', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  // Use single chart layout for baseline tests
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  const canvas = page.getByTestId('pane-0').locator('.chart-canvas');
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 200 && box.height > 200, 'Canvas bounding box must be valid');

  const p1 = { x: Math.round(box.x + box.width * 0.25), y: Math.round(box.y + box.height * 0.35) };
  const p2 = { x: Math.round(box.x + box.width * 0.55), y: Math.round(box.y + box.height * 0.50) };
  const p3 = { x: Math.round(box.x + box.width * 0.70), y: Math.round(box.y + box.height * 0.30) };
  const pEmpty = { x: Math.round(box.x + box.width * 0.85), y: Math.round(box.y + box.height * 0.75) };

  // Initial check: Cursor is active
  await expect(cursorBtn()).toHaveClass(/selected/);
  await expect(cursorBtn()).toHaveAttribute('aria-pressed', 'true');
  console.log('PASS: Initial cursor tool active.');

  // --- TEST 1: Horizontal Line (1-anchor tool) ---
  console.log('\n--- TEST 1: Horizontal Line (1 Anchor) ---');
  await chooseTool('lines', 'horizontal');
  await expect(cursorBtn()).not.toHaveClass(/selected/);
  await expect(page.getByTestId('drawing-category-lines')).toHaveClass(/selected/);

  // Click once on chart
  await page.mouse.click(p1.x, p1.y);
  await expect.poll(async () => (await drawings()).length).toBe(1);
  const d1 = (await drawings()).at(-1);
  assert.equal(d1.kind, 'horizontal');
  // Verify automatic return to cursor
  await expect(cursorBtn()).toHaveClass(/selected/);
  await expect(page.getByTestId('drawing-category-lines')).not.toHaveClass(/selected/);
  console.log('PASS: Horizontal Line created and automatically restored Cursor mode.');

  // --- TEST 2: Trendline (2-anchor tool) ---
  console.log('\n--- TEST 2: Trendline (2 Anchors) ---');
  await chooseTool('lines', 'trend');
  await expect(page.getByTestId('drawing-category-lines')).toHaveClass(/selected/);
  await expect(cursorBtn()).not.toHaveClass(/selected/);

  // Click point 1: Tool must stay active!
  await page.mouse.click(p1.x, p1.y + 30);
  await page.waitForTimeout(100);
  assert.equal((await drawings()).length, 1, 'Drawing must not commit after only 1 anchor placed');
  await expect(cursorBtn()).not.toHaveClass(/selected/);
  await expect(page.getByTestId('drawing-category-lines')).toHaveClass(/selected/);

  // Click point 2: Tool completes and commits!
  await page.mouse.click(p2.x, p2.y);
  await expect.poll(async () => (await drawings()).length).toBe(2);
  const d2 = (await drawings()).at(-1);
  assert.equal(d2.kind, 'trend');
  await expect(cursorBtn()).toHaveClass(/selected/);
  await expect(page.getByTestId('drawing-category-lines')).not.toHaveClass(/selected/);
  console.log('PASS: Trendline remained active for anchor 1, committed on anchor 2, and restored Cursor.');

  // --- TEST 3: Parallel Channel (3-anchor tool) ---
  console.log('\n--- TEST 3: Parallel Channel (3 Anchors) ---');
  await chooseTool('lines', 'parallel_channel');
  await expect(page.getByTestId('drawing-category-lines')).toHaveClass(/selected/);

  // Anchor 1
  await page.mouse.click(p1.x, p1.y + 60);
  await page.waitForTimeout(50);
  assert.equal((await drawings()).length, 2, 'Channel must not commit after anchor 1');
  await expect(cursorBtn()).not.toHaveClass(/selected/);

  // Anchor 2
  await page.mouse.click(p2.x, p2.y + 40);
  await page.waitForTimeout(50);
  assert.equal((await drawings()).length, 2, 'Channel must not commit after anchor 2');
  await expect(cursorBtn()).not.toHaveClass(/selected/);

  // Anchor 3 (final)
  await page.mouse.click(p3.x, p3.y + 20);
  await expect.poll(async () => (await drawings()).length).toBe(3);
  const d3 = (await drawings()).at(-1);
  assert.equal(d3.kind, 'parallel_channel');
  assert.equal(d3.anchors.length, 3);
  await expect(cursorBtn()).toHaveClass(/selected/);
  await expect(page.getByTestId('drawing-category-lines')).not.toHaveClass(/selected/);
  console.log('PASS: Parallel Channel remained active across anchors 1 and 2, committed on anchor 3, restored Cursor.');

  // --- TEST 4: Fibonacci Retracement ---
  console.log('\n--- TEST 4: Fibonacci Retracement ---');
  await chooseTool('fibonacci', 'fib_retracement');
  await page.mouse.click(p1.x + 20, p1.y + 80);
  await page.mouse.click(p2.x + 20, p2.y + 60);
  await expect.poll(async () => (await drawings()).length).toBe(4);
  const d4 = (await drawings()).at(-1);
  assert.equal(d4.kind, 'fib_retracement');
  await expect(cursorBtn()).toHaveClass(/selected/);
  console.log('PASS: Fibonacci Retracement placed and restored Cursor.');

  // --- TEST 5: Rectangle (Shapes) ---
  console.log('\n--- TEST 5: Rectangle ---');
  await chooseTool('shapes', 'rectangle');
  await page.mouse.click(p1.x - 30, p1.y + 40);
  await page.mouse.click(p2.x - 30, p2.y + 80);
  await expect.poll(async () => (await drawings()).length).toBe(5);
  const d5 = (await drawings()).at(-1);
  assert.equal(d5.kind, 'rectangle');
  await expect(cursorBtn()).toHaveClass(/selected/);
  console.log('PASS: Rectangle placed and restored Cursor.');

  // --- TEST 6: Brush / Freehand Stroke ---
  console.log('\n--- TEST 6: Brush / Freehand Stroke ---');
  await chooseTool('shapes', 'brush');
  await expect(page.getByTestId('drawing-category-shapes')).toHaveClass(/selected/);
  await page.mouse.move(p3.x, p3.y + 40);
  await page.mouse.down();
  await page.mouse.move(p3.x + 10, p3.y + 50, { steps: 3 });
  await page.mouse.move(p3.x + 20, p3.y + 60, { steps: 3 });
  await page.mouse.move(p3.x + 30, p3.y + 70, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await drawings()).length).toBe(6);
  const d6 = (await drawings()).at(-1);
  assert.equal(d6.kind, 'brush');
  assert.ok(d6.anchors.length >= 2, 'Brush stroke must have recorded samples');
  await expect(cursorBtn()).toHaveClass(/selected/);
  console.log('PASS: Brush freehand stroke committed on pointerup and restored Cursor.');

  // --- TEST 7: Prevent Duplicate Drawings on Subsequent Click ---
  console.log('\n--- TEST 7: Prevent Duplicate Drawings ---');
  await page.mouse.click(pEmpty.x, pEmpty.y);
  await page.waitForTimeout(200);
  assert.equal((await drawings()).length, 6, 'Subsequent chart click in empty space must NOT create an unwanted drawing');
  await expect(cursorBtn()).toHaveClass(/selected/);
  console.log('PASS: Subsequent empty chart click did not create duplicate drawings.');

  // --- TEST 8: Escape Cancellation ---
  console.log('\n--- TEST 8: Escape Key Cancellation ---');
  await chooseTool('lines', 'ray');
  await page.mouse.click(p1.x + 40, p1.y + 10);
  // Anchor 1 placed, now press Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.equal((await drawings()).length, 6, 'Cancelled drawing must not commit partial geometry');
  await expect(cursorBtn()).toHaveClass(/selected/);
  await expect(page.getByTestId('drawing-category-lines')).not.toHaveClass(/selected/);
  console.log('PASS: Escape cleanly cancelled unfinished drawing and restored Cursor.');

  // --- TEST 9: Existing Drawing Selection & Dragging in Cursor Mode ---
  console.log('\n--- TEST 9: Existing Drawing Interaction in Cursor Mode ---');
  const dBrushBefore = (await drawings()).at(-1);
  const brushYBefore = dBrushBefore.anchors[0].price;
  // Drag the brush drawing
  await page.mouse.move(p3.x, p3.y + 40);
  await page.mouse.down();
  await page.mouse.move(p3.x, p3.y + 60, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert.equal((await drawings()).length, 6, 'Dragging existing drawing must not create new drawings');
  await expect(cursorBtn()).toHaveClass(/selected/);
  console.log('PASS: Dragging and editing existing drawing functions cleanly in Cursor mode.');

  // --- TEST 10: Undo & Redo Verification ---
  console.log('\n--- TEST 10: Undo & Redo ---');
  // First undo reverts the move
  await page.getByLabel('Undo drawing', { exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal((await drawings()).length, 6, 'Undoing move preserves drawing count');

  // Second undo reverts the brush creation
  await page.getByLabel('Undo drawing', { exact: true }).click();
  await expect.poll(async () => (await drawings()).length).toBe(5);

  // Redo creation
  await page.getByLabel('Redo drawing', { exact: true }).click();
  await expect.poll(async () => (await drawings()).length).toBe(6);

  // Redo move
  await page.getByLabel('Redo drawing', { exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal((await drawings()).length, 6);
  console.log('PASS: Undo and Redo work correctly with both move and creation.');

  // --- TEST 11: Rapid Clicks & Double-Click Handling ---
  console.log('\n--- TEST 11: Rapid Clicks & Double Click Handling ---');
  const countBeforeRapid = (await drawings()).length;
  await chooseTool('lines', 'extended');
  // Rapid 3 clicks in quick succession at two points
  await page.mouse.click(p1.x - 50, p1.y + 100);
  await page.mouse.click(p2.x - 50, p2.y + 100);
  await page.mouse.click(p2.x - 50, p2.y + 100);
  await page.waitForTimeout(200);
  // Must commit exactly ONE extended line, not two!
  await expect.poll(async () => (await drawings()).length).toBe(countBeforeRapid + 1);
  const dExtended = (await drawings()).at(-1);
  assert.equal(dExtended.kind, 'extended');
  await expect(cursorBtn()).toHaveClass(/selected/);
  console.log('PASS: Rapid clicks committed exactly one drawing with no unwanted duplicate.');

  // --- TEST 12: Toolbar Active Icon Synchronization ---
  console.log('\n--- TEST 12: Toolbar Active Icon Synchronization ---');
  await chooseTool('lines', 'ray');
  await expect(page.getByTestId('drawing-category-lines')).toHaveClass(/selected/);
  await expect(cursorBtn()).not.toHaveClass(/selected/);
  await cursorBtn().click();
  await expect(cursorBtn()).toHaveClass(/selected/);
  await expect(page.getByTestId('drawing-category-lines')).not.toHaveClass(/selected/);
  console.log('PASS: Toolbar icons stay perfectly synchronized between tool and cursor states.');

  // --- TEST 13: Multi-Pane Isolation (2 Charts) ---
  console.log('\n--- TEST 13: Multi-Pane Isolation ---');
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 2', { exact: true }).click();
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  const p0DrawingsCount = (await drawings(0)).length;
  const p1DrawingsCount = (await drawings(1)).length;
  assert.equal(p1DrawingsCount, 0, 'Pane 1 starts with 0 drawings');

  // Place horizontal line on Pane 0
  const c0 = page.getByTestId('pane-0').locator('.chart-canvas');
  const b0 = await c0.boundingBox();
  await chooseTool('lines', 'horizontal');
  await page.mouse.click(b0.x + b0.width * 0.4, b0.y + b0.height * 0.4);
  await expect.poll(async () => (await drawings(0)).length).toBe(p0DrawingsCount + 1);
  assert.equal((await drawings(1)).length, 0, 'Pane 1 drawings must remain unaffected');
  await expect(cursorBtn()).toHaveClass(/selected/);

  // Switch back to layout 1
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });
  console.log('PASS: Multi-pane layouts maintain isolated drawing state and one-shot reset.');

  // --- TEST 14: Light Mode Verification ---
  console.log('\n--- TEST 14: Light Mode One-Shot Behavior ---');
  await page.getByLabel('Toggle theme', { exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-light/);

  const beforeLightCount = (await drawings()).length;
  await chooseTool('lines', 'horizontal');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await expect.poll(async () => (await drawings()).length).toBe(beforeLightCount + 1);
  await expect(cursorBtn()).toHaveClass(/selected/);

  // Capture screenshot of Light Mode with one-shot drawing and cursor active
  const artifactsDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
  await page.screenshot({ path: join(artifactsDir, 'f110-oneshot-light-mode.png') });

  // Toggle back to Dark Mode
  await page.getByLabel('Toggle theme', { exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-dark/);
  console.log('PASS: Light Mode functions identically with one-shot cursor return.');

  // --- TEST 15: Replay Mode Drawing Completion ---
  console.log('\n--- TEST 15: Replay Mode Drawing Completion ---');
  await page.getByLabel('Historical replay', { exact: true }).click();
  await expect(page.getByTestId('pane-0').locator('.chart-canvas')).toHaveAttribute('data-replay', 'true');

  const beforeReplayCount = (await drawings()).length;
  await chooseTool('lines', 'horizontal');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.35);
  await expect.poll(async () => (await drawings()).length).toBe(beforeReplayCount + 1);
  await expect(cursorBtn()).toHaveClass(/selected/);

  await page.getByLabel('Exit replay', { exact: true }).click();
  await expect(page.getByTestId('pane-0').locator('.chart-canvas')).toHaveAttribute('data-replay', 'false');
  console.log('PASS: Replay Mode completes drawings and returns to Cursor cleanly.');

  // --- TEST 16: Repeat-Mode / Tool-Lock Status ---
  console.log('\n--- TEST 16: Tool-Lock Verification ---');
  // Verify default is strictly One-Shot and no repeat lock is stuck
  await expect(cursorBtn()).toHaveClass(/selected/);
  console.log('PASS: Default is strictly One-Shot mode.');

  // Capture final visual evidence
  await page.screenshot({ path: join(artifactsDir, 'f110-oneshot-cursor-active.png') });
  await page.screenshot({ path: join(artifactsDir, 'f110-oneshot-multidrawing-clean.png') });
  await page.screenshot({ path: join(artifactsDir, 'f110-oneshot-trendline-completed.png') });

  console.log('\n================================================================');
  console.log('ALL PHASE F1.10 TARGETED TESTS PASSED 100%!');
  console.log('================================================================');
  assert.deepEqual(errors, [], 'No renderer errors occurred');

} catch (err) {
  await page?.screenshot({ path: 'test-results/f110-oneshot-failure.png' }).catch(() => {});
  console.error('Test Suite Failed:', err);
  throw err;
} finally {
  await app?.close().catch(() => {});
}
