import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { openDataProvenance } from './chart-menu-controls.mjs';

const output = 'test-results/index-chart';
const profile = await mkdtemp(join(tmpdir(), 'gmt-index-chart-'));
const env = { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' };
const nifty = 'yahoo:%5ENSEI:NSE:index';
const bank = 'yahoo:%5ENSEBANK:NSE:index';
const errors = [];
let app, page;

const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const canvas = () => page.getByTestId('pane-0').locator('.chart-canvas');
const request = (path, method = 'GET', body) =>
  page.evaluate(([path, method, body]) => window.terminal.request(path, method, body), [path, method, body]);
const workspace = () => request('/workspace');

async function launch() {
  app = await electron.launch({ executablePath: sourceElectron, args: ['.'], env, timeout: 60000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(button('Chart layout')).toBeVisible({ timeout: 45000 });
}

async function chart(identity, interval = '1d') {
  await expect(canvas()).toHaveAttribute('data-history-symbol', identity, { timeout: 30000 });
  await expect(canvas()).toHaveAttribute('data-history-interval', interval, { timeout: 30000 });
  await expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/);
}

async function searchIndex(category, query, ticker, identity, shortcut) {
  if (shortcut) await page.keyboard.press(shortcut);
  else await button('Search stocks and indices').click();
  const search = page.getByRole('dialog', { name: 'Search stocks and indices', exact: true });
  const input = search.getByRole('textbox');
  await expect(input).toBeFocused();
  await expect(search.getByRole('button', { name: 'Search indices', exact: true })).toHaveCount(0);
  const categories = search.getByRole('group', { name: 'Market categories' });
  const rows = await categories.getByRole('button').evaluateAll(items => items.map(item => item.offsetTop));
  assert.ok(rows.length > 1 && rows.every(top => top === rows[0]));
  await button(category, categories).click();
  await input.fill(query);
  const result = search.getByTestId('search-result-' + ticker);
  await expect(result).toBeEnabled({ timeout: 30000 });
  if (shortcut) await result.press('Enter');
  else await result.click();
  await expect(search).toHaveCount(0);
  await chart(identity);
}

try {
  await mkdir(output, { recursive: true });
  await launch();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await expect(page.locator('.chart-pane:visible')).toHaveCount(1);
  const legacy = await workspace();
  legacy.panes[0].comparisons = [{ canonical_id: bank }];
  await request('/workspace', 'PUT', legacy);
  const stored = await workspace();
  assert.ok(!('comparisons' in stored.panes[0]));
  await expect(button('Compare Symbol')).toHaveCount(0);
  await expect(page.getByLabel('Grouped intervals')).toHaveCount(0);
  await expect(page.locator('.timeframe-toolbar button')).toHaveCount(10);

  await searchIndex('IN Indices', 'NIFTY 50', '^NSEI', nifty, 'Meta+k');
  await expect(await openDataProvenance(page)).toContainText(/fixture.*Retrieved/i);
  await expect(page.getByLabel('History source pane 0')).toHaveValue('yahoo');
  await expect(button('Index constituents')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Index details', exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => 'importIndexMembership' in window.terminal), false);
  await assert.rejects(request('/api/indices/membership'), /API operation not allowed/);
  await assert.rejects(request('/api/indices/membership/import', 'POST', {}), /API operation not allowed/);
  await expect(page.getByTestId('pane-0').locator('.ohlc b')).toHaveCount(4);
  await page.screenshot({ path: join(output, 'nifty-data-controls.png') });
  await button('Data controls pane 0').click();

  await button('Active timeframe 1w').click();
  await chart(nifty, '1w');
  await button('Active timeframe 1Y').click();
  await chart(nifty, '1Y');
  await button('Active timeframe 1d').click();
  await chart(nifty);
  await searchIndex('IN Indices', 'NIFTY BANK', '^NSEBANK', bank, 'Control+k');
  await searchIndex('Indices & ETFs', 'S&P 500', '^GSPC', 'yahoo:%5EGSPC:NYSE:index');
  await searchIndex('IN Indices', 'NIFTY 50', '^NSEI', nifty);
  await expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state', 'Saved locally');
  const saved = await workspace();
  assert.equal(saved.panes[0].canonical_id, nifty);
  assert.deepEqual(saved.watchlists, stored.watchlists, 'Normal index chart selection preserves Watchlist membership');

  await app.close();
  await launch();
  await chart(nifty);
  assert.deepEqual((await workspace()).watchlists, saved.watchlists);
  assert.deepEqual(errors, []);
  console.log('PASS native index charts, Yahoo history and timeframe changes, removed UI and IPC, unchanged Watchlists and restart.');
} finally {
  await app?.close();
}
