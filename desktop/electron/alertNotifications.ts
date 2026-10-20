import {Notification,type BrowserWindow} from 'electron';
import {join} from 'node:path';
interface Permission {authorization:string;alerts:string;sounds:string;notification_center:string;error:string}
interface EventRow {id:string;kind:string;created_at:number;payload:{instrument:{canonical_id?:string;instrument_id?:string;symbol:string;exchange:string};interval:string;title:string;message:string;candle_time:number|null;market_time?:number;event_type?:string;timezone:string;source:string;sound:string}}
type Fetch=(path:string,method:string,body?:unknown)=>Promise<any>;
/** Native dispatch is owned by main, not by React rendering/polling. Claims persist before display. */
export class AlertNotifications {
 private timer:ReturnType<typeof setInterval>|undefined;private busy=false;private closed=false;private retained=new Map<string,Notification>();private permission:Promise<Permission>|null=null;private last:unknown=null;private pendingNavigation:string|null=null;private lastTest=0;
 constructor(private fetch:Fetch,private getWindow:()=>BrowserWindow|undefined){}
 async status(request=false){
  if(process.platform!=='darwin'||!Notification.isSupported())return {supported:Notification.isSupported(),authorization:'unsupported',alerts:'unsupported',sounds:'unsupported',notification_center:'unsupported',error:'Native macOS notification permissions are unavailable on this platform.',last:this.last};
  try{if(request&&this.permission)await this.permission;if(!this.permission)this.permission=(require(join(__dirname,'notification-status.node')) as {status:(request:boolean)=>Promise<Permission>}).status(request).finally(()=>{this.permission=null;});const p=await this.permission;return {...p,supported:true,last:this.last};}
  catch{return {supported:true,authorization:'unknown',alerts:'unknown',sounds:'unknown',notification_center:'unknown',error:'macOS authorization could not be read. Check System Settings → Notifications.',last:this.last};}
 }
 start(){void this.restore().finally(()=>{if(!this.closed){this.timer=setInterval(()=>void this.flush(),2000);void this.flush();}});}
 private activate(id:string){
  if(this.closed)return;this.pendingNavigation=id;const w=this.getWindow();if(w){if(w.isMinimized())w.restore();w.show();w.focus();w.webContents.send('alert-navigation',id);}void this.record(id,'clicked','Native notification click received.');
 }
 private async restore(){
  if(process.platform!=='darwin')return;
  try{
   const known=new Set((await this.fetch('/api/alerts/history','GET') as EventRow[]).map(row=>row.id));
   const delivered=await Notification.getHistory();if(this.closed)return;
   for(const n of delivered){
    if(!/^[a-f0-9]{32}$/.test(n.id)||!known.has(n.id))continue;
    this.retained.set(n.id,n);n.on('click',()=>this.activate(n.id));n.on('close',()=>this.retained.delete(n.id));
   }
   // Reattach events only: showing restored notifications would redeliver old signals.
  }catch{/* Startup still works if macOS history is unavailable. */}
 }

 navigation(){const id=this.pendingNavigation;this.pendingNavigation=null;return id;}
 async test(value:unknown){
  if(Date.now()-this.lastTest<10000)throw Error('Wait ten seconds between notification tests.');
  if(!value||typeof value!=='object'||typeof (value as any).instrument!=='string'||(value as any).instrument.length>180||!['1m','5m','15m','30m','1h','4h','1d','1w','1M'].includes((value as any).interval))throw Error('Select a valid test instrument and timeframe.');
  this.lastTest=Date.now();const result=await this.fetch('/api/alerts/notifications/test','POST',value);await this.flush();return result;
 }
 async flush(){
  if(this.busy||this.closed)return;this.busy=true;
  try{const rows=await this.fetch('/api/alerts/notifications/claim','POST');for(const row of rows as EventRow[]){if(this.closed)break;await this.send(row);}}
  catch{/* Backend startup/migration/shutdown errors are shown in the Alerts workspace. */}finally{this.busy=false;}
 }
 private async record(id:string,state:string,detail=''){
  this.last={id,state,detail,at:Date.now()/1000};try{await this.fetch(`/api/alerts/notifications/${id}/delivery`,'POST',{state,detail:detail.slice(0,300)});}catch{/* Checkpoint/claim already persisted: never redispatch on ack failure. */}
 }
 private async send(row:EventRow){
  if(!/^[a-f0-9]{32}$/.test(row.id))return;
  if(Date.now()/1000-row.created_at>120){await this.record(row.id,'not_sent_stale');return;}
  const p=await this.status();if(this.closed)return;
  if(!p.supported){await this.record(row.id,'unsupported');return;}
  if(p.authorization==='denied'){await this.record(row.id,'permission_denied','System notification authorization is denied.');return;}
  if(p.authorization==='not_determined'){await this.record(row.id,'permission_required','Use Enable notifications in Alerts; this signal will not be sent retrospectively.');return;}
  if(p.authorization==='unknown'){await this.record(row.id,'unconfirmed','System notification permission status could not be established.');return;}
  const payload=row.payload,stamp=payload.market_time?new Date(payload.market_time*1000).toISOString():payload.candle_time?new Date(payload.candle_time*1000).toISOString():'test only';
  let n:Notification;
  try{n=new Notification({id:row.id,groupId:'historical-alerts',title:payload.title.slice(0,80),subtitle:`${payload.instrument.symbol} · ${payload.instrument.exchange} · ${payload.interval}`,body:`${payload.message.slice(0,500)}\n${payload.event_type==='live_price'?'Public trade':'Signal candle'}: ${stamp}\n${row.kind==='test'?'Test only · not a market signal':payload.event_type==='live_price'?'Public market analysis · provider timestamps':'Historical analysis · may be delayed'}`,silent:payload.sound==='none',...(process.platform==='darwin'&&payload.sound!=='none'&&payload.sound!=='default'?{sound:payload.sound}:{})});}
  catch{await this.record(row.id,'failed','Native notification could not be constructed.');return;}
  this.retained.set(row.id,n);let acknowledged=false;
  n.on('show',()=>{acknowledged=true;void this.record(row.id,'shown_by_api','Electron emitted show; Focus, banner visibility and user receipt are not guaranteed.');});
  n.on('failed',(_event,error)=>{acknowledged=true;void this.record(row.id,'failed',String(error));this.retained.delete(row.id);});
  n.on('click',()=>{acknowledged=true;this.activate(row.id);});
  n.on('close',()=>this.retained.delete(row.id));
  try{n.show();}catch{acknowledged=true;await this.record(row.id,'failed','The operating system rejected notification.show().');}
  setTimeout(()=>{if(!acknowledged&&!this.closed)void this.record(row.id,'unconfirmed','No native show/failure acknowledgment. Delivery cannot be confirmed.');},8000).unref();
  // Bound retained native handles even when the OS omits close events.
  if(this.retained.size>100){const key=this.retained.keys().next().value!;this.retained.delete(key);}
 }
 close(){this.closed=true;if(this.timer)clearInterval(this.timer);this.retained.clear();}
}
