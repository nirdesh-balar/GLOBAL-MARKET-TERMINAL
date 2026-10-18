import{windowsResources}from'./process-resources.mjs';
import assert from 'node:assert/strict';
import {expect} from './isolated-electron.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';

export async function realPerformance(app,page,discovery,request){
 const rendererErrors=[];const onError=e=>rendererErrors.push(e.message);page.on('pageerror',onError);
 const output=await build({entryPoints:['desktop/src/charts/indicators.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const {defaultIndicator}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
 const names=['^NSEI','RELIANCE.NS','AAPL','EURUSD=X','GC=F','TCS.NS','SPY','BTC perpetual'];
 const rows=names.map(n=>discovery.results.find(r=>r.query===n||r.category===n).identity),samples=[];
 const stats=()=>request('/api/history/status');
 const resource=async()=>{const metrics=await app.evaluate(({app})=>app.getAppMetrics());if(process.platform==='win32'){const owned=windowsResources(app.process().pid);return{backend:owned.find(p=>p.name==='imt-backend')??null,renderer:metrics.filter(m=>m.type==='Tab').map(m=>({rss_mib:m.memory.workingSetSize/1024,cpu_percent:m.cpu.percentCPUUsage})),owned_windows_processes:owned};}const ids=execFileSync('pgrep',['-P',String(app.process().pid)],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);let backend=null;for(const id of ids){const comm=execFileSync('ps',['-p',id,'-o','comm='],{encoding:'utf8'}).trim();if(comm.endsWith('/imt-backend')){const [cpu,rss]=execFileSync('ps',['-p',id,'-o','%cpu=,rss='],{encoding:'utf8'}).trim().split(/\s+/).map(Number);backend={pid:Number(id),cpu_percent:cpu,rss_mib:rss/1024};}}return{backend,renderer:metrics.filter(m=>m.type==='Tab').map(m=>({rss_mib:m.memory.workingSetSize/1024,cpu_percent:m.cpu.percentCPUUsage}))};};
 const beginHeartbeat=()=>page.evaluate(()=>{globalThis.__g1Beat={last:performance.now(),max_gap_ms:0,count:0};clearInterval(globalThis.__g1Timer);globalThis.__g1Timer=setInterval(()=>{const now=performance.now(),b=globalThis.__g1Beat;b.max_gap_ms=Math.max(b.max_gap_ms,now-b.last);b.last=now;b.count++;},50);});
 const ready=async n=>{await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({timeout:60000});await expect(page.locator('.chart-pane:visible')).toHaveCount(n);const grid=await page.locator('.chart-grid').evaluate(e=>{const s=getComputedStyle(e);return{columns:s.gridTemplateColumns.split(' ').length,rows:s.gridTemplateRows.split(' ').length}});assert.equal(grid.columns,n===1?1:n===2||n===4?2:n===6?3:4);assert.equal(grid.rows,n>=4?2:1);await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:150000});await expect.poll(()=>page.locator('.chart-pane:visible .chart-canvas').evaluateAll(es=>es.every(e=>Number(e.dataset.renderedBars)>0)),{timeout:150000}).toBe(true);};
 let w=await request('/workspace');w.layout=1;w.sync_time=w.sync_crosshair=false;
 for(const[i,r]of rows.entries()){const{id,...meta}=r;Object.assign(w.panes[i],meta,{instrument_id:id,timeframe:'1d',auto_refresh:false,indicators:['EMA','RSI','MACD'].map(k=>defaultIndicator(k,`perf-${i}-${k}`)),drawing_sets:{}});}
 await request('/workspace','PUT',w);await page.reload();await ready(1);
 for(const n of [1,2,4,6,8]){
  if(n===8)await page.waitForTimeout(18000);
  w=await request('/workspace');w.layout=n;await request('/workspace','PUT',w);await expect.poll(async()=>(await stats()).active,{timeout:120000}).toBe(0);await request('/api/cache/clear','POST');
  const before=await stats(),start=performance.now();await page.reload();await page.waitForLoadState('domcontentloaded');await beginHeartbeat();await ready(n);const duration=performance.now()-start;
  const after=await stats(),heartbeat=await page.evaluate(()=>globalThis.__g1Beat);assert.ok(heartbeat.max_gap_ms<5000,'No multi-second renderer freeze during real load');
  samples.push({layout:n,cache:'cold RAM cache (fresh provider retrieval; discovery already cached)',duration_ms:duration,yahoo_requests:after.provider_requests-before.provider_requests,history_requests:after.history_requests-before.history_requests,hyperliquid_requests:after.hyperliquid.rest.candle_requests-before.hyperliquid.rest.candle_requests,deduplicated:after.deduplicated-before.deduplicated,heartbeat,resources:await resource(),charts:await page.locator('.chart-pane:visible .chart-canvas').evaluateAll(es=>es.map(e=>({symbol:e.dataset.historySymbol,bars:Number(e.dataset.renderedBars),instance:e.dataset.chartInstance,creations:Number(e.dataset.chartCreations),study_ms:Number(e.dataset.studyMs)})))});
  const warmBefore=await stats(),warmStart=performance.now();await page.reload();await page.waitForLoadState('domcontentloaded');await beginHeartbeat();await ready(n);const warmAfter=await stats();
  assert.equal(warmAfter.provider_requests,warmBefore.provider_requests,'Warm Yahoo histories must reuse RAM');
  samples.push({layout:n,cache:'warm RAM',duration_ms:performance.now()-warmStart,yahoo_requests:warmAfter.provider_requests-warmBefore.provider_requests,history_requests:warmAfter.history_requests-warmBefore.history_requests,hyperliquid_requests:warmAfter.hyperliquid.rest.candle_requests-warmBefore.hyperliquid.rest.candle_requests,heartbeat:await page.evaluate(()=>globalThis.__g1Beat),resources:await resource(),note:'A remounted Hyperliquid subscription may separately reconcile through bounded REST.'});
  console.log('PASS real cold/warm layout',n);
 }
 // Delay delivery of an actual Yahoo response, explicitly separate from provider RTT.
 const btc=rows[7],msft=discovery.results.find(r=>r.query==='MSFT').identity;w=await request('/workspace');w.layout=2;
 for(const[i,r]of [btc,msft].entries()){const{id,...meta}=r;Object.assign(w.panes[i],meta,{instrument_id:id,timeframe:i?'1d':'1m',auto_refresh:i===0,indicators:[defaultIndicator('EMA','slow-'+i)],drawing_sets:{}});}
 await page.waitForTimeout(18000);await request('/workspace','PUT',w);await page.reload();await ready(2);await expect(page.getByTestId('stream-status-0')).toHaveAttribute('data-state','live',{timeout:90000});
 await app.evaluate(()=>{const original=globalThis.fetch;globalThis.__g1Delay=false;globalThis.fetch=async(input,options)=>{const response=await original(input,options),url=new URL(String(input));if(url.pathname==='/api/history'&&url.searchParams.get('symbol')?.includes('MSFT')&&url.searchParams.get('interval')==='5m'){globalThis.__g1Delay=true;await new Promise(r=>setTimeout(r,6000));globalThis.__g1Delay=false;}return response;};});
 await page.getByLabel('Timeframe pane 1',{exact:true}).selectOption('5m');await expect.poll(()=>app.evaluate(()=>globalThis.__g1Delay),{timeout:90000}).toBe(true);await beginHeartbeat();const beforeLive=(await request('/api/streams/status')).metrics.candle_updates;
 await page.getByTestId('pane-maximize-0').click();await expect(page.locator('.chart-pane:visible')).toHaveCount(1);await page.getByTestId('pane-maximize-0').click();
 await expect.poll(async()=>(await request('/api/streams/status')).metrics.candle_updates,{timeout:30000}).toBeGreaterThan(beforeLive);await ready(2);const heartbeat=await page.evaluate(()=>globalThis.__g1Beat);assert.ok(heartbeat.max_gap_ms<5000);
 assert.deepEqual(rendererErrors,[]);page.off('pageerror',onError);
 const g1=JSON.parse(await readFile('test-baselines/macos-stage7-performance.json','utf8'));const g1_comparison=samples.map(r=>{const prior=g1.samples.find(p=>p.layout===r.layout&&p.cache===r.cache);return{layout:r.layout,cache:r.cache,macos_stage7_ms:prior?.duration_ms,stage7_ms:r.duration_ms,delta_ms:r.duration_ms-(prior?.duration_ms??0),provider_latency_not_guaranteed:true};});
 await writeFile('test-results/stage7-real-performance.json',JSON.stringify({macos_stage7_comparison:g1_comparison,real_market_payloads:true,profiles_isolated:true,renderer_errors:rendererErrors,samples,slow_yahoo:{controlled_delivery_delay_ms:6000,not_yahoo_network_latency:true,hyperliquid_updates_during_wait:true,other_pane_maximize_restore:true,heartbeat},resources:await resource()},null,2));
 await page.screenshot({path:'test-results/stage7-real-slow-yahoo-live-crypto.png'});
}
