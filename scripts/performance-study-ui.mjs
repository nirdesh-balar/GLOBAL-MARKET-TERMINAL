import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';

const output = resolve(process.env.GMT_PERFORMANCE_OUTPUT || 'test-results/stage2a');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'gmt-performance-study-'));
const bundle = await build({ entryPoints: ['desktop/src/charts/indicators.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false });
const { defaultIndicator } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const kinds = ['SMA', 'EMA', 'VWMA', 'VWAP', 'WMA', 'DEMA', 'TEMA', 'HMA', 'KAMA', 'LSMA', 'BB', 'RSI', 'MACD'];
const timingOnly = process.argv.includes('--timing-only');
let app;
try {
  app = await electron.launch({ executablePath: sourceElectron, args: ['.'], timeout: 60000,
    env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' } });
  const page = await app.firstWindow();
  const button = name => page.getByRole('button', { name, exact: true });
  const request = (path, method = 'GET', body) =>
    page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [path, method, body]);
  await expect(button('Chart layout')).toBeVisible({ timeout: 45000 });
  await button('Chart layout').click();
  await button('Layout 1').click();
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  const canvas = page.getByTestId('pane-0').locator('.chart-canvas');
  await expect(canvas).toHaveAttribute('data-history-symbol', 'yahoo:ICICIBANK.NS:NSE:equity');
  await expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state', 'Saved locally');
  const workspace = await request('/workspace');
  const pane = workspace.panes[0];
  pane.timeframe = '1d';
  pane.volume = true;
  pane.indicators = kinds.map(kind => defaultIndicator(kind, 'perf-' + kind));
  await request('/workspace', 'PUT', workspace);
  await page.reload();
  await expect(canvas).toHaveAttribute('data-rendered-bars', /^[1-9][0-9]{3,}$/);
  await expect(page.locator('.chart-overlay')).toHaveCount(0);
  const summary = await canvas.getAttribute('data-study-series');
  const series = JSON.parse(summary);
  assert.ok(series.length >= 10);
  const bars = Number(await canvas.getAttribute('data-rendered-bars'));
  const box = await canvas.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (let i = 0; i < 8; i++) await page.mouse.move(box.x + box.width * (0.25 + i * 0.04), box.y + box.height * 0.20);
  await frame();
  const samples = [];
  for (let run = 0; run < 3; run++) {
    if (!timingOnly) await page.evaluate(() => {
      window.__studyScanSamples = { calls: 0, points: 0, original: Array.prototype.filter };
      const probe = window.__studyScanSamples;
      Array.prototype.filter = function (...args) {
        if (this.length >= 1000 && /\.value\s*!==\s*null/.test(String(args[0]))) {
          probe.calls++;
          probe.points += this.length;
        }
        return Reflect.apply(probe.original, this, args);
      };
    });
    const before = await metrics();
    const start = performance.now();
    for (let i = 0; i < 60; i++) {
      await page.mouse.move(box.x + box.width * (0.25 + i * 0.007), box.y + box.height * 0.20);
      if (i % 10 === 9) await frame();
    }
    await frame();
    const elapsedMs = performance.now() - start;
    const after = await metrics();
    const scans = timingOnly ? null : await page.evaluate(() => {
      const { calls, points, original } = window.__studyScanSamples;
      Array.prototype.filter = original;
      delete window.__studyScanSamples;
      return { calls, points };
    });
    samples.push({ elapsedMs, scans, scriptMs: 1000 * (after.ScriptDuration - before.ScriptDuration),
      layoutMs: 1000 * (after.LayoutDuration - before.LayoutDuration), heapBefore: before.JSHeapUsedSize,
      heapAfter: after.JSHeapUsedSize });
    assert.equal(await canvas.getAttribute('data-study-series'), summary);
    if (scans && process.env.GMT_EXPECT_MEMO === '1') assert.equal(scans.calls, 0);
  }
  await cdp.detach();
  const evidence = { bars, series: series.length, samples };
  await writeFile(join(output, (process.env.GMT_PERFORMANCE_LABEL || 'after') + (timingOnly ? '-study-timing.json' : '-study.json')), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally {
  try { await app?.close(); } finally { await rm(profile, { recursive: true, force: true }); }
}
