import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { chooseWatchlist } from './watchlist-controls.mjs';

await mkdir('test-results', { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'gmt-symbol-search-'));
const app = await electron.launch({
  executablePath: sourceElectron, args: ['.'], timeout: 60000,
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_FAST_SCREENER_UI: '1', IMT_OFFLINE: '1' },
});

try {
  const page = await app.firstWindow();
  const request = path => page.evaluate(path => window.terminal.request(path), path);
  const workspace = () => request('/workspace');
  const flags = async () => (await request('/api/flags')).flags;
  const add = page.getByTestId('watchlist-add-symbol');
  const dialog = page.locator('.search-modal');
  const input = page.getByPlaceholder('Search symbol, company, index or ISIN');
  const close = page.getByRole('button', { name: 'Close search', exact: true });
  const pane = index => page.getByTestId('pane-' + index);
  const lookup = async symbol => {
    await input.fill(symbol);
    const result = page.getByTestId('search-result-' + symbol).first();
    await expect(result).toBeVisible();
    return result;
  };
  const activate = async index => {
    await pane(index).locator('.chart-canvas').click({ position: { x: 260, y: 150 } });
    await expect(pane(index)).toHaveClass(/\bactive\b/);
  };
  const searchChart = async (index, shortcut, symbol) => {
    await activate(index);
    const before = await workspace();
    const beforeFlags = await flags();
    await page.keyboard.press(shortcut);
    await expect(input).toBeVisible();
    const opened = await dialog.getAttribute('aria-label');
    await (await lookup(symbol)).click();
    await expect(dialog).toHaveCount(0);
    const afterSelection = await workspace();
    assert.deepEqual(afterSelection.watchlists, before.watchlists, 'Chart search changed Watchlist membership');
    assert.deepEqual(await flags(), beforeFlags, 'Chart search changed a color flag');
    assert.equal(opened, 'Search stocks and indices');
    await expect.poll(async () => (await workspace()).panes[index].symbol).toBe(symbol);
    const after = await workspace();
    assert.deepEqual(after.panes.filter((_, i) => i !== index), before.panes.filter((_, i) => i !== index));
  };
  const addToWatchlist = async () => {
    await add.click();
    await expect(page.getByRole('dialog', { name: /^Add symbol to / })).toBeVisible();
  };

  await expect(add).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });
  await addToWatchlist();
  await close.click();
  await searchChart(1, 'Meta+k', 'AAPL');

  await addToWatchlist();
  await lookup('MSFT');
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  assert.ok(!(await workspace()).watchlists.find(list => list.id === 'stocks').items.some(row => row.symbol === 'MSFT'));
  await searchChart(0, 'Control+k', 'MSFT');

  await addToWatchlist();
  await (await lookup('MSFT')).click();
  await expect(dialog).toHaveCount(0);
  assert.ok((await workspace()).watchlists.find(list => list.id === 'stocks').items.some(row => row.symbol === 'MSFT'));
  await searchChart(0, 'Meta+k', 'SPY');

  await chooseWatchlist(page, 'color:orange');
  await addToWatchlist();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await searchChart(1, 'Meta+k', 'MSFT');

  await addToWatchlist();
  await (await lookup('AAPL')).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => Object.values(await flags()).find(row => row.symbol === 'AAPL')?.color).toBe('orange');
  await addToWatchlist();
  await page.locator('.modal-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toHaveCount(0);
  await searchChart(1, 'Control+k', 'SPY');

  await chooseWatchlist(page, 'stocks');
  await app.evaluate(() => {
    const fetch = globalThis.fetch;
    globalThis.fetch = (input, options) => {
      if (new URL(String(input)).pathname === '/api/watchlists/mutate' && options?.method === 'POST') {
        globalThis.fetch = fetch;
        return Promise.resolve(Response.json({ detail: 'Fixture Watchlist write failed' }, { status: 409 }));
      }
      return fetch(input, options);
    };
  });
  const beforeFailure = await workspace();
  await addToWatchlist();
  await (await lookup('AAPL')).click();
  await expect(page.getByText('Fixture Watchlist write failed', { exact: true })).toBeVisible();
  assert.deepEqual((await workspace()).watchlists, beforeFailure.watchlists);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await searchChart(0, 'Meta+k', 'AAPL');

  await app.evaluate(() => {
    const fetch = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      if (new URL(String(input)).pathname === '/api/watchlists/mutate' && options?.method === 'POST') {
        globalThis.fetch = fetch;
        await new Promise(resolve => { globalThis.releaseSymbolSearchWrite = resolve; });
      }
      return fetch(input, options);
    };
  });
  await addToWatchlist();
  await (await lookup('SPY')).click();
  await expect.poll(() => app.evaluate(() => typeof globalThis.releaseSymbolSearchWrite)).toBe('function');
  await close.click();
  await activate(1);
  await page.keyboard.press('Meta+k');
  const normalSearch = page.getByRole('dialog', { name: 'Search stocks and indices', exact: true });
  await expect(normalSearch).toBeVisible();
  await app.evaluate(() => globalThis.releaseSymbolSearchWrite());
  await expect.poll(async () => (await workspace()).watchlists.find(list => list.id === 'stocks').items.some(row => row.symbol === 'SPY')).toBe(true);
  await expect(normalSearch).toBeVisible();
  await (await lookup('AAPL')).click();
  await expect.poll(async () => (await workspace()).panes[1].symbol).toBe('AAPL');

  console.log('PASS chart search shortcuts, independent pane targeting, ordinary and flagged search dismissal, successful selection and rejected Watchlist writes.');
} finally {
  await app.close();
}
