import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { selectChartStyle } from './chart-menu-controls.mjs';

const output = 'test-results/volume-redesign';
const profile = await mkdtemp(join(tmpdir(), 'gmt-volume-redesign-'));
await mkdir(output, { recursive: true });
const launch = () => electron.launch({ executablePath: sourceElectron, args: ['.'], timeout: 60000,
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_VOLUME_REDESIGN_UI: '1', IMT_OFFLINE: '1' } });
let app, page;
const rendererErrors=[];
const icici='yahoo:ICICIBANK.NS:NSE:equity';
const legend=(id='0')=>page.getByTestId(`volume-legend-${id}`);
const header=(id='0')=>page.getByTestId(`study-controls-${id}-volume`);
const overlay=(id='0')=>page.getByTestId(`study-legend-${id}-volume`);
const settings=()=>page.getByRole('dialog',{name:'Volume settings'});
const row=()=>manager().getByTestId('indicator-volume');
const saved=()=>expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state','Saved locally');
const geometry=()=>canvas().evaluate(node=>({
  range:node.__chart.timeScale().getVisibleLogicalRange(), prices:node.__chart.priceScale('right',0).getVisibleRange(),
  height:node.__chart.panes()[0].getHeight(), count:node.__chart.panes().length,
  empty:node.__chart.panes().filter(pane=>!pane.getSeries().length).length,
}));
const chart = id => page.getByTestId(`pane-${id}`);
const canvas = (id = '0') => chart(id).locator('.chart-canvas');
const toolbar = () => chart('0').locator('.pane-toolbar');
const manager = () => page.getByRole('dialog', { name: 'Indicator manager' });
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const volume = (id = '0') => canvas(id).evaluate(node => node.__chart.panes().flatMap((pane, index) =>
  pane.getSeries().filter(series => series.seriesType() === 'Histogram' && series.options().priceFormat.type === 'volume')
    .map(series => ({ index, scale: series.options().priceScaleId, data: series.data() }))));
const request = (path, method = 'GET', body) =>
  page.evaluate(([p,m,b]) => window.terminal.request(p,m,b), [path,method,body]);
const ready = () => expect(canvas()).toHaveAttribute('data-rendered-bars', /^[1-9]/, { timeout: 45000 });
async function start() {
  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror',error=>rendererErrors.push(error.message));
  await page.setViewportSize({width:1440,height:834});
  await expect(button('Chart layout')).toBeVisible({timeout:45000});
  await ready();
}
async function searchVolume() {
  await button('Indicators').click();
  await button('Technicals',manager()).click();
  await manager().getByRole('textbox',{name:'Search indicators'}).fill('Volume');
}

try {
  await start();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await button('Active timeframe 15m').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol','yahoo:ICICIBANK.NS:NSE:equity',{timeout:45000});
  await expect(canvas()).toHaveAttribute('data-history-interval','15m',{timeout:45000});
  if (process.argv.includes('--reproduce')) {
    assert.equal((await volume())[0]?.index, 1, 'Baseline automatically shows the dedicated Volume pane');
    await expect(button('Volume pane 0', toolbar())).toBeVisible();
    await expect(chart('0').locator('.chart-legend').getByTestId('volume-legend-0')).toBeVisible();
    await expect(page.getByTestId('study-controls-0-volume')).toBeVisible();
    await page.screenshot({path:join(output,'before-baseline.png')});
    await searchVolume();
    await expect(button('Add Volume',manager())).toBeDisabled();
    await manager().getByRole('button',{name:/^Active indicators/}).click();
    const row = manager().getByTestId('indicator-volume');
    await button('Visibility volume',row).click();
    await expect.poll(volume).toEqual([]);
    await button('Visibility volume',row).click();
    await expect.poll(async()=> (await volume())[0]?.index).toBe(1);
    await button('Delete volume',row).click();
    await expect.poll(volume).toEqual([]);
    await button('Close indicators').click();
    await searchVolume();
    await button('Add Volume',manager()).click();
    await button('Close indicators').click();
    await expect.poll(async()=> (await volume())[0]?.index).toBe(1);
    await page.screenshot({path:join(output,'before-readded.png')});
    console.log('Reproduced legacy auto-add, duplicate legends, separate-only add, speaker toggle, and clean hide/remove.');
  }
  const wrong = [];
  if (await button('Volume pane 0',toolbar()).count()) wrong.push('speaker button present');
  if (await chart('0').locator('.chart-legend').getByTestId('volume-legend-0').count()) wrong.push('upper legend present');
  if ((await volume()).length) wrong.push('new chart starts with Volume');
  assert.deepEqual(wrong, [], 'New charts have no Volume and neither marked control exists');
  await searchVolume();
  await button('Add Volume',manager()).click();
  await button('Close indicators').click();
  await expect.poll(async()=> (await volume()).map(series=>series.index)).toEqual([0]);
  await expect(legend()).toBeVisible();
  await expect(chart('0').locator('.chart-legend').getByTestId('volume-legend-0')).toHaveCount(1);
  await expect(header()).toHaveCount(0);

  const history = interval=>request('/api/history?'+new URLSearchParams({symbol:icici,interval}));
  const expected = (await history('15m')).candles;
  assert.ok(expected.length>=75);
  const verifyVolume = async (rows,id='0',index=0,color='#17a69255')=>{
    const [histogram] = await volume(id);
    assert.equal((await volume(id)).length,1);
    assert.equal(histogram.index,index);
    assert.deepEqual(histogram.data.filter(point=>'value' in point),
      rows.filter(bar=>bar.volume!==null).map(bar=>({time:bar.time,value:bar.volume,color:bar.close>=bar.open?color:'#e2445055'})));
  };
  // The default margins bound bar coordinates inside the bottom of price pane 0.
  const band=await canvas().evaluate(node=>{
    const pane=node.__chart.panes()[0],height=pane.getHeight();
    const series=pane.getSeries().find(s=>s.options().priceScaleId==='gmt-volume');
    return {height,zero:series.priceToCoordinate(0),top:series.priceToCoordinate(Math.max(...series.data().map(p=>p.value??0))),
      seriesOrder:series.seriesOrder(),legendBottom:node.parentElement.querySelector('[data-testid=study-legend-0-volume]').getBoundingClientRect().bottom-
        pane.getHTMLElement().getBoundingClientRect().top};
  });
  assert.ok(band.legendBottom<=band.top+3&&band.top>=band.height*.88&&band.zero<band.height);
  assert.equal(band.seriesOrder,0);
  assert.equal((await volume())[0].scale,'gmt-volume');
  await verifyVolume(expected);
  const box=await canvas().boundingBox();
  const crosshair = async bar=>{
    const x=await canvas().evaluate((node,time)=>node.__chart.timeScale().timeToCoordinate(time),bar.time);
    assert.ok(x!==null&&x>=0);
    await page.mouse.move(box.x+x,box.y+200);
    await expect(canvas()).toHaveAttribute('data-crosshair-time',String(bar.time));
    await expect(legend()).toContainText(bar.volume===null?'unavailable':String(bar.volume)+'.00');
  };
  await crosshair(expected[1]);
  await crosshair(expected[2]);
  await crosshair(expected[3]);
  await page.mouse.move(box.x+box.width*.65,box.y+250);
  const zoomBefore=(await geometry()).range;
  await page.mouse.wheel(0,-255);
  await expect.poll(async()=> (await geometry()).range).not.toEqual(zoomBefore);
  await verifyVolume(expected);
  await page.screenshot({path:join(output,'fixture-overlay.png')});

  await button('Indicators').click();
  await button('Add RSI',manager()).click();
  await button('Add ATR',manager()).click();
  await button('Close indicators').click();
  await expect.poll(async()=> (await geometry()).count).toBe(3);
  await saved();
  const beforeHide=await geometry();
  await button('Hide Volume',overlay()).click();
  await expect.poll(volume).toEqual([]);
  await expect(legend()).toHaveText('Volume');
  await expect(header()).toHaveCount(0);
  assert.deepEqual(await geometry(),beforeHide,'The independent overlay neither resizes the chart nor changes the price scale');
  await button('Indicators').click();
  await manager().getByRole('button',{name:/^Active indicators/}).click();
  await button('Visibility volume',row()).click();
  await button('Close indicators').click();
  await expect(legend()).toBeVisible();

  const beforeSettings=await request('/api/history/status');
  const activeStudies=await request('/workspace');
  await canvas().evaluate(node=>{node.__volumeTestStudies=node.__chart.panes().slice(1).map(p=>p.getSeries()[0]);});
  await button('Edit Volume',overlay()).click();
  await expect(settings().getByLabel('Volume placement')).toHaveCount(0);
  await settings().getByLabel('Up bar color').fill('#12ab34');
  await button('Apply settings',settings()).click();
  await expect.poll(async()=> (await volume())[0]?.data[0]?.color).toBe('#12ab3455');
  assert.equal(await canvas().evaluate(node=>node.__chart.panes()[1].getSeries()[0]===node.__volumeTestStudies[0]
    &&node.__chart.panes()[2].getSeries()[0]===node.__volumeTestStudies[1]),true,'Volume settings preserve both study series');
  await saved();
  await verifyVolume(expected,'0',0,'#12ab3455');
  assert.equal((await geometry()).empty,0);
  assert.deepEqual((await geometry()).range,beforeHide.range);
  const afterSettings=await request('/api/history/status');
  assert.equal(afterSettings.history_requests,beforeSettings.history_requests);
  assert.equal(afterSettings.provider_requests,beforeSettings.provider_requests);
  assert.deepEqual((await request('/workspace')).panes[0].indicators,activeStudies.panes[0].indicators);

  await button('Historical replay').click();
  await chart('0').getByLabel('Replay position',{exact:true}).fill('40');
  await expect(canvas()).toHaveAttribute('data-rendered-bars','41');
  await expect.poll(async()=> (await volume())[0]?.data.at(-1)?.time).toBe(expected[40].time);
  await chart('0').getByLabel('Exit replay',{exact:true}).click();
  await expect.poll(async()=> (await volume())[0]?.data.at(-1)?.time).toBe(expected.at(-1).time);
  await button('Active timeframe 30m').click();
  await expect(canvas()).toHaveAttribute('data-history-interval','30m');
  const next=(await history('30m')).candles;
  await expect.poll(async()=> (await volume())[0]?.data.at(-1)?.time).toBe(next.at(-1).time);
  await verifyVolume(next,'0',0,'#12ab3455');
  await button('Active timeframe 15m').click();
  await expect(canvas()).toHaveAttribute('data-history-interval','15m');
  const chartType=()=>canvas().evaluate(node=>node.__mainSeries?.seriesType());
  const waitForHistogram=()=>expect.poll(async()=> (await volume())[0]?.data.at(-1)?.time).toBe(expected.at(-1).time);
  await selectChartStyle(page,'line');
  await expect.poll(chartType).toBe('Line');
  await waitForHistogram();
  await verifyVolume(expected,'0',0,'#12ab3455');
  await selectChartStyle(page,'candles');
  await expect.poll(chartType).toBe('Candlestick');
  await waitForHistogram();

  const beforeRefresh=(await volume())[0].data;
  await app.evaluate(()=>{
    globalThis.__gmtVolumeFetch=globalThis.fetch;
    globalThis.fetch=(input,options)=>{
      const url=new URL(String(input));
      if(url.pathname==='/api/history/refresh'){
        return Promise.resolve(new Response(JSON.stringify({detail:'Volume fixture refresh interrupted',code:'connection',kind:'connection',retryable:true}),
          {status:503,headers:{'Content-Type':'application/json'}}));
      }
      if(url.pathname==='/api/history'&&url.searchParams.get('symbol')?.includes('SBIN.NS')&&url.searchParams.get('interval')==='15m'){
        return new Promise(resolve=>{globalThis.__releaseVolumeHistory=()=>resolve(globalThis.__gmtVolumeFetch(input,options));});
      }
      return globalThis.__gmtVolumeFetch(input,options);
    };
  });
  await button('Refresh pane 0').click();
  await expect(overlay().getByText('Stale',{exact:true})).toBeVisible();
  assert.deepEqual((await volume())[0].data,beforeRefresh);
  await page.getByTestId('watchlist-symbol-SBIN-EQ').click();
  await expect.poll(()=>app.evaluate(()=>typeof globalThis.__releaseVolumeHistory)).toBe('function');
  await expect.poll(async()=> (await volume())[0]?.data.length??0).toBe(0);
  await expect(legend()).toHaveText('Volume unavailable');
  await app.evaluate(()=>{
    globalThis.__releaseVolumeHistory();
    globalThis.fetch=globalThis.__gmtVolumeFetch;
    delete globalThis.__releaseVolumeHistory;
    delete globalThis.__gmtVolumeFetch;
  });
  await expect(canvas()).toHaveAttribute('data-history-symbol','yahoo:SBIN.NS:NSE:equity',{timeout:45000});
  await expect(overlay().getByText('Stale',{exact:true})).toHaveCount(0);
  await expect.poll(async()=> (await volume())[0]?.data.find(p=>p.value!==undefined)?.value).toBe(100);
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await expect(canvas()).toHaveAttribute('data-history-symbol',icici,{timeout:45000});
  await expect.poll(async()=> (await volume())[0]?.data.find(p=>p.value!==undefined)?.value).toBe(1000);
  await button('Chart layout').click();
  await button('Layout 4').click();
  await expect.poll(()=>volume('2')).toEqual([]);
  await expect.poll(()=>volume('3')).toEqual([]);
  await chart('1').getByRole('button',{name:'Indicators pane 1'}).click();
  await button('Add Volume',manager()).click();
  await button('Close indicators').click();
  await expect.poll(async()=> (await volume('1'))[0]?.index).toBe(0);
  await expect.poll(async()=> (await volume())[0]?.index).toBe(0);
  await button('Hide Volume',overlay('1')).click();
  await expect.poll(async()=> (await volume('1')).length).toBe(0);
  await expect.poll(async()=> (await request('/workspace')).panes[1].volume).toBe(false);
  await saved();
  await app.close();
  await start();
  await expect.poll(async()=> (await volume())[0]?.index).toBe(0);
  await expect.poll(async()=> (await volume('1')).length).toBe(0);
  const restarted=await request('/workspace');
  assert.equal(restarted.panes[0].volume_settings.position,'last');
  assert.equal(restarted.panes[0].volume_settings.placement,'chart');
  assert.equal(restarted.panes[1].volume_settings.placement,'chart');
  await chart('1').getByRole('button',{name:'Indicators pane 1'}).click();
  await manager().getByRole('button',{name:/^Active indicators/}).click();
  await button('Visibility volume',row()).click();
  await button('Close indicators').click();
  await expect.poll(async()=> (await volume('1'))[0]?.index).toBe(0);
  await expect(page.getByTestId('quote-refresh-status')).toHaveText(/Updated at .+ · Auto 300s/,{timeout:45000});
  assert.deepEqual(rendererErrors,[]);
  await writeFile(join(output,'native-regression.json'),JSON.stringify({band,bars:expected.length,missingVolume:true,zeroVolume:true,staleRetained:true,delayedSymbolWithoutOldBars:true,
    lifecycleRequests:afterSettings.history_requests-beforeSettings.history_requests,
    providerRequests:afterSettings.provider_requests-beforeSettings.provider_requests,rendererErrors},null,2));
  console.log('PASS new chart, scaled overlay, bars and crosshair, settings without rebuilding studies, visibility restart, replay, timeframe and four independent charts.');
} catch (error) {
  await page?.screenshot({path:join(output,'failure.png')}).catch(()=>{});
  console.error(rendererErrors);
  throw error;
} finally {
  await app?.close();
}
