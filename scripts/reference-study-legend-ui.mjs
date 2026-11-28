import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { candlePointerTarget } from './chart-crosshair.mjs';

const output = 'test-results/crosshair-stability';
const profile = await mkdtemp(join(tmpdir(), 'gmt-reference-legend-fixture-'));
const env = { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_VOLUME_REDESIGN_UI: '1', IMT_OFFLINE: '1' };
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

async function readStudyMove(time, point, groups, initial) {
  await canvas().evaluate((node, { time, point, groups, initial }) => {
    const root = node.closest('.chart-pane');
    const controller = new AbortController();
    let handledMove = false;
    const expected = groups.map(({ index, kind }) =>
      node.__chart.panes()[index].getSeries().filter(series => kind === 'all' ||
        (kind === 'overlays' && series.seriesType() === 'Line') ||
        (kind === 'volume' && series.options().priceScaleId === 'gmt-volume')).map(series => {
        const sample = series.data().find(point => point.time === time);
        const swatch = document.createElement('span');
        swatch.style.color = (sample?.color ?? series.options().color)?.slice(0, 7) ?? '';
        return { value: sample?.value, color: swatch.style.color };
      }));

    const check = () => {
      if (!handledMove || capture.result) return;
      // A freshly created chart already displays its latest candle before
      // Lightweight Charts has emitted its first crosshair event.
      const displayedTime = initial && node.dataset.crosshairTime === undefined
        ? node.__mainSeries.data().at(-1)?.time
        : Number(node.dataset.crosshairTime);
      if (displayedTime !== time) return;
      const readings = groups.map(({ selector }) => [...root.querySelectorAll(selector)].map(output => ({
        name: output.dataset.studyOutput, value: Number(output.dataset.value), color: getComputedStyle(output).color,
      })));
      const matches = expected.every((plots, index) => plots.length > 0 && plots.length === readings[index].length &&
        plots.every(({ value, color }, i) => Number.isFinite(value) && readings[index][i].value === value && readings[index][i].color === color));
      capture.last = { time: displayedTime, readings, expected };
      if (matches) capture.result = capture.last;
    };
    const observer = new MutationObserver(check);
    const capture = { stop: () => { controller.abort(); observer.disconnect(); } };
    node.__studyMoveCapture = capture;
    // Observe the exact DOM commit for the requested mouse event. Chromium can
    // deliver another native hover between separate Playwright round trips.
    observer.observe(root, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-crosshair-time', 'data-value', 'style'] });
    window.addEventListener('pointermove', event => {
      if (event.isTrusted && Math.abs(event.clientX - point.x) <= 1 && Math.abs(event.clientY - point.y) <= 1) {
        handledMove = true;
        queueMicrotask(check);
      }
    }, { capture: true, signal: controller.signal });
  }, { time, point, groups, initial });

  try {
    await page.mouse.move(point.x, point.y);
    let capture;
    await expect.poll(async () => {
      capture = await canvas().evaluate(node => {
        const capture = node.__studyMoveCapture;
        return { result: capture?.result, last: capture?.last, currentTime: Number(node.dataset.crosshairTime) };
      });
      return { matched: !!capture.result, ...capture };
    }, { message: `Mouse move must render the exact study values and colors at candle ${time}` })
      .toEqual(expect.objectContaining({ matched: true }));
    return capture.result.readings;
  } finally {
    await canvas().evaluate(node => {
      node.__studyMoveCapture?.stop();
      delete node.__studyMoveCapture;
    });
  }
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

  const groups = [
    { selector: '.study-legend-list .study-legend-row:not(.volume-legend-row) [data-study-output]', index: 0, kind: 'overlays' },
    { selector: `[data-study-header="${rsi.id}"] [data-study-output]`, index: 1, kind: 'all' },
    { selector: `[data-study-header="${macd.id}"] [data-study-output]`, index: 2, kind: 'all' },
    { selector: '[data-testid="study-legend-0-volume"] [data-study-output]', index: 0, kind: 'volume' },
  ];
  const outside = { x: 6, y: 8 };
  const readStudies = async (time, point, initial = false) => {
    const [[EMA, VWMA, VWAP], [RSI], MACD, [Volume]] = await readStudyMove(time, point, groups, initial);
    return { EMA, VWMA, VWAP, RSI, MACD, Volume };
  };
  const measurements = {};
  async function verifyHistorical(label, { opposite = false, constantVolume = false, screenshots = false } = {}) {
    const selection = await canvas().evaluate((node, { opposite, constantVolume }) => {
      const chart = node.__chart, scale = chart.timeScale();
      const latest = node.__mainSeries.data().at(-1).time;
      const series = [
        ...chart.panes()[0].getSeries().filter(s=>s.seriesType()==='Line'),
        ...chart.panes()[1].getSeries(),
        ...chart.panes()[2].getSeries(),
        ...chart.panes()[0].getSeries().filter(s=>s.options().priceScaleId==='gmt-volume'),
      ];
      const maps = series.map(s => new Map(s.data().map(point => [point.time, point.value])));
      const histogram = series.findIndex(s => s.seriesType()==='Histogram' && s.options().priceScaleId!=='gmt-volume');
      const historical = node.__mainSeries.data().findLast(bar => {
        if (bar.time === latest) return false;
        const x = scale.timeToCoordinate(bar.time);
        return x > scale.width()*.27 && x < scale.width()*.91 &&
          maps.every((values,i) => Number.isFinite(values.get(bar.time)) &&
            (constantVolume && i === maps.length-1 || Math.abs(values.get(bar.time)-values.get(latest)) > 1e-8)) &&
          (!opposite || (maps[histogram].get(bar.time)<0) !== (maps[histogram].get(latest)<0));
      })?.time;
      return { latest, historical, identity:node.dataset.historySymbol, interval:node.dataset.historyInterval };
    }, { opposite, constantVolume });
    assert.ok(selection.historical && selection.historical < selection.latest,
      `${label} has an on-screen historical candle with independently varying readings`);
    const latestValues = await readStudies(selection.latest, outside, true);
    if (screenshots) await shot('crosshair-latest');
    const target = await candlePointerTarget(canvas(),selection.historical);
    const historicalValues = await readStudies(selection.historical, target);
    if (opposite) assert.notEqual(historicalValues.MACD[2].color,latestValues.MACD[2].color);
    if (screenshots) await shot('crosshair-selected');
    const fallback = await readStudies(selection.latest, outside);
    assert.deepEqual(fallback,latestValues);
    measurements[label] = { ...selection, target, latestValues, historicalValues, fallback };
    return latestValues;
  }
  const initial = await verifyHistorical('initial',{opposite:true,screenshots:true});
  assert.equal(initial.MACD[0].color,'rgb(243, 146, 65)');
  assert.equal(initial.MACD[1].color,'rgb(88, 164, 255)');

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
  assert.deepEqual(await verifyHistorical('restart'),initial);
  await page.setViewportSize({width:1210,height:730});
  await verifyHistorical('resized');
  await page.setViewportSize({width:1440,height:834});
  await button('Active timeframe 30m').click();
  await expect(canvas()).toHaveAttribute('data-history-interval','30m',{timeout:30000});
  await expect(paneRow(macd.id).locator('[data-study-output][data-value]')).toHaveCount(3);
  await verifyHistorical('newTimeframe');
  await page.getByTestId('watchlist-symbol-SBIN-EQ').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol','yahoo:SBIN.NS:NSE:equity',{timeout:30000});
  await expect(paneRow(macd.id).locator('[data-study-output][data-value]')).toHaveCount(3);
  await verifyHistorical('newSymbol',{constantVolume:true});
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol',identity,{timeout:30000});
  await expect(paneRow(macd.id).locator('[data-study-output][data-value]')).toHaveCount(3);
  await button('Active timeframe 15m').click();
  await expect(canvas()).toHaveAttribute('data-history-interval','15m',{timeout:30000});
  await expect(paneRow(macd.id).locator('[data-study-output][data-value]')).toHaveCount(3);
  await button('Chart layout').click();
  await button('Layout 2').click();
  const otherEma = await pane(1).locator('.study-legend-name').first().innerText();
  assert.equal(otherEma,'EMA 20');
  assert.equal((await workspace()).panes[1].indicators[0].color,'#f4bd61');
  await pane(1).locator('.chart-canvas').click({position:{x:160,y:175}});
  await expect(pane(1)).toHaveClass(/\bactive\b/);
  await canvas().click({position:{x:160,y:175}});
  await expect(pane()).toHaveClass(/\bactive\b/);
  assert.deepEqual(await verifyHistorical('switchedCharts'),initial);
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'reference-native.json'),JSON.stringify({names,measurements,oppositeHistogramColor:true,
    extraProviderRequests:after.provider_requests-before.provider_requests,extraHistoryRequests:after.history_requests-before.history_requests,
    rendererErrors:errors},null,2));
  console.log('PASS neutral transparent legends, exact plot values and colors, hover/focus, direct Volume removal, pane order, theme, restart, resize, timeframe and chart switching.');
} catch (error) {
  await shot('failure').catch(()=>{});
  throw error;
} finally {
  await app?.close();
}
