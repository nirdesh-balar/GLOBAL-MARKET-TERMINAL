import type {Candle,DrawingParameters} from '../types';
export const volumeTools=new Set(['anchored_vwap','fixed_volume_profile','anchored_volume_profile']);
export function validOHLC(r:Pick<Candle,'open'|'high'|'low'|'close'>){return [r.open,r.high,r.low,r.close].every(Number.isFinite)&&r.high>=Math.max(r.open,r.close,r.low)&&r.low<=Math.min(r.open,r.close);}
/** Cash multiplier and currency rate are explicit calibrations; neither is inferred from a Yahoo symbol. */
export function position(entry:number,stop:number,target:number,short:boolean,p:DrawingParameters){
 const direction=short?-1:1,risk=(entry-stop)*direction,reward=(target-entry)*direction,conventional=risk>0&&reward>0;
 const multiplier=(p.unit_multiplier??1)*(p.money_rate??1),budget=(p.account_size??0)*(p.risk_percent??0)/100;
 const unitRisk=Math.abs(entry-stop),cashRisk=unitRisk*multiplier,step=p.lot_step??1;
 const raw=cashRisk>0?budget/cashRisk:null,quantity=!p.sizing_confirmed?null:p.auto_size!==false?(raw===null?null:Math.floor(raw/step+1e-12)*step):Math.floor((p.position_size??0)/step+1e-12)*step;
 const finite=(v:number|null)=>v!==null&&Number.isFinite(v)?v:null;
 return {conventional,risk:unitRisk,reward,ratio:risk>0?reward/risk:null,riskPercent:entry===0?null:unitRisk/Math.abs(entry)*100,rewardPercent:entry===0?null:reward/Math.abs(entry)*100,quantity:finite(quantity),riskCash:finite(quantity===null?null:quantity*cashRisk),stopPL:finite(quantity===null?null:(stop-entry)*direction*multiplier*quantity),targetPL:finite(quantity===null?null:reward*multiplier*quantity)};
}
export function parseGhost(text:string){
 if(text.length>2000)throw Error('Hypothetical candle text exceeds 2000 characters');
 const lines=text.trim().split('\n');if(!text.trim()||lines.length>128)throw Error('Use 1–128 hypothetical candles');
 const candles=lines.map(line=>{const tokens=line.split(',');if(tokens.length!==5||tokens.some(t=>!t.trim()))throw Error('Each candle needs bar, openΔ, highΔ, lowΔ, closeΔ');const [bar,open,high,low,close]=tokens.map(Number);if(!Number.isFinite(bar)||Math.abs(bar)>10000||!validOHLC({open,high,low,close}))throw Error('Use finite valid hypothetical OHLC offsets and bar offsets within ±10000');return {bar,open,high,low,close};});
 if(candles.some((v,i)=>i>0&&v.bar<=candles[i-1].bar))throw Error('Hypothetical bar offsets must be strictly increasing');return candles;
}
export function volumeError(rows:Candle[]){if(!rows.length)return 'Select supplied historical candles.';if(rows.some(r=>!validOHLC(r)||r.volume===null||!Number.isFinite(r.volume)||r.volume!<0))return 'Missing or invalid OHLCV in the selected range. Choose a valid range; no volume is invented.';if(!rows.some(r=>r.volume!>0))return 'No positive volume in the selected range.';return null;}
export const priceSources=['HLC3','O','H','L','C','HL2','OHLC4'];
export function sourcePrice(r:Candle,source:string){switch(source){case 'O':return r.open;case 'H':return r.high;case 'L':return r.low;case 'C':return r.close;case 'HL2':return (r.high+r.low)/2;case 'OHLC4':return (r.open+r.high+r.low+r.close)/4;case 'HLC3':return (r.high+r.low+r.close)/3;default:throw Error('Unknown VWAP price source');}}
/** Stable weighted Welford moments; zero volume adds no weight and retains the last value. */
export function anchoredVWAP(rows:Candle[],source='HLC3'){
 const error=volumeError(rows);if(error)return {error,points:[]};let weight=0,mean=0,m2=0;
 const points=rows.map(r=>{const v=r.volume!,price=sourcePrice(r,source);if(v>0){const next=weight+v,delta=price-mean;mean+=v/next*delta;m2+=v*delta*(price-mean);weight=next;}return {time:r.time,value:weight?mean:null,deviation:weight?Math.sqrt(Math.max(0,m2/weight)):null,volume:weight};});return {error:null,points};
}
/** Uniform volume across the candle high/low, weighted by overlap. This is explicitly an estimate. */
export function estimatedProfile(rows:Candle[],bins=24,valueArea=70){
 const error=volumeError(rows);if(error)return {error,rows:[],poc:null,vah:null,val:null,total:0,covered:0};
 if(!Number.isInteger(bins)||bins<2||bins>128||!Number.isFinite(valueArea)||valueArea<1||valueArea>100)throw Error('Invalid volume profile configuration');
 const contributing=rows.filter(r=>r.volume!>0),low=Math.min(...contributing.map(r=>r.low)),high=Math.max(...contributing.map(r=>r.high)),flat=high===low,step=flat?0:(high-low)/bins;
 const profile=Array.from({length:flat?1:bins},(_,i)=>({low:low+i*step,high:low+(i+1)*step,volume:0,inArea:false}));let total=0;
 for(const r of contributing){total+=r.volume!;if(r.high===r.low||flat){profile[flat?0:Math.min(bins-1,Math.floor((r.low-low)/step))].volume+=r.volume!;continue;}
  const from=Math.max(0,Math.floor((r.low-low)/step)),to=Math.min(bins-1,Math.floor((r.high-low)/step));
  for(let i=from;i<=to;i++){const overlap=Math.max(0,Math.min(r.high,profile[i].high)-Math.max(r.low,profile[i].low));profile[i].volume+=r.volume!*overlap/(r.high-r.low);}
 }
 // Lowest-price POC on ties; adjacent larger row wins, then nearer POC, then lower row.
 let pocIndex=0;for(let i=1;i<profile.length;i++)if(profile[i].volume>profile[pocIndex].volume)pocIndex=i;
 let left=pocIndex,right=pocIndex,covered=profile[pocIndex].volume;const target=total*valueArea/100;
 while(covered+total*1e-12<target&&(left>0||right<profile.length-1)){const below=left>0?profile[left-1].volume:-1,above=right<profile.length-1?profile[right+1].volume:-1;if(below>above||below===above&&pocIndex-left<=right-pocIndex)covered+=profile[--left].volume;else covered+=profile[++right].volume;}
 profile.forEach((r,i)=>r.inArea=i>=left&&i<=right);return {error:null,rows:profile,poc:(profile[pocIndex].low+profile[pocIndex].high)/2,vah:profile[right].high,val:profile[left].low,total,covered};
}
// Runtime-only calculation memo. Weak row keys disappear with the history/replay arrays; bounded per-array LRU.
const cache=new WeakMap<Candle[],Map<string,unknown>>();
export function memoAnalysis<T>(rows:Candle[],key:string,calculate:()=>T):T{let map=cache.get(rows);if(!map){map=new Map();cache.set(rows,map);}if(map.has(key)){const value=map.get(key) as T;map.delete(key);map.set(key,value);return value;}const value=calculate();map.set(key,value);if(map.size>64)map.delete(map.keys().next().value!);return value;}
