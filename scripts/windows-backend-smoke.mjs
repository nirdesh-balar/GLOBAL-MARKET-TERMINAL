import{spawn}from'node:child_process';import{mkdtemp,mkdir,readFile,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import{resolve,join}from'node:path';import{randomBytes}from'node:crypto';import{createRequire}from'node:module';import assert from'node:assert/strict';import{peArchitecture}from'./windows-artifacts.mjs';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Frozen-backend smoke must actually run on Windows x64.');
const executable=resolve('backend/dist-windows/imt-backend/imt-backend.exe');peArchitecture(await readFile(executable));
// This helper is built for Electron, so the actual job binding is exercised in packaged Electron; do not load it into a mismatched host Node runtime.
const profile=await mkdtemp(join(tmpdir(),'GMT frozen 用户 ')),token=randomBytes(32).toString('hex'),errors=[];let child;
try{
 child=spawn(executable,[],{cwd:profile,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,IMT_DATA_DIR:profile,IMT_TOKEN:token,IMT_PARENT_PIPE:'1',IMT_OFFLINE:'1'}});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Frozen backend readiness timeout')),45000);let text='';child.once('error',reject);child.once('exit',()=>reject(Error('Frozen backend exited during startup')));child.stdout.on('data',b=>{text+=b;for(const line of text.split('\n').slice(0,-1)){try{const row=JSON.parse(line);if(row.ready){clearTimeout(timer);resolve(row);}}catch{}}text=text.split('\n').at(-1);});});
 const base='http://127.0.0.1:'+ready.port;let health;
 for(let i=0;i<150;i++){try{health=await fetch(base+'/health',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(2000)});if(health.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(health?.ok);assert.equal((await fetch(base+'/health')).status,401);
 const api=async p=>{const r=await fetch(base+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});assert.ok(r.ok,p);return r.json();};
 const directory=await api('/api/instruments/search?q=AAPL'),workspace=await api('/workspace'),status=await api('/api/history/status');assert.ok(directory.length);assert.ok(workspace.panes.length);assert.ok(status);
 const began=Date.now();const exited=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Frozen backend did not stop via private pipe')),12000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});child.stdin.end(JSON.stringify({command:'shutdown',token})+'\n');const code=await exited;assert.equal(code,0);
 await mkdir('test-results',{recursive:true});await writeFile('test-results/windows-frozen-backend.json',JSON.stringify({platform:process.platform,architecture:process.arch,executable,profile,readiness:true,authenticated_health:true,unauthenticated_rejected:true,directory_and_database:true,shutdown_ms:Date.now()-began,exit_code:code,real_provider_test:false},null,2));console.log('PASS actual Windows frozen backend imports/resources/auth/database/private-pipe shutdown');
}finally{if(child&&child.exitCode===null)child.kill();}
