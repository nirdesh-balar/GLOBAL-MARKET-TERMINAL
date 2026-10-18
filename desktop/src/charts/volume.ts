/** E3A causal volume math. Financial definitions/units: PHASE67E3A_FORMULAS.md. */
import type {Candle,IndicatorConfig,MarketMetadata} from '../types';
import type {Study} from './indicators';
type N=number|null;
export const volumeNames={OBV:'On-Balance Volume',CMF:'Chaikin Money Flow',MFI:'Money Flow Index',ADL:'Accumulation/Distribution Line',VO:'Volume Oscillator',EOM:'Ease of Movement',NVI:'Negative Volume Index',PVI:'Positive Volume Index',PVT:'Price Volume Trend',TMF:'Twiggs Money Flow',VROC:'Volume Rate of Change'};
export const isVolume=(k:string):k is keyof typeof volumeNames=>k in volumeNames;
export const volumeDefaults:Partial<Record<keyof typeof volumeNames,Partial<IndicatorConfig>>>={CMF:{length:20},MFI:{length:14,source:'HLC3'},VO:{fast:5,slow:10},EOM:{length:14},TMF:{length:21},VROC:{length:12}};
export const volumeLevels:Record<string,number[]>={CMF:[0],MFI:[20,80],VO:[0],EOM:[0],TMF:[0],VROC:[0]};
export interface VolumeContext {volume_unit?:string;zero_volume_is_missing?:boolean}
export function volumeContext(m:Partial<MarketMetadata>&{kind?:string}):VolumeContext{return {volume_unit:m.provider==='hyperliquid'?`${m.base_asset||'native base asset'} base units`:['equity','etf','fund'].includes(m.kind??'')?'shares (provider reported)':m.kind==='future'?'futures volume (provider units unconfirmed)':m.kind==='forex'?'FX volume (provider units unconfirmed)':m.kind==='index'?'index volume (provider units unconfirmed)':'provider volume units (unspecified)',zero_volume_is_missing:['forex','index'].includes(m.kind??'')};}
export function volumeUnits(c:IndicatorConfig,ctx:VolumeContext={}){const k=c.kind,u=ctx.volume_unit??'provider volume units (unspecified)';return k==='CMF'?'ratio':['MFI','TMF','VROC'].includes(k)||k==='VO'&&(c.volume_osc_mode??'percent')==='percent'?'%':['NVI','PVI'].includes(k)?`index (seed ${c.volume_seed??1000})`:k==='EOM'?'price² × divisor / '+u:u;}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export const volumeGood=(r:Candle|undefined,ctx:VolumeContext={}):r is Candle=>!!r&&['open','high','low','close','volume'].every(k=>finite(r[k as 'open']))&&r.volume!>=0&&!(ctx.zero_volume_is_missing&&r.volume===0)&&r.high>=Math.max(r.open,r.close,r.low)&&r.low<=Math.min(r.open,r.close,r.high);
export interface VolumeState {smooth:Record<string,{seed:number[];last:N}>;windows:Record<string,N[]>;total?:N;broken?:boolean;invalidSeen?:boolean}
const fresh=():VolumeState=>({smooth:{},windows:{}});
export function volumeCalculate(rows:Candle[],c:IndicatorConfig,ctx:VolumeContext={},start=0,initial:VolumeState=fresh()){
 const state=structuredClone(initial),values:N[]=Array(rows.length).fill(null);let beforeLast=fresh();const k=c.kind,n=c.length;
 const div=(a:N,b:N):N=>a===null||b===null||b===0?null:a/b;
 const avg=(key:string,x:N,p:number):N=>{const a=state.windows[key]??(state.windows[key]=[]);a.push(x);if(a.length>p)a.shift();return a.length===p&&a.every(x=>x!==null)?(a as number[]).reduce((a,b)=>a+b,0)/p:null;};
 const smooth=(key:string,x:N,p:number,wilder=false):N=>{const s=state.smooth[key]??(state.smooth[key]={seed:[],last:null});if(x===null){s.seed=[];s.last=null;return null;}if(s.last===null){s.seed.push(x);if(s.seed.length===p)s.last=s.seed.reduce((a,b)=>a+b,0)/p;}else s.last+=(x-s.last)*(wilder?1/p:2/(p+1));return s.last;};
 const price=(r:Candle|undefined):N=>!volumeGood(r,ctx)?null:c.source==='HL2'?(r.high+r.low)/2:c.source==='HLC3'?(r.high+r.low+r.close)/3:c.source==='OHLC4'?(r.open+r.high+r.low+r.close)/4:r[c.source];
 for(let i=start;i<rows.length;i++){
  if(i===rows.length-1)beforeLast=structuredClone(state);
  const r=rows[i],old=rows[i-1],ok=volumeGood(r,ctx),prior=volumeGood(old,ctx),v=ok?r.volume!:null,x=price(r),p=price(old);let value:N=null;
  if(!ok)state.invalidSeen=true;
  const flow=(trueRange=false):N=>{if(!ok||trueRange&&!prior)return null;const hi=trueRange?Math.max(r.high,old.close):r.high,lo=trueRange?Math.min(r.low,old.close):r.low;return hi===lo?0:((r.close-lo)-(hi-r.close))/(hi-lo)*v!;};
  if(['OBV','ADL','NVI','PVI','PVT'].includes(k)){
   if(!ok)state.broken=true;
   if(!state.broken){if(i===0)state.total=k==='ADL'?flow():['NVI','PVI'].includes(k)?c.volume_seed??1000:0;
    else if(k==='ADL')state.total=state.total!+flow()!;
    else if(k==='OBV')state.total=state.total!+v!*(x!>p!?1:x!<p!?-1:0);
    else {const changes=k==='PVT'||(k==='NVI'?v!<old.volume!:v!>old.volume!);if(changes){if(p===null||p===0)state.broken=true;else state.total=state.total!+(k==='PVT'?v!:state.total!)*(x!-p)/p;}}
    if(!finite(state.total))state.broken=true;
   }value=state.broken?null:state.total??null;
  }else if(k==='CMF')value=div(avg('flow',flow(),n),avg('vol',v,n));
  else if(k==='MFI'){const good=x!==null&&p!==null&&x>=0&&p>=0,a=avg('pos',good?(x!>p!?x!*v!:0):null,n),b=avg('neg',good?(x!<p!?x!*v!:0):null,n);value=a===null||b===null?null:div(100*a,a+b);}
  else if(k==='VO'){const ma=c.volume_ma==='sma'?avg:smooth,a=ma('fast',v,c.fast),b=ma('slow',v,c.slow);value=a===null||b===null?null:(c.volume_osc_mode??'percent')==='percent'?div(100*(a-b),b):a-b;}
  else if(k==='EOM'){const raw=!ok||!prior||v===0?null:((r.high+r.low-old.high-old.low)/2)*(r.high-r.low)*(c.eom_divisor??100000000)/v!;value=avg('eom',raw,n);}
  else if(k==='TMF'){const a=smooth('flow',flow(true),n,true),b=smooth('vol',prior?v:null,n,true),d=div(a,b);value=d===null?null:100*d;}
  else {const a=rows.slice(Math.max(0,i-n),i+1);value=a.length===n+1&&a.every(r=>volumeGood(r,ctx))?div(100*(v!-a[0].volume!),a[0].volume!):null;}
  values[i]=value!==null&&finite(value)?value:null;
 }return {values,state,beforeLast};
}
export function volumeStudies(rows:Candle[],c:IndicatorConfig,values:N[],ctx:VolumeContext={}):Study[]{const o=c.line_options?.[c.kind]??{};if(o.visible===false)return [];return [{id:c.id,name:c.kind,pane:'e3a:'+c.id,histogram:false,linear_scale:true,units:volumeUnits(c,ctx),color:o.color??c.color,width:o.width??c.width,style:o.style??c.style,opacity:o.opacity??c.opacity??1,levels:c.reference_levels??volumeLevels[c.kind]??[],points:rows.map((r,i)=>({time:r.time,value:values[i]}))}];}
export function volumeWarning(rows:Candle[],c:IndicatorConfig,ctx:VolumeContext={}){return rows.some(r=>!volumeGood(r,ctx))?`${c.id}: Missing/invalid volume or OHLC; unknown volume is not zero. Cumulative studies remain unavailable after an unknown contribution; rolling studies require complete windows.`:`${c.id}: Volume study unavailable: insufficient history or undefined denominator/return.`;}
export const volumeAliases:Record<string,string[]>={ADL:['A/D','AD','Accumulation Distribution'],VO:['PVO','Percentage Volume Oscillator'],EOM:['EMV'],PVT:['VPT','Volume Price Trend'],TMF:['Twiggs']};
