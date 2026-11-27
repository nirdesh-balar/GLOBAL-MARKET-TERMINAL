import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {_electron as electron,expect,sourceElectron} from './isolated-electron.mjs';
import {chartStylesMenu,openDataProvenance,openMarketDiagnostics,selectChartStyle} from './chart-menu-controls.mjs';

const output='test-results/chart-menu';
const profile=await mkdtemp(join(tmpdir(),'gmt-chart-menu-'));
const env={...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1',IMT_HYPERLIQUID_UI:'1',IMT_E3B_UI:'1',IMT_OFFLINE:'1'};
const styles=[
  ['bars','Bar'],['candles','Candlestick'],['hollow','Candlestick'],['hlc-bars','Bar'],
  ['line','Line'],['markers','Line'],['steps','Line'],['area','Area'],['baseline','Baseline'],
  ['columns','Histogram'],['high-low','Candlestick'],['heikin-ashi','Candlestick'],['line-break','Candlestick'],
];
const errors=[];
let app,page;
const button=(name,scope=page)=>scope.getByRole('button',{name,exact:true});
const pane=(id='0')=>page.getByTestId('pane-'+id);
const canvas=(id='0')=>pane(id).locator('.chart-canvas');
const menu=()=>chartStylesMenu(page);
const call=(path,method='GET',body)=>page.evaluate(([p,m,b])=>window.terminal.request(p,m,b),[path,method,body]);
const shot=name=>page.screenshot({path:join(output,'after-'+name+'.png')});
const assertNoBrand=async scope=>expect(scope).not.toContainText(/Yahoo Finance|Hyperliquid|DIRECT FETCH|histories in RAM|Providers ·|Local backend/i);
const chartReady=async (id,canonical)=>expect(canvas(id)).toHaveAttribute('data-history-symbol',canonical,{timeout:30000});
async function launch(){
  app=await electron.launch({executablePath:sourceElectron,args:['.'],env,timeout:60000});
  page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:834});
  await expect(button('Charts by TradingView')).toBeVisible({timeout:45000});
  await expect(pane().locator('.chart-overlay')).toHaveCount(0,{timeout:45000});
}
async function checkStyle(id,style,series){
  const state=await canvas(id).evaluate(node=>{
    const m=node.__mainSeries,data=m.data(),options=m.options(),first=data.find(p=>'close' in p);
    return {type:m.seriesType(),count:data.length,flags:{open:options.openVisible,markers:options.pointMarkersVisible,
      line:options.lineType,wick:options.wickVisible},first,second:data[1]};
  });
  assert.equal(state.type,series,style);
  assert.ok(state.count>100,style);
  if(style==='bars'||style==='hlc-bars')assert.equal(state.flags.open,style==='bars');
  if(style==='markers')assert.equal(state.flags.markers,true);
  if(style==='steps')assert.equal(state.flags.line,1);
  if(style==='high-low'){assert.equal(state.flags.wick,false);assert.equal(state.first.open,state.first.low);assert.equal(state.first.close,state.first.high);}
  if(style==='hollow')assert.equal(state.first.color,'transparent');
  if(style==='line-break'){
    assert.ok(state.count<Number(await canvas(id).getAttribute('data-rendered-bars')));
    assert.equal(state.second.open,state.first.close);
  }
  return state;
}
try{
  await mkdir(output,{recursive:true});
  await launch();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await button('Search stocks and indices').click();
  const search=page.getByRole('dialog',{name:'Search stocks and indices'});
  await expect(button('Search indices')).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'Search indices',exact:true})).toHaveCount(0);
  await button('Indices & ETFs',search).click();
  await search.getByRole('textbox').fill('NIFTY 50');
  await expect(search.getByTestId('search-result-^NSEI')).toBeEnabled({timeout:30000});
  await shot('search');
  await search.getByRole('textbox').press('Enter');
  const nifty='yahoo:%5ENSEI:NSE:index';
  await chartReady('0',nifty);
  await assertNoBrand(page.locator('.terminal-header'));
  await assertNoBrand(pane().locator('.chart-legend'));
  await expect(page.locator('.statusbar')).toHaveCount(0);
  await expect(button('Charts by TradingView')).toBeVisible();
  await expect(await openDataProvenance(page)).toContainText(/fixture.*Retrieved/i);
  await expect(button('Index constituents')).toBeVisible();
  await shot('data');
  await button('Data controls pane 0').click();
  await shot('chart');

  const active=button('Active chart type');
  await page.getByTestId('drawing-category-lines').click();
  await page.getByTestId('drawing-tool-horizontal').click();
  await canvas().click({position:{x:280,y:230}});
  await button('Cursor / crosshair').click();
  await expect.poll(async()=>Object.values((await call('/workspace')).panes[0].drawing_sets).flat().length).toBe(1);
  const snapshot=await call('/workspace');
  const reports=[];
  const before=await call('/api/history/status');
  const counts=await canvas().getAttribute('data-rendered-bars');
  const firstRange=await canvas().evaluate(node=>{
    const scale=node.__chart.timeScale();
    const range=scale.getVisibleLogicalRange();
    const target={from:range.from-29,to:range.to-50};
    scale.setVisibleLogicalRange(target);
    return target;
  });
  await expect.poll(()=>canvas().evaluate(node=>node.__chart.timeScale().getVisibleLogicalRange())).toEqual(firstRange);
  await active.focus();
  await active.press('ArrowDown');
  await expect(menu()).toBeVisible();
  await expect(active).toHaveAttribute('aria-expanded','true');
  await expect(menu().getByRole('group')).toHaveCount(5);
  const items=menu().getByRole('menuitemradio');
  assert.deepEqual(await items.evaluateAll(nodes=>nodes.map(item=>item.dataset.style)),styles.map(([style])=>style));
  assert.equal(await items.locator('svg').count(),14); // one icon per item and one selected check
  const initialBounds=await active.boundingBox(), menuBounds=await menu().boundingBox();
  assert.ok(Math.abs(menuBounds.x-initialBounds.x)<=1&&Math.abs(menuBounds.y-(initialBounds.y+initialBounds.height+4))<=1,{initialBounds,menuBounds});
  await expect(menu().getByRole('menuitemradio',{checked:true})).toBeFocused();
  await shot('menu-dark');
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  assert.ok(await menu().evaluate(node=>node.scrollTop>0));
  await shot('menu-scrolled');
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu()).toHaveCount(0);
  await expect(active).toBeFocused();
  await active.click();
  await canvas().click({position:{x:200,y:170}});
  await expect(menu()).toHaveCount(0);

  for(const [style,type] of styles){
    await selectChartStyle(page,style);
    await expect(active).toHaveAttribute('data-chart-style',style);
    await expect(active).toBeFocused();
    await expect(menu()).toHaveCount(0);
    await expect(canvas()).toHaveAttribute('data-rendered-bars',counts);
    await chartReady('0',nifty);
    reports.push({style,...await checkStyle('0',style,type)});
  }
  const ha=reports.find(row=>row.style==='heikin-ashi').first;
  const raw=reports.find(row=>row.style==='candles').first;
  assert.ok(Math.abs(ha.close-(raw.open+raw.high+raw.low+raw.close)/4)<1e-10);
  const breakLine=reports.find(row=>row.style==='line-break').first;
  assert.equal(await canvas().evaluate((node,time)=>node.__chart.timeScale().timeToCoordinate(time)!==null,raw.time),true);
  assert.equal(breakLine.open,raw.close);
  assert.ok(breakLine.time>raw.time);
  await expect.poll(()=>canvas().evaluate(node=>node.__chart.timeScale().getVisibleLogicalRange())).toEqual(firstRange);
  await canvas().hover({position:{x:330,y:180}});
  const hoveredTime=Number(await canvas().getAttribute('data-crosshair-time'));
  const lastTime=Number(await canvas().getAttribute('data-last-rendered-time'));
  assert.ok(hoveredTime>0&&hoveredTime<lastTime,'Crosshair resolves to the underlying candle inside the preserved range');
  for(const style of ['steps','bars','area','candles','markers','line-break'])await selectChartStyle(page,style);
  assert.equal((await call('/api/history/status')).provider_requests,before.provider_requests);
  const after=await call('/workspace');
  assert.deepEqual(after.watchlists,snapshot.watchlists);
  assert.deepEqual(after.panes[0].drawing_sets,snapshot.panes[0].drawing_sets);
  assert.deepEqual(after.panes[0].indicators,snapshot.panes[0].indicators);
  assert.equal(after.panes[0].timeframe,'1d');
  await button('Historical replay').click();
  await expect(canvas()).toHaveAttribute('data-replay','true');
  await selectChartStyle(page,'area');
  await expect(canvas()).toHaveAttribute('data-replay','true');
  await button('Exit replay').click();

  await button('Chart layout').click();
  await button('Layout 2').click();
  await expect(pane('1')).toBeVisible();
  await expect(pane('1').locator('.chart-overlay')).toHaveCount(0,{timeout:30000});
  const second=button('Chart type pane 1');
  await active.click();
  await expect(menu()).toHaveCount(1);
  await second.focus();
  await second.press('ArrowDown');
  await expect(menu()).toHaveCount(1);
  await menu().locator('[data-style=baseline]').click();
  await expect(second).toHaveAttribute('data-chart-style','baseline');
  await expect(button('Chart type pane 0')).toHaveAttribute('data-chart-style','area');
  await canvas('1').click({position:{x:110,y:100}});
  await expect(active).toHaveAttribute('data-chart-style','baseline');
  await selectChartStyle(page,'high-low');
  await expect(second).toHaveAttribute('data-chart-style','high-low');
  assert.equal((await checkStyle('1','high-low','Candlestick')).type,'Candlestick');
  await expect(button('Chart type pane 0')).toHaveAttribute('data-chart-style','area');
  await page.setViewportSize({width:1060,height:650});
  await button('Toggle theme').click();
  await expect(page.locator('.theme-light')).toBeVisible();
  await active.click();
  await shot('menu-light');
  await page.keyboard.press('Escape');

  // Put the real reusable trigger at a constrained viewport edge and verify its collision response.
  await active.evaluate(node=>Object.assign(node.style,{position:'fixed',right:'3px',bottom:'3px',zIndex:'60'}));
  await active.click();
  const collision=await menu().boundingBox(), edgeButton=await active.boundingBox();
  assert.ok(collision.x>=0&&collision.y>=0&&collision.x+collision.width<=1060&&collision.y+collision.height<edgeButton.y,JSON.stringify({collision,edgeButton}));
  await page.keyboard.press('Escape');
  await active.evaluate(node=>node.removeAttribute('style'));
  await page.setViewportSize({width:1440,height:834});

  // Manual refresh failure keeps existing candles and surfaces the stale state.
  await app.evaluate(()=>{
    globalThis.__gmtMenuFetch=globalThis.fetch;
    globalThis.fetch=(input,options)=>new URL(String(input)).pathname==='/api/history/refresh'
      ? Promise.resolve(new Response(JSON.stringify({detail:'Fixture connection interrupted',code:'connection',kind:'connection',retryable:true}),{
          status:503,headers:{'Content-Type':'application/json'}}))
      : globalThis.__gmtMenuFetch(input,options);
  });
  await button('Refresh pane 0').click();
  await expect(pane().locator('.chart-stale')).toHaveText('Stale');
  await expect(canvas()).toHaveAttribute('data-history-stale','true');
  await expect(await openDataProvenance(page)).toContainText(/Stale/);
  await shot('stale');
  await app.evaluate(()=>{globalThis.fetch=globalThis.__gmtMenuFetch;delete globalThis.__gmtMenuFetch;});
  await button('Data controls pane 0').click();

  await openMarketDiagnostics(page);
  const diagnostics=page.getByRole('dialog',{name:'Market data providers'});
  await expect(diagnostics).toContainText('Hyperliquid');
  await expect(diagnostics).toContainText('Yahoo Finance');
  await button('Close providers',diagnostics).click();
  await expect.poll(async()=>(await call('/workspace')).panes.slice(0,2).map(row=>row.chart_type)).toEqual(['area','high-low']);
  await app.close();
  await launch();
  await expect(button('Chart type pane 0')).toHaveAttribute('data-chart-style','area');
  await expect(button('Chart type pane 1')).toHaveAttribute('data-chart-style','high-low');

  // A connection failure on a new instrument has no cached candles to display.
  await app.evaluate(()=>{
    globalThis.__gmtMenuFetch=globalThis.fetch;
    globalThis.fetch=(input,options)=>{
      const url=new URL(String(input));
      if(url.pathname!=='/api/history'||url.searchParams.get('symbol')!=='yahoo:%5EGSPC:NYSE:index')return globalThis.__gmtMenuFetch(input,options);
      return Promise.resolve(new Response(JSON.stringify({
        detail:'Fixture is offline',code:'connection',kind:'temporary',retryable:true,
      }),{status:503,headers:{'Content-Type':'application/json'}}));
    };
  });
  await button('Search stocks and indices').click();
  const restartedSearch=page.getByRole('dialog',{name:'Search stocks and indices'});
  await button('Indices & ETFs',restartedSearch).click();
  await restartedSearch.getByRole('textbox').fill('^GSPC');
  await restartedSearch.getByTestId('search-result-^GSPC').click();
  const offline=page.getByTestId('chart-error-0');
  await expect(offline).toContainText('Connection interrupted');
  await expect(offline).toContainText('Fixture is offline');
  await expect(offline.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await shot('offline');
  await app.evaluate(()=>{globalThis.fetch=globalThis.__gmtMenuFetch;delete globalThis.__gmtMenuFetch;});
  await offline.getByRole('button',{name:'Retry',exact:true}).click();
  await chartReady('0','yahoo:%5EGSPC:NYSE:index');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'native-check.json'),JSON.stringify({reports,collision,range:firstRange,styleRequests:0,errors},null,2));
  console.log('PASS 13 real styles, anchored/scrollable menu, keyboard and outside dismissal, pane independence, replay, exact restart, source, stale and offline visibility, zero extra histories.');
}finally{
  await app?.close();
}
