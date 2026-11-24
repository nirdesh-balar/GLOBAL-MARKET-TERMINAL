import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { chooseWatchlist, openWatchlistOptions } from './watchlist-controls.mjs';

const output = resolve(process.env.GMT_WATCHLIST_EVIDENCE || 'test-results');
const profile = await mkdtemp(join(tmpdir(), 'gmt-watchlist-panel-'));
await mkdir(output, { recursive: true });
const errors = [];
let app, page;

async function launch() {
    app = await electron.launch({
        executablePath: sourceElectron, args: ['.'], timeout: 60000,
        env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_HYPERLIQUID_UI: '1', IMT_STREAM_UI: '1', IMT_OFFLINE: '1' },
    });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(sidebar()).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 30000 });
}
const request = (path, method = 'GET', data) => page.evaluate(
    ([p, m, d]) => window.terminal.request(p, m, d), [path, method, data],
);
const sidebar = () => page.getByTestId('watchlist-sidebar');
const active = () => page.getByTestId('watchlist-dropdown');
const button = name => page.getByRole('button', { name, exact: true });
const list = id => page.getByTestId('watchlist-choice-' + id);
const group = name => button(name);
const rows = () => page.locator('.watch-row');
const save = async () => {
    await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
    return request('/workspace');
};
const shot = name => page.screenshot({ path: join(output, 'watchlist-' + name + '.png') });

try {
    await launch();
    await expect(active()).toHaveAttribute('data-active-list', 'stocks');
    await expect(sidebar().locator('header select, .watchlist-options, .add-symbol')).toHaveCount(0);
    await expect(sidebar().getByTestId('watchlist-add-symbol')).toBeVisible();
    await expect(sidebar().locator('.watch-select > span:first-child small')).toHaveCount(0);
    assert.ok((await rows().first().boundingBox()).height <= 28);
    const w = await request('/workspace');
    const stock = w.watchlists.find(item => item.id === 'stocks').items[0];
    const indices = w.watchlists.find(item => item.id === 'indices').items.slice(0, 2);
    const commodity = w.watchlists.find(item => item.id === 'commodities').items[0];
    const stock2 = w.watchlists.find(item => item.id === 'stocks').items[1];
    const spot = (await request('/api/instruments/discover?category=crypto_perpetual&q=BTC')).results
        .find(row => row.native_id === 'BTC');
    assert.ok(stock && stock2 && indices.length === 2 && commodity && spot?.native_mapping);
    const items = [stock, indices[0], spot, commodity, stock2, indices[1]];
    w.layout = 1;
    w.watchlists.push({ id: 'mixed-observation', name: 'Market overview', items });
    w.watchlists.push({ id: 'local-research', name: 'Local research', items: [stock] });
    w.active_watchlist = 'mixed-observation';
    await request('/workspace', 'PUT', w);
    await page.reload();
    await expect(active()).toHaveText('Market overview');
    await expect(rows()).toHaveCount(6);
    await expect(group('Stocks')).toHaveCount(0);

    await active().focus();
    await active().press('ArrowDown');
    await expect(list('mixed-observation')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(list('local-research')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(active()).toBeFocused();
    await active().click();
    await expect(list('color:yellow')).toBeVisible();
    await expect(list('color:orange')).toBeVisible();
    await shot('list-selector');
    await page.locator('.statusbar').click({ position: { x: 10, y: 5 } });
    await expect(active()).toHaveAttribute('aria-expanded', 'false');

    await openWatchlistOptions(page);
    await expect(button('Refresh watchlist prices')).toBeVisible();
    await expect(button('Import watchlist CSV')).toBeVisible();
    await expect(button('Export watchlist')).toBeVisible();
    await expect(button('Watchlist Chart Grid actions')).toBeVisible();
    await page.getByLabel('Group by market', { exact: true }).check();
    await shot('options');
    await page.keyboard.press('Escape');
    for (const category of ['Commodities', 'Indices & ETFs', 'Crypto', 'Stocks']) {
        await expect(group(category)).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(rows()).toHaveCount(6);
    await group('Indices & ETFs').click();
    await expect(rows()).toHaveCount(4);
    await expect(group('Indices & ETFs')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await request('/workspace')).sidebar.groups['mixed-observation']).toEqual(['indices_funds']);
    await shot('grouped');

    await expect(page.locator('.watch-row[data-stream-state="live"]')).toHaveCount(1, { timeout: 30000 });
    const priceCell = page.locator('.watch-row[data-stream-state="live"] .quote-number');
    await priceCell.evaluate(element => {
        const updates = [];
        let previous = element.textContent;
        window.gmtWatchlistTickProbe = updates;
        new MutationObserver(() => {
            const next = element.textContent;
            if (element.dataset.quoteFlash && next !== previous) {
                updates.push({ direction: element.dataset.quoteFlash, before: previous, after: next });
            }
            previous = next;
        }).observe(element, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-quote-flash'] });
    });
    await expect.poll(() => page.evaluate(() => window.gmtWatchlistTickProbe.length), { timeout: 12000 }).toBeGreaterThan(0);
    const ticks = await page.evaluate(() => window.gmtWatchlistTickProbe);
    assert.ok(ticks.every(({ direction, before, after }) => {
        const number = text => Number(text.replaceAll(',', ''));
        return direction === (number(after) > number(before) ? 'up' : 'down');
    }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const lastPrice = await priceCell.textContent();
    await expect.poll(() => priceCell.textContent(), { timeout: 12000 }).not.toBe(lastPrice);
    await expect(priceCell).not.toHaveAttribute('data-quote-flash', /up|down/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.getByTestId('watchlist-flag-' + stock.symbol).click();
    await expect(page.getByTestId('flag-color-orange')).toBeVisible();
    await shot('flag-picker');
    await page.getByTestId('flag-color-orange').click();
    await expect.poll(async () => (await request('/api/flags')).flags[stock.canonical_id]?.color).toBe('orange');
    await page.getByTestId('watchlist-flag-' + stock2.symbol).click();
    await page.getByTestId('flag-color-yellow').click();
    await chooseWatchlist(page, 'color:orange');
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toHaveAttribute('data-identity', stock.canonical_id);
    await chooseWatchlist(page, 'color:yellow');
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toHaveAttribute('data-identity', stock2.canonical_id);

    await chooseWatchlist(page, 'local-research');
    await expect(group('Stocks')).toHaveCount(0);
    await expect(rows()).toHaveCount(1);
    await sidebar().getByTestId('watchlist-add-symbol').click();
    await expect(page.getByRole('dialog', { name: 'Add symbol to Local research' })).toBeVisible();
    const query = page.getByPlaceholder('Search symbol, company, index or ISIN');
    await query.fill('AAPL');
    const add = page.getByTestId('search-result-AAPL');
    await expect(add).toBeVisible({ timeout: 10000 });
    await shot('symbol-search');
    await add.click();
    await expect(rows()).toHaveCount(2);
    await sidebar().getByTestId('watchlist-add-symbol').click();
    await query.fill('AAPL');
    await add.click();
    await expect(rows()).toHaveCount(2);

    await chooseWatchlist(page, 'mixed-observation');
    await expect(group('Indices & ETFs')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('watchlist-flag-' + stock.symbol).click();
    await page.getByTestId('remove-flag-btn').click();
    await expect.poll(async () => (await request('/api/flags')).flags[stock.canonical_id]).toBeUndefined();
    await expect(rows().filter({ has: page.getByTestId('watchlist-symbol-' + stock.symbol) })).toHaveCount(1);
    await expect.poll(async () => (await request('/workspace')).watchlists.find(row => row.id === 'local-research').items.length).toBe(2);
    await button('Close watchlist').click();
    await expect(sidebar()).toHaveCount(0);
    await shot('panel-collapsed');
    await button('Toggle sidebar').click();
    await expect(sidebar()).toBeVisible();
    await button('Toggle theme').click();
    await expect(page.locator('.theme-light')).toBeVisible();
    await active().click();
    await shot('light-list');
    await page.keyboard.press('Escape');
    const stored = await save();
    await app.close();
    await launch();
    assert.deepEqual(await request('/workspace'), stored);
    await expect(group('Indices & ETFs')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('watchlist-flag-' + stock2.symbol)).toHaveAttribute('aria-label', 'YELLOW flag for ' + stock2.symbol);
    assert.deepEqual(errors, []);
    await writeFile(join(output, 'watchlist-panel-verification.json'), JSON.stringify({ profile, ticks, errors }, null, 2));
    console.log('PASS compact watchlist, custom picker and keyboard, grouping and collapse, Orange/Yellow identity, genuine quote updates, duplicate-safe add, theme and restart.');
} catch (error) {
    if (page && !page.isClosed()) await shot('panel-failure');
    throw error;
} finally {
    await app?.close();
}
