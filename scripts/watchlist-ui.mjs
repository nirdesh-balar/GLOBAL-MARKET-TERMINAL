import {_electron as electron,expect} from './isolated-electron.mjs';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';

const packaged=process.argv.includes('--packaged');
const profile=await mkdtemp(join(tmpdir(),'imt-watchlist-only-'));
const executablePath=resolve(packaged?'release/mac-arm64/Indian Market Terminal.app/Contents/MacOS/Indian Market Terminal':'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const env={...process.env,IMT_TEST_DATA_DIR:profile};
if(!packaged){env.IMT_OFFLINE='1';env.IMT_UI_FIXTURE='1';}
let app,page;const errors=[];
const launch=()=>electron.launch({executablePath,args:packaged?[]:['.'],env,timeout:60000});
await mkdir('test-results',{recursive:true});
try{
 app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.stack||e.message));
 await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({timeout:60000});
 await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:packaged?120000:30000});
 const sidebar=()=>page.getByTestId('watchlist-sidebar');
 const workspace=()=>page.evaluate(()=>window.terminal.request('/workspace'));
 const status=()=>page.evaluate(()=>window.terminal.request('/api/history/status'));
 const layout=async n=>{await page.getByLabel('Chart layout',{exact:true}).click();await page.getByLabel(`Layout ${n}`,{exact:true}).click();await expect(page.locator('.chart-pane')).toHaveCount(n);await expect.poll(async()=>(await workspace()).layout).toBe(n);await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});};
 const absent=async()=>{await expect(sidebar().locator('.symbol-details')).toHaveCount(0);await expect(sidebar().getByRole('region',{name:'Symbol details',exact:true})).toHaveCount(0);await expect(sidebar().locator('section')).toHaveCount(0);};
 const geometry=async()=>{
  const rect=await sidebar().evaluate(el=>{
   const list=el.querySelector('[data-testid="watchlist-rows"]'),add=el.querySelector('[data-testid="watchlist-add-symbol"]'),header=el.querySelector('[data-testid="watchlist-header"]');
   const r=node=>{const b=node.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height};};
   return {sidebar:r(el),rows:r(list),add:r(add),header:r(header),marginTop:parseFloat(getComputedStyle(add).marginTop),overflowY:getComputedStyle(list).overflowY,flexGrow:getComputedStyle(list).flexGrow,client:list.clientHeight,scroll:list.scrollHeight};
  });
  assert.ok(Math.abs(rect.header.top-rect.sidebar.top)<=1,'Watchlist header is fixed at sidebar top');
  assert.ok(Math.abs(rect.rows.bottom-(rect.add.top-rect.marginTop))<=1,'Rows occupy all space up to Add Symbol, with no empty details container');
  assert.ok(rect.rows.height>rect.sidebar.height*.65,'Watchlist occupies most available sidebar height');
  assert.ok(rect.add.bottom<=rect.sidebar.bottom,'Add Symbol remains visible');
  assert.equal(rect.overflowY,'auto');assert.equal(rect.flexGrow,'1');return rect;
 };
 await absent();await layout(1);await geometry();
 await page.getByTestId('watchlist-symbol-SBIN-EQ').click();
 await expect(page.getByTestId('pane-0').locator('.pane-symbol')).toHaveText('SBIN');
 await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:packaged?120000:30000});
 await expect.poll(async()=>(await workspace()).panes[0].symbol).toBe('SBIN-EQ');
 await expect(page.getByTestId('pane-0').locator('.ohlc b')).toHaveCount(4);
 assert.ok((await page.getByTestId('pane-0').locator('.ohlc b').allTextContents()).every(value=>value.trim()&&value!=='—'));
 await expect(page.getByTestId('pane-0').locator('.history-meta')).toContainText('→');
 // A double-click must not recreate an obsolete card.
 await page.getByTestId('watchlist-symbol-SBIN-EQ').dblclick();await absent();
 await page.screenshot({path:packaged?'test-results/watchlist-only-packaged.png':'test-results/watchlist-only-dark.png'});
 await sidebar().screenshot({path:packaged?'test-results/watchlist-only-packaged-sidebar.png':'test-results/watchlist-only-sidebar.png'});
 if(packaged){
  const health=await page.evaluate(()=>window.terminal.request('/health'));assert.equal(health.version,'0.6.0');assert.equal(health.provider.source,'YAHOO FINANCE');
  assert.equal(health.provider.provider_requests,3,'Production app fetches only initial two visible symbols, then explicitly selected SBIN');
  assert.deepEqual(errors,[]);console.log('PASS: signed packaged app launches with real Yahoo SBIN OHLC, full-height watchlist, no details card and no renderer errors.');
 }else{
  await page.getByLabel('Active watchlist',{exact:true}).selectOption('indices');
  await page.getByTestId('watchlist-symbol-^NSEI').click();await expect(page.getByTestId('pane-0').locator('.pane-symbol')).toHaveText('NIFTY 50');
  await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});await expect.poll(async()=>(await workspace()).panes[0].symbol).toBe('^NSEI');
  await expect(page.getByTestId('pane-0').locator('.ohlc b')).toHaveCount(4);await absent();
  const providerBefore=(await status()).provider_requests;
  // Populate a genuinely overflowing watchlist with directory metadata only.
  const catalogue=await page.evaluate(()=>window.terminal.request('/api/instruments/search?q=NSE&limit=100'));
  const items=catalogue.filter(row=>row.kind==='equity'&&row.exchange==='NSE').slice(0,40).map(row=>({symbol:row.symbol,token:row.token,instrument_id:row.id,kind:row.kind,name:row.name,exchange:row.exchange}));assert.equal(items.length,40);
  let w=await workspace();w.watchlists.push({id:'sidebar-regression',name:'Sidebar regression',items});w.active_watchlist='sidebar-regression';
  await page.evaluate(value=>window.terminal.request('/workspace','PUT',value),w);await page.reload();await expect(sidebar()).toBeVisible();await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
  assert.equal((await status()).provider_requests,providerBefore,'Populating/reading a watchlist never bulk-downloads history');
  const measured=await geometry();assert.ok(measured.scroll>measured.client,'Large watchlist overflows its own scrolling area');
  const fixedHeader=await page.getByTestId('watchlist-header').boundingBox();const fixedAdd=await page.getByTestId('watchlist-add-symbol').boundingBox();
  await page.getByTestId('watchlist-rows').evaluate(el=>el.scrollTop=350);
  assert.ok(await page.getByTestId('watchlist-rows').evaluate(el=>el.scrollTop)>0);
  assert.deepEqual(await page.getByTestId('watchlist-header').boundingBox(),fixedHeader);assert.deepEqual(await page.getByTestId('watchlist-add-symbol').boundingBox(),fixedAdd);
  const handle=await page.getByLabel('Resize watchlist',{exact:true}).boundingBox();await page.mouse.move(handle.x+3,handle.y+100);await page.mouse.down();await page.mouse.move(handle.x+63,handle.y+100,{steps:5});await page.mouse.up();
  await expect.poll(async()=>(await workspace()).sidebar.width).toBeLessThan(300);await geometry();
  await page.getByLabel('Toggle sidebar',{exact:true}).click();await expect(sidebar()).toHaveCount(0);await page.getByLabel('Toggle sidebar',{exact:true}).click();await expect(sidebar()).toBeVisible();await absent();
  await page.getByLabel('LOG pane 0',{exact:true}).click();await page.getByLabel('Toggle theme',{exact:true}).click();await expect(page.locator('.theme-light')).toBeVisible();
  await page.screenshot({path:'test-results/watchlist-only-light.png'});
  for(const n of [2,4,6,8]){await layout(n);await absent();await geometry();}
  await layout(2);await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();
  const saved=await workspace();assert.equal(saved.active_watchlist,'sidebar-regression');assert.equal(saved.watchlists.at(-1).items.length,40);assert.equal(saved.panes[0].scale.logarithmic,true);
  await app.close();app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.stack||e.message));await expect(sidebar()).toBeVisible({timeout:45000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
  assert.deepEqual(await workspace(),saved,'Watchlists, chart/layout/sidebar/appearance/drawing settings survive restart');await absent();await geometry();
  assert.equal((await status()).provider_requests,2,'Restart fetches exactly the two visible charts');await expect(page.getByTestId('pane-0').locator('.pane-symbol')).toHaveText('NIFTY 50');await expect(page.getByTestId('pane-0').locator('.ohlc b')).toHaveCount(4);
  assert.deepEqual(errors,[]);console.log('PASS: details absent, full-height independent watchlist scrolling, fixed header/Add Symbol, SBIN/index selection and OHLC, resize/collapse, all layouts, no bulk fetch, themes and exact restart persistence.');console.log('Measured sidebar:',JSON.stringify(measured));
 }
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:'test-results/watchlist-only-failure.png'});console.error('Renderer errors:',errors);throw error;}finally{await app?.close();}
