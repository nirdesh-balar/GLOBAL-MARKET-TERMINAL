import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { openWatchlistOptions } from './watchlist-controls.mjs';

const output = resolve(process.env.GMT_PERFORMANCE_OUTPUT || 'test-results/stage2a');
await mkdir(output, { recursive: true });
await mkdir('test-results', { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'gmt-performance-diagnostics-'));
const baseline = process.argv.includes('--baseline');
const expectedRevision = process.env.GITHUB_ACTIONS === 'true' ? process.env.GITHUB_SHA : null;
if (process.env.GITHUB_ACTIONS === 'true') assert.match(expectedRevision ?? '', /^[a-f0-9]{40}$/);
const report = { baseline, overhead: [], stream: [] };
const errors = [];
let app, page, cdp;
const button = name => page.getByRole('button', { name, exact: true });
const readings = () => page.getByTestId('performance-readings');
const summary = () => page.getByText('Performance diagnostics', { exact: true });
const canvas = () => page.getByTestId('pane-0').locator('.chart-canvas');
const settings = () => page.getByRole('dialog', { name: 'Terminal settings' });
const request = (path, method = 'GET', body) =>
  page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [path, method, body]);
const screenshot = name => page.screenshot({ path: join(output, name + '.png') });
const metric = label => readings().getByText(label, { exact: true }).locator('..').locator('dd');
const stream = () => request('/api/streams/status');
const sampledCalls = () => app.evaluate(() => globalThis.performanceSampleCalls);
const openSettings = async () => {
  if (await button('Application settings').isVisible()) await button('Application settings').click();
  else {
    await page.getByLabel('More chart options', { exact: true }).click();
    await button('Settings').click();
  }
  await expect(settings()).toBeVisible();
};
const history = async () => {
  const status = await request('/api/history/status');
  return { yahoo: status.provider_requests, crypto: status.hyperliquid.rest.candle_requests,
    history: status.history_requests };
};
const settled = () => expect.poll(async () => {
  const { active, queued } = await request('/api/history/status');
  return active + queued;
}).toBe(0);
async function launch() {
  app = await electron.launch({ executablePath: sourceElectron, args: ['.'], timeout: 60000,
    env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1',
      IMT_HYPERLIQUID_UI: '1', IMT_STREAM_UI: '1', IMT_FAST_SCREENER_UI: '1' } });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(button('Chart layout')).toBeVisible({ timeout: 45000 });
  await expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/);
  if (baseline) return;
  await app.evaluate(({ ipcMain }) => {
    const handler = ipcMain._invokeHandlers.get('performance-diagnostics');
    globalThis.performanceSampleCalls = 0;
    ipcMain.removeHandler('performance-diagnostics');
    ipcMain.handle('performance-diagnostics', (...args) => {
      globalThis.performanceSampleCalls++;
      return handler(...args);
    });
  });
}
async function close() {
  const parent = app.process().pid;
  const children = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
    .split('\n').flatMap(line => {
      const row = /^(\d+)\s+(\d+)\s+(.+)$/.exec(line.trim());
      return row && +row[2] === parent && row[3].includes('/backend/tests/fixture_launcher.py') ? [+row[1]] : [];
    });
  assert.equal(children.length, 1, 'The isolated Electron process owns one fixture backend');
  await app.close();
  app = undefined;
  await expect.poll(() => {
    try { process.kill(children[0], 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  }, { timeout: 15000 }).toBe(false);
}
async function resources() {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const values = Object.fromEntries(metrics.map(item => [item.name, item.value]));
  const pids = await app.evaluate(({ app, BrowserWindow }) => ({
    main: process.pid, renderer: BrowserWindow.getAllWindows()[0].webContents.getOSProcessId(),
    appPids: app.getAppMetrics().map(row => row.pid),
  }));
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,time='], { encoding: 'utf8' })
    .trim().split('\n').map(line => line.trim().split(/\s+/));
  const row = pid => rows.find(parts => Number(parts[0]) === pid);
  const memory = item => item ? 1024 * Number(item[2]) : null;
  const seconds = item => item?.[3].split(':').reduce((total, unit) => total * 60 + Number(unit), 0);
  const children = rows.filter(parts => Number(parts[1]) === pids.main);
  const backend = children.find(parts => !pids.appPids.includes(Number(parts[0])));
  return {
    main: { rssBytes: memory(row(pids.main)), cpuSeconds: seconds(row(pids.main)) },
    renderer: { rssBytes: memory(row(pids.renderer)), cpuSeconds: seconds(row(pids.renderer)) },
    backend: { rssBytes: memory(backend), cpuSeconds: seconds(backend) },
    heapBytes: values.JSHeapUsedSize, scriptSeconds: values.ScriptDuration, layoutSeconds: values.LayoutDuration,
    listeners: values.JSEventListeners,
  };
}
async function windowSample(label) {
  const before = await resources();
  const start = performance.now();
  await sleep(5500);
  const after = await resources();
  report.overhead.push({ label, elapsedMs: performance.now() - start, before, after });
}
async function activateCrypto() {
  const markets = await request('/api/instruments/discover?category=crypto_perpetual&q=BTC');
  const btc = markets.results.find(row => row.native_id === 'BTC');
  assert.ok(btc?.canonical_id);
  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.locator('[data-market-category=crypto]').click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN').fill('BTC');
  await page.getByTestId('search-result-' + btc.canonical_id).click();
  await expect(canvas()).toHaveAttribute('data-history-symbol', btc.canonical_id);
  await expect(page.getByTestId('stream-status-0')).toHaveAttribute('data-state', 'live');
}
async function recordStream(label) {
  const status = await stream();
  report.stream.push({ label, state: status.state, connectionCount: status.connection_count,
    subscriptions: status.subscriptions, consumers: status.consumers, generation: status.generation,
    received: status.metrics.received, orderFlow: status.order_flow.state, history: await history() });
}
try {
  await launch();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol', 'yahoo:ICICIBANK.NS:NSE:equity', { timeout: 30000 });
  await page.getByLabel('Active timeframe 15m', { exact: true }).click();
  await expect(canvas()).toHaveAttribute('data-history-symbol', 'yahoo:ICICIBANK.NS:NSE:equity', { timeout: 30000 });
  await expect(canvas()).toHaveAttribute('data-history-interval', '15m');
  await expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/);
  await settled();
  await expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state', 'Saved locally');
  const chartState = await request('/workspace');
  if (baseline) {
    await openSettings();
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    for (let iteration = 0; iteration < 3; iteration++) await windowSample('baseline settings');
    await cdp.detach();
    await button('Close settings').click();
  }
  if (!baseline) {
    await screenshot('icicibank-15m');
    await openSettings();
    await expect(readings()).toHaveCount(0);
    assert.equal(await sampledCalls(), 0);
    const start = await history();
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    for (let iteration = 0; iteration < 3; iteration++) {
      await windowSample('collapsed');
      const calls = await sampledCalls();
      await summary().click();
      await expect(readings()).toHaveAttribute('data-sampled-at', /^\d+$/);
      if (iteration === 0) {
        await expect(metric('Active charts')).toHaveText('1');
        await expect(metric('Active Grid charts')).toHaveText('0');
        await expect(metric('Last Charts restore')).toContainText('ms');
        await expect(metric('GMT version')).toHaveText('1.1.0-rc.8');
        await expect(metric('Source SHA')).toHaveText(expectedRevision ?? /^(Unavailable|[a-f0-9]{40})$/);
        for (const name of ['Main', 'Renderer', 'Backend']) {
          await expect(metric(name)).toHaveText(/^\d+\.\d MiB · CPU Unavailable$/);
        }
      }
      await windowSample('expanded');
      await expect.poll(async () => (await sampledCalls()) - calls, { timeout: 11000 }).toBeGreaterThanOrEqual(2);
      await expect(metric('CPU measurement window')).toHaveText(/^\d+\.\d s$/);
      for (const name of ['Main', 'Renderer', 'Backend']) {
        await expect(metric(name)).toHaveText(/^\d+\.\d MiB · CPU \d+\.\d %$/);
      }
      await screenshot('performance-diagnostics');
      await summary().click();
      await expect(readings()).toHaveCount(0);
      assert.deepEqual(await history(), start);
    }
    await summary().click();
    await expect(readings()).toHaveAttribute('data-sampled-at', /^\d+$/);
    // Simulate browser visibility transitions without moving macOS focus away from the fixture.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden = await sampledCalls();
    await sleep(5500);
    assert.equal(await sampledCalls(), hidden);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(sampledCalls).toBeGreaterThan(hidden);
    await button('Close settings').click();
    await expect(readings()).toHaveCount(0);
    const closed = await sampledCalls();
    await sleep(5500);
    assert.equal(await sampledCalls(), closed);
    assert.deepEqual(await history(), start);
    report.historyWhileToggling = start;
    report.sampling = { hidden, closed };
    await cdp.detach();

    await openWatchlistOptions(page);
    await button('Watchlist Chart Grid actions').click();
    await button('Open watchlist in Grid').click();
    const grid = page.getByTestId('chart-grid-workspace');
    await expect(grid.getByTestId('grid-chart')).toHaveCount(8);
    await expect(grid.locator('.grid-card-canvas[data-rendered-bars]:not([data-rendered-bars="0"])')).toHaveCount(8);
    await screenshot('eight-card-grid');
    await openSettings();
    await summary().click();
    await expect(metric('Active charts')).toHaveText('0');
    await expect(metric('Active Grid charts')).toHaveText('8');
    await expect(metric('Grid history active / peak / limit')).toHaveText('0 / 2 / 2');
    await screenshot('grid-diagnostics');
    await button('Close settings').click();
    await grid.getByRole('button', { name: 'Charts', exact: true }).click();
    await expect(canvas()).toHaveAttribute('data-history-interval', '15m');
  }

  await activateCrypto();
  const orderFlow = page.getByTestId('order-flow-panel');
  await button('Order Flow').click();
  await expect(orderFlow).toHaveAttribute('data-book-state', 'Live');
  if (!baseline) {
    await openSettings();
    await summary().click();
    await expect(readings()).toHaveAttribute('data-sampled-at', /^\d+$/);
    // An existing five-second snapshot can predate the connection.
    await expect(metric('Stream connection state')).toHaveText('connected', { timeout: 11000 });
    await expect(metric('Stream connections / subscriptions / consumers')).toHaveText(/^1 \/ [1-9][0-9]* \/ [1-9][0-9]*$/);
    await metric('Stream connection state').scrollIntoViewIfNeeded();
    await screenshot('stream-diagnostics');
  }
  await settled();
  await recordStream('live start');
  for (let i = 0; i < 3; i++) {
    await sleep(5000);
    await recordStream('connected ' + (i + 1));
  }
  const previous = report.stream.at(-1);
  assert.equal(previous.connectionCount, 1);
  assert.equal(previous.subscriptions, report.stream[0].subscriptions);
  assert.equal(previous.consumers, report.stream[0].consumers);
  assert.ok(previous.received > report.stream[0].received);
  assert.deepEqual(previous.history, report.stream[0].history);

  await request('/api/streams/lifecycle', 'POST', { suspended: true });
  await expect(orderFlow).toHaveAttribute('data-book-state', 'Suspended');
  await recordStream('suspended');
  await request('/api/streams/lifecycle', 'POST', { suspended: false });
  await expect(orderFlow).toHaveAttribute('data-book-state', 'Live');
  await expect.poll(async () => (await stream()).generation).toBeGreaterThan(previous.generation);
  for (let i = 0; i < 3; i++) {
    await sleep(5000);
    await recordStream('reconnected ' + (i + 1));
  }
  assert.equal(report.stream.at(-1).connectionCount, 1);
  assert.equal(report.stream.at(-1).subscriptions, previous.subscriptions);
  assert.equal(report.stream.at(-1).consumers, previous.consumers);
  if (!baseline) await button('Close settings').click();
  await orderFlow.getByRole('button', { name: 'Close Order Flow' }).click();
  await expect.poll(async () => (await stream()).order_flow.state).toBe('inactive');
  await expect.poll(async () => (await stream()).subscriptions).toBeLessThan(previous.subscriptions);
  await recordStream('order flow closed');
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol', 'yahoo:ICICIBANK.NS:NSE:equity', { timeout: 30000 });
  await expect.poll(async () => (await stream()).subscriptions).toBe(0);
  await recordStream('chart switched');

  await expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state', 'Saved locally');
  await close();
  await launch();
  await expect(canvas()).toHaveAttribute('data-history-symbol', chartState.panes[0].canonical_id);
  await expect(canvas()).toHaveAttribute('data-history-interval', '15m');
  await close();
  assert.deepEqual(errors, []);
  report.restart = true;
  report.backendStopped = true;
  await writeFile(join(output, baseline ? 'before-stream.json' : 'after-diagnostics.json'), JSON.stringify(report, null, 2));
  console.log('PASS performance fixture, streaming lifecycle and restart' + (baseline ? ' (baseline)' : ' with local diagnostics'));
} finally {
  try { await app?.close(); } finally { await rm(profile, { recursive: true, force: true }); }
}
