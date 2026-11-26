import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {_electron as electron,expect,sourceElectron} from './isolated-electron.mjs';

const profile=await mkdtemp(join(tmpdir(),'gmt-reference-analysis-'));
const launch=()=>electron.launch({executablePath:sourceElectron,args:['.'],timeout:60000,
  env:{...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1',IMT_OFFLINE:'1'}});
const results='test-results/reference-analysis';
await mkdir(results,{recursive:true});
let app,page;
const errors=[];
const screenshot=name=>page.screenshot({path:join(results,name+'.png')});
const request=(path,method='GET',body)=>page.evaluate(([p,m,b])=>window.terminal.request(p,m,b),[path,method,body]);
const history=()=>request('/api/history/status');
const pane=()=>page.getByTestId('pane-0');
const canvas=()=>pane().locator('.chart-canvas');
const waitHistory=()=>expect.poll(async()=>Number(await canvas().getAttribute('data-rendered-bars')),{timeout:30000}).toBeGreaterThan(20);
const manager=()=>page.getByRole('dialog',{name:'Indicator manager'});
const inspector=()=>page.getByTestId('chart-data-window');
async function mount(){
  app=await launch();
  page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await waitHistory();
}

try{
  await mount();
  await page.getByRole('button',{name:'Chart layout',exact:true}).click();
  await page.getByRole('button',{name:'Layout 1',exact:true}).click();
  await expect(page.locator('.chart-pane:visible')).toHaveCount(1);
  const type=page.getByLabel('Active chart type',{exact:true});
  const baseline=await history(),raw=await canvas().getAttribute('data-last-close');
  const types=await type.locator('option').evaluateAll(options=>options.map(o=>o.value));
  assert.equal(types.length,13);
  const studyBefore=await canvas().getAttribute('data-study-series');
  for(const name of types){
    await type.selectOption(name);
    await expect(type).toHaveValue(name);
    await waitHistory();
    await expect(canvas()).toHaveAttribute('data-last-close',raw);
  }
  await expect(canvas()).toHaveAttribute('data-study-series',studyBefore);
  assert.equal((await history()).provider_requests,baseline.provider_requests,'Presentation styles reuse existing candles');
  await screenshot('0108-chart-style');
  await type.selectOption('candles');
  await page.getByLabel('Grouped intervals').selectOption('1w');
  await expect(canvas()).toHaveAttribute('data-history-interval','1w',{timeout:30000});
  await page.getByLabel('Grouped intervals').selectOption('1d');
  await expect(canvas()).toHaveAttribute('data-history-interval','1d',{timeout:30000});

  const selected=(await request('/workspace')).panes[0].canonical_id;
  const beforeCompare=await history();
  await page.getByRole('button',{name:'Compare Symbol',exact:true}).click();
  let search=page.getByRole('dialog',{name:'Compare Symbol'});
  await search.getByPlaceholder('Search symbol, company, index or ISIN').fill('TCS');
  const result=search.getByTestId('search-result-TCS.NS');
  await expect(result).toBeEnabled();
  await screenshot('0029-compare-search');
  await result.click();
  await expect(pane().locator('.compare-legend')).toContainText('Returns since',{timeout:30000});
  await expect.poll(()=>canvas().evaluate(node=>node.__chart.priceScale('left').width())).toBeGreaterThan(0);
  const scale=await canvas().evaluate(node=>({
    left:node.__chart.priceScale('left').width(),
    legend:node.parentElement.querySelector('.chart-legend').getBoundingClientRect().left-node.getBoundingClientRect().left,
  }));
  assert.ok(scale.legend>=scale.left);
  await expect(pane().locator('.compare-legend')).toContainText('Left scale (%)');
  assert.ok((await history()).provider_requests-beforeCompare.provider_requests<=1);
  await expect.poll(async()=>(await request('/workspace')).panes[0].comparisons.length).toBe(1);
  assert.equal((await request('/workspace')).panes[0].canonical_id,selected);
  await expect(pane().getByRole('button',{name:/Remove comparison TCS/})).toBeVisible();
  await screenshot('0040-comparison');
  await pane().getByRole('button',{name:/Remove comparison TCS/}).click();
  await expect(pane().locator('.compare-legend')).toHaveCount(0);
  await expect.poll(()=>canvas().evaluate(node=>node.__chart.priceScale('left').width())).toBe(0);
  await page.getByRole('button',{name:'Search stocks and indices',exact:true}).click();
  search=page.getByRole('dialog',{name:'Search stocks and indices'});
  await search.getByPlaceholder('Search symbol, company, index or ISIN').fill('RELIANCE');
  await expect(search.getByTestId('search-result-RELIANCE.NS')).toBeVisible();
  await screenshot('0013-search');
  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Search stocks and indices',exact:true})).toBeFocused();

  await page.getByRole('button',{name:'Data Window',exact:true}).click();
  await expect(inspector()).toBeVisible();
  await expect(inspector().getByTestId('inspect-close')).not.toHaveText('—');
  const latest=await inspector().getAttribute('data-candle-time');
  const box=await canvas().boundingBox();
  for(const fraction of [.37,.48,.6,.72]){
    await page.mouse.move(box.x+box.width*fraction,box.y+box.height*.34);
    const hovered=await canvas().getAttribute('data-crosshair-time');
    if(Number(hovered)&&hovered!==latest)break;
  }
  await expect(inspector()).toContainText('Crosshair bar');
  assert.notEqual(await inspector().getAttribute('data-candle-time'),latest);
  await screenshot('0703-data-window');
  await inspector().getByRole('button',{name:'Close Data Window'}).click();
  await expect(inspector()).toHaveCount(0);

  await page.getByRole('button',{name:'Search indices',exact:true}).click();
  search=page.getByRole('dialog',{name:'Search indices'});
  await search.getByPlaceholder('Search symbol, company, index or ISIN').fill('NIFTY');
  const index=search.getByTestId('search-result-^NSEI');
  await expect(index).toBeEnabled();
  await index.click();
  const details=page.getByRole('dialog',{name:'Index details'});
  await expect(details).toContainText('Yahoo Finance');
  await expect(details).toContainText('Constituent membership and weights are unavailable');
  await expect(details.getByRole('button',{name:'Add to Watchlist'})).toBeVisible();
  await screenshot('0512-index-details');
  const workspace=await request('/workspace');
  const listId=workspace.active_watchlist;
  const list=workspace.watchlists.find(item=>item.id===listId);
  const indexIdentity=(await request('/api/instruments/discover?q=NIFTY&category=indices')).results.find(row=>row.yahoo_symbol==='^NSEI').canonical_id;
  assert.ok(!list.items.some(row=>row.canonical_id===indexIdentity));
  await details.getByRole('button',{name:'Add to Watchlist'}).click();
  await expect(details).toHaveCount(0);
  await expect.poll(async()=>(await request('/workspace')).watchlists.find(item=>item.id===listId).items.filter(row=>row.canonical_id===indexIdentity).length).toBe(1);
  assert.equal((await request('/workspace')).panes[0].canonical_id,selected);
  await page.getByRole('button',{name:'Search indices',exact:true}).click();
  search=page.getByRole('dialog',{name:'Search indices'});
  await search.getByPlaceholder('Search symbol, company, index or ISIN').fill('Nifty 50');
  await expect(search.getByTestId('search-result-^NSEI')).toBeEnabled();
  await search.getByTestId('search-result-^NSEI').press('Enter');
  await expect(details).toContainText('NIFTY', {ignoreCase:true});
  await details.getByRole('button',{name:'View Chart'}).click();
  await expect(canvas()).toHaveAttribute('data-history-symbol',/^yahoo:%5ENSEI:/,{timeout:30000});

  await page.getByRole('button',{name:'Indicators',exact:true}).click();
  await manager().getByLabel('Search indicators').fill('RSI');
  await manager().getByRole('button',{name:'Favorite RSI',exact:true}).click();
  await manager().getByRole('button',{name:'Favorites',exact:true}).click();
  const add=manager().getByRole('button',{name:'Add RSI',exact:true});
  await expect(add).toBeVisible();
  await add.click();
  await manager().getByRole('button',{name:'Recently used'}).click();
  await expect(add).toBeVisible();
  await screenshot('0117-indicator-library');
  await manager().getByLabel('Search indicators').fill('');
  await manager().getByRole('button',{name:'My Scripts'}).click();
  const create=async(name,category='indicator')=>{
    await manager().getByRole('button',{name:'New study',exact:true}).click();
    await manager().getByLabel('Study name',{exact:true}).fill(name);
    await manager().getByLabel('Study type',{exact:true}).selectOption(category);
    await manager().getByRole('button',{name:'Verify',exact:true}).click();
    await expect(manager().getByRole('status')).toHaveText('Verified');
    await manager().getByRole('button',{name:'Save revision'}).click();
    await expect(manager().getByRole('status')).toHaveText('Saved revision 1');
  };
  await create('Local momentum study');
  await manager().getByLabel('EMA length').fill('4');
  await manager().getByRole('button',{name:'Verify',exact:true}).click();
  await manager().getByRole('button',{name:'Save revision'}).click();
  await expect(manager().getByLabel('Load study revision')).toHaveValue('2');
  await manager().getByLabel('Load study revision').selectOption('1');
  await screenshot('0302-local-editor');
  await manager().getByRole('button',{name:'Add to Chart',exact:true}).click();
  await expect(pane().getByRole('button',{name:'Hide Local momentum study'})).toBeVisible();
  await expect.poll(async()=>JSON.parse(await canvas().getAttribute('data-study-series')).filter(s=>s.name.includes('of RSI')&&s.valid>0).length).toBe(2);

  await page.getByRole('button',{name:'Indicators',exact:true}).click();
  await manager().getByRole('button',{name:'My Scripts'}).click();
  await create('Momentum cross 50','rule');
  await manager().getByRole('button',{name:'Create local alert'}).click();
  const alert=page.getByRole('dialog',{name:'Create historical alert'});
  await expect(alert).toContainText('RSI crosses above 50 on completed candles');
  await alert.getByRole('button',{name:'Save alert'}).click();
  await expect(alert).toHaveCount(0);
  await expect.poll(async()=>(await request('/api/alerts')).alerts.some(row=>
    row.definition.name==='Momentum cross 50'&&row.definition.study_rule?.level===50)).toBe(true);

  await expect.poll(async()=>(await request('/workspace')).panes[0].local_studies?.length).toBe(1);
  await app.close();
  await mount();
  await expect(pane().getByRole('button',{name:'Hide Local momentum study'})).toBeVisible();
  await pane().getByRole('button',{name:'Hide Local momentum study'}).click();
  await expect(pane().getByRole('button',{name:'Show Local momentum study'})).toBeVisible();
  await pane().getByRole('button',{name:'Remove local study Local momentum study'}).click();
  await expect(pane().getByRole('button',{name:'Show Local momentum study'})).toHaveCount(0);
  await page.getByRole('button',{name:'Indicators',exact:true}).click();
  await manager().getByRole('button',{name:'Favorites',exact:true}).click();
  await expect(manager().getByRole('button',{name:'Add RSI',exact:true})).toBeVisible();
  assert.deepEqual(errors,[]);
  const geometry=await page.evaluate(()=>Object.fromEntries(
    ['.terminal-header','.main-workspace','.analysis-rail','.professional-watchlist','.chart-legend','.indicator-manager']
      .map(key=>[key,document.querySelector(key)?.getBoundingClientRect().toJSON()])));
  await writeFile(join(results,'geometry.json'),JSON.stringify(geometry,null,2));
  console.log('PASS reference workspace controls, comparison, chart styles, Data Window, index details, study revision/restart and local rule alert');
}finally{
  await app?.close();
}
