import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { dragStudySeparator } from './study-separator.mjs';

const output = resolve(process.env.GMT_LEGEND_EVIDENCE || 'test-results');
const profile = await mkdtemp(join(tmpdir(), 'gmt-legend-clock-'));
await mkdir(output, { recursive: true });
await mkdir('test-results', { recursive: true });
const moduleCode = await build({ entryPoints: ['desktop/src/charts/indicators.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false });
const { defaultIndicator, ema } = await import('data:text/javascript;base64,' + Buffer.from(moduleCode.outputFiles[0].text).toString('base64'));
const configs = [
  { ...defaultIndicator('EMA', 'ema20'), length: 20 },
  { ...defaultIndicator('EMA', 'ema9'), length: 9, color: '#86aaf9' },
  defaultIndicator('RSI', 'rsi'),
  defaultIndicator('STOCHRSI', 'stoch'),
];
const evidence = { profile, frames: [], errors: [] };
let app, page, cdp;
const captures = [];
const request = (path, method = 'GET', body) =>
  page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [path, method, body]);
const button = (name, where = page) => where.getByRole('button', { name, exact: true });
const pane = id => page.getByTestId('pane-' + id);
const canvas = id => pane(id).locator('.chart-canvas');
const row = (key, id = 0) => page.getByTestId(`study-legend-${id}-${key}`);
const clock = () => page.getByTestId('chart-clock-0');
const candle = () => page.getByTestId('candle-countdown-0');
const studies = async () => JSON.parse(await canvas(0).getAttribute('data-study-series'));
const workspace = () => request('/workspace');
const idle = async () => {
  await expect.poll(async () => {
    const state = await request('/api/history/status');
    return state.active + state.queued;
  }, { timeout: 30000 }).toBe(0);
};
const snap = async name => {
  const file = `legend-${name}.png`;
  await page.screenshot({ path: join(output, file) });
  evidence.frames.push(file);
};
const ready = async () => {
  await expect(page.getByRole('button', {name:'Charts by TradingView',exact:true})).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });
  await expect(canvas(0)).toHaveAttribute('data-rendered-bars', /^[1-9]/);
};
const saveState = async () => {
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  return (await workspace()).panes[0];
};
const zone = async (search, name) => {
  await button('Time zone pane 0').click();
  const picker = page.getByRole('dialog', { name: 'Chart display time zone' });
  await picker.getByRole('textbox', { name: 'Search time zones' }).fill(search);
  await picker.getByRole('radio', { name }).check();
  if (search === 'Kolkata') await snap('timezone');
  await button('Apply', picker).click();
  await expect(picker).toBeHidden();
  await expect(button('Time zone pane 0')).toBeFocused();
};

try {
  app = await electron.launch({ executablePath: sourceElectron, args: ['.'], timeout: 60000,
    env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' } });
  page = await app.firstWindow();
  page.on('pageerror', error => evidence.errors.push(error.message));
  await ready();
  await idle();
  const seed = await workspace();
  seed.layout = 1;
  seed.panes[0].indicators = configs;
  seed.panes[0].auto_refresh = false;
  seed.panes[0].volume = true;
  seed.panes[0].study_layout = { volume: { height: 100, collapsed: false }, rsi: { height: 130, collapsed: false } };
  seed.panes[1] = { ...seed.panes[0], id: '1' };
  await request('/workspace', 'PUT', seed);
  await page.reload();
  await ready();
  await idle();
  const providerBefore = (await request('/api/history/status')).provider_requests;
  const originalCanvas = await canvas(0).getAttribute('data-chart-creations');
  const count = () => page.getByTestId('study-legend-count-0');
  const legend = id => button(`Indicator legend pane ${id}`, pane(id));
  await expect(count()).toHaveText('4');
  await expect(row('ema20')).toContainText('EMA 20');
  await expect(row('ema9')).toContainText('EMA 9');
  assert.ok(await row('ema20').evaluate(element => {
    const row = element.getBoundingClientRect();
    const list = element.parentElement.getBoundingClientRect();
    if (list.right - row.right < 8) return false;
    const target = document.elementFromPoint((list.right + row.right) / 2, row.top + row.height / 2);
    return !!target?.closest('.chart-canvas');
  }), 'Blank legend space leaves the chart available for drawing and zooming');
  await expect(pane(0).locator('.study-pane-controls')).toHaveCount(3);
  await expect(pane(0).locator('.study-pane-controls').getByText('Height', { exact: true })).toHaveCount(0);

  if (process.env.GMT_LEGEND_RECORD === '1') {
    cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      captures.push({ data, time: metadata.timestamp });
      void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 81, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
  }

  const outputs = row('ema20').locator('[data-study-output]');
  const exactPoint = await canvas(0).evaluate(el => {
    const data = el.__mainSeries.data();
    const index = data.length - 36;
    const r = el.getBoundingClientRect();
    return { closes: data.map(bar => bar.close), index, x: r.left + el.__chart.timeScale().timeToCoordinate(data[index].time),
      y: r.top + Math.min(el.__chart.paneSize(0).height - 20, 160) };
  });
  const expected = ema(exactPoint.closes, 20);
  const numericValue = async () => Number(await outputs.getAttribute('data-value'));
  await page.mouse.move(6, 9);
  await expect.poll(numericValue).toBeCloseTo(expected.at(-1), 8);
  await snap('expanded');
  await page.mouse.move(exactPoint.x, exactPoint.y);
  await expect.poll(numericValue).toBeCloseTo(expected[exactPoint.index], 8);
  await expect(row('stoch').locator('[data-study-output]')).toHaveCount(2);
  const colors = await row('stoch').locator('[data-study-output]').evaluateAll(nodes => nodes.map(node => node.style.color));
  assert.equal(new Set(colors).size, 2);
  await page.mouse.move(6, 9);
  await expect.poll(numericValue).toBeCloseTo(expected.at(-1), 8);

  const actions = row('ema9').locator('.study-legend-actions');
  await expect(actions).toHaveCSS('opacity', '0');
  const box = await row('ema9').boundingBox();
  await row('ema9').hover();
  await expect(actions).toHaveCSS('opacity', '1');
  assert.deepEqual(await row('ema9').boundingBox(), box, 'Hover actions keep the row layout stable');
  await snap('hover');
  await page.mouse.move(6, 9);
  await button('Edit EMA 9', row('ema9')).focus();
  await expect(actions).toHaveCSS('opacity', '1');
  await button('Edit EMA 9', row('ema9')).press('Enter');
  const settings = page.getByRole('dialog', { name: 'Indicator settings' });
  await expect(settings.getByRole('heading')).toHaveText('EMA 9 settings');
  await expect(settings.getByLabel('Length')).toHaveValue('9');
  await snap('settings');
  await settings.getByLabel('Length').fill('10');
  await button('Apply settings', settings).click();
  assert.equal((await saveState()).indicators.find(item => item.id === 'ema9').length, 10);
  assert.equal((await workspace()).panes[0].indicators.find(item => item.id === 'ema20').length, 20);

  const beforeVisibility = await saveState();
  const range = () => canvas(0).evaluate(el => el.__chart.timeScale().getVisibleLogicalRange());
  const zoom = await range();
  const plot = (all, key) => all.some(item => item.id === key);
  await button('Hide EMA 20', row('ema20')).click();
  await expect.poll(async () => plot(await studies(), 'ema20')).toBe(false);
  await expect(row('ema20')).toHaveAttribute('data-visible', 'false');
  await expect(row('ema20').locator('[data-study-output]')).toHaveCount(0);
  await snap('ema-hidden');
  assert.equal((await saveState()).indicators.find(item => item.id === 'ema20').visible, false);
  await button('Show EMA 20', row('ema20')).click();
  await expect.poll(async () => plot(await studies(), 'ema20')).toBe(true);
  const rsiHeader = page.getByTestId('study-controls-0-rsi');
  await button('Hide study rsi', rsiHeader).click();
  await expect(rsiHeader).toHaveCount(0);
  await button('Show RSI 14', row('rsi')).click();
  await expect(rsiHeader).toBeVisible();
  await expect.poll(async () => (await saveState()).study_layout).toEqual(beforeVisibility.study_layout);
  assert.deepEqual((await workspace()).panes[0].indicators, beforeVisibility.indicators);
  assert.deepEqual(await range(), zoom);
  await expect(canvas(0)).toHaveAttribute('data-chart-creations', originalCanvas);
  await dragStudySeparator(page, canvas(0), 'rsi', -22, async fraction => {
    await expect.poll(() => canvas(0).evaluate(element => {
      const rows = JSON.parse(element.dataset.studyPanes);
      return rows.every(({ id, index }) => {
        const top = element.__chart.panes()[index].getHTMLElement().getBoundingClientRect().top;
        const header = element.parentElement.querySelector(`[data-testid="study-controls-0-${id}"]`);
        return header && Math.abs(header.getBoundingClientRect().top - top) <= 1;
      });
    })).toBe(true);
    if (fraction === 0.67) await snap('resize-held');
  });
  await expect.poll(async () => (await saveState()).study_layout.rsi.height).toBeGreaterThan(145);

  const beforeCollapse = await canvas(0).getAttribute('data-study-series');
  await legend(0).click();
  await expect(legend(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(row('ema20')).toBeHidden();
  await expect(count()).toHaveText('4');
  await expect(canvas(0)).toHaveAttribute('data-study-series', beforeCollapse);
  await snap('collapsed');
  await button('Chart layout').click();
  await button('Layout 2').click();
  await expect(legend(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(legend(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('chart-clock-1')).toBeVisible();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await button('Visibility menu').click();
  await button('Hide indicators').click();
  await expect(legend(0)).toHaveCount(0);
  await expect.poll(async () => (await studies()).length).toBe(0);
  await button('Visibility menu').click();
  await expect(button('Hide indicators')).toHaveText('Show indicators');
  await button('Hide indicators').click();
  await expect(legend(0)).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await studies()).length).toBeGreaterThan(0);
  await legend(0).click();

  await button('Remove EMA 10', row('ema9')).click();
  await expect(count()).toHaveText('3');
  await expect(row('ema9')).toHaveCount(0);
  await expect.poll(async () => plot(await studies(), 'ema9')).toBe(false);
  assert.deepEqual((await saveState()).indicators.map(i => i.id), ['ema20', 'rsi', 'stoch']);
  await button('Indicators').click();
  const manager = page.getByRole('dialog', { name: 'Indicator manager' });
  await manager.getByLabel('Add EMA', { exact: true }).click();
  await manager.getByLabel('Close indicators', { exact: true }).click();
  await expect(count()).toHaveText('4');

  await zone('Kolkata', /^Asia\/Kolkata/);
  await expect(clock()).toHaveText(/^\d\d:\d\d:\d\d UTC\+5:30$/);
  const priorTime = Date.parse(await clock().getAttribute('datetime'));
  await expect.poll(async () => (await saveState()).display_timezone).toBe('Asia/Kolkata');
  const stable = await workspace();
  const render = await canvas(0).getAttribute('data-render-revision');
  await expect.poll(async () => Date.parse(await clock().getAttribute('datetime')) - priorTime).toBeGreaterThanOrEqual(2000);
  await expect(canvas(0)).toHaveAttribute('data-render-revision', render);
  assert.deepEqual(await workspace(), stable);
  await zone('UTC', /^UTC/);
  await expect(clock()).toHaveText(/^\d\d:\d\d:\d\d UTC$/);
  await expect.poll(async () => (await saveState()).display_timezone).toBe('UTC');
  await expect(candle()).toHaveCount(0);
  await idle();
  assert.equal((await request('/api/history/status')).provider_requests, providerBefore, 'Presentation controls and the clock make no provider requests');

  // Controlled existing history responses exercise real renderer visibility.
  await app.evaluate(() => {
    const original = globalThis.fetch;
    globalThis.__gmtClockFixture = 'open';
    globalThis.fetch = async function (input, ...args) {
      const response = await original.call(this, input, ...args);
      if (new URL(input?.url ?? String(input)).pathname !== '/api/history' || !response.ok) return response;
      const body = await response.json();
      const now = Math.floor(Date.now() / 1000);
      const last = body.candles.at(-1);
      const bar = now - 120;
      body.candles = [...body.candles.filter(item => item.time < bar), { ...last, time: bar }];
      body.source = 'YAHOO FINANCE';
      body.stale = globalThis.__gmtClockFixture === 'stale';
      body.candle_clock = { bar_time: bar, close_time: globalThis.__gmtClockFixture === 'closed' ? now - 1 : now + 75, observed_at: now };
      return Response.json(body, { status: response.status });
    };
  });
  await page.reload();
  await ready();
  await expect(candle()).toBeVisible();
  const previousCountdown = await candle().textContent();
  await expect(candle()).not.toHaveText(previousCountdown);
  await snap('countdown');
  await button('Historical replay').click();
  await expect(candle()).toHaveCount(0);
  await button('Exit replay', pane(0)).click();
  await expect(candle()).toBeVisible();
  for (const state of ['closed', 'stale']) {
    await app.evaluate((_, value) => { globalThis.__gmtClockFixture = value; }, state);
    await page.reload();
    await ready();
    await expect(candle()).toHaveCount(0);
    await expect(clock()).toBeVisible();
  }
  assert.deepEqual(evidence.errors, []);
  console.log('PASS per-pane legend/count, real crosshair values, hover/focus, exact settings, visibility and height restore, clock/zone/countdown and zero presentation provider requests.');
} finally {
  if (cdp) {
    await cdp.send('Page.stopScreencast').catch(() => {});
    const directory = join(output, 'screencast');
    await mkdir(directory, { recursive: true });
    for (const [i, frame] of captures.entries()) await writeFile(join(directory, `frame-${String(i).padStart(5, '0')}.jpg`), Buffer.from(frame.data, 'base64'));
    await writeFile(join(directory, 'times.json'), JSON.stringify(captures.map(frame => frame.time)));
  }
  await app?.close();
  await writeFile(join(output, 'legend-verification.json'), JSON.stringify(evidence, null, 2));
}
