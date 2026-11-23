import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect } from './isolated-electron.mjs';

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

  const dock = page.getByRole('button', { name: 'Watchlist dock', exact: true });
  await dock.click();
  await expect(dock).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.professional-watchlist')).toHaveCount(0);
  await dock.click();
  await expect(page.locator('.professional-watchlist')).toBeVisible();
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
  await page.getByLabel('Active timeframe menu').selectOption('1w');
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
  await pane.getByLabel(`Legend settings ${ema.id}`).click();
  const settings = page.getByRole('dialog', { name: 'Indicator settings' });
  await settings.getByLabel('Length', { exact: true }).fill('9');
  await settings.getByRole('button', { name: 'Apply settings' }).click();
  await expect.poll(async () => (await workspace()).panes[0].indicators.find(indicator => indicator.id === ema.id).length).toBe(9);

  await page.getByLabel('Active chart indicators').click();
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
  await rsiControls.getByLabel(`Resize study ${rsi.id}`).click();
  const resize = rsiControls.getByRole('slider',{name:`Height study ${rsi.id}`,exact:true});
  await resize.focus();
  await resize.press('ArrowRight');
  await expect.poll(async () => (await workspace()).panes[0].study_layout[rsi.id]?.height).toBe(112);
  await rsiControls.getByLabel(`Resize study ${rsi.id}`).click();

  assert.equal((await historyStatus()).provider_requests, providerCount, 'Study controls must reuse loaded history');
  await page.getByLabel('Active timeframe menu').selectOption('15m');
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
  await page.getByRole('button', { name: 'Open market scanner' }).click();
  await expect(page.getByTestId('screener-page')).toBeVisible();
  await page.getByRole('button', { name: 'Return to charts', exact: true }).click();
  await page.getByRole('button', { name: 'Open local alerts' }).click();
  await expect(page.getByTestId('alerts-page')).toBeVisible();
  await page.getByTestId('alerts-page').getByRole('button', { name: /Return to charts/i }).click();
  await page.getByRole('button', { name: 'Open analysis grid' }).click();
  await expect(page.getByRole('heading', { name: 'Chart Grid', exact: true })).toBeVisible();
  const controls = await page.evaluate(() => [...document.querySelectorAll('button')].filter(button => button.getClientRects().length).map(button => button.textContent.trim()));
  assert.ok(!controls.some(label => /^(buy|sell|trade|trading panel|strategy tester)$/i.test(label)));
  assert.deepEqual(errors, []);
  console.log('PASS: workspace rail, search, timeframe/type, EMA settings, both oscillators, resize/collapse, display zone, raw price alert in percent mode, local-only controls and navigation.');
} finally {
  await app.close();
}
