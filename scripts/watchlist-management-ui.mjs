import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { chooseWatchlist, openWatchlistOptions, watchlistManagement } from './watchlist-controls.mjs';

const output = resolve(process.env.GMT_WATCHLIST_EVIDENCE || 'test-results');
const profile = await mkdtemp(join(tmpdir(), 'gmt-watchlist-management-'));
await mkdir(output, { recursive: true });
let app, page;
const errors = [];
const sidebar = () => page.getByTestId('watchlist-sidebar');
const trigger = () => page.getByTestId('watchlist-dropdown');
const button = name => page.getByRole('button', { name, exact: true });
const request = (path, method = 'GET', body) => page.evaluate(
  ([route, verb, data]) => window.terminal.request(route, verb, data), [path, method, body],
);
const workspace = () => request('/workspace');
const shot = name => page.screenshot({ path: join(output, 'management-' + name + '.png') });

async function launch() {
  app = await electron.launch({
    executablePath: sourceElectron, args: ['.'], timeout: 60000,
    env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_REFRESH_UI: '1', IMT_OFFLINE: '1' },
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(sidebar()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });
}
async function submitName(action, dialog, name) {
  await (await watchlistManagement(page, action)).click();
  await expect(page.getByRole('dialog', { name: dialog, exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Watchlist name' }).fill(name);
  await button('Save watchlist').click();
  await expect(page.getByRole('dialog', { name: dialog, exact: true })).toBeHidden();
}
async function deleteFromMenu(name) {
  await (await watchlistManagement(page, 'Delete list…')).click();
  const dialog = page.getByRole('dialog', { name: 'Delete watchlist?' });
  await expect(dialog).toContainText(name);
  await button('Confirm delete watchlist').click();
  await expect(dialog).toBeHidden();
}

try {
  await launch();
  await expect(trigger()).toHaveText('Indian Stocks');
  await expect(page.locator('.watch-row[data-quote-state="ready"]')).toHaveCount(8, { timeout: 45000 });
  const initial = await workspace();
  const stocks = initial.watchlists.find(list => list.id === 'stocks');
  const stock = stocks.items[0];
  const row = sidebar().locator('.watch-row').first();
  const largeType = await sidebar().evaluate(panel => {
    const selector = key => panel.querySelector(key);
    const width = element => element.clientWidth;
    const size = key => parseFloat(getComputedStyle(selector(key)).fontSize);
    const fits = key => {
      const nodes = [...panel.querySelectorAll(key)];
      return nodes.every(element => element.scrollWidth <= width(element) + 1);
    };
    return {
      title: size('.watchlist-title'),
      symbol: size('.watch-select > span:first-child strong'),
      last: size('.quote-number'),
      change: size('.watch-num-change strong'),
      percent: size('.watch-change strong'),
      heading: size('.watch-col-symbol'),
      allNumbersFit: fits('.quote-number, .watch-num-change strong, .watch-change strong'),
      allSymbolsFit: fits('.watch-select > span:first-child strong'),
    };
  });
  assert.deepEqual(largeType, {
    title: 15, symbol: 13, last: 13, change: 13, percent: 13, heading: 12,
    allNumbersFit: true, allSymbolsFit: true,
  });
  assert.equal((await row.boundingBox()).height, 30);
  await shot('larger-text');
  await trigger().click();
  const selector = page.getByRole('group', { name: 'Choose watchlist' });
  for (const name of ['Rename…', 'Make a copy…', 'Delete list…']) {
    await expect(selector.getByRole('button', { name, exact: true })).toBeEnabled();
  }
  assert.equal(await selector.getByTestId('watchlist-choice-stocks').evaluate(el => getComputedStyle(el).fontSize), '14px');
  await shot('indian-stocks-actions');
  await page.keyboard.press('Escape');

  await openWatchlistOptions(page);
  const options = page.getByRole('group', { name: 'Watchlist options' });
  await expect(options.getByText(/List management|Manage current list|Create new list|Rename…|Make a copy|Delete list/)).toHaveCount(0);
  for (const name of ['Filter this watchlist', 'Refresh watchlist prices', 'Import watchlist CSV', 'Export watchlist', 'Watchlist Chart Grid actions']) {
    await expect(options.getByRole('button', { name, exact: true })).toBeVisible();
  }
  for (const name of ['Open symbol in pane', 'Watchlist sort', 'Watchlist volume', 'Group by market']) {
    await expect(options.getByLabel(name, { exact: true })).toBeVisible();
  }
  await shot('clean-overflow');
  await options.getByLabel('Group by market').check();
  await page.keyboard.press('Escape');
  await button('Stocks').click();

  await submitName('Rename…', 'Rename watchlist', 'Indian Shares');
  await expect(trigger()).toHaveText('Indian Shares');
  await expect(trigger()).toHaveAttribute('data-active-list', 'stocks');
  await submitName('Make a copy…', 'Copy watchlist', 'Indian Shares copy');
  const copied = await workspace();
  const copyId = copied.active_watchlist;
  assert.notEqual(copyId, 'stocks');
  assert.deepEqual(copied.watchlists.find(list => list.id === copyId).items, stocks.items);
  assert.deepEqual(copied.sidebar.groups[copyId], ['stocks']);
  await button('Stocks').click();
  await page.getByTestId('watchlist-flag-' + stock.symbol).click();
  await page.getByTestId('flag-color-orange').click();
  await expect.poll(async () => (await request('/api/flags')).flags[stock.canonical_id]?.color).toBe('orange');
  await chooseWatchlist(page, 'color:orange');
  await expect(await watchlistManagement(page, 'Delete list…')).toBeDisabled();
  await page.keyboard.press('Escape');
  await submitName('Make a copy…', 'Copy watchlist', 'Orange snapshot');
  const snapshot = await workspace();
  assert.deepEqual(snapshot.watchlists.find(list => list.id === snapshot.active_watchlist).items.map(item => item.canonical_id), [stock.canonical_id]);

  await chooseWatchlist(page, 'indices');
  await submitName('Rename…', 'Rename watchlist', 'India Indices');
  await chooseWatchlist(page, 'stocks');
  await (await watchlistManagement(page, 'Delete list…')).click();
  await expect(page.getByRole('dialog', { name: 'Delete watchlist?' })).toContainText('Indian Shares');
  await button('Cancel').click();
  await expect(trigger()).toHaveAttribute('data-active-list', 'stocks');
  await deleteFromMenu('Indian Shares');
  const midway = await workspace();
  assert.ok(!midway.watchlists.some(list => list.id === 'stocks'));
  assert.equal(midway.watchlists.find(list => list.id === 'indices').name, 'India Indices');
  assert.deepEqual(midway.watchlists.find(list => list.id === copyId).items, stocks.items);
  assert.equal((await request('/api/flags')).flags[stock.canonical_id].color, 'orange');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await app.close();
  await launch();
  assert.ok(!(await workspace()).watchlists.some(list => list.id === 'stocks'));

  const remaining = (await workspace()).watchlists;
  let revision = (await workspace()).watchlist_revision;
  for (const list of remaining.slice(1)) {
    const result = await request('/api/watchlists/mutate', 'POST', { action: 'delete', id: list.id, confirm: true, revision });
    revision = result.watchlist_revision;
  }
  await page.reload();
  await expect(trigger()).toHaveAttribute('data-active-list', remaining[0].id);
  await deleteFromMenu(remaining[0].name);
  await expect(sidebar().getByText('No ordinary watchlists yet.')).toBeVisible();
  await expect(sidebar().getByRole('button', { name: 'Create new list', exact: true })).toBeVisible();
  await shot('empty-list');
  assert.deepEqual((await workspace()).watchlists, []);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await app.close();
  await launch();
  await expect(sidebar().getByText('No ordinary watchlists yet.')).toBeVisible();
  assert.deepEqual((await workspace()).panes, initial.panes);
  assert.equal((await request('/api/flags')).flags[stock.canonical_id].color, 'orange');

  await sidebar().getByRole('button', { name: 'Create new list', exact: true }).click();
  await page.getByRole('textbox', { name: 'Watchlist name' }).fill('Fresh list');
  await button('Save watchlist').click();
  await expect(trigger()).toHaveText('Fresh list');
  assert.equal((await workspace()).watchlists.length, 1);

  const handle = page.getByRole('separator', { name: 'Resize watchlist' });
  for (let index = 0; index < 7; index++) await handle.press('ArrowRight');
  const metrics = await page.getByTestId('watchlist-rows').evaluate(el => ({
    visible: el.clientWidth, scrollable: el.scrollWidth, header: getComputedStyle(el.querySelector('.watch-columns')).position,
  }));
  assert.ok(metrics.scrollable >= 318 && metrics.visible < metrics.scrollable);
  assert.equal(metrics.header, 'sticky');
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'watchlist-management-verification.json'), JSON.stringify({ profile, largeType, metrics }, null, 2));
  console.log('PASS larger type and narrow-column scrolling, cleaned overflow, built-in and flagged copy, stable rename, confirmed deletion, empty state and restart.');
} catch (error) {
  if (page && !page.isClosed()) await shot('failure');
  throw error;
} finally {
  await app?.close();
}
