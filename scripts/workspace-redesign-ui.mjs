import { openWatchlistOptions } from './watchlist-controls.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect } from './isolated-electron.mjs';
import { dragStudySeparator } from './study-separator.mjs';

await mkdir('test-results', { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'gmt-workspace-test-'));
const app = await electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_OFFLINE: '1', IMT_UI_FIXTURE: '1', IMT_TEST_DATA_DIR: profile },
  timeout: 60000,
});

try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByText('DIRECT FETCH', { exact: true })).toBeVisible({ timeout: 45000 });
  const display = await page.context().newCDPSession(page);
  await display.send('Emulation.setDeviceMetricsOverride', {
    width: 1470, height: 804, deviceScaleFactor: 2, mobile: false,
  });
  const nativeWindow = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { fullScreen: window.isFullScreen(), controls: window.getWindowButtonPosition() };
  });
  assert.equal(nativeWindow.fullScreen, false);
  assert.ok(nativeWindow.controls && nativeWindow.controls.y < 26, 'Native macOS window controls fit within the title strip');
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  const pane = page.getByTestId('pane-0');
  const canvas = pane.locator('.chart-canvas');
  const ready = async () => {
    await expect(pane.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });
    await expect(canvas).toHaveAttribute('data-rendered-bars', /^[1-9]/);
  };
  const workspace = () => page.evaluate(() => window.terminal.request('/workspace'));
  const historyStatus = () => page.evaluate(() => window.terminal.request('/api/history/status'));
  await ready();
  const toolbar = page.locator('.terminal-header');
  await expect(toolbar.getByLabel('Active timeframe menu')).toHaveCount(0);
  await expect(toolbar.getByLabel('Create alert from active chart')).toHaveCount(0);
  const indicatorsButton = toolbar.getByRole('button', { name: 'Indicators', exact: true });
  await expect(indicatorsButton).toHaveAttribute('title', 'Indicators');
  await expect(indicatorsButton.locator('svg')).toBeVisible();
  await expect(indicatorsButton).toHaveText('');
  const inline = pane.locator('.pane-toolbar');
  await expect(inline.getByRole('button')).toHaveCount(4);
  await expect(inline.locator('.pane-symbol, select')).toHaveCount(0);
  for (const name of ['Auto Refresh pane 0', 'Refresh pane 0', 'Volume pane 0', 'Maximize chart 0']) {
    await expect(inline.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(pane.locator('#tv-attr-logo')).toHaveCount(0);
  assert.equal(await canvas.evaluate(element => element.__chart.options().layout.attributionLogo), false);

  await app.evaluate(({ shell }) => {
    globalThis.originalTradingViewOpenExternal = shell.openExternal;
    shell.openExternal = async url => { globalThis.openedTradingViewUrl = url; };
  });
  await page.locator('.statusbar').getByRole('button', { name: 'Charts by TradingView', exact: true }).click();
  await expect.poll(() => app.evaluate(() => globalThis.openedTradingViewUrl)).toBe('https://www.tradingview.com/');
  await app.evaluate(({ shell }) => { shell.openExternal = globalThis.originalTradingViewOpenExternal; });

  await display.send('Emulation.setDeviceMetricsOverride', {
    width: 1050, height: 650, deviceScaleFactor: 2, mobile: false,
  });
  for (const timeframe of ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M', '1Y']) {
    const button = toolbar.getByRole('button', { name: `Active timeframe ${timeframe}`, exact: true });
    await expect(button).toBeInViewport({ ratio: 1 });
    await expect(button).toBeEnabled();
  }
  await display.send('Emulation.setDeviceMetricsOverride', {
    width: 1470, height: 804, deviceScaleFactor: 2, mobile: false,
  });

  await page.getByRole('button',{name:'Save workspace',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save workspace',exact:true})).toHaveAttribute('data-saved','true');
  const more = page.getByLabel('More chart options',{exact:true});
  await more.click();
  await expect(page.getByRole('button',{name:'Chart data and source'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Chart data and source'})).toHaveCount(0);
  const capture = label => page.screenshot({path:`test-results/neutral-${label}.png`});
  const measure = () => page.evaluate(() => {
    const box = selector => {
      const {x,y,width,height}=document.querySelector(selector).getBoundingClientRect();
      return {x,y,width,height};
    };
    return {
      viewport:{width:innerWidth,height:innerHeight,scale:devicePixelRatio},
      title:box('.titlebar'),
      toolbar:box('.terminal-header'), drawing:box('.drawing-toolbar'),
      analytical:box('.analysis-rail'), bottom:box('.bottom-chart-toolbar'),
      chart:box('.chart-canvas'), watchlist:document.querySelector('.professional-watchlist')?box('.professional-watchlist'):null,
    };
  });
  await expect(page.locator('.watch-row').first()).toHaveAttribute('data-quote-state','ready',{timeout:30000});
  await more.evaluate(element=>element.blur());
  const expandedDock=await measure();
  await capture('expanded');
  const dock = page.getByRole('button', { name: 'Toggle sidebar', exact: true });
  await dock.click();
  await expect(dock).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.professional-watchlist')).toHaveCount(0);
  const collapsedDock=await measure();
  assert.equal(collapsedDock.analytical.width,45);
  assert.equal(collapsedDock.toolbar.height,46);
  assert.equal(collapsedDock.drawing.width,46);
  assert.equal(collapsedDock.bottom.height,32);
  assert.equal(collapsedDock.title.height,26);
  assert.equal(collapsedDock.toolbar.y,26);
  assert.ok(collapsedDock.chart.width>expandedDock.chart.width);
  const axis = await canvas.evaluate(el => {
    const chart = el.__chart;
    const priceScale = chart.priceScale('right');
    const context = document.createElement('canvas').getContext('2d');
    const { fontFamily, fontSize } = chart.options().layout;
    context.font = `${fontSize}px ${fontFamily}`;
    const label = el.__mainSeries.priceFormatter().format(Number(el.dataset.lastClose));
    return { priceWidth: priceScale.width(), labelWidth: context.measureText(label).width, timeHeight: chart.timeScale().height(), label };
  });
  assert.ok(axis.priceWidth >= 60 && axis.priceWidth > axis.labelWidth);
  console.log('Workspace geometry:',JSON.stringify({expanded:expandedDock,collapsed:collapsedDock,axis,nativeWindow}));
  await page.mouse.move(4,4);
  await capture('collapsed');
  await dock.click();
  await expect(page.locator('.professional-watchlist')).toBeVisible();
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 2', { exact: true }).click();
  await openWatchlistOptions(page);await page.getByLabel('Open symbol in pane', { exact: true }).selectOption('1');await page.keyboard.press('Escape');
  const tcs = page.locator('.watch-select').filter({ has: page.getByText('TCS', { exact: true }) });
  await expect(tcs).toHaveCount(1);
  await tcs.click();
  const secondPane = page.getByTestId('pane-1');
  await expect(secondPane.locator('.pane-symbol')).toHaveText('TCS');
  await expect(secondPane.locator('.chart-canvas')).toHaveAttribute('data-rendered-bars', /^[1-9]/);
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });
  const secondTimeframe = secondPane.getByLabel('Timeframe pane 1');
  await expect(secondTimeframe).toBeVisible();
  const firstInterval = await canvas.getAttribute('data-history-interval');
  const secondInterval = await secondTimeframe.inputValue();
  await secondTimeframe.selectOption('1w');
  await expect(secondPane.locator('.chart-canvas')).toHaveAttribute('data-history-interval', '1w');
  await expect(canvas).toHaveAttribute('data-history-interval', firstInterval);
  await secondTimeframe.selectOption(secondInterval);
  await expect(secondPane.locator('.chart-canvas')).toHaveAttribute('data-history-interval', secondInterval);
  await expect(secondPane.getByLabel('Indicators pane 1')).toBeVisible();
  await expect(secondPane.getByLabel('Create alert pane 1')).toBeVisible();
  await expect(page.locator('.chart-grid #tv-attr-logo')).toHaveCount(0);
  const activeType = page.getByLabel('Active chart type', { exact: true });
  await activeType.selectOption('line');
  await expect.poll(async () => (await workspace()).panes[1].chart_type).toBe('line');
  await expect(secondPane.getByLabel('Chart type pane 1')).toHaveValue('line');
  await activeType.selectOption('candles');
  await expect.poll(async () => (await workspace()).panes[1].chart_type).toBe('candles');
  await page.mouse.move(4,4);
  await capture('two-charts');
  await page.getByLabel('Chart layout', { exact: true }).click();
  await page.getByLabel('Layout 1', { exact: true }).click();
  const separatesQuote = () => page.locator('.watch-select').first().evaluate(row => {
    const name = row.querySelector('span:first-child strong').getBoundingClientRect();
    const quote = row.querySelector('.quote > strong').getBoundingClientRect();
    return name.width > 40 && name.right <= quote.left;
  });
  await expect.poll(separatesQuote).toBe(true);
  const resizeDock = page.getByRole('separator', { name: 'Resize watchlist' });
  const dockWidth = (await workspace()).sidebar.width;
  await resizeDock.focus();
  await resizeDock.press('ArrowRight');
  await expect.poll(async () => (await workspace()).sidebar.width).toBe(dockWidth - 16);
  await resizeDock.press('ArrowLeft');
  await expect.poll(async () => (await workspace()).sidebar.width).toBe(dockWidth);
  await page.getByRole('button', { name: 'Inspect active chart data' }).click();
  await expect(pane.getByLabel('History source pane 0')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect active chart data' }).click();
  await expect(pane.getByLabel('History source pane 0')).toBeHidden();

  await page.getByLabel('Search stocks and indices', { exact: true }).click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN').fill('RELIANCE');
  await expect(page.locator('.search-results').getByRole('button',{name:/RELIANCE/}).first()).toBeVisible();
  await page.getByLabel('Close search').click();
  await toolbar.getByRole('button', { name: 'Active timeframe 1w', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-history-interval', '1w');
  await ready();
  await page.getByLabel('Active timeframe 1d', { exact: true }).click();
  await expect(canvas).toHaveAttribute('data-history-interval', '1d');
  await ready();
  await page.getByLabel('Active chart type').selectOption('line');
  await expect.poll(async () => (await workspace()).panes[0].chart_type).toBe('line');
  await page.getByLabel('Active chart type').selectOption('candles');
  await ready();

  const providerCount = (await historyStatus()).provider_requests;
  const ema = (await workspace()).panes[0].indicators.find(indicator => indicator.kind === 'EMA');
  assert.ok(ema);
  await pane.getByTestId(`legend-settings-${ema.id}`).click();
  const settings = page.getByRole('dialog', { name: 'Indicator settings' });
  await settings.getByLabel('Length', { exact: true }).fill('9');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect.poll(async () => (await workspace()).panes[0].indicators.find(indicator => indicator.id === ema.id).length).toBe(9);

  await indicatorsButton.click();
  const manager = page.getByRole('dialog', { name: 'Indicator manager' });
  await manager.getByLabel('Search indicators').fill('RSI');
  await manager.getByLabel('Add RSI', { exact: true }).click();
  await manager.getByLabel('Add Stochastic RSI', { exact: true }).click();
  await manager.getByLabel('Close indicators').click();
  await expect.poll(async () => (await workspace()).panes[0].indicators.length).toBe(3);
  const { indicators } = (await workspace()).panes[0];
  const rsi = indicators.find(indicator => indicator.kind === 'RSI');
  const stochastic = indicators.find(indicator => indicator.kind === 'STOCHRSI');
  assert.ok(rsi && stochastic);
  const studyPanes = async () => JSON.parse(await canvas.getAttribute('data-study-panes') || '[]');
  await expect.poll(async () => (await studyPanes()).filter(row => [rsi.id, stochastic.id].includes(row.id)).length).toBe(2);
  const rsiControls = pane.getByTestId(`study-controls-0-${rsi.id}`);
  await rsiControls.getByLabel(`Collapse study ${rsi.id}`).click();
  await expect.poll(async () => (await studyPanes()).find(row => row.id === rsi.id)?.collapsed).toBe(true);
  await rsiControls.getByLabel(`Expand study ${rsi.id}`).click();
  await expect.poll(async () => (await studyPanes()).find(row => row.id === rsi.id)?.height).toBeGreaterThan(100);
  await dragStudySeparator(page, canvas, rsi.id, -8);
  await expect.poll(async () => (await workspace()).panes[0].study_layout[rsi.id]?.height).toBe(112);

  assert.equal((await historyStatus()).provider_requests, providerCount, 'Study controls must reuse loaded history');
  await toolbar.getByRole('button', { name: 'Active timeframe 15m', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-history-interval', '15m');
  await ready();
  const series = JSON.parse(await canvas.getAttribute('data-study-series') || '[]');
  assert.ok(series.some(study => study.id === rsi.id && study.valid > 0));
  assert.ok(series.filter(study => study.id === stochastic.id && study.valid > 0).length >= 2);
  const zoneProviderCount = (await historyStatus()).provider_requests;
  const zoneTrigger = pane.getByLabel('Time zone pane 0');
  const visibleRange = () => canvas.evaluate(element => element.__chart.timeScale().getVisibleLogicalRange());
  const bars = Number(await canvas.getAttribute('data-rendered-bars'));
  assert.ok(bars > 20);
  await canvas.evaluate((element,count) => element.__chart.timeScale().setVisibleLogicalRange({from:Math.max(0,count-100),to:count-10}),bars);
  await expect.poll(async () => (await visibleRange()).to).toBeLessThan(bars);
  await zoneTrigger.click();
  const timeZone = page.getByRole('dialog', { name: 'Chart display time zone' });
  const beforeZone = await visibleRange();
  await timeZone.getByRole('textbox', { name: 'Search time zones' }).fill('New York');
  await timeZone.getByRole('radio', { name: /America\/New York/ }).check();
  await timeZone.getByRole('button', { name: 'Apply' }).click();
  await expect(zoneTrigger).toBeFocused();
  await expect.poll(async () => (await workspace()).panes[0].display_timezone).toBe('America/New_York');
  await expect.poll(async () => Math.round((await visibleRange()).from)).toBe(Math.round(beforeZone.from));
  assert.equal((await historyStatus()).provider_requests, zoneProviderCount);
  await zoneTrigger.click();
  await timeZone.getByRole('textbox', { name: 'Search time zones' }).fill('UTC');
  await timeZone.getByRole('radio', { name: /^UTC/ }).check();
  await page.keyboard.press('Escape');
  await expect(timeZone).toBeHidden();
  assert.equal((await workspace()).panes[0].display_timezone, 'America/New_York');

  await pane.getByLabel('Percent pane 0').click();
  await expect(pane.getByLabel('Percent pane 0')).toHaveAttribute('aria-pressed', 'true');
  const bounds = await canvas.boundingBox();
  const y = 135;
  const expected = await canvas.evaluate((element, offset) => element.__mainSeries.coordinateToPrice(offset), y);
  await page.mouse.move(bounds.x + 220, bounds.y + y);
  const priceAlert = pane.getByLabel('Create alert at cursor price pane 0');
  await expect(priceAlert).toBeVisible();
  await priceAlert.click();
  const alert = page.getByRole('dialog', { name: 'Create historical alert' });
  const threshold = alert.getByLabel('value 0-0');
  await expect(threshold).toBeVisible();
  const seededPrice = Number(await threshold.inputValue());
  assert.ok(seededPrice > 100 && Math.abs(seededPrice - expected) < 1, `Cursor must pass raw price: ${seededPrice} versus ${expected}`);
  await alert.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(alert).toBeHidden();
  await expect(pane.getByLabel('Chart studies viewport 0')).toBeFocused();
  await pane.getByLabel('Percent pane 0').click();

  await page.mouse.move(3, 3);
  await page.screenshot({ path: 'test-results/workspace-oscillators.png' });
  await pane.getByLabel(`Hide study ${rsi.id}`, { exact: true }).click();
  await expect.poll(async () => (await workspace()).panes[0].indicators.find(indicator => indicator.id === rsi.id).visible).toBe(false);
  await pane.getByLabel(`Remove study ${stochastic.id}`, { exact: true }).click();
  await expect.poll(async () => (await workspace()).panes[0].indicators.some(indicator => indicator.id === stochastic.id)).toBe(false);
  assert.equal((await historyStatus()).provider_requests, zoneProviderCount, 'Local presentation controls must not fetch provider history');

  await page.getByTestId('drawing-category-lines').click();
  await expect(page.getByTestId('drawing-flyout').getByRole('button', { name: 'Horizontal line', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-flyout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Screener workspace' }).click();
  await expect(page.getByTestId('screener-page')).toBeVisible();
  await page.getByRole('button', { name: 'Return to charts', exact: true }).click();
  await page.getByRole('button', { name: 'Alerts workspace' }).click();
  await expect(page.getByTestId('alerts-page')).toBeVisible();
  await page.getByTestId('alerts-page').getByRole('button', { name: /Return to charts/i }).click();
  await page.getByRole('button', { name: 'Chart Grid workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Chart Grid', exact: true })).toBeVisible();
  const controls = await page.evaluate(() => [...document.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => button.textContent.trim()));
  assert.ok(!controls.some(label => /^(buy|sell|trade|trading panel|strategy tester)$/i.test(label)));
  assert.deepEqual(errors, []);
  console.log('PASS: workspace rail, search, timeframe/type, EMA settings, both oscillators, resize/collapse, display zone, raw price alert in percent mode, local-only controls and navigation.');
} finally {
  await app.close();
}
