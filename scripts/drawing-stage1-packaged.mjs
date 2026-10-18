// Two visible Yahoo histories only; packaged launcher must never enable fixtures.
import {extractFile} from '@electron/asar';
import {_electron as electron,expect} from './isolated-electron.mjs';import assert from 'node:assert/strict';import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'imt-stage1-package-'));let app;
try{
 app=await electron.launch({executablePath:resolve('release-stage1/mac-arm64/Indian Market Terminal.app/Contents/MacOS/Indian Market Terminal'),args:[],env:{...process.env,IMT_TEST_DATA_DIR:profile,IMT_UI_FIXTURE:'1'},timeout:60000});const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 await expect(page.getByText('DIRECT FETCH',{exact:true})).toBeVisible({timeout:60000});await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:90000});
 const manifest=JSON.parse(extractFile(resolve('release-stage1/mac-arm64/Indian Market Terminal.app/Contents/Resources/app.asar'),'package.json').toString());assert.equal(manifest.drawingPreview,'phase6-stage1');
 const health=await page.evaluate(()=>window.terminal.request('/health'));assert.equal(health.provider.source,'YAHOO FINANCE');assert.equal(health.provider.provider_requests,2);
 await page.getByLabel('Chart layout',{exact:true}).click();await page.getByLabel('Layout 1',{exact:true}).click();const canvas=await page.getByTestId('pane-0').locator('.chart-canvas').boundingBox();
 for(const [kind,points] of [['ray',[[200,190],[350,240]]],['regression_channel',[[240,200],[410,260]]],['text',[[370,170]]]]){
  await page.getByTestId('drawing-category-'+(kind==='text'?'text':'lines')).click();await page.getByTestId('drawing-tool-'+kind).click();for(const [x,y] of points)await page.mouse.click(canvas.x+x,canvas.y+y);
  if(kind==='text'){await page.getByLabel('Annotation text',{exact:true}).fill('Local drawing preview · real Yahoo history');await page.getByRole('button',{name:'Done',exact:true}).click();}
 }
 await expect.poll(async()=>{const w=await page.evaluate(()=>window.terminal.request('/workspace'));return Object.values(w.panes[0].drawing_sets).flat().length;}).toBe(3);
 assert.equal((await page.evaluate(()=>window.terminal.request('/api/history/status'))).provider_requests,2,'Drawing tools reuse fetched data');assert.equal(await page.locator('.symbol-details,[data-testid="stock-details"]').count(),0);assert.deepEqual(errors,[]);
 await page.getByLabel('Cursor / crosshair',{exact:true}).click();await page.getByTestId('drawing-category-lines').click();await page.screenshot({path:'test-results/stage1-packaged-real-yahoo.png'});await page.keyboard.press('Escape');await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();
 await writeFile('test-results/stage1-packaged-verification.json',JSON.stringify({production_source:health.provider.source,provider_requests:2,tools:['ray','regression_channel','text'],preview_marker:manifest.drawingPreview,profile,renderer_errors:errors},null,2));
 console.log('PASS: isolated arm64 Stage 1 package, production Yahoo data, two visible histories, real-data regression/ray/text drawings, no details card and zero renderer errors.');
}finally{await app?.close();}
