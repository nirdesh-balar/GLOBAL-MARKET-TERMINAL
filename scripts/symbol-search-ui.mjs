import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { chooseWatchlist } from './watchlist-controls.mjs';
import { traceSymbolSearch } from './symbol-search-trace.mjs';

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

  const trace = await traceSymbolSearch(app, page);
  try {
    const canvas = pane(1).locator('.chart-canvas');
    await expect(canvas).toHaveAttribute('data-history-symbol', 'yahoo:AAPL:NASDAQ:equity');
    const history = async () => {
      const status = await request('/api/history/status');
      return { requests: status.history_requests, yahoo: status.provider_requests,
        hyperliquid: status.hyperliquid?.rest.candle_requests ?? 0 };
    };
    await expect.poll(async () => {
      const status = await request('/api/history/status');
      return status.active + status.queued;
    }).toBe(0);
    const before = await history();
    const filter = name => dialog.getByRole('button', { name, exact: true });
    const results = dialog.locator('.search-results');
    const result = symbol => results.getByTestId('search-result-' + symbol);
    await page.keyboard.press('Meta+k');
    await expect(input).toBeFocused();
    await filter('Indices & ETFs').click();
    await expect(result('^NSEI')).toBeEnabled();

    await trace.hold('AAPL');
    await filter('Stocks').click();
    await input.fill('A');
    await input.fill('AAP');
    await input.fill('AAPL');
    await trace.mark('assertion-loading', { query: 'AAPL' });
    await expect.poll(() => trace.waiting('AAPL')).toBe(true);
    await expect(results).toHaveAttribute('aria-busy', 'true');
    const stale = filter('Favourite ^NSEI');
    await expect(result('^NSEI')).toBeDisabled();
    await expect(stale).toBeDisabled();
    await input.press('Enter');
    await expect(dialog).toBeVisible();
    assert.deepEqual(await history(), before);

    await filter('IN Indices').click();
    await filter('Stocks').click();
    await input.fill('MSFT');
    await expect(result('MSFT')).toBeEnabled();
    await expect(result('AAPL')).toHaveCount(0);
    await trace.release('AAPL');
    await expect.poll(async () => (await trace.main()).filter(event =>
      event.query === 'AAPL' && event.event === 'request-delivered').length).toBe(1);
    await expect.poll(() => page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => resolve(document.querySelector('.search-results .result-main:enabled')?.dataset.testid))))).toBe('search-result-MSFT');
    await expect(result('AAPL')).toHaveCount(0);

    // Hold one live loopback request until the renderer sends its cancel IPC.
    await app.evaluate(() => {
      const fetch = globalThis.fetch;
      globalThis.fetch = (input, options) => {
        const url = new URL(String(input));
        if (url.pathname !== '/api/instruments/discover' || url.searchParams.get('q') !== 'TSLA') {
          return fetch(input, options);
        }
        globalThis.fetch = fetch;
        globalThis.gmtSearchTrace.cancelReady = true;
        return new Promise((_, reject) => {
          const signal = options.signal;
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      };
    });
    await input.fill('TSLA');
    await expect.poll(() => app.evaluate(() => Boolean(globalThis.gmtSearchTrace.cancelReady))).toBe(true);
    await trace.hold('NVDA', true);
    await input.fill('NVDA');
    await expect.poll(() => trace.waiting('NVDA')).toBe(true);
    await expect.poll(async () => (await trace.main()).some(event =>
      event.query === 'TSLA' && event.event === 'request-complete' && event.error === 'cancelled')).toBe(true);
    await trace.release('NVDA');
    await expect(results.locator('.error')).toHaveText('Fixture discovery failed');
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(result('MSFT')).toHaveCount(0);

    await input.fill('MSFT');
    await expect(result('MSFT')).toBeEnabled();
    await expect(results.locator('.error')).toHaveCount(0);
    await filter('IN Indices').click();
    await input.fill('NIFTY BANK');
    await expect(result('^NSEBANK')).toBeEnabled();
    await input.fill('NIFTY 50');
    await expect(result('^NSEI')).toBeEnabled();
    await trace.mark('assertion-ready', { query: 'NIFTY 50' });
    assert.deepEqual(await history(), before, 'Discovery and cancellation do not request chart history');
    await input.press('ArrowDown');
    await input.press('ArrowUp');
    await input.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-history-symbol', 'yahoo:%5ENSEI:NSE:index');
    await trace.mark('assertion-selected', { query: 'NIFTY 50' });

    const events = await trace.timeline();
    const latest = events.find(event => event.query === 'MSFT' && event.event === 'request-delivered');
    const obsolete = events.find(event => event.query === 'AAPL' && event.event === 'request-delivered');
    assert.equal(latest.category, 'all_equities');
    assert.ok(events.indexOf(latest) < events.indexOf(obsolete), 'The held AAPL reply arrived after MSFT');
    assert.ok(events.some(event => event.event === 'debounce-cancelled'));
    assert.ok(events.some(event => event.query === 'TSLA' && event.event === 'request-cancel'));
  } finally {
    await writeFile('test-results/symbol-search-timeline.json', JSON.stringify(await trace.timeline(), null, 2) + '\n');
  }

  console.log('PASS chart search shortcuts, independent pane targeting, ordinary and flagged search dismissal, Watchlist writes, search debounce and cancellation, stale response rejection, error recovery and exact chart selection.');
} finally {
  try { await app.close(); } finally { await rm(profile, { recursive: true, force: true }); }
}
