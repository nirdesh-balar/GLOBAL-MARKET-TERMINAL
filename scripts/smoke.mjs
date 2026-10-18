import{pythonExecutable}from'./platform-paths.mjs';
import {_electron as electron,expect} from './isolated-electron.mjs';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
const bundled=await build({entryPoints:['desktop/src/charts/indicators.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {defaultIndicator,calculateIndicators,sma,ema,rsi}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
assert.deepEqual(sma([1,2,3,4],3),[null,null,2,3]);assert.deepEqual(ema([1,2,3,4],3),[null,null,2,3]);assert.equal(rsi(Array(20).fill(10)).at(-1),50);
// Parity across independent Python/TypeScript engines, including every style of study.
const rows=Array.from({length:160},(_,i)=>({time:1704067200+i*900,open:100+Math.sin(i)*5,high:108+Math.sin(i)*5,low:97+Math.sin(i)*5,close:103+Math.sin(i)*5,volume:i%47===0?null:100+i}));
const configs=['SMA','EMA','WMA','VWMA','RSI','MACD','STOCHRSI','BB','ATR','SUPERTREND','VWAP'].map(k=>defaultIndicator(k,k));
const py=spawnSync(pythonExecutable,['-c',"import sys,json;sys.path.insert(0,'backend');from app.indicators import IndicatorCalculator;v=json.load(sys.stdin);print(json.dumps(IndicatorCalculator.calculate(v['rows'],v['configs'],'15m')))"],{input:JSON.stringify({rows,configs}),encoding:'utf8'});
assert.equal(py.status,0,py.stderr);const python=JSON.parse(py.stdout),ts=calculateIndicators(rows,configs,'15m');
assert.equal(python.series.length,ts.series.length);for(let i=0;i<ts.series.length;i++){assert.equal(ts.series[i].name,python.series[i].name);for(let j=0;j<rows.length;j++){const a=ts.series[i].points[j].value,b=python.series[i].points[j].value;if(a===null||b===null)assert.equal(a,b);else assert.ok(Math.abs(a-b)<1e-7,`${ts.series[i].name} ${j}: ${a} vs ${b}`);}}
console.log('PASS: indicator Python/TypeScript parity for all 11 studies and known SMA/EMA/RSI examples.');
const data=await mkdtemp(join(tmpdir(),'imt-advanced-ui-'));let app;const errors=[],timings=[];
const launch=()=>electron.launch({executablePath:resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),args:['.'],env:{...process.env,IMT_OFFLINE:'1',IMT_UI_FIXTURE:'1',IMT_TEST_DATA_DIR:data},timeout:60000});
await mkdir('test-results',{recursive:true});
try{
 app=await launch();let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:45000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
 const status=()=>page.evaluate(()=>window.terminal.request('/api/history/status'));const workspace=()=>page.evaluate(()=>window.terminal.request('/workspace'));
 assert.equal((await status()).provider_requests,2,'Only two visible histories at startup');
 for(const n of [1,2,4,6,8]){const start=Date.now();await page.getByLabel('Chart layout',{exact:true}).click();await page.getByLabel(`Layout ${n}`,{exact:true}).click();await expect(page.locator('.chart-pane')).toHaveCount(n);await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});timings.push({layout:n,ms:Date.now()-start});}
 await page.screenshot({path:'test-results/advanced-eight-charts.png'});await page.getByLabel('Chart layout',{exact:true}).click();await page.getByLabel('Layout 2',{exact:true}).click();await expect(page.locator('.chart-overlay')).toHaveCount(0);
 const before=(await status()).history_requests;
 await page.getByLabel('LOG pane 0',{exact:true}).click();await expect(page.getByTestId('pane-0').locator('.chart-canvas')).toHaveAttribute('data-price-mode','1');await expect(page.getByLabel('LOG pane 0',{exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('AUTO pane 0',{exact:true}).click();await expect(page.getByTestId('pane-0').locator('.chart-canvas')).toHaveAttribute('data-auto-scale','false');await expect(page.getByLabel('AUTO pane 0',{exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByLabel('LOG pane 0',{exact:true})).toHaveAttribute('aria-pressed','true');
 assert.equal((await workspace()).panes[1].scale.logarithmic,false);assert.equal((await workspace()).panes[1].scale.auto,true);
 await page.getByLabel('Percent pane 0',{exact:true}).click();await expect(page.getByLabel('Percent pane 0',{exact:true})).toHaveAttribute('aria-pressed','true');await page.getByLabel('Percent pane 0',{exact:true}).click();await page.getByLabel('AUTO pane 0',{exact:true}).click();
 await page.getByLabel('FIT pane 0',{exact:true}).click();await page.getByLabel('RESET pane 0',{exact:true}).click();
 await expect(page.getByTestId('pane-0').locator('.chart-canvas')).toHaveAttribute('data-view-from','7850');
 const viewport=await page.getByTestId('pane-0').locator('.chart-canvas').getAttribute('data-view-from');
 await page.getByLabel('Indicators pane 0',{exact:true}).click();await expect(page.getByRole('dialog',{name:'Indicator manager'})).toBeVisible();
 await page.getByLabel('Add EMA',{exact:true}).click();await page.getByLabel('Add RSI',{exact:true}).click();await page.getByLabel('Add MACD',{exact:true}).click();
 await expect.poll(async()=>(await workspace()).panes[0].indicators.length).toBe(4);
 let w=await workspace();const ema9=w.panes[0].indicators.filter(i=>i.kind==='EMA').at(-1),r=w.panes[0].indicators.find(i=>i.kind==='RSI');
 await page.getByLabel(`Settings ${ema9.id}`,{exact:true}).click();await page.getByLabel('Length',{exact:true}).fill('0');await page.getByRole('button',{name:'Apply settings',exact:true}).click();await expect(page.getByRole('alert')).toContainText('integer');await page.getByLabel('Length',{exact:true}).fill('9');await page.getByLabel('Indicator source',{exact:true}).selectOption('HLC3');await page.getByLabel('Line width',{exact:true}).selectOption('2');await page.getByRole('button',{name:'Apply settings',exact:true}).click();
 await page.getByLabel(`Visibility ${r.id}`,{exact:true}).click();await page.getByLabel(`Visibility ${r.id}`,{exact:true}).click();await page.getByLabel(`Move up ${r.id}`,{exact:true}).click();
 await page.getByLabel('Preset name',{exact:true}).fill('Trend and momentum');await page.getByRole('button',{name:'Save preset',exact:true}).click();await page.getByLabel('Preset target 1',{exact:true}).check();await page.getByRole('button',{name:'Load preset',exact:true}).click();await page.screenshot({path:'test-results/advanced-indicators.png'});await page.getByLabel('Close indicators',{exact:true}).click();
 await expect(page.getByTestId('pane-0').locator('.chart-canvas')).toHaveAttribute('data-view-from',viewport);
 assert.equal((await status()).history_requests,before,'Scale/indicator/preset changes never request OHLCV');
 w=await workspace();assert.equal(w.panes[0].indicators.length,4);assert.equal(w.panes[1].indicators.length,4);assert.ok(w.panes[0].indicators.some(i=>i.length===9&&i.source==='HLC3'));
 // All nine timeframes, returning native intervals or session-aligned derived 4h.
 for(const interval of ['1m','5m','15m','30m','1h','4h','1d','1w','1M']){await page.getByLabel('Timeframe pane 0',{exact:true}).selectOption(interval);await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});await expect(page.getByTestId('pane-0').locator('.history-meta')).not.toContainText('No candles');}
 await page.getByLabel('Timeframe pane 0',{exact:true}).selectOption('1d');await expect(page.locator('.chart-overlay')).toHaveCount(0);
 await page.getByLabel('Active watchlist',{exact:true}).selectOption('indices');await expect(page.locator('.watch-row')).toHaveCount(4);await page.getByLabel('Search current watchlist',{exact:true}).fill('BANK');await expect(page.locator('.watch-row')).toHaveCount(1);await page.getByLabel('Search current watchlist',{exact:true}).fill('');
 await page.getByLabel('Open symbol in pane',{exact:true}).selectOption('1');await page.locator('.watch-select').filter({hasText:'NIFTY BANK'}).click();await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});await expect(page.getByTestId('pane-1').locator('.pane-symbol')).toContainText('NIFTY BANK');await expect(page.getByTestId('pane-1').locator('.studies-legend')).toContainText('Volume unavailable');
 await page.getByLabel('Create watchlist',{exact:true}).click();await page.getByLabel('Watchlist name',{exact:true}).fill('Research');await page.getByRole('button',{name:'Save watchlist',exact:true}).click();
 await page.getByRole('button',{name:'Search stocks and indices',exact:true}).click();await page.getByPlaceholder('Search symbol, company, index or ISIN').fill('INFY');await page.getByLabel('Favourite INFY-EQ',{exact:true}).click();await page.getByLabel('Close search',{exact:true}).click();await expect(page.locator('.watch-row')).toHaveCount(1);
 await page.getByLabel('Manage watchlists',{exact:true}).click();await page.getByLabel('Watchlist action',{exact:true}).selectOption('rename');await page.getByLabel('Watchlist name',{exact:true}).fill('My research');await page.getByRole('button',{name:'Save watchlist',exact:true}).click();
 await page.getByLabel('Toggle theme',{exact:true}).click();await expect(page.locator('.theme-light')).toBeVisible();await page.screenshot({path:'test-results/advanced-light-theme.png'});await page.getByLabel('Toggle theme',{exact:true}).click();
 await page.getByTestId('chart-maximize-0').click();await expect(page.locator('.chart-pane:visible')).toHaveCount(1);await page.getByTestId('chart-maximize-0').click();await expect(page.locator('.chart-pane')).toHaveCount(2);
 const image=join(data,'chart-export.png');await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},image);await page.getByLabel('SCREENSHOT pane 0',{exact:true}).click();await expect.poll(async()=>{try{return (await readFile(image)).subarray(0,8).toString('hex');}catch{return '';}}).toBe('89504e470d0a1a0a');
 await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();await expect(page.getByTestId('pane-1').locator('.ohlc')).not.toContainText('No candles');await page.screenshot({path:'test-results/advanced-terminal.png'});
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.equal(await page.evaluate(()=>window.terminal.platform),process.platform);assert.deepEqual(await page.evaluate(()=>Object.keys(window.terminal).sort()),['cancel','drawingFile','exportScreenerCSV','exportScreenshot','notificationControl','onAlertNavigation','onLifecycle','onMarketStream','onUpdateState','onWindowState','openExternal','platform','request','selectDrawingImage','selectFiles','updateControl','watchlistFile','windowControl']);
 await app.close();app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:45000});await expect(page.getByTestId('pane-1').locator('.pane-symbol')).toContainText('NIFTY BANK');await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});await expect(page.getByLabel('Active watchlist')).toContainText('My research');assert.equal((await workspace()).presets.length,1);assert.equal((await workspace()).panes[0].scale.logarithmic,true);assert.equal((await status()).provider_requests,2,'Restart requests only two visible histories');
 assert.deepEqual(errors,[]);console.log('PASS: all layouts/timeframes, independent LOG/AUTO/percent, editable multiple indicators, validation, presets, watchlists, index volume, PNG export, themes, restart and renderer isolation.');console.log('Layout timings:',JSON.stringify(timings));
}finally{await app?.close();}
