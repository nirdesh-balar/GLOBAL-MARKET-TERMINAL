import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {_electron as electron,expect,sourceElectron} from './isolated-electron.mjs';

const output='test-results/index-correction';
const profile=await mkdtemp(join(tmpdir(),'gmt-index-correction-'));
const csvFile=join(profile,'ind_nifty50list.csv');
const fixtureRows=['Fixture Reliance,Fixture,RELIANCE,EQ,INE002A01018',
  ...Array.from({length:49},(_,i)=>'Fixture company '+(i+1)+',Fixture,FIXTURE'+(i+1)+',EQ,INZ'+String(i+1).padStart(9,'0'))];
await writeFile(csvFile,['Company Name,Industry,Symbol,Series,ISIN Code',...fixtureRows].join('\n'));
await mkdir(output,{recursive:true});
const env={...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1',IMT_HYPERLIQUID_UI:'1',IMT_OFFLINE:'1'};
const errors=[];
let app,page;
const nifty='yahoo:%5ENSEI:NSE:index';
const bank='yahoo:%5ENSEBANK:NSE:index';
const call=(path,method='GET',body)=>page.evaluate(([path,method,body])=>window.terminal.request(path,method,body),[path,method,body]);
const b=(name,parent=page)=>parent.getByRole('button',{name,exact:true});
const details=()=>page.getByRole('dialog',{name:'Index details'});
const canvas=()=>page.getByTestId('pane-0').locator('.chart-canvas');
const history=()=>call('/api/history/status');
const shot=name=>page.screenshot({path:join(output,'after-'+name+'.png')});
async function launch(){
  app=await electron.launch({executablePath:sourceElectron,args:['.'],env,timeout:60000});
  page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:834});
  await expect(b('Chart layout')).toBeEnabled({timeout:30000});
}
async function chart(identity,interval){
  await expect(canvas()).toHaveAttribute('data-history-symbol',identity,{timeout:30000});
  await expect(canvas()).toHaveAttribute('data-history-interval',interval,{timeout:30000});
  await expect.poll(async()=>Number(await canvas().getAttribute('data-rendered-bars'))).toBeGreaterThan(0);
}
async function singleRow(group){
  const positions=await group.getByRole('button').evaluateAll(buttons=>buttons.map(button=>{
    const bounds=button.getBoundingClientRect();
    return [bounds.y,bounds.height,button.scrollWidth,button.clientWidth];
  }));
  assert.ok(positions.length>1&&positions.every(([y,height,scroll,width])=>y===positions[0][0]&&height===positions[0][1]&&scroll<=width));
}
async function searchChart(category,query,result,identity){
  await b('Search stocks and indices').click();
  const search=page.getByRole('dialog',{name:'Search stocks and indices'});
  await b(category,search).click();
  await search.getByPlaceholder('Search symbol, company, index or ISIN').fill(query);
  await search.getByTestId('search-result-'+result).click({timeout:30000});
  await chart(identity,'1d');
}
try{
  await launch();
  await b('Chart layout').click();
  await b('Layout 1').click();
  const old=await call('/workspace');
  old.panes[0].comparisons=[{canonical_id:bank}];
  await call('/workspace','PUT',old);
  assert.ok(!('comparisons' in (await call('/workspace')).panes[0]));
  await expect(b('Compare Symbol')).toHaveCount(0);
  await assert.rejects(call('/api/indices/membership/import','POST',{}),/API operation not allowed/);
  await expect(page.getByLabel('Grouped intervals')).toHaveCount(0);
  await expect(page.locator('.timeframe-toolbar button')).toHaveCount(10);

  await b('Search stocks and indices').click();
  let search=page.getByRole('dialog',{name:'Search stocks and indices'});
  await expect(search.locator('select')).toHaveCount(0);
  await expect(search.getByRole('textbox')).toHaveCount(1);
  await singleRow(search.getByRole('group',{name:'Market categories'}));
  await b('India equities',search).click();
  const input=search.getByRole('textbox');
  await input.fill('RELIANCE.NS');
  await expect(search.getByTestId('search-result-RELIANCE.NS')).toBeEnabled({timeout:30000});
  await shot('symbols');
  await input.press('ArrowDown');
  await input.press('ArrowUp');
  await input.press('Enter');
  await chart('yahoo:RELIANCE.NS:NSE:equity','1d');

  const unchanged=(await call('/workspace')).watchlists;
  await searchChart('US equities','AAPL','AAPL','yahoo:AAPL:NASDAQ:equity');
  await searchChart('Indices','NIFTY BANK','^NSEBANK',bank);
  await searchChart('Crypto Perpetual','BTC','hyperliquid:perpetual:BTC:BTC:USDC','hyperliquid:perpetual:BTC:BTC:USDC');
  assert.deepEqual((await call('/workspace')).watchlists,unchanged);

  await b('Search indices').click();
  search=page.getByRole('dialog',{name:'Search indices'});
  await expect(search.locator('select')).toHaveCount(0);
  const regions=search.getByRole('group',{name:'Market categories'});
  await expect(regions.getByRole('button')).toHaveCount(2);
  await singleRow(regions);
  await b('Global',regions).click();
  await expect(b('Global',regions)).toHaveAttribute('aria-pressed','true');
  await expect(search.getByTestId('search-result-^GSPC')).toBeEnabled({timeout:30000});
  await b('India',regions).click();
  await expect(search.getByTestId('search-result-^NSEI')).toBeEnabled({timeout:30000});
  await shot('indices');
  await search.getByTestId('search-result-^NSEI').click();
  await expect(details()).toContainText('NIFTY 50');
  await expect(b('Import official CSV',details())).toBeVisible();
  await b('View Chart',details()).click();
  await chart(nifty,'1d');
  await expect(page.locator('.legend-title')).toContainText('INR');
  await expect(page.locator('.ohlc b')).toHaveCount(4);
  await expect(page.locator('.compare-legend')).toHaveCount(0);
  assert.equal(await canvas().evaluate(node=>node.__chart.priceScale('left').width()),0);
  await shot('nifty-daily');
  await b('Active timeframe 1w').click();
  await chart(nifty,'1w');
  await b('Active timeframe 1Y').click();
  await chart(nifty,'1Y');
  await expect(b('Active timeframe 1Y')).toHaveAttribute('aria-pressed','true');
  await shot('toolbar-nifty');
  await b('Active timeframe 1d').click();
  await chart(nifty,'1d');

  const workspace=await call('/workspace');
  const made=await call('/api/watchlists/mutate','POST',{action:'create',name:'Index acceptance',revision:workspace.watchlist_revision});
  await page.reload();
  await chart(nifty,'1d');
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},csvFile);
  const before=await history();
  await b('Index constituents').click();
  await expect(details()).toContainText('Constituent membership and weights are unavailable');
  await details().getByLabel('Membership as-of date').fill('2026-10-31');
  await b('Import official CSV',details()).click();
  await expect(details()).toContainText('Source as-of 2026-10-31');
  const table=details().getByRole('table',{name:'NIFTY 50 constituents'});
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(table.getByRole('cell',{name:'Weight unavailable'})).toHaveCount(50);
  await expect(b('View FIXTURE1 Chart',table)).toBeDisabled();
  await expect(details().getByRole('button',{name:/^(Buy|Sell|Trade|Option Chain)$/i})).toHaveCount(0);
  await shot('constituents-fixture');
  await details().getByLabel('Search constituents').fill('INE002');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  assert.equal((await history()).provider_requests,before.provider_requests);
  await details().getByLabel('Destination watchlist').selectOption(made.active_watchlist);
  await b('Add RELIANCE to Watchlist',table).click();
  await expect(details()).toContainText('added to Index acceptance');
  const destination=(await call('/workspace')).watchlists.find(list=>list.id===made.active_watchlist);
  assert.deepEqual(destination.items.map(row=>row.canonical_id),['yahoo:RELIANCE.NS:NSE:equity']);
  await b('View RELIANCE Chart',table).click();
  await chart('yahoo:RELIANCE.NS:NSE:equity','1d');
  await shot('constituent-stock');
  await b('Active timeframe 1w').click();
  await chart('yahoo:RELIANCE.NS:NSE:equity','1w');

  await b('Indicators').click();
  const indicators=page.getByRole('dialog',{name:'Indicator manager'});
  await singleRow(indicators.getByRole('group',{name:'Indicator library views'}));
  await singleRow(indicators.getByRole('group',{name:'Indicator types'}));
  await expect(indicators.getByLabel('Indicator category',{exact:true})).toHaveCount(0);
  await shot('indicators');
  await page.keyboard.press('Escape');
  await b('Toggle theme').click();
  await expect(page.locator('.theme-light')).toBeVisible();
  await b('Indicators').click();
  await singleRow(indicators.getByRole('group',{name:'Indicator library views'}));
  await shot('indicators-light');
  await page.keyboard.press('Escape');
  await app.close();
  await launch();
  await expect(page.locator('.theme-light')).toBeVisible();
  await b('Search indices').click();
  await page.getByTestId('search-result-^NSEI').click({timeout:30000});
  await expect(details().getByRole('table',{name:'NIFTY 50 constituents'}).locator('tbody tr')).toHaveCount(50);
  await page.keyboard.press('Escape');
  await expect(details()).toHaveCount(0);
  assert.deepEqual(errors,[]);
  console.log('PASS compact search, index and chart identity, legacy compare removal, CSV validation workflow, cache-only quotes, constituent handoffs, indicator alignment, themes and restart.');
}finally{
  await app?.close();
}
