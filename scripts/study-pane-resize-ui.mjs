import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { dragStudySeparator } from './study-separator.mjs';

const output = resolve(process.env.GMT_STUDY_RESIZE_EVIDENCE || 'test-results');
const profile = await mkdtemp(join(tmpdir(), 'gmt-study-resize-'));
await mkdir(output, { recursive: true });
await mkdir('test-results', { recursive: true });
const bundle = await build({ entryPoints: ['desktop/src/charts/indicators.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false });
const { defaultIndicator } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const indicators = ['ROC', 'RSI', 'STOCHRSI', 'MACD', 'ATR', 'ADX'].map(kind => defaultIndicator(kind, 'resize-' + kind));
const initialLayout = Object.fromEntries([['resize-ROC', 124], ['resize-RSI', 148], ['resize-STOCHRSI', 128],
  ['resize-MACD', 116], ['resize-ATR', 108], ['resize-ADX', 104]].map(([id, height]) => [id, { height, collapsed: false }]));
const studyIds = Object.keys(initialLayout);
const legacyVolumeLayout = { height: 124, collapsed: false };
const evidence = { profile, samples: [], persisted: {}, rendererErrors: [] };
const dpi = process.env.GMT_STUDY_RESIZE_DPI;
let app, page;
const launch = async () => {
  app = await electron.launch({ executablePath: sourceElectron, args: dpi ? [`--force-device-scale-factor=${dpi}`, '.'] : ['.'], timeout: 60000,
    env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' } });
  page = await app.firstWindow();
  page.on('pageerror', error => evidence.rendererErrors.push(error.message));
  evidence.dpi = await page.evaluate(() => devicePixelRatio);
  if (dpi) assert.equal(evidence.dpi, Number(dpi));
  await expect(page.getByRole('button', {name:'Chart layout',exact:true})).toBeVisible({ timeout: 45000 });
};
const pane = () => page.getByTestId('pane-0');
const canvas = () => pane().locator('.chart-canvas');
const button = name => page.getByRole('button', { name, exact: true });
const request = (path, method = 'GET', body) =>
  page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [path, method, body]);
const saved = async () => {
  await expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state','Saved locally');
  return (await request('/workspace')).panes[0].study_layout;
};
const screenshot = name => page.screenshot({ path: join(output, `study-resize-${name}.png`) });
const geometry = () => canvas().evaluate((element, ids) => {
  const chart = element.__chart;
  const home = element.getBoundingClientRect();
  const rows = JSON.parse(element.dataset.studyPanes || '[]');
  return ids.map(id => {
    const index = rows.find(row => row.id === id)?.index;
    const pane = chart.panes()[index]?.getHTMLElement()?.getBoundingClientRect();
    const header = element.parentElement.querySelector(`[data-testid="study-controls-0-${id}"]`)?.getBoundingClientRect();
    return { id, top: pane && pane.top - home.top, height: pane?.height,
      label: header && header.top - home.top, labelHeight: header?.height };
  });
}, studyIds);
const afterChartFrame = () => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));
const aligned = rows => rows.every(row => Number.isFinite(row.top) && Number.isFinite(row.label) &&
  Math.abs(row.top - row.label) <= 1 && row.labelHeight > 0 && row.labelHeight < row.height);
const row = (rows, id) => rows.find(value => value.id === id);
async function ready() {
  await expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/, { timeout: 30000 });
  await expect.poll(async () => aligned(await geometry())).toBe(true);
}
async function resize(id, pixels, name) {
  const before = await geometry();
  const original = row(before, id);
  let previous = original;
  await dragStudySeparator(page, canvas(), id, pixels, async (fraction, point) => {
    await afterChartFrame();
    const held = await geometry();
    const current = row(held, id);
    const offset = pixels * fraction;
    assert.ok(Math.sign(current.height - previous.height) === -Math.sign(pixels),
      `${id} reverses before mouse release in ${name} at ${fraction}: ${previous.height} -> ${current.height}`);
    assert.ok(Math.abs(current.top - original.top - offset) <= 2, `Separator tracks the pointer in ${name} at ${fraction}`);
    assert.ok(Math.abs(current.height - original.height + offset) <= 2, `Pane tracks the pointer in ${name} at ${fraction}`);
    assert.ok(aligned(held), `Headers during ${name} before mouse release: ${JSON.stringify(held)}`);
    evidence.samples.push({ name, fraction, held: true, point: { x: point.x, y: point.y + offset }, rows: held });
    previous = current;
    if (fraction === 0.67 && name === 'first-study-expand') {
      const input = await page.context().newCDPSession(page);
      try {
        const hoverY = point.y + original.height;
        await input.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: hoverY, buttons: 0 });
        await afterChartFrame();
        const afterHover = await geometry();
        evidence.ambient = { y: hoverY, before: current.height, after: row(afterHover, id).height };
        assert.deepEqual(afterHover, held, 'A buttonless mouse move must leave all held panes and headers unchanged');
      } finally {
        await input.detach();
      }
      await screenshot('while-held');
    }
  });
  await ready();
  const after = await geometry();
  evidence.samples.push({ name, held: false, rows: after });
  assert.ok(Math.sign(row(after, id).height - row(before, id).height) === -Math.sign(pixels),
    `${id} must ${pixels < 0 ? 'expand' : 'shrink'} in ${name}`);
  await expect.poll(async () => (await saved())[id]?.height).toBe(Math.round(row(after, id).height));
}

try {
  await launch();
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });
  const idleHistory = async () => {
    await expect.poll(async () => {
      const { active, queued } = await request('/api/history/status');
      return active + queued;
    }, { timeout: 30000 }).toBe(0);
  };
  await idleHistory();
  const workspace = await request('/workspace');
  workspace.layout = 1;
  workspace.panes[0].volume = true;
  workspace.panes[0].indicators = indicators;
  workspace.panes[0].study_layout = { ...initialLayout, volume: legacyVolumeLayout };
  const drawingKey = `${workspace.panes[0].canonical_id}/${workspace.panes[0].timeframe}`;
  workspace.panes[0].drawing_sets = { [drawingKey]: [{
    id: 'study-resize-line', kind: 'horizontal', version: 2, anchors: [{ time: 1700000000, price: 340 }],
    color: '#86aaf9', width: 1, params: {},
  }] };
  await request('/workspace', 'PUT', workspace);
  await page.reload();
  await ready();
  await expect(pane().getByTestId('study-controls-0-volume')).toHaveCount(0);
  assert.deepEqual(await canvas().evaluate(node => node.__chart.panes().flatMap((pane, index) =>
    pane.getSeries().filter(series => series.options().priceScaleId === 'gmt-volume').map(() => index))), [0]);
  await screenshot('initial');
  await idleHistory();
  const creationCount = await canvas().getAttribute('data-chart-creations');
  const providerBefore = (await request('/api/history/status')).provider_requests;
  const retainedDrawings = (await request('/workspace')).panes[0].drawing_sets;
  assert.equal(retainedDrawings[drawingKey][0].id, 'study-resize-line');
  const studySeries = await canvas().getAttribute('data-study-series');
  await resize('resize-RSI', -48, 'first-study-expand');
  await resize('resize-RSI', 26, 'first-study-shrink');
  await resize('resize-STOCHRSI', -32, 'stochastic-expand');
  await resize('resize-STOCHRSI', 20, 'stochastic-shrink');
  await button('Collapse study resize-STOCHRSI').click();
  await expect.poll(async () => row(await geometry(), 'resize-STOCHRSI').height).toBeLessThan(40);
  await resize('resize-RSI', -22, 'first-study-with-stochastic-collapsed');
  await button('Expand study resize-STOCHRSI').click();
  await ready();
  await expect.poll(async () => row(await geometry(), 'resize-STOCHRSI').height).toBeGreaterThan(100);
  await expect(pane().locator('.study-pane-controls').getByText('Height', { exact: true })).toHaveCount(0);
  await expect(pane().locator('.study-pane-controls :is(summary, input[type="range"])')).toHaveCount(0);
  await idleHistory();
  assert.equal((await request('/api/history/status')).provider_requests, providerBefore, 'Resizing and collapse reuse cached data');
  await expect(canvas()).toHaveAttribute('data-chart-creations', creationCount);
  const initialDrags = await saved();
  assert.deepEqual(initialDrags.volume, legacyVolumeLayout);
  for (const id of ['resize-MACD', 'resize-ATR', 'resize-ADX', 'resize-ROC']) {
    assert.deepEqual(initialDrags[id], initialLayout[id], 'Unmoved studies keep their saved height');
  }
  await dragStudySeparator(page, canvas(), 'resize-RSI', 0);
  assert.deepEqual(await saved(), initialDrags, 'A separator click keeps saved heights');
  let expected = initialDrags;
  const retained = async label => {
    await ready();
    const layout = label === 'restart' ? (await request('/workspace')).panes[0].study_layout : await saved();
    assert.deepEqual(layout, expected, label);
    await expect.poll(async () => (await geometry()).every(item =>
      Math.abs(item.height - expected[item.id].height) <= 2), { message: label + ' restores the rendered heights' }).toBe(true);
    evidence.persisted[label] = true;
  };
  await button('Toggle sidebar').click();
  await retained('watchlistClosed');
  await button('Toggle sidebar').click();
  await retained('watchlistOpened');
  await button('Order Flow').click();
  await expect(page.getByTestId('order-flow-panel')).toBeVisible();
  await retained('orderFlowOpened');
  await button('Close Order Flow').click();
  await retained('orderFlowClosed');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 690));
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1100);
  await retained('windowResized');
  await resize('resize-MACD', -18, 'macd-expand-after-window-resize');
  const rsiHeight = row(await geometry(), 'resize-RSI').height;
  await resize('resize-RSI', rsiHeight - 108, 'rsi-shrink-near-minimum');
  assert.ok(Math.abs(row(await geometry(), 'resize-RSI').height - 108) <= 2);
  expected = await saved();
  evidence.persisted.afterDrag = expected;
  assert.deepEqual(expected.volume, legacyVolumeLayout);
  assert.deepEqual((await request('/workspace')).panes[0].drawing_sets, retainedDrawings);
  await expect(canvas()).toHaveAttribute('data-study-series', studySeries);
  await idleHistory();
  evidence.providerRequests = { before: providerBefore, after: (await request('/api/history/status')).provider_requests };
  assert.equal(evidence.providerRequests.after, evidence.providerRequests.before, 'Resizing the window and panes reuses loaded history');
  await expect(canvas()).toHaveAttribute('data-chart-creations', creationCount);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 920));
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
  await retained('windowRestored');
  for (const size of [2, 4, 6, 8, 1]) {
    await button('Chart layout').click();
    await button(`Layout ${size}`).click();
    await expect(page.locator('.chart-pane:visible')).toHaveCount(size);
    await retained('layout' + size);
    if (size === 2) {
      await pane().getByTestId('pane-maximize-0').click();
      await retained('chartMaximized');
      await pane().getByTestId('chart-maximize-0').click();
      await retained('chartRestored');
    }
  }
  await page.getByTestId('watchlist-symbol-SBIN-EQ').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol', /SBIN/, { timeout: 30000 });
  await retained('instrumentChanged');
  await button('Active timeframe 1w').click();
  await expect(canvas()).toHaveAttribute('data-history-interval', '1w', { timeout: 30000 });
  await retained('timeframeChanged');
  await screenshot('after');
  await app.close();
  await launch();
  await retained('restart');
  assert.deepEqual((await request('/workspace')).panes[0].drawing_sets, retainedDrawings);
  await expect(canvas()).toHaveAttribute('data-history-symbol', /SBIN/);
  await expect(canvas()).toHaveAttribute('data-history-interval', '1w');
  assert.deepEqual(evidence.rendererErrors, []);
  console.log(`PASS: native study separators and headers before release and after resize, ${evidence.samples.length} samples, persistence across chart and window changes and restart.`);
} finally {
  try {
    await app?.close();
  } finally {
    await writeFile(join(output, 'study-pane-resize-verification.json'), JSON.stringify(evidence, null, 2));
  }
}
