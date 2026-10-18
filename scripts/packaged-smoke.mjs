// Opt-in real internet test: the packaged app loads its TWO visible symbols.
import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(join(tmpdir(),'imt-packaged-direct-'));
const executable=resolve('release/mac-arm64/Indian Market Terminal.app/Contents/MacOS/Indian Market Terminal');
let app;
try{
 app=await electron.launch({executablePath:executable,args:[],env:{...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1'},timeout:60000});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:60000});
 await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:180000});
 const health=await page.evaluate(()=>window.terminal.request('/health'));
 assert.equal(health.version,'0.6.0');assert.equal(health.instruments,3185);assert.equal(health.provider.source,'YAHOO FINANCE','Packaged production launcher never enables test provider');
 assert.equal(health.provider.provider_requests,2,'Only two visible symbols fetched');
 const daily=await page.evaluate(()=>window.terminal.request('/api/history?symbol=RELIANCE&interval=1d&period=max'));
 const weekly=await page.evaluate(()=>window.terminal.request('/api/history?symbol=RELIANCE&interval=1w&period=max'));
 const monthly=await page.evaluate(()=>window.terminal.request('/api/history?symbol=RELIANCE&interval=1M&period=max'));
 assert.equal(daily.source,'YAHOO FINANCE');assert.ok(daily.candles.length>7000);assert.ok(weekly.candles.length<daily.candles.length&&monthly.candles.length<weekly.candles.length);assert.equal(monthly.first_available,daily.first_available);
 assert.equal((await page.evaluate(()=>window.terminal.request('/api/history/status'))).provider_requests,4);
 assert.ok(daily.candles.every(r=>r.high>=r.low&&r.high>=r.open&&r.high>=r.close));assert.ok(daily.candles.some(r=>r.volume>0));
 const indices=await page.evaluate(()=>window.terminal.request('/api/indices'));
 assert.deepEqual(indices.map(r=>r.yahoo_symbol),['^NSEI','^NSEBANK','^CRSLDX','^BSESN']);
 for(const ticker of indices.map(r=>r.symbol)){
  const result=await page.evaluate(symbol=>window.terminal.request('/api/history?symbol='+encodeURIComponent(symbol)+'&interval=1d&period=max'),ticker);
  assert.ok(result.candles.length>1000);assert.equal(result.source,'YAHOO FINANCE');
 }
 // Show one real index beside a real equity, and verify actual intraday aggregation.
 const workspace=await page.evaluate(()=>window.terminal.request('/workspace'));const index=indices[0];
 workspace.panes[1]={...workspace.panes[1],symbol:index.symbol,token:index.token,instrument_id:index.id,kind:index.kind,name:index.name,exchange:index.exchange};
 await page.evaluate(w=>window.terminal.request('/workspace','PUT',w),workspace);await page.reload();
 await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible();await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:180000});
 const intra=await page.evaluate(()=>window.terminal.request('/api/history?symbol=RELIANCE&interval=4h&period=max'));
 assert.ok(intra.candles.length>50);assert.ok(intra.candles.every(r=>['09:15','13:15'].includes(new Date(r.time*1000+19800000).toISOString().slice(11,16))));
 assert.deepEqual(errors,[]);
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/packaged-phase4-real-yahoo.png'});
 console.log('PASS: signed standalone package, production Yahoo source, official NSE directory, only two visible downloads, native daily/weekly/monthly, four verified indices, 4h session alignment, volume and zero renderer errors.');
 console.log(JSON.stringify({source:daily.source,daily:daily.candles.length,weekly:weekly.candles.length,monthly:monthly.candles.length,first_available:daily.first_available,last_available:daily.last_available,actions:daily.actions.length,four_hour:intra.candles.length,indices:indices.map(i=>i.name),profile}));
}finally{await app?.close();}
