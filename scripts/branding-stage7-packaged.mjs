import {_electron as electron,expect} from './isolated-electron.mjs';
import {session} from './stability-stage7-session.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=await mkdtemp(join(tmpdir(),'gmt-stage7-first-launch-')),profile=join(root,'GLOBAL MARKET TERMINAL');await mkdir(profile);
const normal=join(homedir(),'Library/Application Support/GLOBAL MARKET TERMINAL'),absent=async()=>{try{await access(normal);return false}catch{return true}};
assert.ok(await absent());const t=await session(profile),env={...t.env,GMT_TEST_APP_DATA_ROOT:root},errors=[];let app,page;const start=performance.now();
const launch=()=>electron.launch({executablePath:t.executable,args:[],env,timeout:90000});
const ready=async()=>{page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({timeout:60000});};
const request=(p,m='GET',b)=>page.evaluate(([p,m,b])=>window.terminal.request(p,m,b),[p,m,b]);
try{
 app=await launch();await ready();const startupMs=performance.now()-start;
 const native=await app.evaluate(({app,Menu,BrowserWindow})=>({name:app.getName(),version:app.getVersion(),userData:app.getPath('userData'),appData:app.getPath('appData'),title:BrowserWindow.getAllWindows()[0].getTitle(),menu:Menu.getApplicationMenu().items.map(i=>({label:i.label,items:i.submenu?.items.map(j=>({label:j.label,role:j.role}))}))}));
 assert.equal(native.name,'GLOBAL MARKET TERMINAL');assert.equal(native.version,'0.7.0');assert.equal(native.userData,profile);assert.equal(native.appData,root);assert.equal(native.title,'GLOBAL MARKET TERMINAL');assert.equal(native.menu[0].label,'GLOBAL MARKET TERMINAL');assert.ok(native.menu[0].items.some(r=>r.label==='About GLOBAL MARKET TERMINAL'));
 await expect(page.getByTestId('product-brand')).toHaveAttribute('aria-label','GLOBAL MARKET TERMINAL');await expect(page.getByTestId('product-brand')).toHaveText('GMT');assert.equal(await page.title(),'GLOBAL MARKET TERMINAL');await expect(page.locator('.titlebar-name')).toHaveText('GLOBAL MARKET TERMINAL');assert.ok(!(await page.locator('body').innerText()).toLowerCase().includes('indian market terminal'));
 const settings=await request('/workspace');assert.equal(settings.layout,2);const alerts=await request('/api/alerts');assert.ok(Array.isArray(alerts.alerts)&&alerts.alerts.length===0,'No prior alerts activated');const migration=await request('/api/crypto-migration/preview');assert.ok(!migration.entries?.length,'No automatic legacy crypto migration');
 await page.getByLabel('Settings',{exact:true}).click();await expect(page.getByRole('dialog',{name:'Terminal settings'})).toContainText('GLOBAL MARKET TERMINAL');await expect(page.getByRole('dialog',{name:'Terminal settings'})).toContainText('0.7.0');await page.screenshot({path:'test-results/stage7-branding-settings.png'});await page.getByLabel('Close settings',{exact:true}).click();
 // Existing supported chart must really render; no mocked historical payload.
 await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:120000});await page.screenshot({path:'test-results/stage7-branding-dashboard.png'});
 const status=await page.evaluate(()=>window.terminal.notificationControl('status'));settings.layout=8;await request('/workspace','PUT',settings);const saved=await request('/workspace');const quitStart=performance.now(),pid=app.process().pid;
 const children=execFileSync('pgrep',['-P',String(pid)],{encoding:'utf8'}).trim().split(/\s+/).map(Number);await app.close();await expect.poll(()=>children.filter(p=>{try{process.kill(p,0);return true}catch{return false}}),{timeout:30000}).toEqual([]);const shutdownMs=performance.now()-quitStart;
 app=await launch();await ready();assert.equal((await request('/workspace')).layout,8);assert.ok(await absent());assert.deepEqual(errors,[]);
 await writeFile('test-results/stage7-branding-packaged.json',JSON.stringify({native,stable_profile_default_under_temporary_appData:true,normal_stable_profile_absent:true,no_preview_import:true,first_launch_alerts:alerts.alerts.length,no_legacy_migration:true,restart_layout:8,startup_ms:startupMs,shutdown_ms:shutdownMs,owned_children_exited:children,notifications:status,native_banner_claimed:false,renderer_errors:errors},null,2));console.log('PASS stable metadata, GMT branding, default profile decision, fresh settings, isolated restart and clean backend shutdown');
}catch(e){await page?.screenshot({path:'test-results/stage7-branding-failure.png'});throw e;}finally{await app?.close();}
