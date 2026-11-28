import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';

const output = 'test-results/volume-legend';
const profile = await mkdtemp(join(tmpdir(), 'gmt-volume-legend-'));
await mkdir(output, { recursive: true });
const env = { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_VOLUME_REDESIGN_UI: '1', IMT_OFFLINE: '1' };
const errors = [];
let app, page;
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const pane = (id = '0') => page.getByTestId(`pane-${id}`);
const canvas = (id = '0') => pane(id).locator('.chart-canvas');
const row = (id = '0') => pane(id).getByTestId(`study-legend-${id}-volume`);
const field = (id = '0') => page.getByTestId(`volume-legend-${id}`);
const dedicated = (id = '0') => page.getByTestId(`study-controls-${id}-volume`);
const count = () => page.getByTestId('study-legend-count-0');
const settings = () => page.getByRole('dialog', { name: 'Volume settings' });
const timeout = 45000;
const request = (path, method = 'GET', body) =>
  page.evaluate(([p,m,b]) => window.terminal.request(p,m,b),[path,method,body]);
const workspace = () => request('/workspace');
const counters = () => request('/api/history/status');
const idle = () => expect.poll(async()=>{ const h=await counters(); return h.active+h.queued; },{timeout}).toBe(0);
const saved = () => expect(page.locator('.terminal-shell')).toHaveAttribute('data-workspace-save-state','Saved locally');
const legendOrder = () => pane().locator('.study-legend-name').allTextContents();
const histogram = (id = '0') => canvas(id).evaluate(node=>node.__chart.panes().flatMap((p,index)=>p.getSeries()
  .filter(series=>series.seriesType()==='Histogram'&&series.options().priceFormat.type==='volume')
  .map(series=>({index,scale:series.options().priceScaleId,data:series.data()}))));
const at = (index,id='0') => expect.poll(async()=> (await histogram(id)).map(h=>h.index)).toEqual([index]);
const shot = name => page.screenshot({path:join(output,`fixture-${name}.png`)});

async function launch() {
  app=await electron.launch({executablePath:sourceElectron,args:['.'],env,timeout:60000});
  page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:834});
  await expect(button('Chart layout')).toBeVisible({timeout});
}
async function verifyFooter() {
  await expect(page.getByTestId('quote-refresh-status')).toHaveText(/Updated at .+ · Auto 300s/,{timeout});
}

try {
  await launch();
  await button('Chart layout').click();
  await button('Layout 1').click();
  await page.getByTestId('watchlist-symbol-ICICIBANK-EQ').click();
  await button('Active timeframe 15m').click();
  const symbol='yahoo:ICICIBANK.NS:NSE:equity';
  await expect(canvas()).toHaveAttribute('data-history-symbol',symbol,{timeout});
  await expect(canvas()).toHaveAttribute('data-history-interval','15m',{timeout});
  const data=await request('/api/history?'+new URLSearchParams({symbol,interval:'15m'}));
  await button('Indicators').click();
  const manager=page.getByRole('dialog',{name:'Indicator manager'});
  for(const name of ['VWMA','VWAP','Volume'])await button('Add '+name,manager).click();
  await button('Close indicators',manager).click();
  await verifyFooter();
  await at(0);
  await expect(row()).toBeVisible();
  await expect(dedicated()).toHaveCount(0);
  await expect(count()).toHaveText('4');
  assert.deepEqual(await legendOrder(),['EMA 20','VWMA 20','VWAP session','Volume']);
  const initialSeries=(await histogram())[0];
  assert.equal(initialSeries.scale,'gmt-volume');
  assert.deepEqual(initialSeries.data.filter(point=>'value' in point).map(({time,value})=>({time,value})),
    data.candles.filter(bar=>bar.volume!==null).map(bar=>({time:bar.time,value:bar.volume})));
  const band=await canvas().evaluate(node=>{
    const price=node.__chart.panes()[0];
    const series=price.getSeries().find(s=>s.options().priceScaleId==='gmt-volume');
    const max=Math.max(...series.data().map(point=>point.value??0));
    const main=price.getHTMLElement().querySelector('canvas');
    const rect=main.getBoundingClientRect();
    const hit=document.elementFromPoint(rect.left+125,rect.top+rect.height*.92);
    return {height:price.getHeight(),top:series.priceToCoordinate(max),zero:series.priceToCoordinate(0),
      hitLegend:!!hit?.closest('.study-pane-headers,.chart-legend'),
      lowestPrice:node.__chart.priceScale('right').getVisibleRange().from};
  });
  assert.ok(band.top>=band.height*.88&&band.zero<band.height&&band.lowestPrice>1);
  assert.equal(band.hitLegend,false);

  const value=()=>field().locator('[data-study-output=Volume]');
  await page.mouse.move(1290,200);
  await expect(value()).toHaveAttribute('data-value',String(data.candles.at(-1).volume));
  const remove = button('Remove Volume', row());
  const {x: actionsX} = await remove.boundingBox();
  for(const i of [1,2,10]){
    const bar=data.candles[i];
    const box=await canvas().boundingBox();
    const x=await canvas().evaluate((node,time)=>node.__chart.timeScale().timeToCoordinate(time),bar.time);
    assert.ok(x!==null&&x>=0);
    await page.mouse.move(box.x+x,box.y+220);
    await expect(canvas()).toHaveAttribute('data-crosshair-time',String(bar.time));
    if(bar.volume===null)await expect(field()).toHaveText('Volume unavailable');
    else await expect(value()).toHaveAttribute('data-value',String(bar.volume));
    assert.equal((await remove.boundingBox()).x, actionsX);
  }

  await idle();
  const before=await counters();
  const studies=(await workspace()).panes[0].indicators;
  await canvas().evaluate(node=>{node.__legendSeries=node.__chart.panes()[0].getSeries().slice();});
  const legendToggle=button('Indicator legend pane 0',pane());
  await legendToggle.click();
  await expect(row()).toBeHidden();
  assert.deepEqual((await histogram())[0],initialSeries);
  await legendToggle.click();
  await expect(row()).toBeVisible();
  await expect(count()).toHaveText('4');

  const actions=row().locator('.study-legend-actions');
  await row().hover();
  await expect(actions).toHaveCSS('opacity','1');
  await shot('hover');
  await page.mouse.move(1290,200);
  await expect(actions).toHaveCSS('opacity','0');
  await button('Edit Volume',row()).focus();
  await expect(actions).toHaveCSS('opacity','1');
  await page.keyboard.press('Enter');
  await expect(settings()).toBeVisible();
  await expect(settings().getByLabel('Volume placement')).toHaveCount(0);
  await settings().getByLabel('Up bar color').fill('#25ab54');
  await button('Apply settings',settings()).click();
  await expect.poll(async()=> (await histogram())[0]?.data[0]?.color).toBe('#25ab5455');

  await button('Hide Volume',row()).click();
  await expect.poll(histogram).toEqual([]);
  await expect(field()).toHaveText('Volume');
  await expect(count()).toHaveText('4');
  await expect(dedicated()).toHaveCount(0);
  await button('Show Volume',row()).click();
  await at(0);
  await expect.poll(async()=> (await histogram())[0]?.data[0]?.color).toBe('#25ab5455');

  await expect(button('More Volume actions', row())).toHaveCount(0);
  await expect(row().locator('.study-legend-actions button')).toHaveCount(3);
  const originalStudyHandles=await canvas().evaluate(node=>node.__legendSeries
    .filter(s=>s.seriesType()!=='Histogram').every(s=>node.__chart.panes()[0].getSeries().includes(s)));
  assert.ok(originalStudyHandles);
  await expect(dedicated()).toHaveCount(0);
  assert.deepEqual(await legendOrder(),['EMA 20','VWMA 20','VWAP session','Volume']);
  await idle();
  const after=await counters();
  assert.equal(after.provider_requests,before.provider_requests);
  assert.equal(after.history_requests,before.history_requests);
  assert.deepEqual((await workspace()).panes[0].indicators,studies);

  await button('Chart layout').click();
  await button('Layout 2').click();
  await expect(row('1')).toHaveCount(0);
  await expect(dedicated('1')).toHaveCount(0);
  await expect.poll(()=>histogram('1')).toEqual([]);
  await button('Hide Volume',row()).click();
  await saved();
  await app.close();
  await launch();
  await expect(row()).toBeVisible();
  await expect(button('Show Volume',row())).toBeVisible();
  assert.equal((await workspace()).panes[0].volume_settings.up_color,'#25ab54');
  await expect.poll(histogram).toEqual([]);
  await button('Show Volume',row()).click();
  await at(0);
  await expect(row('1')).toHaveCount(0);
  await button('Remove Volume',row()).click();
  await expect(row()).toHaveCount(0);
  await expect(dedicated()).toHaveCount(0);
  await expect(count()).toHaveText('3');
  await expect.poll(histogram).toEqual([]);
  await saved();
  await app.close();
  await launch();
  await expect(count()).toHaveText('3');
  await expect(row()).toHaveCount(0);
  assert.equal((await workspace()).panes[0].volume_settings,null);
  await verifyFooter();
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'native-regression.json'),JSON.stringify({bars:data.candles.length,band,
    chartHistoryDelta:after.history_requests-before.history_requests,providerDelta:after.provider_requests-before.provider_requests,
    screenshots:[1440,834],restarts:2,rendererErrors:errors},null,2));
  console.log('PASS Volume legend values, hover and keyboard, collapse, hide/show, settings, direct remove, two restarts and zero extra requests.');
} catch(error) {
  await shot('failure').catch(()=>{});
  console.error(errors);
  throw error;
} finally {
  await app?.close();
}
