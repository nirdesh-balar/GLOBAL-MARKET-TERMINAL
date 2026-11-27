import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {_electron as electron,expect,sourceElectron} from './isolated-electron.mjs';
import {clickWatchlistAction} from './watchlist-controls.mjs';

const output='test-results/chart-ui-cleanup';
const profile=await mkdtemp(join(tmpdir(),'gmt-chart-ui-cleanup-'));
const env={...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1',IMT_REFRESH_UI:'1',IMT_OFFLINE:'1'};
const errors=[],viewports=[];
let app,page;
const button=name=>page.getByRole('button',{name,exact:true});
const pane=()=>page.getByTestId('pane-0');
const canvas=()=>pane().locator('.chart-canvas');
const sidebar=()=>page.getByTestId('watchlist-sidebar');
const refresh=()=>sidebar().getByTestId('quote-refresh-status');
const request=(path,method='GET',body)=>page.evaluate(([p,m,b])=>window.terminal.request(p,m,b),[path,method,body]);
const history=()=>request('/api/history/status');
const saved=()=>expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state','Saved locally');

async function launch(){
  app=await electron.launch({executablePath:sourceElectron,args:['.'],env,timeout:60000});
  page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:834});
  await expect(sidebar()).toBeVisible({timeout:45000});
}
async function checkLayout(viewport){
  await expect.poll(()=>canvas().evaluate(node=>node.__chart.timeScale().height())).toBeGreaterThan(28);
  const data=await canvas().evaluate(node=>{
    const box=element=>element.getBoundingClientRect();
    const footer=document.querySelector('.watchlist-bottom');
    const summary=footer.querySelector('summary');
    const plot=box(node);
    const bottom=box(document.querySelector('.bottom-chart-toolbar'));
    const ohlc=[...document.querySelectorAll('.ohlc > span')].map(el=>box(el));
    const overlaps=ohlc.some((item,i)=>ohlc.slice(i+1).some(other=>
      item.left<other.right&&other.left<item.right&&item.top<other.bottom&&other.top<item.bottom));
    const layout=node.__chart.options().layout;
    const volume=node.__chart.panes()[1]?.getHTMLElement();
    const header=document.querySelector('[data-study-header=volume]');
    return {viewport:[innerWidth,innerHeight,devicePixelRatio],height:plot.height,bottom:bottom.bottom,
      footerBottom:box(footer).bottom,watchRowsEnd:box(document.querySelector('[data-testid=watchlist-rows]')).bottom,
      footerTop:box(footer).top,summaryFits:summary.scrollWidth<=summary.clientWidth,
      overlaps,scaleFont:layout.fontSize,ohlcFont:getComputedStyle(document.querySelector('.ohlc b')).fontSize,
      indicatorFont:getComputedStyle(document.querySelector('.study-legend-name')).fontSize,
      valueFont:getComputedStyle(document.querySelector('.study-legend-row .study-values')).fontSize,
      watchFooterFont:getComputedStyle(summary).fontSize,axisHeight:node.__chart.timeScale().height(),
      volumeDelta:volume&&header?Math.abs(box(volume).top-box(header).top):null};
  });
  assert.deepEqual(data.viewport,viewport);
  assert.equal(data.bottom,viewport[1]-1,'Only the chart border remains below the controls');
  assert.equal(data.footerBottom,viewport[1]);
  assert.equal(data.watchRowsEnd,data.footerTop);
  assert.ok(data.summaryFits&&!data.overlaps);
  assert.equal(data.scaleFont,13);
  assert.equal(data.ohlcFont,'13px');
  assert.equal(data.indicatorFont,'13px');
  assert.equal(data.valueFont,'12px');
  assert.equal(data.watchFooterFont,'9px');
  assert.ok(data.volumeDelta!==null&&data.volumeDelta<=1);
  viewports.push(data);
}

try{
  await mkdir(output,{recursive:true});
  await launch();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol','yahoo:ICICIBANK.NS:NSE:equity',{timeout:30000});
  await expect(canvas()).toHaveAttribute('data-rendered-bars',/^[1-9]/);
  await expect(pane().locator('.chart-overlay')).toHaveCount(0);
  await expect(sidebar().getByText('ICICIBANK details',{exact:true})).toHaveCount(0);
  await expect(sidebar().getByText(/NSE equities.*Global search/)).toHaveCount(0);
  await expect(page.locator('.statusbar')).toHaveCount(0);
  await expect(page.getByText('Saved locally',{exact:true})).toHaveCount(0);
  await expect(refresh()).toHaveText(/Updated at .+ · Auto 300s/,{timeout:30000});
  const oldStamp=await refresh().innerText();
  const oldStatus=await request('/api/quotes/status?watchlist=stocks');
  const oldHistory=await history();
  await clickWatchlistAction(page,'Refresh watchlist prices');
  let nextStatus;
  await expect.poll(async()=>{
    nextStatus=await request('/api/quotes/status?watchlist=stocks');
    const job=await sidebar().getAttribute('data-quote-job');
    return Boolean(nextStatus.job&&nextStatus.job!==oldStatus.job&&job===nextStatus.job&&!nextStatus.pending);
  },{timeout:30000}).toBe(true);
  await expect(refresh()).toHaveText(/Updated at .+ · Auto 300s/,{timeout:30000});
  await expect(refresh()).not.toHaveText(oldStamp,{timeout:30000});
  const latest=Math.max(...Object.values(nextStatus.rows).map(row=>row.value?.fetched_at||0));
  assert.notEqual(nextStatus.job,oldStatus.job);
  assert.equal(await refresh().innerText(),'Updated at '+await page.evaluate(time=>new Date(time*1000).toLocaleTimeString(),latest)+' · Auto 300s');
  const refreshed=await history();
  assert.ok(refreshed.quote_provider_requests>oldHistory.quote_provider_requests);
  assert.equal(refreshed.provider_requests,oldHistory.provider_requests);

  const chartCreation=await canvas().getAttribute('data-chart-creations');
  const initialRange=await canvas().evaluate(node=>node.__chart.timeScale().getVisibleLogicalRange());
  const dpr=await page.evaluate(()=>devicePixelRatio);
  await checkLayout([1440,834,dpr]);
  const separator=page.getByRole('separator',{name:'Resize watchlist'});
  const width=Number(await separator.getAttribute('aria-valuenow'));
  for(let i=0;i<4;i++)await separator.press('ArrowRight');
  await expect(refresh()).toBeVisible();
  const compact=await refresh().evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,box:node.closest('.watchlist').getBoundingClientRect().width}));
  assert.equal(compact.box,width-64);
  assert.ok(compact.scroll<=compact.width);
  await expect(refresh()).toHaveText(/Updated at .+ · Auto 300s/);
  for(let i=0;i<4;i++)await separator.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow',String(width));
  await expect(refresh()).toBeVisible();

  const cdp=await app.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:2047,height:1285,deviceScaleFactor:2,mobile:false});
  await checkLayout([2047,1285,2]);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1050,height:650,deviceScaleFactor:2,mobile:false});
  await checkLayout([1050,650,2]);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await page.setViewportSize({width:1440,height:834});
  await expect(canvas()).toHaveAttribute('data-chart-creations',chartCreation);
  const resizedRange=await canvas().evaluate(node=>node.__chart.timeScale().getVisibleLogicalRange());
  assert.ok(Math.abs(initialRange.to-resizedRange.to)<1&&Math.abs(initialRange.from-resizedRange.from)<1,
    JSON.stringify({initialRange,resizedRange}));
  const plot=await canvas().boundingBox();
  const latestTime=Number(await canvas().getAttribute('data-last-rendered-time'));
  await page.mouse.move(plot.x+plot.width*.6,plot.y+plot.height*.35);
  await expect.poll(async()=>Number(await canvas().getAttribute('data-crosshair-time'))).toBeLessThan(latestTime);
  assert.ok(Number(await canvas().getAttribute('data-crosshair-time'))>0);
  await expect(pane().locator('[data-study-output][data-value]').first()).toBeVisible();
  const noNeed=await history();
  assert.equal(noNeed.history_requests,refreshed.history_requests);
  assert.equal(noNeed.provider_requests,refreshed.provider_requests);

  await app.evaluate(({shell})=>{shell.openExternal=async url=>{globalThis.__chartAttributionURL=url;};});
  const credit=page.locator('.terminal-header').getByRole('button',{name:'Charts by TradingView'});
  await expect(credit).toBeVisible();
  await credit.click();
  await expect.poll(()=>app.evaluate(()=>globalThis.__chartAttributionURL)).toBe('https://www.tradingview.com/');
  await expect(button('Enter macOS Fullscreen')).toBeEnabled();
  await button('Time zone pane 0').click();
  await expect(page.getByRole('dialog',{name:'Chart display time zone'})).toBeVisible();
  await page.keyboard.press('Escape');
  await button('LOG pane 0').click();
  await expect(button('LOG pane 0')).toHaveAttribute('aria-pressed','true');
  await button('AUTO pane 0').click();
  await expect(button('AUTO pane 0')).toHaveAttribute('aria-pressed','false');
  await button('FIT pane 0').click();
  await button('RESET pane 0').click();
  await button('Data controls pane 0').click();
  await expect(page.getByLabel('History source pane 0')).toBeVisible();
  await button('Data controls pane 0').click();
  await button('Historical replay').click();
  await expect(canvas()).toHaveAttribute('data-replay','true');
  await button('Exit replay').click();
  await expect(canvas()).toHaveAttribute('data-replay','false');
  const screenshot=join(profile,'chart.png');
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},screenshot);
  await button('SCREENSHOT pane 0').click();
  await expect.poll(async()=>await readFile(screenshot).then(bytes=>bytes.subarray(0,8).toString('hex')).catch(()=>null))
    .toBe('89504e470d0a1a0a');

  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app-lifecycle','suspend'));
  await expect(refresh()).toHaveText('Refresh paused · Auto 300s');
  await expect(sidebar().locator('.stale-quote').first()).toBeVisible();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app-lifecycle','resume'));
  await expect(refresh()).toHaveText(/Updated at .+ · Auto 300s/,{timeout:30000});
  await page.context().setOffline(true);
  await expect(refresh()).toHaveText('Refresh paused · Auto 300s');
  await page.context().setOffline(false);
  await expect(refresh()).toHaveText(/Updated at .+ · Auto 300s/,{timeout:30000});

  await refresh().click();
  await page.getByLabel('Watchlist auto refresh',{exact:true}).selectOption('900');
  await expect(refresh()).toContainText('Auto 900s');
  await refresh().click();
  await expect.poll(async()=>(await request('/api/refresh/preferences')).watchlist_interval).toBe(900);
  await button('Save workspace').click();
  await saved();
  await app.close();
  await launch();
  await expect(refresh()).toHaveText(/Updated at .+ · Auto 900s/,{timeout:30000});
  await expect(canvas()).toHaveAttribute('data-history-symbol','yahoo:ICICIBANK.NS:NSE:equity',{timeout:30000});
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'native-regression.json'),JSON.stringify({viewports,compact,oldStamp,latest,
    newQuoteProviderRequests:refreshed.quote_provider_requests-oldHistory.quote_provider_requests,
    extraChartRequests:noNeed.history_requests-refreshed.history_requests, chartCreation, initialRange,resizedRange},null,2));
  console.log('PASS footer sizing, real refresh timestamps, persistence, 13 px axes, Retina, crosshair, study alignment, chart controls, attribution and zero extra history requests.');
}finally{
  await app?.close();
}
