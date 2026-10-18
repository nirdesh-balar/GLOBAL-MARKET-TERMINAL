import {useEffect,useState} from 'react';
import {api} from '../services/api';
import type {Candle,HistoryResult,SymbolEntry} from '../types';
import type {QuoteValue} from '../refresh/hooks';
export interface StreamStatus {enabled:boolean;state:string;error:string|null;connection_count:number;subscriptions:number;consumers:number;limit:number;generation:number;version:number;metrics:Record<string,number>}
export interface StreamFeed {key:string;identity:string;feed:'candle'|'trades';interval:string;state:string;error:string|null;received_at:number;market_time:number|null;refs:number;version:number;precision?:number;candle?:Candle;history?:HistoryResult;quote?:QuoteValue}
interface Message {cursor:number;status:StreamStatus;feeds:StreamFeed[]}
interface Consumer {owner:string;identity:string;native_mapping:string;feed:'candle'|'trades';interval:string}
const demands=new Map<string,Consumer>(),listeners=new Map<string,Set<(f:StreamFeed)=>void>>(),statusListeners=new Set<()=>void>(),latest=new Map<string,StreamFeed>();
let status:StreamStatus={enabled:false,state:'initializing',error:null,connection_count:0,subscriptions:0,consumers:0,limit:108,generation:0,version:0,metrics:{}};
let failures=0;
let started=false,changed=false,running=false,timer:ReturnType<typeof setTimeout>|undefined,flushTimer:ReturnType<typeof setTimeout>|undefined;
const pending=new Map<string,StreamFeed>();
const key=(r:SymbolEntry,feed:string,interval:string)=>(r.canonical_id||r.instrument_id||'')+'|'+feed+'|'+interval;
function receive(value:Message){
 if(!value||!value.status||!Array.isArray(value.feeds))return;
 const before=status;status=value.status;
 if(before.enabled!==status.enabled||before.state!==status.state||before.error!==status.error||before.generation!==status.generation)for(const fn of statusListeners)fn();
 for(const row of value.feeds){
  if(!row||typeof row.identity!=='string'||!row.identity.startsWith('hyperliquid:')||!['candle','trades'].includes(row.feed))continue;
  const previous=pending.get(row.key);pending.set(row.key,previous?.history&&!row.history?{...row,history:previous.history}:row);
 }
 if(!flushTimer)flushTimer=setTimeout(()=>{flushTimer=undefined;for(const [k,row] of pending){latest.set(k,row);for(const fn of listeners.get(k)||[])fn(row);}pending.clear();for(const k of latest.keys())if(!listeners.has(k))latest.delete(k);},250);
}
function start(){
 if(started)return;started=true;
 window.terminal.onMarketStream(value=>receive(value as Message));
 void api<StreamStatus>('/api/streams/status').then(s=>receive({cursor:0,status:s,feeds:[]})).catch(()=>{});
 window.addEventListener('beforeunload',()=>{demands.clear();void api('/api/streams/consumers','PUT',{consumers:[]}).catch(()=>{});});
}
function schedule(){changed=true;clearTimeout(timer);timer=setTimeout(()=>void send(),50);}
async function send(){
 if(running)return;running=true;
 try{while(changed){changed=false;const s=await api<StreamStatus>('/api/streams/consumers','PUT',{consumers:[...demands.values()]});receive({cursor:0,status:s,feeds:[]});failures=0;}}
 catch(e){status={...status,state:'unavailable',error:(e as Error).message};for(const fn of statusListeners)fn();failures=Math.min(failures+1,5);if(demands.size){changed=true;timer=setTimeout(()=>void send(),Math.min(60000,5000*2**(failures-1)));}}
 finally{running=false;}
}
export function useStreamStatus(){const [value,setValue]=useState(status);useEffect(()=>{start();const fn=()=>setValue({...status});statusListeners.add(fn);fn();return()=>{statusListeners.delete(fn);};},[]);return value;}
export function useStreamFeed(owner:string,row:SymbolEntry,feed:'candle'|'trades',interval:string,enabled:boolean,onData:(f:StreamFeed)=>void){
 const identity=row.canonical_id||row.instrument_id||'',mapping=row.native_mapping||'';
 useEffect(()=>{
  if(!enabled||row.provider!=='hyperliquid'||!identity)return;
  start();const k=key(row,feed,interval),id=owner+'|'+k;const callbacks=listeners.get(k)||new Set();callbacks.add(onData);listeners.set(k,callbacks);
  demands.set(id,{owner,identity,native_mapping:mapping,feed,interval});schedule();const cached=latest.get(k);if(cached)onData(cached);
  return()=>{callbacks.delete(onData);if(!callbacks.size){listeners.delete(k);latest.delete(k);}demands.delete(id);schedule();};
 },[owner,identity,mapping,feed,interval,enabled,onData]);
}
export function useWatchlistStream(owner:string,rows:SymbolEntry[],enabled:boolean,onData:(f:StreamFeed)=>void,feed:'trades'|'candle'='trades',interval=''){
 const signature=rows.filter(r=>r.provider==='hyperliquid').map(r=>(r.canonical_id||r.instrument_id)+'/'+r.native_mapping).join('|');
 useEffect(()=>{
  if(!enabled)return;start();const cleanups:(()=>void)[]=[];
  for(const row of rows.filter(r=>r.provider==='hyperliquid')){
   const identity=row.canonical_id||row.instrument_id;if(!identity)continue;const k=key(row,feed,interval),id=owner+'|'+k;const callbacks=listeners.get(k)||new Set();callbacks.add(onData);listeners.set(k,callbacks);demands.set(id,{owner,identity,native_mapping:row.native_mapping||'',feed,interval});
   const cached=latest.get(k);if(cached)onData(cached);
   cleanups.push(()=>{callbacks.delete(onData);if(!callbacks.size){listeners.delete(k);latest.delete(k);}demands.delete(id);});
  }
  schedule();return()=>{for(const fn of cleanups)fn();schedule();};
 },[owner,signature,enabled,onData,feed,interval]);
}
export function streamView(range:{from:number;to:number}|null,oldRows:Candle[],rows:Candle[],follow:boolean){
 if(!range||!oldRows.length||!rows.length)return range;
 if(follow&&range.to>=oldRows.length-1){const shift=rows.length-oldRows.length;return {from:range.from+shift,to:range.to+shift};}
 const oldLast=oldRows.at(-1)!.time,index=rows.findIndex(r=>r.time===oldLast);if(index<0)return range;
 const shift=index-(oldRows.length-1);return {from:range.from+shift,to:range.to+shift};
}
export function mergeLive(old:HistoryResult,frame:StreamFeed):HistoryResult{
 const base=frame.history||old;let candles=base.candles;
 if(frame.candle){const last=candles.at(-1);if(!last||frame.candle.time>last.time)candles=[...candles,frame.candle].slice(-5000);else if(frame.candle.time===last.time)candles=[...candles.slice(0,-1),frame.candle];}
 return {...base,precision:Math.max(base.precision||0,frame.precision||0),candles,returned:candles.length,stream_received_at:frame.received_at,stream_update_only:!frame.history,last_available:candles.length?new Date(candles.at(-1)!.time*1000).toISOString():base.last_available};
}
