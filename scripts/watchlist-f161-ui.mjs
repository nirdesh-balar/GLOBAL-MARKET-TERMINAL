import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f161-ui-'));
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

try {
  console.log('================================================================');
  console.log('STARTING PHASE F1.6.1 AUTO-DISMISS & NOTIFICATION UI TESTS');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

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

  // Select 'stocks' (Indian Stocks) watchlist
  const dropdown = page.getByTestId('watchlist-dropdown');
  await dropdown.selectOption('stocks');
  await page.waitForTimeout(600);

  // Switch timeframe to 1M
  const btn1M = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1M"]');
  await expect(btn1M).toBeVisible();
  await btn1M.click();
  await page.waitForTimeout(500);

  const tfBadge = page.getByTestId('watchlist-active-timeframe');
  await expect(tfBadge).toHaveText('1M');

  const exportBtn = page.getByTestId('watchlist-export-btn');
  const exportMenu = page.getByTestId('watchlist-export-menu');

  // =========================================================================
  // TEST 1: Successful Export & 4000ms Auto-Dismiss Lifecycle
  // =========================================================================
  console.log('1. Testing Successful Export & 4000ms Auto-Dismiss Lifecycle...');
  const exportPath1M = join(profile, 'Indian_Stocks-1M.xlsx');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, exportPath1M);

  // Trigger export
  await exportBtn.click();
  await expect(exportMenu).toBeVisible();
  const excelAction = page.getByTestId('export-excel-action');
  await excelAction.click();

  // Status notification appears
  const statusNotice = page.locator('.watchlist-status');
  await expect(statusNotice).toContainText('Excel exported successfully', { timeout: 35000 });
  await expect(statusNotice).toContainText('Indian_Stocks-1M.xlsx');
  await expect(statusNotice).toContainText('8 symbols · 1M');

  // Verify small green check icon
  const checkIcon = statusNotice.locator('.status-icon.success');
  await expect(checkIcon).toBeVisible();

  // Verify notification has class 'success' and aria-live='polite'
  await expect(statusNotice).toHaveClass(/success/);
  await expect(statusNotice).toHaveAttribute('aria-live', 'polite');

  console.log(`Notification text: "${await statusNotice.innerText()}"`);

  // Screenshot 1: Notification visible
  await page.screenshot({ path: 'test-results/watchlist-f161-notification-visible.png' });
  await copyFile('test-results/watchlist-f161-notification-visible.png', join(artifactDir, 'watchlist-f161-notification-visible.png')).catch(() => {});
  console.log('PASS: Success notification visible with check icon, filename, symbols, and timeframe!');

  // Check at 1500ms: Still visible
  await page.waitForTimeout(1500);
  await expect(statusNotice).toBeVisible();
  console.log('PASS: Notification remains visible at 1.5 seconds.');

  // Check at 4500ms total (extra 3000ms): Must be completely dismissed!
  await page.waitForTimeout(3000);
  await expect(statusNotice).toHaveCount(0);
  console.log('PASS: Notification automatically dismissed after 4000ms!');

  // Screenshot 2: Notification dismissed
  await page.screenshot({ path: 'test-results/watchlist-f161-notification-dismissed.png' });
  await copyFile('test-results/watchlist-f161-notification-dismissed.png', join(artifactDir, 'watchlist-f161-notification-dismissed.png')).catch(() => {});

  // =========================================================================
  // TEST 2: Normal Watchlist Layout Restored
  // =========================================================================
  console.log('2. Verifying Watchlist Layout Restored without Obstruction...');
  const watchCols = page.locator('.watch-columns');
  const watchRows = page.getByTestId('watchlist-rows');
  await expect(watchCols).toBeVisible();
  await expect(watchRows).toBeVisible();

  // Ensure stock rows are selectable and unobstructed
  const firstRow = watchRows.locator('.watch-row').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(firstRow).toHaveClass(/selected-symbol/);

  // Screenshot 3: Clean normal watchlist layout
  await page.screenshot({ path: 'test-results/watchlist-f161-normal-layout.png' });
  await copyFile('test-results/watchlist-f161-normal-layout.png', join(artifactDir, 'watchlist-f161-normal-layout.png')).catch(() => {});
  console.log('PASS: Normal watchlist layout fully restored and stocks selectable!');

  // =========================================================================
  // TEST 3: User Cancellation Auto-Dismiss (2000ms)
  // =========================================================================
  console.log('3. Testing Cancelled Export Auto-Dismiss (2000ms)...');
  await app.evaluate(() => {
    globalThis.__saveDialogCancel = true;
  });

  await exportBtn.click();
  await excelAction.click();

  await expect(statusNotice).toBeVisible();
  await expect(statusNotice).toContainText('Export cancelled');
  await expect(statusNotice).toHaveClass(/cancelled/);

  // Wait 1000ms: still visible
  await page.waitForTimeout(1000);
  await expect(statusNotice).toBeVisible();

  // Wait another 1500ms (2500ms total): dismissed
  await page.waitForTimeout(1500);
  await expect(statusNotice).toHaveCount(0);
  console.log('PASS: Cancelled notification auto-dismissed after 2000ms!');

  // =========================================================================
  // TEST 4: Manual Dismiss Button (X)
  // =========================================================================
  console.log('4. Testing Manual Dismiss (X button)...');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, exportPath1M);

  await exportBtn.click();
  await excelAction.click();

  await expect(statusNotice).toContainText('Excel exported successfully', { timeout: 35000 });
  const dismissBtn = statusNotice.locator('.watchlist-status-dismiss');
  await expect(dismissBtn).toBeVisible();
  await dismissBtn.click();

  // Immediately dismissed without waiting 4000ms
  await expect(statusNotice).toHaveCount(0);
  console.log('PASS: Manual dismiss button closes notification immediately!');

  // =========================================================================
  // TEST 5: Switching Watchlists Immediately Clears Stale Notification
  // =========================================================================
  console.log('5. Testing Watchlist Switch immediately clears notification...');
  await exportBtn.click();
  await excelAction.click();
  await expect(statusNotice).toContainText('Excel exported successfully', { timeout: 35000 });
  await expect(statusNotice).toContainText('Indian_Stocks-1M.xlsx');

  // Immediately switch dropdown to US Stocks
  await dropdown.selectOption('us');
  await page.waitForTimeout(100);

  // Status notice must be instantly gone!
  await expect(statusNotice).toHaveCount(0);
  console.log('PASS: Switching watchlists immediately dismisses stale notifications!');

  // Switch back to stocks
  await dropdown.selectOption('stocks');
  await page.waitForTimeout(300);

  // =========================================================================
  // TEST 6: Rapid Exports & Timer Race Protection
  // =========================================================================
  console.log('6. Testing Rapid Exports and Timer Race Protection...');
  // Export 1
  await exportBtn.click();
  await excelAction.click();
  await expect(statusNotice).toContainText('Excel exported successfully', { timeout: 35000 });

  // While visible, immediately start Export 2
  await exportBtn.click();
  await excelAction.click();

  // Progress or Saving appears immediately for Export 2 without lingering Export 1 notice
  await expect(statusNotice).toContainText(/Preparing Excel export|Saving Excel workbook/, { timeout: 10000 });
  console.log('PASS: Starting new export replaces old notice with new progress cleanly!');

  // Wait for Export 2 to finish
  await expect(statusNotice).toContainText('Excel exported successfully', { timeout: 35000 });
  // Wait 4500ms: dismissed cleanly
  await page.waitForTimeout(4500);
  await expect(statusNotice).toHaveCount(0);
  console.log('PASS: Rapid export lifecycle completed and dismissed cleanly!');

  // Verify zero unhandled page errors
  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);

  console.log('================================================================');
  console.log('ALL PHASE F1.6.1 NOTIFICATION & AUTO-DISMISS TESTS PASSED 100%!');
  console.log('================================================================');
} finally {
  await app?.close();
}
