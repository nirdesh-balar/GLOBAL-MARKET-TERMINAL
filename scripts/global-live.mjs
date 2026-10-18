// Opt-in, bounded live validation. No claim of a complete verified global universe.
import {_electron as electron,expect} from './isolated-electron.mjs';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import assert from 'node:assert/strict';
const profile=await mkdtemp(join(tmpdir(),'imt-global-live-'));let app;
const checked=[];const errors=[];
try{
 app=await electron.launch({executablePath:resolve('release/mac-arm64/Indian Market Terminal.app/Contents/MacOS/Indian Market Terminal'),args:[],env:{...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1'},timeout:60000});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:60000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:90000});
 const request=(path)=>page.evaluate(p=>window.terminal.request(p),path);
 const health=await request('/health');assert.equal(health.version,'0.6.0');assert.equal(health.provider.source,'YAHOO FINANCE');assert.equal(health.provider.provider_requests,2);
 // Seven daily histories cover stocks, global indices, crypto, FX, futures and ETFs.
 for(const symbol of ['AAPL','HSBA.L','^GSPC','BTC-USD','EURUSD=X','GC=F','SPY']){
  const value=await request('/api/history?'+new URLSearchParams({symbol,interval:'1d',period:'max'}));
  assert.ok(value.candles.length>100);assert.equal(value.source,'YAHOO FINANCE');assert.ok(value.currency);
  assert.ok(value.candles.every((r,i,a)=>Number.isFinite(r.close)&&r.high>=Math.max(r.open,r.close,r.low)&&(!i||r.time>a[i-1].time)));
  if(symbol==='EURUSD=X')assert.ok(value.candles.every(r=>r.volume===null));
  checked.push({symbol,interval:'1d',bars:value.candles.length,first:value.first_available,last:value.last_available,currency:value.currency,timezone:value.timezone});
 }
 // Three 4h requests cover exchange DST, continuous UTC, and provider futures periods.
 for(const symbol of ['AAPL','BTC-USD','GC=F']){
  try{
   const value=await request('/api/history?'+new URLSearchParams({symbol,interval:'4h',period:'max'}));assert.ok(value.candles.length>20);
   if(symbol==='AAPL')assert.ok(value.candles.every(r=>['09:30','13:30'].includes(new Intl.DateTimeFormat('en-GB',{timeZone:value.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(r.time*1000)))));
   if(symbol==='BTC-USD')assert.ok(value.candles.every(r=>new Date(r.time*1000).getUTCHours()%4===0));
   checked.push({symbol,interval:'4h',bars:value.candles.length,first:value.first_available,last:value.last_available,timezone:value.timezone,notice:value.notice});
  }catch(e){if(symbol==='GC=F'&&String(e.message).includes('Verified session bounds'))checked.push({symbol,interval:'4h',unavailable:String(e.message)});else throw e;}
 }
 const found=await request('/api/instruments/discover?q=VOD.L');assert.ok(found.results.some(r=>r.yahoo_symbol==='VOD.L'),'Dynamic discovery beyond samples');
 const rows=await request('/api/instruments/search?q=&limit=200');const w=await request('/workspace');w.layout=4;
 for(const [n,symbol] of ['AAPL','BTC-USD','GC=F','SPY'].entries()){
  const r=rows.find(r=>r.yahoo_symbol===symbol);w.panes[n]={...w.panes[n],...Object.fromEntries(['symbol','token','kind','name','exchange','canonical_id','provider','category','country','currency','timezone','calendar','precision','contract'].map(k=>[k,r[k]])),instrument_id:r.id};
 }
 w.active_watchlist='us';await page.evaluate(w=>window.terminal.request('/workspace','PUT',w),w);await page.reload();await expect(page.locator('.chart-pane')).toHaveCount(4);await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:60000});
 await expect(page.getByTestId('pane-0').locator('.ohlc b')).toHaveCount(4);assert.equal(await page.locator('.symbol-details,[data-testid="stock-details"]').count(),0);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/global-four-markets-real-yahoo.png'});
 assert.deepEqual(errors,[]);const final=await request('/api/history/status');assert.equal(final.provider_requests,12,'Two startup, seven daily and three intraday downloads only; pane reload reuses memory');
 await writeFile('test-results/global-live-validation.json',JSON.stringify({version:health.version,checked,search:'VOD.L discovered',provider_requests:final.provider_requests,search_requests:final.search_requests,renderer_errors:errors,scope:'Bounded sample only; other symbols/timeframes remain unverified.'},null,2));
 console.log('PASS: packaged production source, seven daily asset-class samples, three session-aware 4h probes, dynamic VOD.L discovery, four real markets rendered, RAM reuse and no details card.');console.log(JSON.stringify(checked));
}finally{await app?.close();}
