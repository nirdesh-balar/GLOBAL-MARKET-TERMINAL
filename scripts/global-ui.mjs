import {_electron as electron,expect} from './isolated-electron.mjs';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['desktop/src/services/marketTime.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {marketMidnight,marketDay}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
assert.equal(marketMidnight('2024-03-11','America/New_York'),Date.parse('2024-03-11T04:00:00Z')/1000);
assert.equal(marketMidnight('2024-03-08','America/New_York'),Date.parse('2024-03-08T05:00:00Z')/1000);
assert.equal(marketDay(Date.parse('2024-03-11T02:00:00Z')/1000,'America/New_York'),'2024-03-10');
const profile=await mkdtemp(join(tmpdir(),'imt-global-ui-'));let app,page;const errors=[];
const launch=()=>electron.launch({executablePath:resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:['.'],env:{...process.env,IMT_OFFLINE:'1',IMT_UI_FIXTURE:'1',IMT_TEST_DATA_DIR:profile},timeout:60000});
const workspace=()=>page.evaluate(()=>window.terminal.request('/workspace'));
const status=()=>page.evaluate(()=>window.terminal.request('/api/history/status'));
try{
 app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:45000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
 const w=await workspace();assert.equal(w.watchlists.length,10);assert.equal((await status()).provider_requests,2);
 await page.getByLabel('Chart layout',{exact:true}).click();await page.getByLabel('Layout 4',{exact:true}).click();await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
 for(const [pane,symbol] of ['AAPL','MSFT','GC=F','EURUSD=X'].entries()){
  await page.getByTestId(`pane-${pane}`).locator('.pane-symbol').click();
  await page.getByPlaceholder('Search symbol, company, index or ISIN').fill(symbol);
  await page.getByTestId(`search-result-${symbol}`).click();
  await expect(page.getByTestId(`pane-${pane}`).locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
  await expect(page.getByTestId(`pane-${pane}`).locator('.pane-symbol')).toContainText(symbol);
  await expect.poll(async()=>(await workspace()).panes[pane].symbol).toBe(symbol);
 }
 const ready=await workspace();assert.deepEqual(ready.panes.slice(0,4).map(p=>p.currency),['USD','USD','USD','']);
 await expect(page.getByTestId('pane-2').locator('.legend-title')).toContainText('CONTINUOUS · NOT AN EXPIRY');
 await expect(page.getByTestId('pane-3').locator('.studies-legend')).toContainText('Volume unavailable');
 await expect(page.getByTestId('pane-3').locator('.ohlc')).toContainText(/\d+\.\d{5}/);
 for(let pane=0;pane<4;pane++){
  await page.getByLabel(`Timeframe pane ${pane}`,{exact:true}).selectOption('4h');
  await expect(page.getByTestId(`pane-${pane}`).locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
  await expect(page.getByTestId(`pane-${pane}`).locator('.history-meta')).toContainText('bars');
 }
 const count=(await status()).provider_requests;
 await page.getByLabel('LOG pane 0',{exact:true}).click();await page.getByLabel('Indicators pane 1',{exact:true}).click();await page.getByLabel('Add RSI',{exact:true}).click();await page.getByLabel('Close indicators',{exact:true}).click();
 assert.equal((await status()).provider_requests,count,'Indicators and scale reuse data');
 await page.getByLabel('Active watchlist',{exact:true}).selectOption('crypto');await expect(page.locator('.watch-row')).toHaveCount(4);
 await expect(page.getByTestId('watchlist-symbol-BTC-USD')).toContainText('BTC-USD');
 await page.getByRole('button',{name:'Search stocks and indices',exact:true}).click();await page.getByLabel('Search market').selectOption('crypto');
 await expect(page.locator('.search-result')).toHaveCount(0);await expect(page.locator('.watch-row')).toHaveCount(4);await page.getByLabel('Close search',{exact:true}).click();
 assert.equal(await page.locator('[data-testid="stock-details"],.symbol-details').count(),0);
 const geometry=await page.getByTestId('watchlist-rows').evaluate(el=>({rows:el.getBoundingClientRect().height,aside:el.closest('aside').getBoundingClientRect().height,scroll:getComputedStyle(el).overflowY}));
 assert.ok(geometry.rows/geometry.aside>.65);assert.equal(geometry.scroll,'auto');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/global-four-markets-fixture.png'});
 await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();const saved=await workspace();
 await app.close();app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:45000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:45000});
 assert.deepEqual(await workspace(),saved);assert.equal((await status()).provider_requests,4,'Restart loads only four visible markets');assert.deepEqual(errors,[]);
 console.log('PASS: global search/categories, mixed-market layout, IANA/DST dates, FX precision/no volume, four session-aware markets, indicator reuse, intact watchlist/no details card, and restart persistence.');
}finally{await app?.close();}
