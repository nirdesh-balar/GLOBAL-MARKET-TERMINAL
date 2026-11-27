import { openWatchlistOptions } from './watchlist-controls.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';

const profile = await mkdtemp(join(tmpdir(), 'gmt-chart-grid-'));
const results = 'test-results';
await mkdir(results, { recursive: true });
const launch = () => electron.launch({
  executablePath: sourceElectron,
  args: ['.'],
  env: {
    ...process.env, IMT_OFFLINE: '1', IMT_UI_FIXTURE: '1', IMT_FAST_SCREENER_UI: '1',
    IMT_HYPERLIQUID_UI: '1', IMT_TEST_DATA_DIR: profile,
  },
  timeout: 60000,
});
let app;
let page;
const errors = [];
const evidence = { cold: [], warm: [], lifecycleCycles: 20 };
const request = (path, method = 'GET', body) =>
  page.evaluate(([path, method, body]) => window.terminal.request(path, method, body), [path, method, body]);
const workspace = () => request('/workspace');
const status = () => request('/api/history/status');
const tiles = () => page.getByTestId('grid-card');
const charts = () => page.locator('[data-testid="grid-chart"][data-rendered-bars]:not([data-rendered-bars="0"])');
const shell = () => page.getByTestId('chart-grid-workspace');
const button = name => page.getByRole('button', { name, exact: true });
const nav = name => page.getByRole('button', { name: name + ' workspace', exact: true });
const back = () => shell().getByRole('button', { name: 'Charts', exact: true }).click();
const ready = async count => {
  await expect(tiles()).toHaveCount(count);
  await expect(charts()).toHaveCount(count, { timeout: 45000 });
};
const waitForApp = async () => {
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('button', {name:'Charts by TradingView',exact:true})).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });
};
async function measure(control, eventName, action, kind, count, label) {
  await control.evaluate((node, { eventName, count }) => {
    node.addEventListener(eventName, () => {
      const start = performance.now();
      window.gridMeasurement = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { observer.disconnect(); reject(Error('Grid render timeout')); }, 45000);
        const observer = new MutationObserver(() => {
          const canvases = document.querySelectorAll('[data-testid="grid-chart"][data-rendered-bars]:not([data-rendered-bars="0"])');
          if (canvases.length !== count) return;
          observer.disconnect();
          requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve(performance.now() - start);
          });
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-rendered-bars'] });
      });
    }, { capture: true, once: true });
  }, { eventName, count });
  const before = await status();
  await action();
  await ready(count);
  const ms = await page.evaluate(() => window.gridMeasurement);
  const after = await status();
  const yahooDelta = after.provider_requests - before.provider_requests;
  const cryptoDelta = after.hyperliquid.rest.requests - before.hyperliquid.rest.requests;
  evidence[kind].push({
    label, ms: Number(ms.toFixed(1)), chart_instances: await charts().count(),
    provider_delta: yahooDelta + cryptoDelta, yahoo_delta: yahooDelta, hyperliquid_delta: cryptoDelta,
    history_delta: after.history_requests - before.history_requests,
    cache_hit_delta: after.cache_hits - before.cache_hits,
  });
  if (kind === 'warm') assert.equal(yahooDelta + cryptoDelta, 0);
}

try {
  app = await launch();
  await waitForApp();
  const original = await workspace();
  assert.equal(original.chart_grid.cards.length, 0);
  const universes = await request('/api/screener/universes');
  const rows = universes.flatMap(universe => universe.symbols);
  const stock = symbol => rows.find(row => row.symbol === symbol || row.base_symbol === symbol);
  const equities = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'AAPL', 'MSFT', 'RKFAL'].map(stock);
  assert.ok(equities.every(Boolean), 'Official and bundled fixtures contain the required instruments');
  const discovered = await request('/api/instruments/discover?category=crypto_perpetual&q=BTC');
  const btc = discovered.results.find(row => row.kind === 'crypto' && row.symbol === 'BTC');
  assert.ok(btc?.canonical_id?.startsWith('hyperliquid:'));
  const list = [...equities.slice(0, 2), { ...btc, instrument_id: btc.id }, ...equities.slice(2)];
  const newWorkspace = {
    ...original, active_watchlist: 'grid-fixture', sidebar: { ...original.sidebar, sort: 'manual' },
    watchlists: [...original.watchlists, { id: 'grid-fixture', name: 'Grid fixture', items: list }],
  };
  await request('/workspace', 'PUT', newWorkspace);
  await page.reload();
  await waitForApp();
  const beforeGrid = await workspace();

  await nav('Chart Grid').click();
  await expect(shell()).toBeVisible();
  await expect(shell().getByText('Your Chart Grid is empty')).toBeVisible();
  await back();

  const watchlist = page.getByTestId('watchlist-sidebar');
  await openWatchlistOptions(page);
  const watchlistGrid = page.getByRole('button', { name: 'Watchlist Chart Grid actions', exact: true });
  await watchlistGrid.focus();
  await watchlistGrid.press('Enter');
  await expect(button('Open watchlist in Grid')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(watchlistGrid).toBeFocused();
  await watchlistGrid.press('Enter');
  await page.getByRole('button', { name: 'Select symbols', exact: true }).click();
  for (const row of list.slice(0, 2)) {
    await watchlist.getByRole('checkbox', { name: 'Select ' + row.symbol + ' for Chart Grid', exact: true }).check();
  }
  await openWatchlistOptions(page);
  await watchlistGrid.click();
  await button('Open selected (2) in Grid').click();
  await ready(2);
  assert.deepEqual(await tiles().evaluateAll(nodes => nodes.map(node => node.dataset.gridId)), list.slice(0, 2).map(row => row.canonical_id));
  await back();

  await openWatchlistOptions(page);
  await watchlistGrid.click();
  const openWatchlist = button('Open watchlist in Grid');
  await measure(openWatchlist, 'click', () => openWatchlist.click(), 'cold', 8, 'daily source first page');
  await expect(shell().getByText('Page 1 / 2')).toBeVisible();
  await expect(shell().locator('#tv-attr-logo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Charts by TradingView', exact: true })).toBeVisible();
  await expect(shell().getByText('11 symbols')).toBeVisible();
  assert.deepEqual(await tiles().evaluateAll(nodes => nodes.map(node => node.dataset.gridId)), list.slice(0, 8).map(row => row.canonical_id));
  const global = page.getByLabel('Global Chart Grid timeframe');
  for (const timeframe of ['5m', '1w', '1M']) {
    // The same cards are reused but the old canvases must be cleared before new
    // results can mount. The benchmark observer sees that committed transition.
    await measure(global, 'change', () => global.selectOption(timeframe), 'cold', 8, 'new timeframe ' + timeframe);
    assert.deepEqual(await tiles().evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.timeframe))]), [timeframe]);
  }

  const rendererMemory = async () => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.detach();
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
    return metrics.find(row => row.type === 'Tab')?.memory?.workingSetSize / 1024;
  };
  const baselineMiB = await rendererMemory();
  const gridNav = nav('Chart Grid');
  for (let i = 0; i < evidence.lifecycleCycles; i++) {
    await back();
    await expect(tiles()).toHaveCount(0);
    await expect(charts()).toHaveCount(0);
    if (i < 5) await measure(gridNav, 'click', () => gridNav.click(), 'warm', 8, 'workspace return ' + (i + 1));
    else { await gridNav.click(); await ready(8); }
  }
  evidence.renderer_mib = { before: baselineMiB, after: await rendererMemory() };
  assert.ok(Object.values(evidence.renderer_mib).every(Number.isFinite));

  await page.getByLabel('Next Grid page').click();
  await expect(tiles()).toHaveCount(3);
  await expect(tiles().filter({ has: page.getByText(/Yahoo has no available history/) })).toHaveCount(1, { timeout: 45000 });
  await expect(charts()).toHaveCount(2);
  const previous = page.getByLabel('Previous Grid page');
  await measure(previous, 'click', () => previous.click(), 'warm', 8, 'return to first page');


  const first = tiles().first();
  const firstId = await first.getAttribute('data-grid-id');
  const savedCanvas = await first.getByTestId('grid-chart').elementHandle();
  await first.getByRole('button', { name: /^Maximize / }).click();
  await ready(1);
  assert.ok(await savedCanvas.evaluate(node => node.isConnected));
  await expect(first).toHaveAttribute('data-grid-id', firstId);
  await page.keyboard.press('Escape');
  await ready(8);
  assert.ok(await savedCanvas.evaluate(node => node.isConnected));
  await expect(first.getByRole('button', { name: /^Maximize / })).toBeFocused();
  await first.getByRole('button', { name: 'SMA', exact: true }).click();
  await first.getByRole('button', { name: 'EMA', exact: true }).click();
  await first.getByRole('combobox').selectOption('1d');
  await expect(first).toHaveAttribute('data-timeframe', '1d');
  await ready(8);

  const fixture = await request('/api/history?' + new URLSearchParams({ symbol: firstId, interval: '1d' }));
  await app.evaluate((_, { firstId, fixture }) => {
    const original = globalThis.fetch;
    const probe = globalThis.chartGridProbe = { started: [], canceled: 0, active: 0, peak: 0 };
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      if (url.pathname !== '/api/history' || url.searchParams.get('priority') !== '1') return original(input, options);
      const interval = url.searchParams.get('interval');
      probe.peak = Math.max(probe.peak, ++probe.active);
      try {
        if (url.searchParams.get('symbol') !== firstId || !['1h', '15m', '30m'].includes(interval)) {
          return await original(input, options);
        }
        probe.started.push(interval);
        if (interval === '1h') {
          await new Promise((resolve, reject) => {
            const signal = options.signal;
            signal.addEventListener('abort', () => { probe.canceled++; reject(signal.reason); }, { once: true });
          });
        }
        return Response.json({ ...fixture, interval, stale: interval === '30m', candles: interval === '15m' ? [] : fixture.candles });
      } finally { probe.active--; }
    };
  }, { firstId, fixture });

  const timeframeControl = first.getByRole('combobox');
  await timeframeControl.selectOption('1h');
  await expect.poll(() => app.evaluate(() => globalThis.chartGridProbe.started)).toContain('1h');
  await timeframeControl.selectOption('15m');
  await expect(first).toHaveAttribute('data-status', 'empty');
  await expect(first.getByText('No candles available')).toBeVisible();
  await expect.poll(() => app.evaluate(() => globalThis.chartGridProbe.canceled)).toBe(1);
  await timeframeControl.selectOption('30m');
  await expect(first).toHaveAttribute('data-status', 'stale');
  await expect(first.getByText(/Stale ·/)).toBeVisible();
  await timeframeControl.selectOption('1d');
  await ready(8);
  evidence.cancellation = await app.evaluate(() => globalThis.chartGridProbe.canceled);

  await page.setViewportSize({ width: 1280, height: 800 });
  const columns = () => page.locator('.grid-tiles').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  assert.equal(await columns(), 4);
  assert.ok(await shell().evaluate(node => node.scrollWidth <= node.clientWidth));
  await page.getByLabel('Chart Grid columns').selectOption('3');
  assert.equal(await columns(), 3);
  await page.getByLabel('Chart Grid card size').selectOption('comfortable');
  await expect(page.locator('.grid-tiles')).toHaveAttribute('data-grid-size', 'comfortable');
  await page.getByLabel('Chart Grid card size').selectOption('compact');
  await page.getByLabel('Chart Grid columns').selectOption('4');
  await page.screenshot({ path: results + '/chart-grid-dark.png' });
  await page.getByLabel('Toggle Chart Grid theme').click();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-light/);
  await page.screenshot({ path: results + '/chart-grid-light.png' });
  await page.getByLabel('Toggle Chart Grid theme').click();
  await page.getByPlaceholder('Filter symbols').fill('BTC');
  await expect(tiles()).toHaveCount(1);
  await expect(tiles().first()).toHaveAttribute('data-grid-id', btc.canonical_id);
  await page.getByPlaceholder('Filter symbols').clear();
  await ready(8);
  evidence.native_history_peak = await app.evaluate(() => globalThis.chartGridProbe.peak);
  assert.equal(evidence.native_history_peak, 2);

  await first.getByRole('button', { name: /^Change symbol/ }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN').fill('Berkshire');
  await page.getByTestId('search-result-BRK-B').click();
  await expect(first).toHaveAttribute('data-grid-id', stock('BRK-B').canonical_id);
  await expect(first).toHaveAttribute('data-timeframe', '1d');
  await ready(8);
  assert.deepEqual((await workspace()).panes, beforeGrid.panes);
  await expect.poll(async () => (await workspace()).chart_grid.cards[0].canonical_id).toBe(stock('BRK-B').canonical_id);
  const persisted = await workspace();
  await app.close();
  app = await launch();
  await waitForApp();
  assert.deepEqual((await workspace()).panes, persisted.panes);
  assert.deepEqual((await workspace()).watchlists, persisted.watchlists);
  await nav('Chart Grid').click();
  await ready(8);
  await expect(tiles().first()).toHaveAttribute('data-grid-id', stock('BRK-B').canonical_id);
  await expect(tiles().first().getByRole('button', { name: 'EMA', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await back();

  await nav('Screener').click();
  await page.getByLabel('Screener selection mode', { exact: true }).selectOption('symbols');
  await page.getByLabel('Screener symbols', { exact: true }).selectOption(list.filter(row => row.kind !== 'crypto').slice(0, 3).map(row => row.canonical_id));
  await page.getByLabel('Screener batch size', { exact: true }).fill('3');
  await button('Run scan').click();
  await expect(page.getByTestId('scan-state')).toHaveText('COMPLETED', { timeout: 45000 });
  await page.getByRole('checkbox', { name: 'Select ' + list[0].symbol + ' result for Chart Grid', exact: true }).check();
  await button('Open selected (1) in Chart Grid').click();
  await ready(1);
  await expect(tiles().first()).toHaveAttribute('data-grid-id', list[0].canonical_id);
  await back();
  await nav('Screener').click();
  await page.getByLabel('Filter screener results').fill('TCS');
  await button('Open filtered (1) in Chart Grid').click();
  await ready(1);
  await expect(tiles().first()).toHaveAttribute('data-grid-id', list[1].canonical_id);
  await tiles().first().getByRole('button', { name: /^Open .* in Charts$/ }).click();
  await expect(shell()).toHaveCount(0);
  await expect.poll(async () => (await workspace()).panes[0].canonical_id).toBe(list[1].canonical_id);

  evidence.max_charts = Math.max(...[...evidence.cold, ...evidence.warm].map(sample => sample.chart_instances));
  assert.deepEqual(errors, []);
  console.log('PASS Grid workspace handoffs, navigation, responsive layout, themes, charts, pagination, cache, failure, persistence and disposal. ' + JSON.stringify(evidence));
  await writeFile(results + '/chart-grid-performance.json', JSON.stringify(evidence, null, 2) + '\n');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: results + '/chart-grid-failure.png' }).catch(() => {});
  console.error('Grid evidence before failure:', JSON.stringify(evidence), errors);
  throw error;
} finally {
  await app?.close();
}
