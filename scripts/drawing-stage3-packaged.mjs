// Two visible Yahoo histories only; packaged launcher must never enable fixtures.
import {extractFile} from '@electron/asar';
import {_electron as electron,expect} from './isolated-electron.mjs';import assert from 'node:assert/strict';import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
let page;const errors=[];const profile=await mkdtemp(join(tmpdir(),'imt-stage3-package-'));let app;
try{
 app=await electron.launch({executablePath:resolve('release-stage3/mac-arm64/Indian Market Terminal.app/Contents/MacOS/Indian Market Terminal'),args:[],env:{...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1'},timeout:60000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.stack||e.message));
 await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:60000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:90000});
 const manifest=JSON.parse(extractFile(resolve('release-stage3/mac-arm64/Indian Market Terminal.app/Contents/Resources/app.asar'),'package.json').toString());assert.equal(manifest.drawingPreview,'phase6-stage3');
 const health=await page.evaluate(()=>window.terminal.request('/health'));assert.equal(health.provider.source,'YAHOO FINANCE');assert.equal(health.provider.provider_requests,2);
 await page.getByLabel('Chart layout',{exact:true}).click();await page.getByLabel('Layout 1',{exact:true}).click();const canvas=await page.getByTestId('pane-0').locator('.chart-canvas').boundingBox();
 const tools=[['pitchfork','lines',[[230,300],[330,200],[420,320]]],['gann_fan','fibonacci',[[260,350],[420,220]]],['xabcd','patterns',[[220,220],[340,340],[430,250],[530,390],[630,300]]],['elliott_impulse','patterns',[[200,400],[290,240],[380,340],[470,200],[560,300],[650,160]]],['time_cycles','patterns',[[230,330],[400,200]]],['curve','shapes',[[250,350],[430,180],[610,300]]],['image','text',[[600,240],[800,370]]]];
 for(const [kind,category,points] of tools){
  if(kind==='image')await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},resolve('test-results/stage3-packaged-pitchfork.png'));
  await page.getByTestId('drawing-category-'+category).click();await page.getByTestId('drawing-tool-'+kind).click();for(const [x,y] of points)await page.mouse.click(canvas.x+x,canvas.y+y);
  if(kind==='gann_fan'){await page.getByLabel('Price per trading bar',{exact:true}).fill('2');await page.getByLabel('Confirm price/bar calibration',{exact:true}).check();await page.getByRole('button',{name:'Done',exact:true}).click();}
  await expect.poll(async()=>{const w=await page.evaluate(()=>window.terminal.request('/workspace'));return Object.values(w.panes[0].drawing_sets).flat().at(-1)?.kind;}).toBe(kind);
  await page.getByLabel('Cursor / crosshair',{exact:true}).click();await page.screenshot({path:'test-results/stage3-packaged-'+kind+'.png'});
  await page.getByLabel('Edit selected drawing pane 0',{exact:true}).click();await page.getByLabel('Drawing visible',{exact:true}).uncheck();await page.getByRole('button',{name:'Done',exact:true}).click();
 }
 await expect.poll(async()=>{const w=await page.evaluate(()=>window.terminal.request('/workspace'));return Object.values(w.panes[0].drawing_sets).flat().length;}).toBe(7);
 assert.equal((await page.evaluate(()=>window.terminal.request('/api/history/status'))).provider_requests,2,'Drawing tools reuse fetched data');assert.equal(await page.locator('.symbol-details,[data-testid="stock-details"]').count(),0);assert.deepEqual(errors,[]);
 await page.getByLabel('Cursor / crosshair',{exact:true}).click();await page.getByTestId('drawing-category-fibonacci').click();await page.screenshot({path:'test-results/stage3-packaged-fibonacci-menu.png'});await page.keyboard.press('Escape');await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();

 const saved=await page.evaluate(()=>window.terminal.request('/workspace'));await app.close();app=await electron.launch({executablePath:resolve('release-stage3/mac-arm64/Indian Market Terminal.app/Contents/MacOS/Indian Market Terminal'),args:[],env:{...process.env,IMT_TEST_DATA_DIR:profile},timeout:60000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:60000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:90000});assert.deepEqual(await page.evaluate(()=>window.terminal.request('/workspace')),saved);assert.deepEqual(errors,[]);
 await writeFile('test-results/stage3-packaged-verification.json',JSON.stringify({production_source:health.provider.source,provider_requests:2,tools:tools.map(t=>t[0]),preview_marker:manifest.drawingPreview,profile,renderer_errors:errors,restart:true,stock_details_absent:true,history_requests_added_by_drawings:0},null,2));
 console.log('PASS: isolated arm64 Stage 3 package, production Yahoo data, two visible histories, real-data advanced pitchfork/Gann/pattern/wave/cycle/curve/image drawings, no details card and zero renderer errors.');
}finally{await app?.close();}
