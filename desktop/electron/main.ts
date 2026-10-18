import {startUpdates} from './updateRuntime';
import type {ApplicationUpdates} from './updates';
import {backendExecutable,fullscreenAccelerator,stableWindowsIdentity} from './platform';
import {windowsIntegration} from './windowsIntegration';
import {stopOwnedBackend,type BackendJob} from './backendLifecycle';
import {PRODUCT_NAME,RELEASE_VERSION,STABLE_BUNDLE_ID,STABLE_MARKER} from '../src/brand';
import {execFileSync} from 'node:child_process';
import {previewTestGuard} from './previewTestGuard';
import {importWatchlistCSV,exportWatchlistCSV} from './watchlistFiles';
import {windowControls} from './windowControls';
import {AlertNotifications} from './alertNotifications';
import {formatCSV,type CSVData} from '../src/screener/csv';
import {normalizeDrawingImage} from './drawingImages';
import {deserializeDrawings,serializeDrawings} from '../src/drawings/codec';
import { app, BrowserWindow, ipcMain, dialog, shell, Menu, powerMonitor } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
let backend:ChildProcess|undefined;
let backendJob:BackendJob|undefined;
let shutdown:Promise<void>|undefined;
let shutdownFinished=false;
let window:BrowserWindow|undefined;
let port=0;
let readiness:Promise<void>;
const pendingSaves=new Set<Promise<unknown>>();
let quitting=false;
let streamBridge:AbortController|undefined;
async function startStreamBridge(){
  if(streamBridge)return;const controller=new AbortController();streamBridge=controller;let cursor=0;
  try{
    const status=await localFetch('/api/streams/status','GET');window?.webContents.send('market-stream',{cursor:0,status,feeds:[]});
    if(!status.enabled)return;
    while(!controller.signal.aborted){
      try{const value=await localFetch('/api/streams/events?cursor='+cursor,'GET',undefined,controller.signal);cursor=value.cursor;window?.webContents.send('market-stream',value);}
      catch{if(!controller.signal.aborted)await new Promise(r=>setTimeout(r,3000));}
    }
  }finally{if(streamBridge===controller)streamBridge=undefined;}
}

let alertNotifications:AlertNotifications|undefined;
let updates:ApplicationUpdates|undefined;
const requests=new Map<string,AbortController>();
const auth=randomBytes(32).toString('hex');
const root=join(__dirname,'../..');
const dev=!app.isPackaged&&process.env.IMT_DEV==='1';
// Packaged Stage 1 preview uses an isolated profile, preserving the v0.6 release.
const metadata=JSON.parse(readFileSync(join(app.getAppPath(),'package.json'),'utf8'));
const stable=app.isPackaged&&metadata.releaseChannel==='stable';
const previewStage=stable?STABLE_MARKER:app.isPackaged?metadata.drawingPreview:undefined;
app.setName(PRODUCT_NAME);
app.setAboutPanelOptions({applicationName:PRODUCT_NAME,applicationVersion:RELEASE_VERSION,version:RELEASE_VERSION,copyright:'Personal market analysis · Yahoo Finance and public Hyperliquid data'});
const preview=['phase6-stage1','phase6-stage2','phase6-stage3','phase6-stage4','phase6-stage5','phase6-stage6','phase6-stage6.5','phase6-stage6.6','phase6-stage6.7-A','phase6-stage6.7-B','phase6-stage6.7-C','phase6-stage6.7-D','phase6-stage6.7-E1','phase6-stage6.7-E1.1','phase6-stage6.7-E2','phase6-stage6.7-E3A','phase6-stage6.7-E3B','phase6-stage6.7-F','phase6-stage6.7-G','phase6-stage6.7-G1'].includes(previewStage);
const rejectLaunch=(message:string):never=>{process.stderr.write(message+'\n');process.exit(78);};
// Fail before creating any directory or backend when a test selects the wrong package.
if(process.env.IMT_EXPECT_PREVIEW && previewStage!==process.env.IMT_EXPECT_PREVIEW)rejectLaunch('Preview identity mismatch; no profile opened');
if(!app.isPackaged&&!dev&&!process.env.IMT_TEST_DATA_DIR)rejectLaunch('Unpackaged runs require IMT_DEV or an isolated IMT_TEST_DATA_DIR');
if(stable&&process.platform==='darwin'){const id=execFileSync('/usr/bin/plutil',['-extract','CFBundleIdentifier','raw',join(process.resourcesPath,'../Info.plist')],{encoding:'utf8'}).trim();if(id!==STABLE_BUNDLE_ID||metadata.version!==RELEASE_VERSION||metadata.drawingPreview)rejectLaunch('Stable package identity mismatch; no profile opened');}
if(stable&&process.platform==='win32'&&!stableWindowsIdentity(metadata,process.execPath,process.arch))rejectLaunch('Stable Windows package identity mismatch; no profile opened');
if(stable&&!['darwin','win32'].includes(process.platform))rejectLaunch('Unsupported stable release platform');
if(process.platform==='win32')app.setAppUserModelId(STABLE_BUNDLE_ID);
if(app.isPackaged&&!stable&&previewStage&&!preview)rejectLaunch('Unknown preview identity; no profile opened');
const guardReason=previewTestGuard(previewStage,process.resourcesPath,process.env);
if(guardReason)rejectLaunch(guardReason);
// Stable releases never seed or open a preview database.
if(process.env.GMT_TEST_APP_DATA_ROOT){const dataRoot=process.env.GMT_TEST_APP_DATA_ROOT;if(!process.env.IMT_TEST_DATA_DIR||join(dataRoot,PRODUCT_NAME)!==process.env.IMT_TEST_DATA_DIR)rejectLaunch('Stable first-launch test path mismatch');app.setPath('appData',dataRoot);}
const previewSeed=['phase6-stage3','phase6-stage4','phase6-stage5','phase6-stage6','phase6-stage6.5','phase6-stage6.6'].includes(previewStage)&&!process.env.IMT_TEST_DATA_DIR?join(app.getPath('appData'),previewStage==='phase6-stage6.6'?'Indian Market Terminal Drawing Preview Stage 6.5':previewStage==='phase6-stage6.5'?'Indian Market Terminal Drawing Preview Stage 6':previewStage==='phase6-stage6'?'Indian Market Terminal Drawing Preview Stage 5':previewStage==='phase6-stage5'?'Indian Market Terminal Drawing Preview Stage 4':previewStage==='phase6-stage4'?'Indian Market Terminal Drawing Preview Stage 3':'Indian Market Terminal Drawing Preview','terminal.sqlite3'):undefined;
if(preview&&!process.env.IMT_TEST_DATA_DIR){const directory=join(app.getPath('appData'),previewStage==='phase6-stage6.7-G1'?'Indian Market Terminal Drawing Preview Stage 6.7-G.1':previewStage==='phase6-stage6.7-G'?'Indian Market Terminal Drawing Preview Stage 6.7-G':previewStage==='phase6-stage6.7-F'?'Indian Market Terminal Drawing Preview Stage 6.7-F':previewStage==='phase6-stage6.7-E3B'?'Indian Market Terminal Drawing Preview Stage 6.7-E3B':previewStage==='phase6-stage6.7-E3A'?'Indian Market Terminal Drawing Preview Stage 6.7-E3A':previewStage==='phase6-stage6.7-E2'?'Indian Market Terminal Drawing Preview Stage 6.7-E2':previewStage==='phase6-stage6.7-E1.1'?'Indian Market Terminal Drawing Preview Stage 6.7-E1.1':previewStage==='phase6-stage6.7-E1'?'Indian Market Terminal Drawing Preview Stage 6.7-E1':previewStage==='phase6-stage6.7-D'?'Indian Market Terminal Drawing Preview Stage 6.7-D':previewStage==='phase6-stage6.7-C'?'Indian Market Terminal Drawing Preview Stage 6.7-C':previewStage==='phase6-stage6.7-B'?'Indian Market Terminal Drawing Preview Stage 6.7-B':previewStage==='phase6-stage6.7-A'?'Indian Market Terminal Drawing Preview Stage 6.7-A':previewStage==='phase6-stage6.6'?'Indian Market Terminal Drawing Preview Stage 6.6':previewStage==='phase6-stage6.5'?'Indian Market Terminal Drawing Preview Stage 6.5':previewStage==='phase6-stage6'?'Indian Market Terminal Drawing Preview Stage 6':previewStage==='phase6-stage5'?'Indian Market Terminal Drawing Preview Stage 5':previewStage==='phase6-stage4'?'Indian Market Terminal Drawing Preview Stage 4':previewStage==='phase6-stage3'?'Indian Market Terminal Drawing Preview Stage 3':'Indian Market Terminal Drawing Preview');mkdirSync(directory,{recursive:true,mode:0o700});app.setPath('userData',directory);}
if(stable&&(!process.env.IMT_TEST_DATA_DIR||process.env.GMT_TEST_APP_DATA_ROOT)){const directory=join(app.getPath('appData'),PRODUCT_NAME);mkdirSync(directory,{recursive:true,mode:0o700});app.setPath('userData',directory);}
if(dev&&!process.env.IMT_TEST_DATA_DIR){const directory=join(app.getPath('appData'),'GLOBAL MARKET TERMINAL Development');mkdirSync(directory,{recursive:true,mode:0o700});app.setPath('userData',directory);}
if(process.env.IMT_TEST_DATA_DIR){mkdirSync(process.env.IMT_TEST_DATA_DIR,{recursive:true,mode:0o700});app.setPath('userData',process.env.IMT_TEST_DATA_DIR);}
const alertPath=(path:string)=>/^\/api\/alerts(?:\/(?:status|settings|history(?:\/clear)?|[a-f0-9]{32}(?:\/delete)?))?$/.test(path);
const allowed=new Set(['/api/studies/context','/api/streams/status','/api/streams/consumers','/api/streams/events','/api/streams/lifecycle','/api/hyperliquid/catalogue','/api/crypto-migration/candidates','/api/providers/status','/api/crypto-migration/preview','/api/crypto-migration/postpone','/api/crypto-migration/commit','/api/crypto-migration/restore','/health','/workspace','/api/securities/search','/api/securities/refresh','/api/history','/api/history/refresh','/api/quotes/snapshot','/api/quotes/status','/api/quotes/cancel','/api/refresh/preferences','/api/history/status','/api/history/preferences','/api/cache/clear','/api/instruments/search','/api/instruments/discover','/api/markets','/api/indices','/api/indicators/calculate','/api/provider/status','/api/watchlists/mutate','/api/watchlists/import/preview','/api/watchlists/import/commit']);
function python(){const candidate=backendExecutable(root,false);if(!existsSync(candidate))throw new Error('Run npm run setup to install the local Python backend.');return candidate;}
async function startBackend(){
  const executable=app.isPackaged?backendExecutable(process.resourcesPath,true):python();
  const args=app.isPackaged?[]:[join(root,process.env.IMT_UI_FIXTURE==='1'?'backend/tests/fixture_launcher.py':'backend/launcher.py')];
  const dataDir=process.env.IMT_TEST_DATA_DIR||app.getPath('userData');mkdirSync(dataDir,{recursive:true,mode:0o700});
  backend=spawn(executable,args,{cwd:dataDir,env:{...process.env,IMT_TOKEN:auth,IMT_DATA_DIR:dataDir,IMT_PREVIEW_SEED_DB:previewSeed,IMT_PARENT_PIPE:'1',PYTHONUNBUFFERED:'1'},windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  backend.on('error',()=>{/* Readiness reports spawn failures in the visible startup dialog. */});
  if(process.platform==='win32'&&backend.pid){try{const native=windowsIntegration(),handle=native.attachBackend(backend.pid!,executable);backendJob={close:()=>native.closeBackendJob(handle)};backend.once('exit',()=>backendJob?.close());}catch(error){backend.kill();throw error;}}
  backend.stderr?.on('data',()=>{/* Controlled provider errors go to UI, no raw responses in logs. */});
  await new Promise<void>((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(new Error('Local backend did not start within 45 seconds.')),45000);
    backend!.once('error',e=>{clearTimeout(timeout);reject(e);});
    backend!.stdout?.on('data',data=>{output+=data.toString();const lines=output.split('\n');output=lines.pop()||'';for(const line of lines){try{const info=JSON.parse(line);if(info.ready&&Number.isInteger(info.port)&&info.port>0&&info.port<=65535){port=info.port;clearTimeout(timeout);resolve();}}catch{/* non-protocol output */}}});
    backend!.once('exit',()=>{clearTimeout(timeout);reject(new Error('Local backend exited before startup.'));});
  });
  const healthDeadline=Date.now()+15000;
  for(let attempt=0;attempt<150&&Date.now()<healthDeadline;attempt++){
    try{const result=await fetch(`http://127.0.0.1:${port}/health`,{headers:{Authorization:`Bearer ${auth}`},signal:AbortSignal.timeout(2000)});if(result.ok)return;}catch{/* wait for uvicorn */}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Local health check failed.');
}
function trusted(event:Electron.IpcMainInvokeEvent|Electron.IpcMainEvent){if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Untrusted renderer');}
async function localFetch(path:string,method:string,body?:unknown,signal?:AbortSignal){
  await readiness;
  const response=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000)});
  const payload=await response.json();
  if(!response.ok)throw Object.assign(new Error(typeof payload.detail==='string'?payload.detail:(path.startsWith('/api/screener')||path.startsWith('/api/alerts')||path.startsWith('/api/watchlists'))&&Array.isArray(payload.detail)?payload.detail.slice(0,5).map((e:{msg:string})=>e.msg).join('; '):'The local service rejected this request.'),{kind:payload.kind??(response.status===404?'missing':'source'),code:payload.code,retry_after:payload.retry_after??0,retryable:payload.retryable??['temporary','rate'].includes(payload.kind),http_status:payload.http_status??response.status});
  return payload;
}
ipcMain.handle('api',async(event,path:string,method='GET',body?:unknown,requestId?:string)=>{
  trusted(event);const url=new URL(path,'http://127.0.0.1');
  if(url.origin!=='http://127.0.0.1'||!(allowed.has(url.pathname)||alertPath(url.pathname)||/^\/api\/screener\/(universes|conditions|presets|jobs(?:\/[a-f0-9]{32}(?:\/(?:results|cancel))?)?)$/.test(url.pathname))||!['GET','POST','PUT'].includes(method))throw new Error('API operation not allowed');
  if(JSON.stringify(body??'').length>(url.pathname.startsWith('/api/watchlists/import/')?1_500_000:url.pathname==='/api/indicators/calculate'?16_000_000:(url.pathname==='/workspace'||url.pathname==='/api/screener/presets')?4_000_000:256_000))throw new Error('Request too large');
  if(requestId!==undefined&&(typeof requestId!=='string'||requestId.length>80||requests.has(requestId)))throw new Error('Invalid request identifier');
  const controller=new AbortController();if(requestId)requests.set(requestId,controller);
  const operation=localFetch(url.pathname+url.search,method,body,controller.signal);
  if((url.pathname==='/workspace'||url.pathname==='/api/refresh/preferences'||url.pathname==='/api/screener/presets'||alertPath(url.pathname)||url.pathname.startsWith('/api/watchlists/')||url.pathname.startsWith('/api/crypto-migration/'))&&(method==='PUT'||method==='POST')){pendingSaves.add(operation);operation.finally(()=>pendingSaves.delete(operation)).catch(()=>{});}
  try{return await operation;}
  catch(e){const failure=e as Error&{kind?:string;code?:string;retry_after?:number;retryable?:boolean;http_status?:number};return {__terminal_error:{message:controller.signal.aborted?'Outdated chart request cancelled.':failure.message,kind:controller.signal.aborted?'cancelled':failure.kind??'temporary',code:controller.signal.aborted?'cancelled':failure.code??failure.kind??'connection',retry_after:failure.retry_after??0,retryable:!controller.signal.aborted&&(failure.retryable??true),http_status:failure.http_status}};}
  finally{if(requestId)requests.delete(requestId);}
});
const nativeWindow=windowControls(()=>window);
ipcMain.handle('window-control',(event,action:unknown)=>{trusted(event);return nativeWindow.control(action);});
ipcMain.handle('application-updates',async(event,action:unknown,value?:unknown)=>{
 trusted(event);if(!updates)throw Error('Update service is starting');
 if(action==='status')return updates.snapshot();
 if(action==='check')return updates.check();
 if(action==='preferences')return updates.preferences(value);
 if(action==='restart'){
  if(!updates.snapshot().restartReady)throw Error('No validated update is ready');
  const choice=await dialog.showMessageBox(window!,{type:'question',buttons:['Later','Restart to Update'],defaultId:0,cancelId:0,message:'Restart GLOBAL MARKET TERMINAL to install the validated update?',detail:'Your saved watchlists, indicators and drawings will be preserved. Active charting will close.'});
  if(choice.response===1){await new Promise(r=>setTimeout(r,500));if(pendingSaves.size)await Promise.all([...pendingSaves]);updates.restart();}return updates.snapshot();
 }
 throw Error('Update operation not allowed');
});
ipcMain.handle('watchlist-file',async(event,action:unknown,id?:unknown)=>{trusted(event);if(!window)return null;if(action==='import')return importWatchlistCSV(window);if(action==='export'){await readiness;return exportWatchlistCSV(window,await localFetch('/workspace','GET'),id);}throw Error('Invalid watchlist file operation');});
ipcMain.handle('alert-notifications',async(event,action:string,value?:unknown)=>{trusted(event);await readiness;if(!alertNotifications)throw Error('Native alert service is unavailable');if(action==='status')return alertNotifications.status();if(action==='request')return alertNotifications.status(true);if(action==='test')return alertNotifications.test(value);if(action==='navigation')return alertNotifications.navigation();if(action==='settings'){await shell.openExternal(process.platform==='win32'?'ms-settings:notifications':'x-apple.systempreferences:com.apple.Notifications-Settings.extension');return null;}throw Error('Notification operation not allowed');});
ipcMain.handle('screener-csv',async(event,data:CSVData)=>{trusted(event);if(!window)return null;const csv=formatCSV(data);const selected=await dialog.showSaveDialog(window,{title:'Export historical screener results',defaultPath:'Screener-results.csv',filters:[{name:'CSV results',extensions:['csv']}]});if(selected.canceled||!selected.filePath)return null;await writeFile(selected.filePath,csv,'utf8');return selected.filePath;});
ipcMain.on('cancel', (event,id:string)=>{trusted(event);requests.get(id)?.abort();});
ipcMain.handle('select-files',async(event,kind:string,symbol?:string)=>{
  trusted(event);
  if(!window||!['directory','history'].includes(kind)||(kind==='history'&&(typeof symbol!=='string'||symbol.length>60)))throw new Error('Invalid file import');
  const selected=await dialog.showOpenDialog(window,{title:kind==='directory'?'Select EQUITY_L.csv and SME_EQUITY_L.csv from NSE':'Select official NSE equity bhavcopy files',properties:['openFile','multiSelections'],filters:[{name:'Official NSE files',extensions:kind==='directory'?['csv']:['csv','zip']}]});
  if(selected.canceled)return null;
  if(!selected.filePaths.length||selected.filePaths.length>40)throw new Error('Select between 1 and 40 files.');
  const sizes=await Promise.all(selected.filePaths.map(path=>stat(path)));const limit=kind==='directory'?10_000_000:64_000_000;
  if(sizes.some(s=>!s.isFile())||sizes.reduce((n,s)=>n+s.size,0)>limit)throw new Error('Selected files exceed the import size limit.');
  const files=[];
  for(const path of selected.filePaths){const content=await readFile(path);files.push({name:basename(path),content:content.toString('base64')});}
  return localFetch(kind==='directory'?'/api/securities/import':'/api/nse/import','POST',{symbol,files});
});
ipcMain.handle('save-chart-image',async(event,data:string,name:string)=>{
  trusted(event);
  if(!window||typeof data!=='string'||data.length>24_000_000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))throw new Error('Invalid or oversized chart PNG');
  const bytes=Buffer.from(data.split(',')[1],'base64');
  if(bytes.length>16_000_000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid PNG image');
  const filename=String(name).replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,100).replace(/\.png$/,'')+'.png';
  const selected=await dialog.showSaveDialog(window,{title:'Export chart screenshot',defaultPath:filename,filters:[{name:'PNG image',extensions:['png']}]});
  if(selected.canceled||!selected.filePath)return null;
  await writeFile(selected.filePath,bytes);return 'Chart PNG saved.';
});
ipcMain.handle('select-drawing-image',async(event)=>{
 trusted(event);if(!window)throw Error('Application window is unavailable');
 const selected=await dialog.showOpenDialog(window,{title:'Select local image annotation',properties:['openFile'],filters:[{name:'Local PNG/JPEG image',extensions:['png','jpg','jpeg']}]});
 if(selected.canceled)return null;if(selected.filePaths.length!==1)throw Error('Select one local image.');const info=await stat(selected.filePaths[0]);if(!info.isFile()||info.size>8_000_000)throw Error('Select an image no larger than 8 MB.');return normalizeDrawingImage(await readFile(selected.filePaths[0]));
});
ipcMain.handle('drawing-file',async(event,action:string,data?:string)=>{
  trusted(event);if(!window||!['import','export'].includes(action))throw new Error('Invalid drawing file operation');
  if(action==='export'){
    if(typeof data!=='string'||Buffer.byteLength(data,'utf8')>2_000_000)throw new Error('Drawing JSON exceeds the size limit');
    const content=serializeDrawings(deserializeDrawings(data));
    const selected=await dialog.showSaveDialog(window,{title:'Save drawings / template JSON',defaultPath:'drawing-template.json',filters:[{name:'Drawing JSON',extensions:['json']}]});
    if(selected.canceled||!selected.filePath)return null;await writeFile(selected.filePath,content,'utf8');return 'Drawing JSON saved.';
  }
  const selected=await dialog.showOpenDialog(window,{title:'Open drawings / template JSON',properties:['openFile'],filters:[{name:'Drawing JSON',extensions:['json']}]});
  if(selected.canceled)return null;if(selected.filePaths.length!==1)throw new Error('Select one drawing JSON file');
  const info=await stat(selected.filePaths[0]);if(!info.isFile()||info.size>2_000_000)throw new Error('Drawing JSON exceeds the size limit');
  const dataBytes=await readFile(selected.filePaths[0]);if(dataBytes.length>2_000_000)throw new Error('Drawing JSON exceeds the size limit');return serializeDrawings(deserializeDrawings(dataBytes.toString('utf8')));
});
ipcMain.handle('external',async(event,url:string)=>{
  trusted(event);const links=new Set(['https://www.tradingview.com/','https://www.nseindia.com/all-reports','https://www.nseindia.com/static/market-data/securities-available-for-trading','https://ranaroussi.github.io/yfinance/']);
  if(links.has(url))await shell.openExternal(url);
});
function createWindow(){
  window=new BrowserWindow({width:1440,height:920,minWidth:1050,minHeight:650,title:PRODUCT_NAME,backgroundColor:'#0c1017',...(process.platform==='darwin'?{titleBarStyle:'hiddenInset' as const,trafficLightPosition:{x:17,y:9}}:{titleBarStyle:'default' as const}),webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
  if(process.platform==='win32')window.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='F11'&&!input.isAutoRepeat){event.preventDefault();void nativeWindow.control('toggle').catch(error=>dialog.showErrorBox('Fullscreen unavailable',String(error)));}});
  window.webContents.on('did-finish-load',()=>{void readiness?.then(()=>localFetch('/api/streams/events?cursor=0&wait=0','GET')).then(value=>window?.webContents.send('market-stream',value)).catch(()=>{});});
  window.webContents.on('render-process-gone',()=>{void localFetch('/api/streams/consumers','PUT',{consumers:[]}).catch(()=>{});});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));window.webContents.session.setPermissionCheckHandler(()=>false);
  if(dev)void window.loadURL('http://127.0.0.1:5173');else void window.loadFile(join(root,'desktop/dist/index.html'));
}
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.whenReady().then(()=>{
    // Show the dashboard while the local backend/directory starts.
    Menu.setApplicationMenu(Menu.buildFromTemplate([process.platform==='darwin'?{role:'appMenu',label:PRODUCT_NAME}:{label:PRODUCT_NAME,submenu:[{label:'About '+PRODUCT_NAME,click:()=>app.showAboutPanel()},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{label:'View',submenu:[process.platform==='darwin'?{role:'togglefullscreen',accelerator:fullscreenAccelerator()}:{label:'Toggle Fullscreen',accelerator:fullscreenAccelerator(),click:()=>{void nativeWindow.control('toggle').catch(error=>dialog.showErrorBox('Fullscreen unavailable',String(error)));}}]},{role:'windowMenu'}]));
    createWindow();readiness=startBackend();updates=startUpdates(metadata,state=>window?.webContents.send('application-update-state',state));
    powerMonitor.on('suspend',()=>{window?.webContents.send('app-lifecycle','suspend');void localFetch('/api/streams/lifecycle','POST',{suspended:true}).catch(()=>{});});powerMonitor.on('resume',()=>{window?.webContents.send('app-lifecycle','resume');void localFetch('/api/streams/lifecycle','POST',{suspended:false}).catch(()=>{});});
    window?.on('enter-full-screen',()=>window?.webContents.send('window-state',nativeWindow.state()));window?.on('leave-full-screen',()=>window?.webContents.send('window-state',nativeWindow.state()));
    readiness.then(()=>{backend?.once('exit',()=>{if(!quitting){dialog.showErrorBox(PRODUCT_NAME+' backend stopped','The local data service stopped. Quit and relaunch the application to retry. Saved settings are preserved.');app.quit();}});void startStreamBridge();alertNotifications=new AlertNotifications(localFetch,()=>window);alertNotifications.start();}).catch(()=>{});
    readiness.catch(error=>{dialog.showErrorBox(PRODUCT_NAME+' could not start',String(error));app.quit();});
  });
}
app.on('activate',()=>{if(!window||window.isDestroyed())createWindow();});
app.on('window-all-closed',()=>app.quit());process.on('SIGTERM',()=>app.quit());process.on('SIGINT',()=>app.quit());
app.on('before-quit',event=>{
 if(shutdown){if(!shutdownFinished)event.preventDefault();return;}
 event.preventDefault();quitting=true;streamBridge?.abort();alertNotifications?.close();updates?.close();
 shutdown=(async()=>{
  if(pendingSaves.size)await Promise.race([Promise.allSettled([...pendingSaves]),new Promise(resolve=>setTimeout(resolve,3000))]);
  for(const controller of requests.values())controller.abort();requests.clear();
  try{await stopOwnedBackend(backend,auth,backendJob);}catch{dialog.showErrorBox(PRODUCT_NAME+' shutdown','The owned backend did not confirm shutdown. Its cleanup job has been closed. Relaunch after checking the saved application logs.');}
 })().finally(()=>{shutdownFinished=true;app.quit();});
});
