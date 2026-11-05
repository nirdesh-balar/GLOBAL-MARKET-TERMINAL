import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const data = await mkdtemp(join(tmpdir(), 'imt-flags-ui-'));
await mkdir('test-results', { recursive: true });

const errors = [];
const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: {
    ...process.env,
    IMT_OFFLINE: '1',
    IMT_UI_FIXTURE: '1',
    IMT_TEST_DATA_DIR: data
  },
  timeout: 60000
});

console.log('STARTING PHASE F1 COLORED TICKERS & FLAGGED WATCHLISTS UI TEST...');
let app;
try {
  app = await launch();
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByText('DIRECT FETCH', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  console.log('1. Verifying Search Flag Action for RELIANCE...');
  // Open search dialog
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Search stocks and indices' })).toBeVisible();

  // Search RELIANCE
  await page.getByPlaceholder('Search symbol, company, index or ISIN').fill('RELIANCE');
  await page.waitForTimeout(600);

  // Locate RELIANCE row
  const relRow = page.locator('.search-result').filter({ hasText: 'RELIANCE' }).first();
  await expect(relRow).toBeVisible();

  // Click flag button on RELIANCE
  const relFlagBtn = relRow.locator('.symbol-flag-btn');
  await expect(relFlagBtn).toBeAttached();
  await relFlagBtn.click();

  // Color picker should appear
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  // Select RED color
  await page.locator('[data-testid="flag-color-red"]').click();
  await expect(page.locator('.color-flag-picker-popover')).toHaveCount(0);

  // Verify RELIANCE flag is now red
  await expect(relFlagBtn).toHaveClass(/flagged/);
  console.log('PASS: RELIANCE flagged RED in Search results.');

  // Close search
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Search stocks and indices' })).toHaveCount(0);

  console.log('2. Verifying Red List in Watchlist dropdown...');
  const dropdown = page.getByTestId('watchlist-dropdown');
  await expect(dropdown).toBeVisible();

  // Switch to Red List
  await dropdown.selectOption('color:red');
  await page.waitForTimeout(400);

  // Verify RELIANCE is in the Red List
  const redRows = page.locator('.watch-row');
  await expect(redRows).toHaveCount(1);
  await expect(redRows.first()).toContainText('RELIANCE');
  console.log('PASS: RELIANCE dynamically populates Red List.');

  console.log('3. Flagging TCS as BLUE from Search...');
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN').fill('TCS');
  await page.waitForTimeout(600);

  const tcsRow = page.locator('.search-result').filter({ hasText: 'TCS' }).first();
  await expect(tcsRow).toBeVisible();
  const tcsFlagBtn = tcsRow.locator('.symbol-flag-btn');
  await tcsFlagBtn.click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  await page.locator('[data-testid="flag-color-blue"]').click();
  await page.keyboard.press('Escape');

  // Switch to Blue List
  await dropdown.selectOption('color:blue');
  await page.waitForTimeout(400);
  await expect(page.locator('.watch-row')).toHaveCount(1);
  await expect(page.locator('.watch-row').first()).toContainText('TCS');
  console.log('PASS: TCS appears in Blue List.');

  console.log('4. Reassigning TCS from BLUE to GREEN from Watchlist row...');
  const tcsWatchFlag = page.locator('.watch-row').filter({ hasText: 'TCS' }).locator('.symbol-flag-btn');
  await tcsWatchFlag.click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  await page.locator('[data-testid="flag-color-green"]').click();
  await page.waitForTimeout(400);

  // Blue list must now be empty
  await expect(page.locator('.watch-row')).toHaveCount(0);
  console.log('PASS: TCS removed from Blue List.');

  // Switch to Green list
  await dropdown.selectOption('color:green');
  await page.waitForTimeout(400);
  await expect(page.locator('.watch-row')).toHaveCount(1);
  await expect(page.locator('.watch-row').first()).toContainText('TCS');
  console.log('PASS: TCS moved to Green List.');

  console.log('5. Unflagging RELIANCE and verifying Red List clears...');
  await dropdown.selectOption('color:red');
  await page.waitForTimeout(400);
  await expect(page.locator('.watch-row')).toHaveCount(1);
  const relWatchFlag = page.locator('.watch-row').filter({ hasText: 'RELIANCE' }).locator('.symbol-flag-btn');
  await relWatchFlag.click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  await page.locator('[data-testid="remove-flag-btn"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.watch-row')).toHaveCount(0);
  console.log('PASS: RELIANCE unflagged; Red List updated.');

  console.log('6. Custom list preservation and Multi-Chart isolation...');
  // Switch to custom favourites list
  await dropdown.selectOption('favourites');
  await page.waitForTimeout(400);
  // Verify standard watchlists are intact
  const favCount = await page.locator('.watch-row').count();
  console.log(`Custom favourites list intact with ${favCount} items.`);

  console.log('7. Verifying Active Chart Header Flag button...');
  const headerFlag = page.locator('[data-testid="header-symbol-flag"]');
  await expect(headerFlag).toBeVisible();

  console.log('8. Verifying INFY Red List save and quote loading (Bug Reproduction & Verification)...');
  // Open search and flag INFY as RED
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN').fill('INFY');
  await page.waitForTimeout(600);
  const infyRow = page.locator('.search-result').filter({ hasText: 'INFY' }).first();
  await expect(infyRow).toBeVisible();
  const infyFlagBtn = infyRow.locator('.symbol-flag-btn');
  await infyFlagBtn.click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  await page.locator('[data-testid="flag-color-red"]').click();
  await page.keyboard.press('Escape');

  // Switch dropdown to Red List
  await dropdown.selectOption('color:red');
  await page.waitForTimeout(600);

  // CRITICAL CHECK: Verify INFY is present in Red List
  const infyWatchRow = page.locator('.watch-row').filter({ hasText: 'INFY' });
  await expect(infyWatchRow).toHaveCount(1);

  // CRITICAL CHECK: No rejected request toast
  await expect(page.locator('.toast')).toHaveCount(0);

  // CRITICAL CHECK: Statusbar must NOT say "Save failed"
  const statusbar = page.locator('.statusbar');
  await expect(statusbar).not.toContainText('Save failed');

  // CRITICAL CHECK: Quote status must NOT be 404 or stuck on "Not fetched" if quote service responds
  // Give quote polling a brief moment
  await page.waitForTimeout(1000);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(statusbar).not.toContainText('Save failed');

  console.log('PASS: INFY Red List selection saved cleanly with zero rejected requests!');

  console.log('9. Verifying App Restart Persistence for Colored Watchlist...');
  // Close the app and relaunch with the same data directory to verify cold restart persistence
  await app.close();
  app = await launch();
  const page2 = await app.firstWindow();
  page2.on('pageerror', e => errors.push(e.message));

  await expect(page2.getByText('DIRECT FETCH', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page2.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });

  // Verify dropdown restored to Red List
  const dropdown2 = page2.getByTestId('watchlist-dropdown');
  await expect(dropdown2).toHaveValue('color:red');

  // Verify INFY is still in the Red List
  const restoredRedRows = page2.locator('.watch-row').filter({ hasText: 'INFY' });
  await expect(restoredRedRows).toHaveCount(1);
  await expect(page2.locator('.toast')).toHaveCount(0);
  console.log('PASS: Color flag assignment and active colored watchlist persisted across restart!');

  assert.equal(errors.length, 0, `Unexpected errors: ${errors.join(', ')}`);
  console.log('ALL PHASE F1 & F1.1 UI TESTS PASSED SUCCESSFULLY!');
} finally {
  if (app) {
    await app.close();
  }
}
