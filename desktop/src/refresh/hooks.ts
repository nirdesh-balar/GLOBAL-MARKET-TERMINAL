import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../services/api';
import {RefreshScheduler} from './scheduler';
export interface RefreshPreferences {startup_quotes:boolean;watchlist_interval:0|60|300|900;chart_interval:60|300|900}
export interface QuoteValue {price:number;previous_close:number|null;absolute_change:number|null;change:number|null;volume:number|null;currency:string;timezone:string;precision:number;data_time:number;received_at?:number;timestamp_kind:'trading_date'|'provider_market_time'|'native_candle_start'|'provider_trade_time';latest_bar_time:number;last_completed_bar_time:number|null;fetched_at:number;source:string;session:{state:'open'|'closed'|'unknown';reliable:boolean;basis:string};notice:string}
export interface QuoteRow {stream_state?:string;receive_time?:number;identity:string;state:'idle'|'pending'|'loading'|'ready'|'error'|'cancelled';value:QuoteValue|null;stale:boolean;error:string|null;retry_at?:number|null}
export interface QuoteSnapshot {job:string|null;watchlist:string;rows:Record<string,QuoteRow>;pending:number;completed_at:number|null;provider:{cooldown_seconds:number;error:string|null};storage:string}
export const refreshScheduler=new RefreshScheduler();
export function useRefreshLifecycle(){
  const [paused,setPaused]=useState(false);
  useEffect(()=>{
    let suspended=false;
    const update=()=>{const active=!suspended&&!document.hidden&&navigator.onLine;setPaused(!active);refreshScheduler.setActive(active);};
    const off=window.terminal.onLifecycle(state=>{suspended=state==='suspend';update();});
    for(const name of ['online','offline','visibilitychange'])window.addEventListener(name,update);
    update();return()=>{off();for(const name of ['online','offline','visibilitychange'])window.removeEventListener(name,update);refreshScheduler.setActive(false);};
  },[]);
  return paused;
}
export function useRefreshTask(key:string,enabled:boolean,seconds:number,run:()=>Promise<void>){
  const callback=useRef(run);callback.current=run;
  useEffect(()=>enabled&&seconds>0?refreshScheduler.register(key,seconds*1000,()=>callback.current()):undefined,[key,enabled,seconds]);
}
export function useRefreshPreferences(){
  const [value,setValue]=useState<RefreshPreferences|null>(null),[error,setError]=useState('');
  const queue=useRef<Promise<unknown>>(Promise.resolve());
  useEffect(()=>{let alive=true;void api<RefreshPreferences>('/api/refresh/preferences').then(v=>{if(alive)setValue(v);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
  const change=useCallback((next:RefreshPreferences)=>{setValue(next);queue.current=queue.current.catch(()=>{}).then(()=>api<RefreshPreferences>('/api/refresh/preferences','PUT',next)).then(()=>setError(''),e=>setError(e.message));},[]);
  return {value,change,error};
}
export function useWatchlistQuotes(watchlist:string,signature:string,enabled:boolean,preferences:RefreshPreferences|null){
  const [snapshot,setSnapshot]=useState<QuoteSnapshot|null>(null),[error,setError]=useState('');
  const runRef=useRef<(force?:boolean,automatic?:boolean)=>Promise<void>>(async()=>{}),first=useRef(true),lastSelection=useRef('');
  useEffect(()=>{
    if(!enabled||!preferences){setSnapshot(old=>old?.watchlist===watchlist?old:null);return;}
    let alive=true,running=false,runRevision=0,job:string|null=null,timer:ReturnType<typeof setTimeout>|undefined,wake:(()=>void)|undefined;
    const requests=new Set<string>();
    async function request<T>(path:string,method='GET',body?:unknown){const id=crypto.randomUUID();requests.add(id);try{return await api<T>(path,method,body,id);}finally{requests.delete(id);}}
    const accept=(value:QuoteSnapshot)=>{if(alive){setSnapshot(value);setError('');}};
    const run=async(force=false,automatic=false)=>{
      if(!alive||running)return;running=true;runRevision++;
      try{
        let value=await request<QuoteSnapshot>('/api/quotes/snapshot','POST',{watchlist,force,automatic});job=value.job;
        if(!alive){if(job)void api('/api/quotes/cancel','POST',{job}).catch(()=>{});return;}
        accept(value);
        while(alive&&value.pending){
          await new Promise<void>(resolve=>{wake=resolve;timer=setTimeout(resolve,500);});wake=undefined;
          if(!alive)break;
          value=await request<QuoteSnapshot>('/api/quotes/status?watchlist='+encodeURIComponent(watchlist));accept(value);
        }
      }catch(e){if(alive)setError((e as Error).message);throw e;}finally{running=false;}
    };
    runRef.current=run;setSnapshot(null);
    // A bootstrap status can arrive after a newer refresh has completed.
    // Keep it only while no refresh has started in this effect generation.
    const bootstrapRevision=runRevision;
    void request<QuoteSnapshot>('/api/quotes/status?watchlist='+encodeURIComponent(watchlist)).then(value=>{if(runRevision===bootstrapRevision)accept(value);}).catch(e=>{if(alive)setError(e.message);});
    const selection=watchlist+'|'+signature,automatic=lastSelection.current===selection;
    if(!first.current||preferences.startup_quotes)void run(false,automatic).catch(()=>{});
    first.current=false;lastSelection.current=selection;
    return()=>{alive=false;clearTimeout(timer);wake?.();for(const id of requests)window.terminal.cancel(id);if(job)void api('/api/quotes/cancel','POST',{job}).catch(()=>{});};
  },[watchlist,signature,enabled,!!preferences]);
  useRefreshTask('selected-watchlist:'+watchlist,enabled&&!!preferences,(preferences?.watchlist_interval||0),()=>runRef.current(false,true));
  return {snapshot,error,refresh:()=>void runRef.current(true).catch(()=>{})};
}

export function quoteTime(value:QuoteValue){
  return new Intl.DateTimeFormat('en-IN',{timeZone:value.timestamp_kind==='trading_date'?'UTC':value.timezone,month:'short',day:'2-digit',...(['provider_market_time','provider_trade_time'].includes(value.timestamp_kind)?{hour:'2-digit',minute:'2-digit',...(value.timestamp_kind==='provider_trade_time'?{second:'2-digit' as const}:{}),hour12:false}:{})}).format(new Date(value.data_time*1000));
}
