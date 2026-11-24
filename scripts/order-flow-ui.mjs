import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';

const live = process.argv.includes('--live');
const output = resolve(process.env.GMT_ORDER_FLOW_EVIDENCE || 'test-results');
const profile = await mkdtemp(join(tmpdir(), 'gmt-order-flow-'));
const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(IMT_|GMT_|ELECTRON_RUN_AS_NODE$)/.test(key)));
const environment = live ? {} : { IMT_UI_FIXTURE: '1', IMT_HYPERLIQUID_UI: '1', IMT_STREAM_UI: '1', IMT_OFFLINE: '1' };
const errors = [];
const report = { live, profile, markets: [], watchlistRestored: false, restarted: false, backendStopped: false };
let app, page;
await mkdir(output, { recursive: true });
await mkdir('test-results', { recursive: true });

const launch = async () => {
  app = await electron.launch({
    executablePath: sourceElectron, args: ['.'], timeout: 90000,
    env: { ...inherited, ...environment, IMT_TEST_DATA_DIR: profile },
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByText('DIRECT FETCH', { exact: true })).toBeVisible({ timeout: 60000 });
};
const request = (path, method = 'GET', body) =>
  page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [path, method, body]);
const streamStatus = () => request('/api/streams/status');
const frames = () => request('/api/streams/events?cursor=0&wait=0');
const panel = () => page.getByTestId('order-flow-panel');
const toggle = () => page.getByRole('button', { name: 'Order Flow', exact: true });
const canvas = () => page.getByTestId('pane-0').locator('.chart-canvas');
const screenshot = (name) => page.screenshot({ path: join(output, `order-flow-${live ? 'live' : 'fixture'}-${name}.png`) });
const wait = live ? 90000 : 30000;

async function activate(row) {
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByLabel('Search market').selectOption(row.market_type === 'spot' ? 'crypto_spot' : 'crypto_perpetual');
  await expect(page.locator('.search-caption')).toContainText('verified spot / perpetual catalogue', { timeout: wait });
  const query = page.getByPlaceholder('Search symbol, company, index or ISIN');
  await query.pressSequentially(row.native_id);
  await expect(query).toHaveValue(row.native_id);
  await page.getByTestId('search-result-' + row.canonical_id).click({ timeout: wait });
  await expect(canvas()).toHaveAttribute('data-history-symbol', row.canonical_id, { timeout: wait });
  await expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/, { timeout: wait });
}

async function observe(row, name) {
  await expect(panel()).toHaveAttribute('data-identity', row.canonical_id);
  await expect(panel()).toHaveAttribute('data-book-state', 'Live', { timeout: wait });
  await panel().getByRole('button', { name: 'Order book', exact: true }).click();
  await expect(panel().getByRole('table', { name: 'Observed order book levels' })).toBeVisible();
  await expect(panel().getByTestId('order-flow-depth').getByRole('img')).toBeVisible();
  const state = await frames();
  const book = state.feeds.find(feed => feed.identity === row.canonical_id && feed.feed === 'l2Book').book;
  const bid = Number(book.bids[0].price), ask = Number(book.asks[0].price);
  assert.ok(book.bids.length <= 20 && book.asks.length <= 20);
  assert.ok(bid > 0 && ask >= bid && Math.abs(Number(book.spread) - (ask - bid)) < Math.max(ask * 1e-12, 1e-12));
  assert.ok(Math.abs(Number(book.spread_percent) - 100 * (ask - bid) / ((ask + bid) / 2)) < 1e-7);
  assert.ok(Number(book.bids.at(-1).cumulative) >= Number(book.bids[0].size));
  if (book.bids.length >= 5 && book.asks.length >= 5) {
    const bidSize = Number(book.bids[4].cumulative), askSize = Number(book.asks[4].cumulative);
    assert.ok(Math.abs(Number(book.imbalance) - (bidSize - askSize) / (bidSize + askSize)) < 1e-7);
    await expect(panel().getByTestId('order-flow-imbalance')).toContainText('%');
  }
  if (!live) {
    await expect(panel().getByTestId('order-flow-bid')).toHaveText('200');
    await expect(panel().getByTestId('order-flow-ask')).toHaveText('202');
    await expect(panel().getByTestId('order-flow-spread')).toHaveText('2');
  }
  const metrics = { identity: row.canonical_id, native: row.native_id, source: row.provider,
    depth: [book.bids.length, book.asks.length], provider_timestamp_ms: book.time_ms,
    one_socket: state.status.connection_count === 1 };
  assert.ok(metrics.one_socket);
  await screenshot(name + '-book');
  await panel().getByRole('button', { name: 'Time & Sales', exact: true }).click();
  const table = panel().getByRole('table', { name: 'Public trade prints' });
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: wait });
  await expect(panel()).toHaveAttribute('data-tape-state', 'Live', { timeout: wait });
  const tape = (await frames()).feeds.find(feed => feed.identity === row.canonical_id && feed.feed === 'trades').tape;
  assert.ok(tape.trades.length > 0 && tape.trades.every(entry => Number(entry.price) > 0 && Number(entry.size) >= 0));
  assert.ok(tape.trades.every(entry => !('users' in entry) && !('hash' in entry)));
  metrics.prints_observed = tape.trades.length;
  metrics.provider_print_ms = Math.max(...tape.trades.map(row => row.time_ms));
  await screenshot(name + '-tape');
  report.markets.push(metrics);
}

async function close() {
  const pid = app.process().pid;
  const pids = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    return match && Number(match[2]) === pid && match[3].includes('/backend/') ? [Number(match[1])] : [];
  });
  assert.equal(pids.length, 1);
  await app.close();
  app = undefined;
  await expect.poll(() => pids.some(child => {
    try { process.kill(child, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  }), { timeout: 15000 }).toBe(false);
  report.backendStopped = true;
}

try {
  await launch();
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  await expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/, { timeout: wait });
  await expect(page.getByTestId('pane-0').locator('.chart-overlay')).toHaveCount(0, { timeout: wait });
  if (live) {
    await expect(page.getByTestId('pane-0').locator('.demo-mini').first()).toContainText('Yahoo Finance');
    assert.ok((await request('/api/history/status')).provider_requests > 0);
    report.yahooHistory = true;
  }
  await toggle().click();
  await expect(panel()).toHaveAttribute('data-book-state', 'Unsupported');
  assert.equal((await streamStatus()).order_flow.state, 'inactive');

  const catalogue = await request('/api/hyperliquid/catalogue');
  assert.ok(catalogue.metadata_available, catalogue.error || 'Official Hyperliquid metadata must be available');
  const discover = (q, category) => request(`/api/instruments/discover?q=${encodeURIComponent(q)}&category=${category}`);
  const perpetuals = await discover('BTC', 'crypto_perpetual');
  const spots = await discover(live ? '@107' : 'UBTC', 'crypto_spot');
  const perpetual = perpetuals.results.find(row => row.native_id === 'BTC');
  const spot = spots.results.find(row => row.native_id === (live ? '@107' : '@1'));
  assert.ok(perpetual?.native_mapping, `Verified BTC perpetual missing: ${perpetuals.warning}`);
  assert.ok(spot?.native_mapping, `Verified spot market missing: ${spots.warning}`);
  if (!live) {
    await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
    const workspace = await request('/workspace');
    const created = await request('/api/watchlists/mutate', 'POST', {
      action: 'create', name: 'Order Flow test', revision: workspace.watchlist_revision,
    });
    await request('/api/watchlists/mutate', 'POST', {
      action: 'add', id: created.active_watchlist, instrument: perpetual.canonical_id, revision: created.watchlist_revision,
    });
    await page.reload();
    await expect(toggle()).toBeVisible({ timeout: wait });
  }
  await activate(perpetual);
  await expect(page.getByTestId('stream-status-0')).toHaveAttribute('data-state', 'live', { timeout: wait });
  const before = await request('/api/history/status');
  if (!await panel().isVisible()) await toggle().click();
  await observe(perpetual, 'perpetual');
  if (!live) {
    const after = await request('/api/history/status');
    assert.equal(after.hyperliquid.rest.candle_requests, before.hyperliquid.rest.candle_requests);
    assert.equal((await frames()).feeds.find(feed => feed.identity === perpetual.canonical_id && feed.feed === 'trades').refs, 2);
    const generation = (await streamStatus()).generation;
    await request('/api/streams/lifecycle', 'POST', { suspended: true });
    await expect(panel()).toHaveAttribute('data-tape-state', 'Suspended');
    await request('/api/streams/lifecycle', 'POST', { suspended: false });
    await expect.poll(async () => (await streamStatus()).generation, { timeout: wait }).toBeGreaterThan(generation);
    await expect(panel()).toHaveAttribute('data-tape-state', 'Live', { timeout: wait });
    await expect(panel().getByText(/Tape interrupted at/)).toBeVisible();
    report.reconnected = true;
  }

  await activate(spot);
  await observe(spot, 'spot');
  await expect.poll(async () => (await frames()).feeds.filter(feed => feed.feed === 'l2Book').map(feed => feed.identity)).toEqual([spot.canonical_id]);
  await panel().getByRole('button', { name: 'Close Order Flow' }).click();
  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible();
  await expect(toggle()).toBeFocused();
  await expect.poll(async () => (await streamStatus()).order_flow.state).toBe('inactive');
  await expect.poll(async () => (await frames()).feeds.some(feed => feed.feed === 'l2Book' || feed.tape)).toBe(false);
  report.watchlistRestored = true;
  assert.deepEqual(errors, []);
  if (!live) {
    await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
    const saved = await request('/workspace');
    await close();
    await launch();
    await expect(toggle()).toBeVisible({ timeout: wait });
    assert.deepEqual(await request('/workspace'), saved);
    await expect(panel()).toHaveCount(0);
    report.restarted = true;
  }
  await close();
  assert.deepEqual(errors, []);
  console.log('PASS Order Flow', JSON.stringify(report));
} catch (error) {
  if (page && !page.isClosed()) await screenshot('failure');
  throw error;
} finally {
  if (app) await app.close();
  await writeFile(join(output, `order-flow-${live ? 'live' : 'fixture'}-verification.json`),
    JSON.stringify({ ...report, rendererErrors: errors }, null, 2) + '\n', { mode: 0o600 });
}
