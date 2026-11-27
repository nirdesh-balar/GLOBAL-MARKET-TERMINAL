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
const indicators = ['RSI', 'STOCHRSI', 'MACD', 'ATR', 'ADX'].map(kind => defaultIndicator(kind, 'resize-' + kind));
const initialLayout = Object.fromEntries([['volume', 124], ['resize-RSI', 148], ['resize-STOCHRSI', 128],
  ['resize-MACD', 116], ['resize-ATR', 108], ['resize-ADX', 104]].map(([id, height]) => [id, { height, collapsed: false }]));
const studyIds = Object.keys(initialLayout);
const evidence = { profile, samples: [], persisted: {}, rendererErrors: [] };
let app, page;
const launch = async () => {
  app = await electron.launch({ executablePath: sourceElectron, args: ['.'], timeout: 60000,
    env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' } });
  page = await app.firstWindow();
  page.on('pageerror', error => evidence.rendererErrors.push(error.message));
  await expect(page.getByRole('button', {name:'Charts by TradingView',exact:true})).toBeVisible({ timeout: 45000 });
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
const aligned = rows => rows.every(row => Number.isFinite(row.top) && Number.isFinite(row.label) &&
  Math.abs(row.top - row.label) <= 1 && row.labelHeight > 0 && row.labelHeight < row.height);
const row = (rows, id) => rows.find(value => value.id === id);
async function ready() {
  await expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/, { timeout: 30000 });
  await expect.poll(async () => aligned(await geometry())).toBe(true);
}
async function resize(id, pixels, name) {
  const before = await geometry();
  const oldTop = row(before, id).top;
  let lastTop = oldTop;
  await dragStudySeparator(page, canvas(), id, pixels, async fraction => {
    await expect.poll(async () => Math.abs(row(await geometry(), id).top - lastTop)).toBeGreaterThan(3);
    const held = await geometry();
    lastTop = row(held, id).top;
    evidence.samples.push({ name, fraction, held: true, rows: held });
    if (fraction === 0.67 && name === 'volume-expand') await screenshot('while-held');
    assert.ok(aligned(held), `Headers during ${name} before mouse release: ${JSON.stringify(held)}`);
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
  workspace.panes[0].study_layout = initialLayout;
  await request('/workspace', 'PUT', workspace);
  await page.reload();
  await ready();
  await screenshot('initial');
  await idleHistory();
  const creationCount = await canvas().getAttribute('data-chart-creations');
  const providerBefore = (await request('/api/history/status')).provider_requests;
  await resize('volume', -48, 'volume-expand');
  await resize('volume', 26, 'volume-shrink');
  await resize('resize-RSI', -32, 'rsi-expand');
  await resize('resize-RSI', 20, 'rsi-shrink');
  await button('Collapse study resize-STOCHRSI').click();
  await expect.poll(async () => row(await geometry(), 'resize-STOCHRSI').height).toBeLessThan(40);
  await resize('volume', -22, 'volume-with-stochastic-collapsed');
  await button('Expand study resize-STOCHRSI').click();
  await ready();
  await expect.poll(async () => row(await geometry(), 'resize-STOCHRSI').height).toBeGreaterThan(100);
  await expect(pane().locator('.study-pane-controls').getByText('Height', { exact: true })).toHaveCount(0);
  await expect(pane().locator('.study-pane-controls :is(summary, input[type="range"])')).toHaveCount(0);
  await idleHistory();
  assert.equal((await request('/api/history/status')).provider_requests, providerBefore, 'Resizing and collapse reuse cached data');
  await expect(canvas()).toHaveAttribute('data-chart-creations', creationCount);
  const expected = await saved();
  evidence.persisted.afterDrag = expected;
  for (const id of ['resize-MACD', 'resize-ATR', 'resize-ADX']) {
    assert.deepEqual(expected[id], initialLayout[id], 'Unmoved studies keep their saved height');
  }
  await dragStudySeparator(page, canvas(), 'volume', 0);
  assert.deepEqual(await saved(), expected, 'A separator click keeps saved heights');
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
