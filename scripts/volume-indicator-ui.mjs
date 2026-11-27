import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';

const output = 'test-results/volume-indicator';
const profile = await mkdtemp(join(tmpdir(), 'gmt-volume-indicator-'));
const env = { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' };
const evidence = { rendererErrors: [] };
let app, page;
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const canvas = id => page.getByTestId(`pane-${id}`).locator('.chart-canvas');
const legend = id => page.getByTestId(`volume-legend-${id}`);
const header = id => page.getByTestId(`study-controls-${id}-volume`);
const manager = () => page.getByRole('dialog', { name: 'Indicator manager' });
const volumeRow = () => manager().getByTestId('indicator-volume');
const active = () => manager().getByRole('button', { name: /^Active indicators/ });
const request = (path, method = 'GET', body) =>
  page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [path, method, body]);
const state = () => request('/workspace');
const history = () => request('/api/history/status');
const saved = () => expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state', 'Saved locally');
const screenshot = name => page.screenshot({ path: join(output, `fixture-${name}.png`) });
const ready = (id, symbol) => expect(canvas(id)).toHaveAttribute('data-history-symbol', symbol, { timeout: 30000 });
const idle = () => expect.poll(async () => { const h = await history(); return h.active + h.queued; }, { timeout: 30000 }).toBe(0);

async function launch() {
  app = await electron.launch({ executablePath: sourceElectron, args: ['.'], env, timeout: 60000 });
  page = await app.firstWindow();
  page.on('pageerror', error => evidence.rendererErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 834 });
  await expect(button('Chart layout')).toBeVisible({ timeout: 45000 });
}

async function volumes(id) {
  return canvas(id).evaluate(node => node.__chart.panes().flatMap((pane, index) =>
    pane.getSeries().filter(series => series.seriesType() === 'Histogram' && series.options().priceFormat.type === 'volume')
      .map(series => ({ index, height: pane.getHeight(), data: series.data() }))));
}

async function showManager() {
  await button('Indicators').click();
  await expect(manager()).toBeVisible();
}

try {
  await mkdir(output, { recursive: true });
  await launch();
  const toolbar = page.locator('.terminal-header');
  const more = page.getByLabel('More chart options', { exact: true });
  await expect(toolbar.getByText('TradingView', { exact: true })).toHaveCount(0);
  await expect(toolbar.locator('.lucide-save')).toHaveCount(0);
  await expect(button('Save workspace', toolbar)).toHaveCount(0);
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(button('Save workspace', toolbar)).toBeVisible();
  await button('Settings').click();
  const licenses = page.getByRole('region', { name: 'About and licenses' });
  const credit = licenses.getByRole('link', { name: 'TradingView' });
  await expect(licenses).toContainText('Apache License 2.0');
  await expect(credit).toHaveAttribute('href', 'https://www.tradingview.com/');
  await app.evaluate(({ shell }) => { shell.openExternal = async url => { globalThis.__volumeCreditUrl = url; }; });
  await credit.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => app.evaluate(() => globalThis.__volumeCreditUrl)).toBe('https://www.tradingview.com/');
  await page.keyboard.press('Escape');
  await expect(licenses).toHaveCount(0);

  const fixture = await state();
  const instrument = fixture.watchlists.flatMap(list => list.items).find(item => item.symbol === 'ICICIBANK-EQ' || item.symbol === 'ICICIBANK.NS');
  assert.ok(instrument);
  const icici = 'yahoo:ICICIBANK.NS:NSE:equity';
  const nifty = 'yahoo:%5ENSEI:NSE:index';
  const index = fixture.watchlists.flatMap(list => list.items).find(item => item.canonical_id === nifty);
  assert.ok(index);
  fixture.layout = 2;
  Object.assign(fixture.panes[0], instrument, { timeframe: '15m', volume: true, auto_refresh: false });
  Object.assign(fixture.panes[1], index, { timeframe: '1d', volume: true, auto_refresh: false });
  for (const pane of fixture.panes) delete pane.volume_settings;
  const rsi = { id: 'volume-test-rsi', kind: 'RSI' };
  fixture.panes[0].indicators.push(rsi);
  fixture.panes[0].study_layout = { volume: { height: 122, collapsed: false } };
  fixture.panes[0].drawing_sets = { [icici + '/15m']: [{
    id: 'volume-test-drawing', kind: 'horizontal', version: 2,
    anchors: [{ time: 1700000000, price: 102 }], color: '#86aaf9', width: 1, params: {},
  }] };
  await request('/workspace', 'PUT', fixture);
  await page.reload();
  await ready('0', icici);
  await ready('1', nifty);
  await expect(header('0')).toBeVisible();
  await expect(header('1')).toBeVisible();
  await expect(page.getByTestId('quote-refresh-status')).toHaveText(/Updated at .+ · Auto 300s/, { timeout: 30000 });
  await expect(legend('1')).toHaveText('Volume unavailable');
  assert.equal((await volumes('1'))[0].data.filter(point => 'value' in point).length, 0);

  // Compare every rendered histogram value against the history returned by the
  // fixture API, including timestamps and the up/down color convention.
  const response = await request('/api/history?' + new URLSearchParams({ symbol: icici, interval: '15m' }));
  const expected = response.candles.map(bar => ({ time: bar.time, value: bar.volume }));
  assert.ok(expected.length >= 75 && expected.every(bar => bar.value === 100));
  await expect(legend('0')).toHaveText('Volume 100.00');
  await expect(legend('0')).not.toContainText(/historical|am|pm/);
  await expect.poll(async () => (await volumes('0'))[0]?.height).toBeGreaterThanOrEqual(120);
  const [original] = await volumes('0');
  assert.equal((await volumes('0')).length, 1, 'Exactly one native histogram for a pre-existing Volume pane');
  assert.deepEqual(original.data.map(({time,value})=>({time,value})), expected);
  assert.ok(original.data.every(point => point.color === '#17a69255'));
  const beforePane = await canvas('0').evaluate(node => ({
    priceHeight: node.__chart.panes()[0].getHeight(), data: node.__mainSeries.data(),
    creations: node.dataset.chartCreations,
  }));
  await idle();
  const requestsBefore = await history();
  const savedBefore = await state();
  assert.equal(savedBefore.panes[0].drawing_sets[icici + '/15m'][0].id, 'volume-test-drawing');

  await canvas('0').click({ position: { x: 180, y: 125 } });
  await showManager();
  await expect(manager().getByRole('status')).toHaveText('70 matching studies');
  const query = manager().getByRole('textbox', { name: 'Search indicators' });
  await query.fill('Volume');
  await expect(button('Add Volume', manager())).toBeDisabled();
  await button('Oscillators', manager()).click();
  await expect(button('Add Volume', manager())).toBeDisabled();
  await button('Favorite Volume', manager()).click();
  await button('Favorites', manager()).click();
  await expect(button('Add Volume', manager())).toBeDisabled();
  await screenshot('library');
  await active().click();
  await expect(volumeRow()).toHaveCount(1);
  await button('Settings volume', volumeRow()).click();
  const settings = page.getByRole('dialog', { name: 'Volume settings' });
  await settings.getByLabel('Pane position').selectOption('last');
  await settings.getByLabel('Up bar color').fill('#12ab34');
  await button('Apply settings', settings).click();
  await expect.poll(async () => (await volumes('0'))[0]?.index).toBe(2);
  await expect.poll(async () => (await volumes('0'))[0]?.data[0]?.color).toBe('#12ab3455');
  await button('Visibility volume', volumeRow()).click();
  await expect(button('Visibility volume', volumeRow())).toHaveAttribute('aria-pressed', 'false');
  await expect(header('0')).toHaveCount(0);
  await expect(legend('0')).toHaveCount(0);
  await expect(header('1')).toBeVisible();
  await saved();
  const hidden = (await state()).panes[0];
  assert.deepEqual(hidden.volume_settings, { position: 'last', up_color: '#12ab34', down_color: null });
  assert.equal(hidden.volume, false);
  assert.deepEqual(hidden.study_layout.volume, fixture.panes[0].study_layout.volume);
  await button('Visibility volume', volumeRow()).click();
  await expect(header('0')).toBeVisible();
  await expect.poll(async () => (await volumes('0'))[0]?.data[0]?.color).toBe('#12ab3455');
  await button('Delete volume', volumeRow()).click();
  await expect(volumeRow()).toHaveCount(0);
  await button('Close indicators').click();
  await expect(header('0')).toHaveCount(0);
  const priceHeight = () => canvas('0').evaluate(node => node.__chart.panes()[0].getHeight());
  await expect.poll(priceHeight).toBeGreaterThan(beforePane.priceHeight + 90);
  evidence.priceHeightAfter = await priceHeight();
  await expect(page.getByTestId('study-controls-0-volume-test-rsi')).toBeVisible();
  assert.deepEqual(await canvas('0').evaluate(node => node.__mainSeries.data()), beforePane.data);
  await screenshot('removed');
  await saved();
  const removed = await state();
  assert.equal(removed.panes[0].volume, false);
  assert.deepEqual(removed.panes[0].indicators, savedBefore.panes[0].indicators);
  assert.deepEqual(removed.panes[0].drawing_sets, savedBefore.panes[0].drawing_sets);
  assert.deepEqual(removed.panes[1], savedBefore.panes[1]);
  assert.equal(await canvas('0').getAttribute('data-chart-creations'), beforePane.creations);
  const afterRemoval = await history();
  assert.equal(afterRemoval.history_requests, requestsBefore.history_requests);
  assert.equal(afterRemoval.provider_requests, requestsBefore.provider_requests);
  await app.close();
  await launch();
  await ready('0', icici);
  await ready('1', nifty);
  await expect(header('0')).toHaveCount(0);
  assert.deepEqual(await state(), removed);
  await expect(header('1')).toBeVisible();

  await idle();
  const beforeAdd = await history();
  await showManager();
  await manager().getByRole('textbox', { name: 'Search indicators' }).fill('Volume');
  await button('Add Volume', manager()).click();
  await expect(button('Add Volume', manager())).toBeDisabled();
  await button('Recently Used', manager()).click();
  await expect(button('Add Volume', manager())).toBeDisabled();
  await button('Close indicators').click();
  await expect(header('0')).toBeVisible();
  await expect.poll(async () => (await volumes('0'))[0]?.height).toBeGreaterThanOrEqual(120);
  assert.deepEqual((await volumes('0'))[0].data.map(({time,value})=>({time,value})), expected);
  await saved();
  await idle();
  const afterAdd = await history();
  assert.equal(afterAdd.provider_requests, beforeAdd.provider_requests);
  assert.equal(afterAdd.history_requests, beforeAdd.history_requests);
  assert.equal(removed.panes[1].volume, true);
  await screenshot('added');

  const restored = await state();
  await app.close();
  await launch();
  await ready('0', icici);
  await ready('1', nifty);
  await expect(header('0')).toBeVisible();
  assert.deepEqual(await state(), restored);
  assert.equal((await volumes('0')).length, 1);
  assert.deepEqual(evidence.rendererErrors, []);
  Object.assign(evidence, { historyBarsVerified: expected.length, absentHistoryState: await legend('1').innerText(),
    legacyHeight: original.height, priceHeightBefore: beforePane.priceHeight, profileRestarts: 2,
    lifecycleExtraHistoryRequests: afterRemoval.history_requests - requestsBefore.history_requests,
    lifecycleExtraProviderRequests: afterRemoval.provider_requests - requestsBefore.provider_requests,
    readdExtraProviderRequests: afterAdd.provider_requests - beforeAdd.provider_requests,
    readdExtraHistoryRequests: afterAdd.history_requests - beforeAdd.history_requests });
  // Request counters are scoped to their native backend process.
  assert.ok(requestsBefore.provider_requests >= 1);
  console.log(`PASS Volume add/hide/show/remove/order, ${expected.length} exact fixture bars, legacy height, independent charts, keyboard attribution, autosave, two restarts, and zero extra requests on re-add.`);
} catch (error) {
  await screenshot('failure').catch(() => {});
  throw error;
} finally {
  await app?.close().catch(() => {});
  await writeFile(join(output, 'native-regression.json'), JSON.stringify(evidence, null, 2));
}
