import {chartStylesMenu,selectChartStyle} from './chart-menu-controls.mjs';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {_electron as electron,expect,sourceElectron} from './isolated-electron.mjs';

const profile=await mkdtemp(join(tmpdir(),'gmt-reference-analysis-'));
const launch=()=>electron.launch({executablePath:sourceElectron,args:['.'],timeout:60000,
  env:{...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1',IMT_HYPERLIQUID_UI:'1',IMT_OFFLINE:'1'}});
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
  // Both startup panes can fetch history before the layout changes to one pane.
  // Finish those requests before taking the presentation-only baseline.
  await expect.poll(()=>page.locator('.chart-pane:visible .chart-canvas').evaluateAll(charts=>
    charts.length>0&&charts.every(chart=>Number(chart.dataset.renderedBars)>0)),{timeout:30000}).toBe(true);
  await page.getByRole('button',{name:'Chart layout',exact:true}).click();
  await page.getByRole('button',{name:'Layout 1',exact:true}).click();
  await expect(page.locator('.chart-pane:visible')).toHaveCount(1);
  const type=page.getByLabel('Active chart type',{exact:true});
  const sidebar=page.getByTestId('watchlist-sidebar');
  const toggleSidebar=page.getByRole('button',{name:'Toggle sidebar',exact:true});
  // Watchlist snapshots share the backend queue with chart histories.
  await toggleSidebar.click();
  await expect(sidebar).toHaveCount(0);
  await expect.poll(async()=>{const state=await history();return state.active+state.queued;},{timeout:30000}).toBe(0);
  const baseline=await history(),raw=await canvas().getAttribute('data-last-close');
  await type.click();
  const types=await chartStylesMenu(page).getByRole('menuitemradio').evaluateAll(items=>items.map(item=>item.dataset.style));
  await page.keyboard.press('Escape');
  assert.equal(types.length,13);
  const studyBefore=await canvas().getAttribute('data-study-series');
  for(const name of types){
    await selectChartStyle(page,name);
    await expect(type).toHaveAttribute('data-chart-style',name);
    await waitHistory();
    await expect(canvas()).toHaveAttribute('data-last-close',raw);
  }
  await expect(canvas()).toHaveAttribute('data-study-series',studyBefore);
  const afterStyles=await history();
  assert.equal(afterStyles.history_requests,baseline.history_requests,'Presentation styles do not request history');
  assert.equal(afterStyles.provider_requests,baseline.provider_requests,'Presentation styles reuse existing candles');
  await screenshot('0108-chart-style');
  await toggleSidebar.click();
  await expect(sidebar).toBeVisible();
  await selectChartStyle(page,'candles');
  await page.getByRole('button',{name:'Active timeframe 1w',exact:true}).click();
  await expect(canvas()).toHaveAttribute('data-history-interval','1w',{timeout:30000});
  await page.getByRole('button',{name:'Active timeframe 1d',exact:true}).click();
  await expect(canvas()).toHaveAttribute('data-history-interval','1d',{timeout:30000});

  await expect(page.getByRole('button',{name:'Compare Symbol',exact:true})).toHaveCount(0);
  await expect(pane().locator('.compare-legend')).toHaveCount(0);
  await expect.poll(()=>canvas().evaluate(node=>node.__chart.priceScale('left').width())).toBe(0);
  await page.getByRole('button',{name:'Search stocks and indices',exact:true}).click();
  let search=page.getByRole('dialog',{name:'Search stocks and indices'});
  await search.getByRole('button',{name:'IN Stocks',exact:true}).click();
  await search.getByPlaceholder('Search symbol, company, index or ISIN').fill('RELIANCE');
  await expect(search.getByTestId('search-result-RELIANCE.NS')).toBeEnabled({timeout:30000});
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

  await page.getByRole('button',{name:'Search stocks and indices',exact:true}).click();
  search=page.getByRole('dialog',{name:'Search stocks and indices'});
  await search.getByPlaceholder('Search symbol, company, index or ISIN').fill('NIFTY');
  const index=search.getByTestId('search-result-^NSEI');
  await expect(index).toBeEnabled({timeout:30000});
  await index.click();
  await expect(canvas()).toHaveAttribute('data-history-symbol',/^yahoo:%5ENSEI:/,{timeout:30000});

  await page.getByRole('button',{name:'Indicators',exact:true}).click();
  await manager().getByLabel('Search indicators').fill('RSI');
  await manager().getByRole('button',{name:'Favorite RSI',exact:true}).click();
  await manager().getByRole('button',{name:'Favorites',exact:true}).click();
  const add=manager().getByRole('button',{name:'Add RSI',exact:true});
  await expect(add).toBeVisible();
  await add.click();
  await manager().getByRole('button',{name:'Recently Used'}).click();
  await expect(add).toBeVisible();
  await screenshot('0117-indicator-library');
  await manager().getByRole('button',{name:'Close indicators'}).click();
  await expect.poll(async()=>(await request('/workspace')).study_library.recent[0]).toBe('RSI');
  const legacy=await request('/workspace');
  const recipe={version:1,source:'close',rsi:9,ema:3,wma:21};
  const recipeRevision={number:1,recipe,output:'rsi',direction:'above',level:50};
  legacy.local_studies=[
    {id:'aaaa-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa',name:'Local momentum study',category:'indicator',revisions:[recipeRevision,{...recipeRevision,number:2,recipe:{...recipe,ema:4}}]},
    {id:'bbbb-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb',name:'Momentum cross 50',category:'rule',revisions:[recipeRevision]},
  ];
  await request('/workspace','PUT',legacy);
  await page.reload();
  await expect(canvas()).toHaveAttribute('data-history-symbol',/^yahoo:%5ENSEI:/,{timeout:30000});
  await page.getByRole('button',{name:'Indicators',exact:true}).click();
  await manager().getByRole('button',{name:'My Scripts'}).click();
  await manager().getByRole('button',{name:'Local momentum study',exact:true}).click();
  const editor=page.getByRole('complementary',{name:'Pine-compatible Editor'});
  await expect(editor.getByLabel('Script revision')).toHaveValue('2');
  await editor.getByLabel('Script revision').selectOption('1');
  await expect(editor.getByLabel('Pine source code')).toHaveValue(/ta\.ema\(value, 3\)/);
  await expect(editor).toContainText('Legacy revision retained');
  await screenshot('0302-local-editor');
  await editor.getByRole('button',{name:'Close editor'}).click();
  await page.getByRole('button',{name:'Indicators',exact:true}).click();
  await manager().getByRole('button',{name:'My Scripts'}).click();
  await manager().getByRole('button',{name:'Add legacy Local momentum study to Chart'}).click();
  await expect(pane().getByRole('button',{name:'Hide Local momentum study'})).toBeVisible();
  await expect.poll(async()=>JSON.parse(await canvas().getAttribute('data-study-series')).filter(s=>s.name.includes('of RSI')&&s.valid>0).length).toBe(2);

  await page.getByRole('button',{name:'Indicators',exact:true}).click();
  await manager().getByRole('button',{name:'My Scripts'}).click();
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
  const appliedRecipe = (await request('/workspace')).panes[0].local_studies[0];
  await pane().getByTestId(`study-controls-0-${appliedRecipe.id}`).getByRole('button', {name:`Pane settings ${appliedRecipe.id}`}).click();
  const legacySettings = page.getByRole('dialog',{name:'Legacy study settings'});
  await expect(legacySettings.getByLabel('RSI length')).toHaveValue(String(appliedRecipe.recipe.rsi));
  await legacySettings.getByLabel('RSI length').fill(String(appliedRecipe.recipe.rsi+1));
  await legacySettings.getByRole('button',{name:'Apply settings',exact:true}).click();
  await expect.poll(async()=>(await request('/workspace')).panes[0].local_studies[0])
    .toEqual({...appliedRecipe,recipe:{...appliedRecipe.recipe,rsi:appliedRecipe.recipe.rsi+1}});
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
  console.log('PASS reference workspace controls, chart styles, Data Window, NIFTY chart selection, study revision/restart and local rule alert');
}finally{
  await app?.close();
}
