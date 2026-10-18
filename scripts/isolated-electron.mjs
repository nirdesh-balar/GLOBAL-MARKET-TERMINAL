// Project test launches fail before spawning an app when identity/profile is unsafe.
import{_electron as real}from'playwright/test';import assert from'node:assert/strict';import{realpath,mkdir,writeFile,unlink,appendFile}from'node:fs/promises';import{tmpdir}from'node:os';import{resolve,join,dirname,isAbsolute,relative,sep}from'node:path';import{randomUUID}from'node:crypto';import{execFileSync}from'node:child_process';
import{extractFile}from'@electron/asar';
import{peArchitecture}from'./windows-artifacts.mjs';
const inside=(p,r)=>{const rel=relative(r,p);return !!rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
export const sourceElectron=resolve(process.platform==='win32'?'node_modules/electron/dist/electron.exe':'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
export*from'playwright/test';
export const marker='stable-v1.0.0',bundle='local.globalmarket.terminal';
export async function validateLaunch(options){
 const env=options.env;assert.ok(env&&isAbsolute(env.IMT_TEST_DATA_DIR??''),'Tests must declare an explicit absolute temporary profile');
 const profile=await realpath(env.IMT_TEST_DATA_DIR),temp=await realpath(tmpdir());assert.ok(inside(profile,temp),'Normal profiles and symlink escapes are prohibited');
 const executable=await realpath(options.executablePath),source=await realpath(sourceElectron);
 if(executable===source){assert.ok(JSON.stringify(options.args)==='["."]'||options.args?.length===2&&options.args[1]==='.'&&/^--force-device-scale-factor=(1|1\.25|1\.5|2)$/.test(options.args[0]),'Source tests require this workspace and only an optional bounded DPI switch');assert.ok(!env.IMT_EXPECT_PREVIEW,'Source Electron must not impersonate a packaged preview');return{profile,env:{...env,IMT_AUTOMATED_TEST:'1'}};}
 if(process.platform==='win32'){
  assert.ok(env.GMT_WINDOWS_TEST_EXE,'Select the exact current Windows candidate executable');assert.equal(executable,await realpath(env.GMT_WINDOWS_TEST_EXE),'Only the explicitly selected candidate may launch');assert.deepEqual(options.args,[]);assert.equal(env.IMT_EXPECT_PREVIEW,marker);peArchitecture(await (await import('node:fs/promises')).readFile(executable));
  const root=dirname(executable),meta=JSON.parse(extractFile(join(root,'resources/app.asar'),'package.json'));assert.equal(meta.releaseChannel,'stable');assert.equal(meta.platformRelease,'windows-x64');assert.equal(meta.stableAppId,bundle);assert.equal(meta.version,'1.0.0');
  const dir=join(dirname(root),'.gmt-stage7-test-sessions');await mkdir(dir,{recursive:true});const token=randomUUID(),lease=join(dir,token+'.json');await writeFile(lease,JSON.stringify({version:1,marker,profile,token,owner:process.pid}),{flag:'wx'});return{profile,lease,env:{...env,IMT_AUTOMATED_TEST:'1',IMT_TEST_LEASE:token}};
 }
 assert.ok(env.GMT_MAC_TEST_EXE&&executable===await realpath(env.GMT_MAC_TEST_EXE),'Port tests may not launch the protected stable Mac app; select a separate candidate explicitly');
 assert.ok(executable.endsWith('/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL'),'Unexpected executable');
 const root=dirname(dirname(dirname(executable))),id=execFileSync('plutil',['-extract','CFBundleIdentifier','raw',join(root,'Contents/Info.plist')],{encoding:'utf8'}).trim();
 const meta=JSON.parse(extractFile(join(root,'Contents/Resources/app.asar'),'package.json'));assert.equal(meta.version,'1.0.0');assert.equal(meta.releaseChannel,'stable');
 assert.ok(!root.includes('release-v0.7.0')&&!root.includes('work/stage7/'),'Protected older apps may never launch from the public-release tests');
 assert.deepEqual(options.args,[],'Native test arguments may not redirect application/profile selection');
 assert.equal(id,bundle,'Archived previews cannot be launched by project tests');assert.equal(env.IMT_EXPECT_PREVIEW,marker,'Mismatched preview identity');
 const dir=join(dirname(root),'.gmt-stage7-test-sessions');await mkdir(dir,{recursive:true,mode:0o700});const token=randomUUID(),lease=join(dir,token+'.json');await writeFile(lease,JSON.stringify({version:1,marker,profile,token,owner:process.pid}),{flag:'wx',mode:0o600});
 return{profile,lease,env:{...env,IMT_AUTOMATED_TEST:'1',IMT_TEST_LEASE:token}};
}
export const _electron={...real,async launch(options){if(options.executablePath===resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'))options={...options,executablePath:sourceElectron};const checked=await validateLaunch(options);let app,locked=false;const lock=join(checked.profile,'.imt-test-owner.json'),token=randomUUID(),log=row=>appendFile('test-results/windows-port-launches.jsonl',JSON.stringify({at:new Date().toISOString(),...row})+'\n');try{await writeFile(lock,JSON.stringify({token,pid:process.pid}),{flag:'wx',mode:0o600});locked=true;app=await real.launch({...options,env:checked.env});const actual=await realpath(await app.evaluate(({app})=>app.getPath('userData')));assert.equal(actual,checked.profile,'Actual userData must match before any test interaction');await log({event:'verified_launch',profile:actual,executable:options.executablePath,pid:app.process().pid});const close=app.close.bind(app);app.close=async()=>{try{return await close();}finally{if(checked.lease)await unlink(checked.lease).catch(()=>{});if(locked){await unlink(lock).catch(()=>{});locked=false;}await log({event:'closed',profile:actual});}};return app;}catch(error){await app?.close().catch(()=>{});if(checked.lease)await unlink(checked.lease).catch(()=>{});if(locked)await unlink(lock).catch(()=>{});throw error;}}};
