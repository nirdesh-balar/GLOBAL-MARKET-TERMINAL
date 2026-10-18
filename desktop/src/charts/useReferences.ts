import {useEffect,useState,useCallback,useMemo,useRef} from 'react';
import type {Pane,IndicatorConfig,SymbolEntry} from '../types';
import type {CustomContext} from './custom';
import {useWatchlistStream,type StreamFeed} from '../streams/client';
import {applyBenchmarkFrame,mergeBenchmarkSnapshot} from './referenceMerge';
const pending=new Map<string,{promise:Promise<CustomContext>;id:string;users:number;done:boolean}>();
const LOADING='Loading historical reference data…';
function acquire(path:string){
 let item=pending.get(path);
 if(!item){
  const id=crypto.randomUUID();item={id,promise:window.terminal.request<CustomContext>(path,'GET',undefined,id),users:0,done:false};pending.set(path,item);
  const entry=item;entry.promise.finally(()=>{entry.done=true;if(pending.get(path)===entry)pending.delete(path);}).catch(()=>{});
 }
 item.users++;const entry=item;
 return {promise:entry.promise,release:()=>{
  entry.users--;if(!entry.users&&!entry.done)setTimeout(()=>{if(!entry.users&&!entry.done){if(pending.get(path)===entry)pending.delete(path);window.terminal.cancel(entry.id);}},0);
 }};
}
interface State {identity:string;key:string;context:CustomContext}
export function useReferences(pane:Pane,configs:IndicatorConfig[],adjusted:boolean,revision:number|string,enabled:boolean,liveEnabled=enabled){
 const identity=pane.canonical_id||pane.instrument_id||pane.symbol,selected=configs.filter(c=>c.visible),periods=new Set<string>();
 for(const c of selected){
  if(c.reference_source==='chart')continue;
  if(c.kind==='CPR_MTF'){periods.add('1d');periods.add('1w');periods.add('1M');}
  else if(['PIVOT','CPR'].includes(c.kind)){periods.add('1d');periods.add(c.pivot_reference??'1d');}
  else if(c.kind==='PREV_OHLC')periods.add('1d');
 }
 const needsSessions=selected.some(c=>c.kind==='ORB'||c.reference_source==='chart');
 const benchmarks=[...new Set(selected.filter(c=>['RELATIVE_STRENGTH','INDIA_VIX'].includes(c.kind)&&c.benchmark).map(c=>c.benchmark!))].sort();
 const signature=JSON.stringify([[...periods].sort(),needsSessions,benchmarks]),configKey=JSON.stringify([identity,pane.timeframe,signature,adjusted]);
 const [state,setState]=useState<State>({identity:'',key:'',context:{}}),[tick,setTick]=useState(0);const current=useRef(state);current.current=state;
 useEffect(()=>{
  if(!enabled||!liveEnabled||(!periods.size&&!needsSessions&&!benchmarks.length))return;
  const timer=setInterval(()=>setTick(v=>v+1),60000);return()=>clearInterval(timer);
 },[signature,enabled,liveEnabled]);
 useEffect(()=>{
  if(!enabled){setState(old=>old.key===configKey&&old.context.warnings?.includes(LOADING)?{...old,context:{...old.context,warnings:['Historical reference retrieval paused',...old.context.warnings.filter(w=>w!==LOADING)]}}:old);return;}
  let alive=true;const leases:ReturnType<typeof acquire>[]=[];
  const requests=[{periods:[...periods].sort().join(','),benchmark:''},...benchmarks.map(benchmark=>({periods:'',benchmark}))].filter(q=>q.periods||q.benchmark||needsSessions);
  const context:CustomContext=current.current.key===configKey?{...current.current.context,warnings:[]}:{primary:pane,references:{},sessions:[],benchmarks:{},warnings:[]};
  setState({identity,key:configKey,context:{...context,warnings:requests.length?[LOADING]:[]}});let remaining=requests.length;
  for(const query of requests){
   const params=new URLSearchParams({symbol:identity,interval:pane.timeframe,periods:query.periods,benchmark:query.benchmark,adjusted:String(adjusted),sessions:String(needsSessions&&!query.benchmark)}),lease=acquire('/api/studies/context?'+params);leases.push(lease);
   lease.promise.then(value=>{
    if(!alive)return;remaining--;
    setState(old=>{
     if(old.key!==configKey)return old;
     const histories={...old.context.benchmarks};for(const [key,incoming]of Object.entries(value.benchmarks??{}))histories[key]=mergeBenchmarkSnapshot(histories[key],incoming);
     const warnings=[...(remaining?[LOADING]:[]),...new Set([...(old.context.warnings??[]).filter(w=>w!==LOADING),...(value.warnings??[])])];
     return {identity,key:configKey,context:{...old.context,primary:value.primary,references:{...old.context.references,...value.references},sessions:query.benchmark?old.context.sessions:value.sessions??[],benchmarks:histories,warnings}};
    });
   },error=>{
    if(!alive)return;remaining--;
    setState(old=>old.key!==configKey?old:{...old,context:{...old.context,warnings:[...(remaining?[LOADING]:[]),...(old.context.warnings??[]).filter(w=>w!==LOADING),(error as Error).message]}});
   });
  }
  return()=>{alive=false;for(const lease of leases)lease.release();};
 },[identity,pane.timeframe,signature,adjusted,revision,tick,enabled]);
 const context:CustomContext=state.identity===identity&&state.key===configKey?state.context:{primary:pane};
 const benchmarkRows=useMemo(()=>Object.values(context.benchmarks??{}).map(v=>v.instrument).filter(v=>v?.provider==='hyperliquid') as SymbolEntry[],[context.benchmarks]);
 const receive=useCallback((frame:StreamFeed)=>setState(old=>{
  if(old.key!==configKey||frame.feed!=='candle'||frame.interval!==pane.timeframe)return old;
  const entries={...old.context.benchmarks};let changed=false;
  for(const [key,entry]of Object.entries(entries))if(entry.instrument?.canonical_id===frame.identity){entries[key]=applyBenchmarkFrame(entry,frame);changed=true;}
  return changed?{...old,context:{...old.context,benchmarks:entries}}:old;
 }),[configKey,pane.timeframe]);
 useWatchlistStream('reference:'+pane.id,benchmarkRows,enabled&&liveEnabled,receive,'candle',pane.timeframe);
 return context;
}
