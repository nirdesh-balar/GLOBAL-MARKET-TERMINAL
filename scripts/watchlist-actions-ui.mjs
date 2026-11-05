import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-actions-ui-'));
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
  console.log('STARTING WATCHLIST ROW ACTIONS UI TEST...');
  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // 1. Populate custom watchlist 'favourites' with 3 real instruments from stocks
  console.log('1. Verifying Custom Watchlist Row Actions for favourites...');
  let w = await request('/workspace');
  const sampleItems = w.watchlists.find(l => l.id === 'stocks')?.items.slice(0, 3) || [];
  assert.ok(sampleItems.length >= 3, 'Must have at least 3 stocks in sample');
  let fav = w.watchlists.find(l => l.id === 'favourites');
  if (!fav) {
    fav = { id: 'favourites', name: 'Favourites', items: [] };
    w.watchlists.push(fav);
  }
  fav.items = sampleItems;
  w.active_watchlist = 'favourites';
  w.sidebar.sort = 'manual';
  await request('/workspace', 'PUT', w);
  await page.reload();
  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  const symbol0 = sampleItems[0].symbol;
  const symbol1 = sampleItems[1].symbol;
  const symbol2 = sampleItems[2].symbol;

  // Verify rows are present
  await expect(page.locator('.watch-row')).toHaveCount(3);

  // 2. Test row 0: Alert button MUST NOT exist anywhere in watchlist rows
  console.log('2. Verifying Alert button is removed from watchlist rows...');
  await expect(page.locator('.watch-alert-button')).toHaveCount(0);
  await expect(page.locator('.watch-row button:has-text("Alert")')).toHaveCount(0);
  console.log('PASS: No Alert button exists in watchlist rows.');

  // 3. Test Up, Down, Remove buttons on row 0
  console.log(`3. Verifying Up, Down, and Remove buttons on row 0 (${symbol0})...`);
  const row0 = page.locator('.watch-row').filter({ has: page.getByTestId(`watchlist-symbol-${symbol0}`) });
  const row0Up = page.getByLabel(`Move up ${symbol0}`, { exact: true });
  const row0Down = page.getByLabel(`Move down ${symbol0}`, { exact: true });
  const row0Remove = page.getByLabel(`Remove ${symbol0}`, { exact: true });

  await expect(row0Up).toBeVisible();
  await expect(row0Down).toBeVisible();
  await expect(row0Remove).toBeVisible();

  // Check tooltips
  assert.equal(await row0Up.getAttribute('title'), 'Move up');
  assert.equal(await row0Down.getAttribute('title'), 'Move down');
  assert.equal(await row0Remove.getAttribute('title'), 'Remove from watchlist');

  // row 0 is first row (n=0), so Move Up must be disabled
  await expect(row0Up).toBeDisabled();
  // Move Down must be enabled
  await expect(row0Down).toBeEnabled();

  // 4. Test row 2: Last row, so Move Down must be disabled
  console.log(`4. Verifying boundary disable on last row (${symbol2})...`);
  const row2Up = page.getByLabel(`Move up ${symbol2}`, { exact: true });
  const row2Down = page.getByLabel(`Move down ${symbol2}`, { exact: true });
  await expect(row2Up).toBeEnabled();
  await expect(row2Down).toBeDisabled();
  console.log('PASS: First row Up is disabled, last row Down is disabled.');

  // 5. Check Non-overlapping Layout & Bounding Boxes
  console.log('5. Verifying actions do not overlap price columns, symbol, or exchange name...');
  await row0.hover();
  const row0ActionsBox = await row0.locator('.watch-row-actions').boundingBox();
  const row0SymbolBox = await row0.locator('.watch-select > span:first-child').boundingBox();
  const row0QuoteBox = await row0.locator('.watch-select .quote').boundingBox();
  const row0ChangeBox = await row0.locator('.watch-select .watch-change').boundingBox();

  assert.ok(row0ActionsBox && row0SymbolBox && row0QuoteBox && row0ChangeBox);
  // Actions must be strictly to the right of Change box (or dedicated right area)
  assert.ok(row0ActionsBox.x >= row0ChangeBox.x + row0ChangeBox.width - 2, 
    `Actions box (${row0ActionsBox.x}) should not overlap Change box (${row0ChangeBox.x} + ${row0ChangeBox.width})`);
  assert.ok(row0QuoteBox.x + row0QuoteBox.width <= row0ChangeBox.x + 2,
    `Quote box should be to the left of Change box`);
  console.log('PASS: Actions reside in dedicated right-side area with ZERO numeric data overlap.');

  // 6. Test Automatic Sort Mode: Move Up and Move Down must be disabled
  console.log('6. Verifying Auto-Sort disables Up and Down...');
  await page.getByLabel('Watchlist sort', { exact: true }).selectOption('symbol');
  await expect(page.getByLabel(`Move up ${symbol1}`, { exact: true })).toBeDisabled();
  await expect(page.getByLabel(`Move down ${symbol1}`, { exact: true })).toBeDisabled();
  console.log('PASS: Auto-sort disables Move Up and Move Down.');

  // Switch back to manual sort
  await page.getByLabel('Watchlist sort', { exact: true }).selectOption('manual');
  await expect(page.getByLabel(`Move up ${symbol1}`, { exact: true })).toBeEnabled();
  await expect(page.getByLabel(`Move down ${symbol1}`, { exact: true })).toBeEnabled();

  // 7. Test Move Down / Move Up reordering
  console.log('7. Verifying Move Down reordering...');
  await row0.hover();
  await row0Down.click();
  await expect.poll(async () => {
    const list = (await request('/workspace')).watchlists.find(l => l.id === 'favourites');
    return list.items[1].symbol;
  }).toBe(symbol0);
  console.log(`PASS: Move Down shifted ${symbol0} to index 1.`);

  // Move it back up
  const row1 = page.locator('.watch-row').filter({ has: page.getByTestId(`watchlist-symbol-${symbol0}`) });
  await row1.hover();
  await page.getByLabel(`Move up ${symbol0}`, { exact: true }).click();
  await expect.poll(async () => {
    const list = (await request('/workspace')).watchlists.find(l => l.id === 'favourites');
    return list.items[0].symbol;
  }).toBe(symbol0);
  console.log(`PASS: Move Up restored ${symbol0} to index 0.`);

  // 8. Test Colored Watchlist: Hide Up/Down, Show Remove Flag Only
  console.log('8. Verifying Colored Watchlist row actions...');
  // Assign Red flag to symbol0
  await page.getByTestId(`watchlist-flag-${symbol0}`).click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  await page.locator('[data-testid="flag-color-red"]').click();
  await page.waitForTimeout(300);
  // Switch to Red List
  await page.getByLabel('Active watchlist', { exact: true }).selectOption('color:red');
  await page.waitForTimeout(400);
  await expect(page.locator('.watch-row')).toHaveCount(1);

  // In colored list: Up and Down MUST NOT exist
  await expect(page.getByLabel(`Move up ${symbol0}`)).toHaveCount(0);
  await expect(page.getByLabel(`Move down ${symbol0}`)).toHaveCount(0);
  // Remove button must exist with tooltip "Remove flag"
  const coloredRow = page.locator('.watch-row').first();
  await coloredRow.hover();
  const coloredRemove = page.getByLabel(`Remove ${symbol0}`, { exact: true });
  await expect(coloredRemove).toBeVisible();
  assert.equal(await coloredRemove.getAttribute('title'), 'Remove flag');
  console.log('PASS: Colored list hides Up/Down and shows Remove Flag only.');

  // Click remove flag
  await coloredRemove.click();
  await expect(page.locator('.watch-row')).toHaveCount(0);
  console.log('PASS: Remove in colored list clears flag and removes ticker from colored list.');

  // 9. Test Market / System Lists: Up, Down hidden; Remove (X) available to hide ticker
  console.log('9. Verifying System Market List row actions and local hide...');
  await page.getByLabel('Active watchlist', { exact: true }).selectOption('stocks');
  await expect(page.locator('.watch-row').first()).toBeVisible();
  const firstStockSymbol = await page.locator('.watch-row').first().locator('.watch-select > span:first-child > strong').innerText();
  await expect(page.getByLabel(`Move up ${firstStockSymbol}`)).toHaveCount(0);
  await expect(page.getByLabel(`Move down ${firstStockSymbol}`)).toHaveCount(0);
  await expect(page.getByLabel(`Remove ${firstStockSymbol}`)).toHaveCount(1);
  console.log('PASS: System market lists provide Remove (X) while protecting reordering.');

  // 10. Test Context Menu: Create alert option is available
  console.log('10. Verifying Context Menu has Create Alert and proper actions...');
  await page.locator('.watch-row').first().locator('.watch-select').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Instrument actions' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Create alert', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  console.log('PASS: Context menu provides Create Alert.');

  // 11. Test Global Alert Feature Preserved
  console.log('11. Verifying Global Alert Toolbar button works...');
  await page.getByLabel('Create alert from active chart', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create historical alert', exact: true })).toBeVisible();
  await page.getByLabel('Close alert dialog', { exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByLabel('Alerts workspace', { exact: true }).click();
  await expect(page.getByTestId('alerts-page')).toBeVisible();
  await page.getByRole('button', { name: 'Return to charts', exact: true }).click();
  await expect(page.getByTestId('alerts-page')).toBeHidden();
  console.log('PASS: Global Alert feature works properly.');

  // 12. Switch back to favourites and take screenshot with hover
  console.log('12. Capturing screenshot with hover actions on custom watchlist...');
  await page.getByLabel('Active watchlist', { exact: true }).selectOption('favourites');
  await expect(page.locator('.watch-row')).toHaveCount(3);
  const hoverRow = page.locator('.watch-row').filter({ has: page.getByTestId(`watchlist-symbol-${symbol1}`) });
  await hoverRow.hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/watchlist-row-actions.png' });
  console.log('PASS: Saved screenshot to test-results/watchlist-row-actions.png');

  assert.deepEqual(errors, [], 'No uncaught page errors allowed');
  console.log('ALL WATCHLIST ROW ACTIONS TESTS PASSED SUCCESSFULLY!');
} catch (e) {
  if (page && !page.isClosed()) await page.screenshot({ path: 'test-results/watchlist-actions-failure.png' }).catch(() => {});
  throw e;
} finally {
  await app?.close();
}
