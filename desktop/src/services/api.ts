import type { HistoryResult } from '../types';
import {cleanError}from './errors';
export const api = <T>(path:string,method='GET',body?:unknown,requestId?:string) => {
  if(!window.terminal)return Promise.reject(new Error('Launch the desktop app or run npm run dev.'));
  return window.terminal.request<T>(path,method,body,requestId,true).then(value=>{if(value&&typeof value==='object'&&'__terminal_error'in value){const detail=(value as {__terminal_error:import('./errors').ChartFailure}).__terminal_error;throw Object.assign(new Error(detail.message),detail);}return value as T;}).catch(e=>{throw cleanError(e);});
};
type Pending={promise:Promise<HistoryResult>;id:string;users:number;settled:boolean;cancelTimer?:ReturnType<typeof setTimeout>};
const pending=new Map<string,Pending>();
const updates=new Map<string,Set<(data:HistoryResult)=>void>>();
const requestKey=(path:string)=>{const url=new URL(path,'http://127.0.0.1');url.searchParams.delete('priority');url.searchParams.sort();return url.pathname+'?'+url.searchParams.toString();};
const canonical=(path:string)=>{const url=new URL(path,'http://127.0.0.1');url.searchParams.delete('refresh');return requestKey(url.pathname+url.search);};
export function subscribeHistory(path:string,callback:(data:HistoryResult)=>void){
  const key=canonical(path);const listeners=updates.get(key)||new Set();listeners.add(callback);updates.set(key,listeners);
  return()=>{listeners.delete(callback);if(!listeners.size)updates.delete(key);};
}
// Renderer leases deduplicate identical pane requests. Cancelling one pane
// does not abort a request still used by another pane. No renderer disk cache.
export function acquireHistory(path:string){
  const key=requestKey(path);let item=pending.get(key);
  if(!item){
    const id=crypto.randomUUID();
    item={id,users:0,settled:false,promise:api<HistoryResult>(path,'GET',undefined,id)};
    const entry=item;pending.set(key,entry);
    entry.promise.then(value=>{for(const listener of updates.get(canonical(path))||[])listener(value);},()=>{}).finally(()=>{entry.settled=true;if(pending.get(key)===entry)pending.delete(key);});
  }
  clearTimeout(item.cancelTimer);item.users++;
  const entry=item;
  let released=false;return {promise:entry.promise,release:()=>{
    if(released)return;released=true;
    entry.users--;
    if(!entry.users&&!entry.settled)entry.cancelTimer=setTimeout(()=>{
      if(entry.users||entry.settled)return;
      if(pending.get(key)===entry)pending.delete(key);
      window.terminal.cancel(entry.id);
    },0);
  }};
}
export const symbolLabel=(symbol:string)=>symbol.replace(/-(EQ|BE|BZ|SM|ST|BL|IL|IT)$/,'');
export const price=(n:number,precision=2)=>n.toLocaleString('en-IN',{minimumFractionDigits:precision,maximumFractionDigits:precision});
