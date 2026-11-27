import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';

const output = 'test-results/reference-legend';
const profile = await mkdtemp(join(tmpdir(), 'gmt-reference-legend-fixture-'));
const env = { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' };
const errors = [];
let app, page;
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const pane = (id = 0) => page.getByTestId(`pane-${id}`);
const canvas = () => pane().locator('.chart-canvas');
const topRow = id => pane().getByTestId(`study-legend-0-${id}`);
const paneRow = id => pane().getByTestId(`study-controls-0-${id}`);
const manager = () => page.getByRole('dialog', { name: 'Indicator manager' });
const settings = () => page.getByRole('dialog', { name: 'Indicator settings' });
const requests = () => page.evaluate(() => window.terminal.request('/api/history/status'));
const workspace = () => page.evaluate(() => window.terminal.request('/workspace'));
const saved = () => expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state', 'Saved locally');
const nativePanes = () => canvas().evaluate(node => JSON.parse(node.dataset.studyPanes));
const shot = name => page.screenshot({ path: join(output, `fixture-${name}.png`) });

async function start() {
  app = await electron.launch({ executablePath: sourceElectron, args: ['.'], env, timeout: 60000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 834 });
  await expect(button('Chart layout')).toBeVisible({ timeout: 45000 });
}

async function setColor(row, names, colors) {
  const edit = row.locator('.study-legend-actions button').nth(1);
  await edit.focus();
  await expect(row.locator('.study-legend-actions')).toHaveCSS('opacity', '1');
  await edit.press('Enter');
  await expect(settings()).toBeVisible();
  for (const [i, name] of names.entries()) await settings().getByLabel(name, { exact: true }).fill(colors[i]);
  await button('Apply settings', settings()).click();
}

async function comparePlots(row, index, time, overlays = false) {
  const readings = await row.locator('[data-study-output]').evaluateAll(nodes => nodes.map(node => ({
    value: Number(node.dataset.value), name: node.dataset.studyOutput, color: getComputedStyle(node).color,
  })));
  const plots = await canvas().evaluate((node, { index, time, overlays }) => {
    const series = node.__chart.panes()[index].getSeries()
      .filter(item => !overlays || item.seriesType() === 'Line');
    const sample = series.map(item => {
      const point = item.data().find(point => point.time === time);
      const color = point?.color ?? item.options().color;
      const swatch = document.createElement('span');
      swatch.style.color = color?.slice(0, 7) ?? '';
      return { value: point?.value, color: swatch.style.color };
    });
    return sample;
  }, { index, time, overlays });
  assert.equal(readings.length, plots.length);
  for (const [i, reading] of readings.entries()) {
    assert.ok(Number.isFinite(reading.value), reading.name);
    assert.ok(Math.abs(reading.value - plots[i].value) < 1e-10, reading.name);
    assert.equal(reading.color, plots[i].color, reading.name);
  }
  return readings;
}

try {
  await mkdir(output, { recursive: true });
  await start();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await button('Active timeframe 15m').click();
  const identity = 'yahoo:ICICIBANK.NS:NSE:equity';
  await expect(canvas()).toHaveAttribute('data-history-symbol', identity, { timeout: 30000 });
  await expect(canvas()).toHaveAttribute('data-history-interval', '15m', { timeout: 30000 });
  const before = await requests();
  await expect(topRow('volume')).toHaveCount(0);
  await button('Indicators').click();
  for (const name of ['VWMA','VWAP','Volume','RSI','MACD']) await button('Add ' + name, manager()).click();
  await expect(button('Add Volume', manager())).toBeDisabled();
  await button('Close indicators').click();
  await saved();

  const all = (await workspace()).panes[0].indicators;
  const [ema, vwma, vwap, rsi, macd] = ['EMA','VWMA','VWAP','RSI','MACD'].map(kind => all.find(item => item.kind === kind));
  const volume = topRow('volume');
  const rsiRow = paneRow(rsi.id), macdRow = paneRow(macd.id);
  const top = () => pane().locator('.study-legend-list');
  const count = top().getByTestId('study-legend-count-0');
  await expect(count).toHaveText('6');
  await expect.poll(async () => (await nativePanes()).map(({ id, index }) => [id,index])).toEqual([[rsi.id,1],[macd.id,2]]);
  await expect(topRow(rsi.id)).toHaveCount(0);
  await expect(topRow(macd.id)).toHaveCount(0);
  await expect(volume.locator('.study-legend-actions button')).toHaveCount(3);
  await expect(button('More Volume actions', volume)).toHaveCount(0);
  await expect(pane().getByTestId('study-controls-0-volume')).toHaveCount(0);
  assert.deepEqual(await canvas().evaluate(node => node.__chart.panes().map(pane =>
    pane.getSeries().map(series => series.options().priceScaleId ?? 'right'))), [
    ['gmt-volume','right','right','right','right'],['right'],['right','right','right'],
  ]);

  const volumeActions = volume.locator('.study-legend-actions');
  await page.mouse.move(1300,600);
  await expect(volume).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const box = await volume.boundingBox();
  await volume.hover();
  await expect(volumeActions).toHaveCSS('opacity','1');
  assert.deepEqual(await volume.boundingBox(), box);
  await page.mouse.move(1300,600);
  await expect(volumeActions).toHaveCSS('opacity','0');
  const rows = [topRow(ema.id),topRow(vwma.id),topRow(vwap.id),volume,rsiRow,macdRow];
  const names = ['EMA 20','VWMA 20','VWAP session','Volume','RSI 14','MACD 12/26/9'];
  for (const [i, row] of rows.entries()) {
    await expect(row.locator('.study-legend-name')).toHaveText(names[i]);
    await expect(row.locator('.study-legend-name')).toHaveCSS('color','rgb(220, 222, 230)');
    await expect(row).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await expect(row.locator('.study-legend-actions')).toHaveCSS('opacity','0');
    await expect(row.locator('.study-legend-actions button')).toHaveCount(3);
  }
  await expect(topRow(ema.id).locator('.study-legend-parameters')).toHaveCSS('color','rgb(146, 153, 167)');
  await setColor(topRow(ema.id),['Line color'],['#35c17b']);
  await setColor(topRow(vwma.id),['Line color'],['#bc7bf0']);
  await setColor(rsiRow,['Line color'],['#bd95ff']);
  await setColor(macdRow,['Line color','Signal color','Positive histogram color','Negative histogram color'],
    ['#f39241','#58a4ff','#28b5a3','#df6379']);

  await page.mouse.move(1300,600);
  const latest = await canvas().evaluate(node => node.__mainSeries.data().at(-1).time);
  const overlayReadings = () => top().locator('.study-legend-row:not(.volume-legend-row)');
  const latestColors = await comparePlots(overlayReadings(),0,latest,true);
  const rsiLatest = await comparePlots(rsiRow,1,latest);
  const macdLatest = await comparePlots(macdRow,2,latest);
  assert.equal(macdLatest[0].color,'rgb(243, 146, 65)');
  assert.equal(macdLatest[1].color,'rgb(88, 164, 255)');

  const crosshair = await canvas().evaluate((node, latest) => {
    const histogram = node.__chart.panes()[2].getSeries().find(series => series.seriesType() === 'Histogram');
    const latestPoint = histogram.data().at(-1);
    const historic = histogram.data().findLast(point => point.time !== latest && point.value !== undefined
      && (point.value < 0) !== (latestPoint.value < 0) && node.__chart.timeScale().timeToCoordinate(point.time) > 310);
    return historic?.time;
  }, latest);
  assert.ok(crosshair, 'Fixture contains an on-screen histogram point with the opposite sign');
  const bounds = await canvas().boundingBox();
  const x = await canvas().evaluate((node,time)=>node.__chart.timeScale().timeToCoordinate(time),crosshair);
  assert.ok(x > 0);
  await page.mouse.move(bounds.x+x,bounds.y+200);
  await expect(canvas()).toHaveAttribute('data-crosshair-time',String(crosshair));
  await comparePlots(overlayReadings(),0,crosshair,true);
  await comparePlots(rsiRow,1,crosshair);
  const historicMacd = await comparePlots(macdRow,2,crosshair);
  assert.notEqual(historicMacd[2].color,macdLatest[2].color);
  await shot('crosshair');
  await page.mouse.move(1300,600);

  const native = await canvas().getAttribute('data-study-series');
  const toggle = button('Indicator legend pane 0',pane());
  await toggle.click();
  await expect(volume).toBeHidden();
  await expect(count).toHaveText('6');
  await expect(canvas()).toHaveAttribute('data-study-series',native);
  assert.ok(await canvas().evaluate(node=>node.__chart.panes()[0].getSeries().some(series=>series.options().priceScaleId==='gmt-volume')));
  await toggle.click();
  await expect(volume).toBeVisible();
  await rsiRow.hover();
  await expect(rsiRow.locator('.study-legend-actions')).toHaveCSS('opacity','1');
  await button(`Hide study ${rsi.id}`,rsiRow).click();
  await expect(rsiRow).toHaveCount(0);
  await button('Show RSI 14',topRow(rsi.id)).click();
  await expect.poll(async () => (await nativePanes()).map(({ id }) => id)).toEqual([rsi.id,macd.id]);
  await saved();
  assert.equal((await workspace()).panes[0].indicators.find(item=>item.id===rsi.id).color,'#bd95ff');

  await button('Remove Volume',volume).click();
  await expect(volume).toHaveCount(0);
  await expect(count).toHaveText('5');
  await expect.poll(async ()=>(await nativePanes()).length).toBe(2);
  await button('Indicators').click();
  await button('Add Volume',manager()).click();
  await button('Close indicators').click();
  await expect(volume).toBeVisible();
  await expect(button('Toggle theme')).toBeVisible();
  await button('Toggle theme').click();
  await expect(rsiRow.locator('.study-legend-name')).toHaveCSS('color','rgb(30, 41, 59)');
  await button('Toggle theme').click();
  await saved();
  const after = await requests();
  assert.equal(after.provider_requests,before.provider_requests);
  assert.equal(after.history_requests,before.history_requests);
  const snapshot = await workspace();

  await app.close();
  await start();
  await expect(canvas()).toHaveAttribute('data-history-interval','15m',{timeout:30000});
  await expect(paneRow(macd.id).locator('[data-study-output]')).toHaveCount(3);
  assert.deepEqual((await workspace()).panes[0], snapshot.panes[0]);
  await page.mouse.move(1300,600);
  assert.deepEqual(await comparePlots(overlayReadings(),0,latest,true),latestColors);
  assert.deepEqual(await comparePlots(paneRow(rsi.id),1,latest),rsiLatest);
  assert.deepEqual(await comparePlots(paneRow(macd.id),2,latest),macdLatest);
  await button('Chart layout').click();
  await button('Layout 2').click();
  const otherEma = await pane(1).locator('.study-legend-name').first().innerText();
  assert.equal(otherEma,'EMA 20');
  assert.equal((await workspace()).panes[1].indicators[0].color,'#f4bd61');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'reference-native.json'),JSON.stringify({names,latestColors,rsiLatest,macdLatest,historicMacd,
    barsTime:latest,matchedHistoricTime:crosshair,oppositeHistogramColor:true,
    extraProviderRequests:after.provider_requests-before.provider_requests,extraHistoryRequests:after.history_requests-before.history_requests,
    rendererErrors:errors},null,2));
  console.log('PASS neutral transparent legends, exact plot values and colors, hover/focus, direct Volume removal, pane order, theme and restart.');
} catch (error) {
  await shot('failure').catch(()=>{});
  throw error;
} finally {
  await app?.close();
}
