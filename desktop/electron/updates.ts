import {EventEmitter} from 'node:events';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {RELEASE_VERSION} from '../src/brand';

export const UPDATE_OWNER='nirdesh-balar';
export const UPDATE_REPO='GLOBAL-MARKET-TERMINAL';
export const UPDATE_INTERVAL=6*60*60*1000;
export interface UpdateState {installed:string;latest:string|null;lastCheck:number|null;status:string;message:string;progress:number;automatic:boolean;restartReady:boolean;available:boolean;}
export interface UpdateEngine extends EventEmitter {autoDownload:boolean;autoInstallOnAppQuit:boolean;allowPrerelease:boolean;allowDowngrade:boolean;channel:string|null;checkForUpdates:()=>Promise<unknown>;downloadUpdate:()=>Promise<unknown>;quitAndInstall:(silent?:boolean,runAfter?:boolean)=>void;}
export function newerStable(next:string,current:string){
 const parse=(s:string)=>/^\d+\.\d+\.\d+$/.test(s)?s.split('.').map(Number):null;
 const a=parse(next),b=parse(current);if(!a||!b)return false;
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
/** A fixed public feed; renderer never supplies URLs, file paths or install arguments. */
export class ApplicationUpdates {
 private state:UpdateState;private timer:ReturnType<typeof setTimeout>|undefined;private busy=false;private closed=false;private checked=0;private downloaded=false;
 private listeners:[string,(value:any)=>void][]=[];
 constructor(private engine:UpdateEngine|null,private directory:string,private reason:string,private emit:(s:UpdateState)=>void,private now:()=>number=Date.now){
  let saved:{automatic?:boolean;lastCheck?:number}={};try{const value=JSON.parse(readFileSync(join(directory,'application-updates.json'),'utf8'));if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
  this.state={installed:RELEASE_VERSION,latest:null,lastCheck:Number.isFinite(saved.lastCheck)?saved.lastCheck!:null,status:engine?'idle':'blocked',message:reason||'Stable updates from the official GitHub repository.',progress:0,automatic:saved.automatic!==false,restartReady:false,available:!!engine};
  if(!engine)return;
  engine.autoDownload=false;engine.autoInstallOnAppQuit=false;engine.allowPrerelease=false;engine.channel='latest';engine.allowDowngrade=false;
  const on=(name:string,fn:(v:any)=>void)=>{engine.on(name,fn);this.listeners.push([name,fn]);};
  on('checking-for-update',()=>this.patch({status:'checking',message:'Checking the official stable release…'}));
  on('update-not-available',()=>this.patch({status:'current',message:'No newer compatible stable version is available.'}));
  on('update-available',info=>{
   if(!newerStable(info?.version,this.state.installed)){this.patch({status:'rejected',message:'Prerelease, invalid version or downgrade rejected.'});return;}
   this.patch({latest:info.version,status:'downloading',message:'Downloading a signed update in the background.',progress:0,restartReady:false});
   void engine.downloadUpdate().catch(()=>this.fail());
  });
  on('download-progress',p=>{if(this.state.status==='downloading')this.patch({progress:Math.max(0,Math.min(100,Number(p?.percent)||0))});});
  on('update-downloaded',info=>{
   if(this.state.status!=='downloading'||info?.version!==this.state.latest||!newerStable(info.version,this.state.installed)){this.patch({status:'rejected',message:'Unexpected update completion rejected.',restartReady:false});return;}
   // electron-updater has verified the package hash and native code signature.
   this.downloaded=true;this.patch({status:'downloaded',progress:100,restartReady:true,message:'Update validated. Restart when you are ready; charts will stay open until then.'});
  });
  on('error',()=>this.fail());
 }
 snapshot(){return {...this.state};}
 private patch(value:Partial<UpdateState>){if(this.closed)return;Object.assign(this.state,value);this.emit(this.snapshot());}
 private persist(){const p=join(this.directory,'application-updates.json'),temp=p+'.tmp';writeFileSync(temp,JSON.stringify({version:1,automatic:this.state.automatic,lastCheck:this.state.lastCheck})+'\n',{mode:0o600});renameSync(temp,p);}
 private fail(){this.downloaded=false;this.patch({status:'error',restartReady:false,message:'Update check or validation failed. Your current application and settings are unchanged. Try again later.'});}
 start(){if(this.engine&&this.state.automatic)this.schedule(15000);}
 private schedule(ms:number){if(this.timer)clearTimeout(this.timer);if(this.closed||!this.engine||!this.state.automatic)return;this.timer=setTimeout(()=>{void this.check(false).finally(()=>this.schedule(UPDATE_INTERVAL));},ms);this.timer.unref?.();}
 preferences(value:unknown){if(typeof value!=='boolean')throw Error('Update preference must be a boolean');this.state.automatic=value;this.persist();this.patch({automatic:value});if(value)this.schedule(15000);else if(this.timer)clearTimeout(this.timer);return this.snapshot();}
 async check(manual=true){
  if(this.closed)throw Error('Updater is closed');
  if(!this.engine){this.patch({status:'blocked',message:this.reason});return this.snapshot();}
  if(this.busy||this.downloaded||this.state.status==='downloading')return this.snapshot();
  if(this.checked&&this.now()-this.checked<(manual?60000:UPDATE_INTERVAL))return this.snapshot();
  this.busy=true;this.checked=this.now();this.patch({lastCheck:this.checked,status:'checking'});this.persist();
  try{await this.engine.checkForUpdates();}catch{this.fail();}finally{this.busy=false;}
  return this.snapshot();
 }
 restart(){if(!this.engine||!this.downloaded||!this.state.restartReady)throw Error('No validated update is ready');this.engine.quitAndInstall(false,true);}
 close(){this.closed=true;if(this.timer)clearTimeout(this.timer);for(const [name,fn]of this.listeners)this.engine?.removeListener(name,fn);this.listeners=[];}
}
