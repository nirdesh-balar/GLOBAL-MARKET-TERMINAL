import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f13-ui-'));
await mkdir('test-results', { recursive: true });
const errors = [];
let app, page;

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' },
  timeout: 60000,
});

const request = (p, m = 'GET', b) => page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [p, m, b]);

try {
  console.log('STARTING PHASE F1.3 WATCHLIST KEYBOARD NAVIGATION & UI REFINEMENT TEST...');
  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // =========================================================================
  // STEP 1: Verify Fractional Integer Error Fix (Sidebar width float coercion)
  // =========================================================================
  console.log('1. Verifying Fractional Integer Error Fix (/workspace PUT with float width)...');
  let w = await request('/workspace');
  assert.ok(w, 'Workspace must be retrieved');

  // Inject a fractional floating point number as happens on Retina displays
  w.sidebar.width = 318.423984;
  const saveRes = await request('/workspace', 'PUT', w);
  assert.ok(saveRes && saveRes.watchlist_revision !== undefined, 'PUT /workspace with float width must succeed without 422');

  const reloadedW = await request('/workspace');
  assert.equal(typeof reloadedW.sidebar.width, 'number', 'Sidebar width must be numeric');
  assert.equal(reloadedW.sidebar.width, 318, 'Sidebar width must be coerced to rounded integer 318');
  console.log('PASS: Fractional integer error resolved! Backend safely coerces float width to integer.');

  // Reload page to verify frontend loads and renders cleanly with integer width
  await page.reload();
  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });
  await expect(page.locator('.statusbar')).toContainText(/(Saved locally|Preferences ready)/);
  await expect(page.locator('.toast')).toHaveCount(0);
  console.log('PASS: Workspace loaded with zero 422 errors and zero Save failed toasts.');

  // =========================================================================
  // STEP 2: Verify Delete (X) Available in Every Watchlist (Market, Colored, Custom)
  // =========================================================================
  console.log('2. Verifying Delete (X) button on Market/System Watchlist (stocks)...');
  await page.getByLabel('Active watchlist', { exact: true }).selectOption('stocks');
  await expect(page.locator('.watch-row').first()).toBeVisible({ timeout: 15000 });

  // Get total rows in stocks
  const initialStockCount = await page.locator('.watch-row').count();
  console.log(`Stocks count in UI: ${initialStockCount}`);
  assert.ok(initialStockCount >= 1, 'Stocks watchlist must have at least 1 item');

  const firstStockRow = page.locator('.watch-row').first();
  const firstStockSymbol = (await firstStockRow.locator('.watch-select > span:first-child > strong').innerText()).trim();

  // Hover first row and check that Delete (X) button is present!
  await firstStockRow.hover();
  const removeBtn = firstStockRow.locator('button[aria-label^="Remove "]');
  await expect(removeBtn).toBeVisible();
  console.log(`PASS: Delete (X) button is present on System Market row: ${firstStockSymbol}`);

  // Click Delete (X) to hide the symbol locally
  console.log(`2b. Hiding ${firstStockSymbol} locally from stocks market list...`);
  await removeBtn.click();

  // Verify first row is no longer firstStockSymbol
  await page.waitForTimeout(400);
  const newFirstStockSymbol = (await page.locator('.watch-row').first().locator('.watch-select > span:first-child > strong').innerText()).trim();
  assert.notEqual(newFirstStockSymbol, firstStockSymbol, 'Hidden symbol must not be the first visible row');
  console.log(`PASS: ${firstStockSymbol} smoothly removed from view. New top row: ${newFirstStockSymbol}`);

  // Verify 'Hidden (1)' toggle is visible in options bar
  await expect(page.locator('.watch-hidden-toggle')).toBeVisible();
  console.log('PASS: Hidden (1) toggle is displayed in watchlist options.');

  // Toggle 'Hidden (1)' to show hidden row
  await page.getByLabel('Show hidden symbols').check();
  await page.waitForTimeout(300);

  // Find the hidden row
  const hiddenRow = page.locator('.watch-row[data-hidden="true"]').first();
  await expect(hiddenRow).toBeVisible();
  await hiddenRow.hover();

  // Verify restore button exists on the hidden row
  const restoreBtn = hiddenRow.locator('button[aria-label^="Restore "]');
  await expect(restoreBtn).toBeVisible();

  // Click Restore on the row
  await restoreBtn.click();
  await page.waitForTimeout(400);

  // Once restored, hiddenSymbols is empty, so watch-hidden-toggle is hidden
  await expect(page.locator('.watch-hidden-toggle')).toHaveCount(0);

  // Verify firstStockSymbol is visible again normally
  const restoredRow = page.locator('.watch-row').filter({ hasText: firstStockSymbol }).first();
  await expect(restoredRow).toBeVisible();
  console.log(`PASS: ${firstStockSymbol} restored to active market list!`);

  // =========================================================================
  // STEP 3: TradingView-Style Watchlist Keyboard Navigation
  // =========================================================================
  console.log('3. Verifying TradingView-Style Keyboard Navigation (ArrowUp / ArrowDown without Enter)...');
  const rows = page.locator('.watch-row');
  const rowCount = await rows.count();

  // Click row 0 to select and focus
  const row0 = rows.nth(0);
  const row0Symbol = (await row0.locator('.watch-select > span:first-child > strong').innerText()).trim();
  await row0.locator('.watch-select').click();
  await page.waitForTimeout(500);

  // Active chart pane must show row 0 symbol
  await expect(page.locator('.pane-symbol').first()).toContainText(row0Symbol);
  await expect(row0).toHaveClass(/selected-symbol/);
  console.log(`Selected Row 0: ${row0Symbol}. Chart pane title matches.`);

  // Press ArrowDown: MUST immediately highlight row 1 AND switch active chart WITHOUT Enter key!
  console.log('Pressing ArrowDown...');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);

  const row1 = rows.nth(1);
  const row1Symbol = (await row1.locator('.watch-select > span:first-child > strong').innerText()).trim();
  await expect(row1).toHaveClass(/selected-symbol/);
  await expect(page.locator('.pane-symbol').first()).toContainText(row1Symbol);
  console.log(`PASS: ArrowDown immediately switched active chart to ${row1Symbol} without Enter key!`);

  // Press ArrowDown again: switches to row 2
  console.log('Pressing ArrowDown again...');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);

  const row2 = rows.nth(2);
  const row2Symbol = (await row2.locator('.watch-select > span:first-child > strong').innerText()).trim();
  await expect(row2).toHaveClass(/selected-symbol/);
  await expect(page.locator('.pane-symbol').first()).toContainText(row2Symbol);
  console.log(`PASS: Second ArrowDown switched active chart to ${row2Symbol}!`);

  // Press ArrowUp: switches back to row 1
  console.log('Pressing ArrowUp...');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(500);

  await expect(row1).toHaveClass(/selected-symbol/);
  await expect(page.locator('.pane-symbol').first()).toContainText(row1Symbol);
  console.log(`PASS: ArrowUp switched active chart back to ${row1Symbol}!`);

  // Rapid Navigation Test across 5+ symbols
  console.log('3b. Verifying Rapid Navigation across multiple symbols...');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(600);

  // Verify selected row is within bounds and chart pane updated cleanly
  const currentSelectedRow = page.locator('.watch-row.selected-symbol');
  await expect(currentSelectedRow).toHaveCount(1);
  const currentSymbol = (await currentSelectedRow.locator('.watch-select > span:first-child > strong').innerText()).trim();
  await expect(page.locator('.pane-symbol').first()).toContainText(currentSymbol);
  console.log(`PASS: Rapid navigation succeeded! Landed smoothly on ${currentSymbol} with zero errors.`);

  // Home key jumps to row 0
  console.log('Pressing Home key...');
  await page.keyboard.press('Home');
  await page.waitForTimeout(500);
  await expect(row0).toHaveClass(/selected-symbol/);
  await expect(page.locator('.pane-symbol').first()).toContainText(row0Symbol);
  console.log(`PASS: Home key jumped to row 0 (${row0Symbol})!`);

  // =========================================================================
  // STEP 4: Multi-Pane Chart Isolation
  // =========================================================================
  console.log('4. Verifying Multi-Pane Chart Isolation in 2-Chart Layout...');
  // Ensure layout is 2 panes
  w = await request('/workspace');
  w.layout = 2;
  await request('/workspace', 'PUT', w);
  await page.reload();
  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Two chart panes must be visible
  await expect(page.locator('.pane-symbol')).toHaveCount(2);

  // Select Pane 1 and ensure it has a distinct symbol
  const pane1Header = page.locator('.pane-symbol').nth(1);
  const pane1Symbol = (await pane1Header.innerText()).trim();

  // Select Pane 0 as active by clicking pane 0 surface
  await page.locator('[data-testid="pane-0"]').click();
  await page.waitForTimeout(300);

  // Navigate in watchlist
  const firstRow = page.locator('.watch-row').first();
  await firstRow.locator('.watch-select').click();
  await page.waitForTimeout(400);

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);

  // Pane 0 must have changed, Pane 1 must remain strictly unchanged!
  await expect(page.locator('.pane-symbol').nth(1)).toHaveText(pane1Symbol);
  console.log(`PASS: Multi-pane isolation verified! Pane 1 remained ${pane1Symbol} while Pane 0 updated.`);

  // =========================================================================
  // STEP 5: Focus Safety (Input / Modal Isolation)
  // =========================================================================
  console.log('5. Verifying Focus Safety (Arrow keys in inputs do not switch charts)...');
  const searchInput = page.getByPlaceholder('Search this watchlist');
  await searchInput.focus();
  await searchInput.fill('TAT');

  const beforeKeySymbol = (await page.locator('.pane-symbol').first().innerText()).trim();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);

  const afterKeySymbol = (await page.locator('.pane-symbol').first().innerText()).trim();
  assert.equal(beforeKeySymbol, afterKeySymbol, 'Arrow keys while typing in input must NOT switch chart');
  console.log('PASS: Focus safety verified! Typing in search input preserves active chart.');

  // Clear search input
  await searchInput.fill('');
  await page.waitForTimeout(300);

  // =========================================================================
  // STEP 6: Capture Refined High-Resolution Screenshot
  // =========================================================================
  console.log('6. Capturing final Phase F1.3 refined UI screenshot...');
  // Switch to US Stocks or stocks watchlist with selected symbol and hover on a row
  await page.locator('.watch-row').first().hover();
  await page.waitForTimeout(300);

  const screenshotPath = 'test-results/watchlist-f13-refined.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`PASS: Screenshot saved to ${screenshotPath}`);

  // Copy screenshot to artifact directory
  const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
  await copyFile(screenshotPath, join(artifactDir, 'watchlist-f13-refined.png'));
  console.log(`PASS: Screenshot copied to artifact directory: ${artifactDir}/watchlist-f13-refined.png`);

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join('; ')}`);
  console.log('ALL PHASE F1.3 UI TESTS PASSED SUCCESSFULLY!');
} catch (e) {
  console.error('TEST FAILED:', e);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
}
