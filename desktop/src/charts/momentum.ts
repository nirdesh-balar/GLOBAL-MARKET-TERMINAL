/** E2 causal bar-indexed studies. See PHASE67E2_FORMULAS.md for warmups/units.
 * Recursive state resumes BEFORE a forming bar; derived windows are bounded.
 */
import type {Candle,IndicatorConfig,Timeframe} from '../types';
import type {Study} from './indicators';
type N=number|null;
export const momentumNames={STOCH:'Stochastic Oscillator',CCI:'Commodity Channel Index',ROC:'Rate of Change',AO:'Awesome Oscillator',MOM:'Momentum',WILLR:'Williams %R',ULTOSC:'Ultimate Oscillator',TSI:'True Strength Index',FISHER:'Fisher Transform',PPO:'Percentage Price Oscillator',KST:'Know Sure Thing',COPPOCK:'Coppock Curve',CKS:'Chande Kroll Stop',KC:'Keltner Channels',DC:'Donchian Channels',STDDEV:'Standard Deviation',HV:'Historical Volatility',CHAIKIN_VOL:'Chaikin Volatility',CHOP:'Choppiness Index',MASS:'Mass Index'};
export const isMomentum=(k:string):k is keyof typeof momentumNames=>k in momentumNames;
export const e2Overlays=['CKS','KC','DC'];
export const e2Defaults:Partial<Record<keyof typeof momentumNames,Partial<IndicatorConfig>>>={STOCH:{stoch_period:14,k:3,d:3},CCI:{length:20,source:'HLC3'},ROC:{length:9},AO:{fast:5,slow:34,source:'HL2'},MOM:{length:10},WILLR:{length:14},TSI:{fast:13,slow:25,signal:13},FISHER:{length:9,source:'HL2'},PPO:{fast:12,slow:26,signal:9},COPPOCK:{fast:11,slow:14,length:10},CKS:{length:10,period:10,multiplier:1,stop_period:9},KC:{length:20,period:10,multiplier:2},DC:{length:20},STDDEV:{length:20},HV:{length:20,sample:true},CHAIKIN_VOL:{length:10,period:10},CHOP:{length:14},MASS:{length:25,period:9}};
export const e2Levels:Record<string,number[]>={STOCH:[20,80],CCI:[-100,0,100],ROC:[0],AO:[0],MOM:[0],WILLR:[-80,-20],ULTOSC:[30,70],TSI:[-25,0,25],FISHER:[-1.5,0,1.5],PPO:[0],KST:[0],COPPOCK:[0],CHAIKIN_VOL:[0],CHOP:[38.2,61.8],MASS:[26.5,27]};
export interface E2State {smooth:Record<string,{seed:number[];last:N}>;windows:Record<string,N[]>;fisher?:{x:number;last:number;ready:boolean}}
export interface E2Field {name:string;values:N[];histogram:boolean}
const fresh=():E2State=>({smooth:{},windows:{}});
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const valid=(r:Candle|undefined):r is Candle=>!!r&&['open','high','low','close'].every(k=>finite(r[k as 'open']))&&r.high>=Math.max(r.open,r.close,r.low)&&r.low<=Math.min(r.open,r.close,r.high);
const get=(r:Candle|undefined,c:IndicatorConfig):N=>!valid(r)?null:c.source==='HL2'?(r.high+r.low)/2:c.source==='HLC3'?(r.high+r.low+r.close)/3:c.source==='OHLC4'?(r.open+r.high+r.low+r.close)/4:r[c.source];
const ratio=(a:N,b:N,scale=1):N=>a===null||b===null||b===0?null:scale*a/b;
const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
export function annualFactor(c:IndicatorConfig,interval:Timeframe){const mode=c.annualization??'per_bar';if(mode==='per_bar')return 1;if(mode==='custom')return c.annual_bars??252;const days=mode==='crypto'?365:c.annual_days??252,minutes=mode==='crypto'?1440:c.session_minutes??390;return interval==='1d'?days:interval==='1w'?days/(mode==='crypto'?7:5):interval==='1M'?12:days*minutes/({'1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240}[interval]);}
export function momentumCalculate(rows:Candle[],c:IndicatorConfig,interval:Timeframe='1d',start=0,initial:E2State=fresh()){
 let state=structuredClone(initial),beforeLast=fresh();const fields=new Map<string,E2Field>(),n=c.length,p=c.period,kind=c.kind;
 const put=(name:string,i:number,value:N,histogram=false)=>{let f=fields.get(name);if(!f){f={name,values:Array(rows.length).fill(null),histogram};fields.set(name,f);}f.values[i]=value!==null&&finite(value)?value:null;};
 const window=(i:number,length:number)=>{if(i<length-1)return null;const a=rows.slice(i-length+1,i+1);return a.every(valid)?a:null;};
 const xs=(i:number,length:number)=>window(i,length)?.map(r=>get(r,c)!)??null;
 const extrema=(i:number,length:number)=>{const a=window(i,length);return a?{hi:Math.max(...a.map(r=>r.high)),lo:Math.min(...a.map(r=>r.low))}:null;};
 const roc=(i:number,length:number)=>{const a=xs(i,length+1);return a?ratio(a.at(-1)!-a[0],a[0],100):null;};
 const sm=(key:string,x:N,length:number,wilder=false):N=>{const s=state.smooth[key]??(state.smooth[key]={seed:[],last:null});if(x===null){s.seed=[];s.last=null;return null;}if(s.last===null){s.seed.push(x);if(s.seed.length===length)s.last=mean(s.seed);}else s.last+=(x-s.last)*(wilder?1/length:2/(length+1));return s.last;};
 const queue=(key:string,x:N,length:number)=>{const a=state.windows[key]??(state.windows[key]=[]);a.push(x);if(a.length>length)a.shift();return a.length===length&&a.every(v=>v!==null)?a as number[]:null;};
 const avg=(key:string,x:N,length:number,weighted=false):N=>{const a=queue(key,x,length);return a?weighted?a.reduce((s,v,j)=>s+v*(j+1),0)/(length*(length+1)/2):mean(a):null;};
 for(let i=start;i<rows.length;i++){
  if(i===rows.length-1)beforeLast=structuredClone(state);
  const r=rows[i],x=get(r,c),prev=rows[i-1];if(x===null)state=fresh();
  const tr=x===null?null:valid(prev)?Math.max(r.high-r.low,Math.abs(r.high-prev.close),Math.abs(r.low-prev.close)):r.high-r.low;
  if(kind==='STOCH'||kind==='WILLR'||kind==='DC'){
   const a=extrema(i,kind==='STOCH'?c.stoch_period:n);
   if(kind==='DC'){put('Donchian upper',i,a?.hi??null);put('Donchian middle',i,a?(a.hi+a.lo)/2:null);put('Donchian lower',i,a?.lo??null);}
   else {const raw=x===null||!a||a.hi===a.lo?null:kind==='STOCH'?100*(x-a.lo)/(a.hi-a.lo):-100*(a.hi-x)/(a.hi-a.lo);if(kind==='WILLR')put('Williams %R',i,raw);else{const k=avg('k',raw,c.k);put('Stochastic %K',i,k);put('Stochastic %D',i,avg('d',k,c.d));}}
  }else if(kind==='CCI'){const a=xs(i,n),m=a?mean(a):0;put('CCI',i,a?ratio(a.at(-1)!-m,a.reduce((s,v)=>s+Math.abs(v-m),0)/n,1/.015):null);}
  else if(kind==='ROC')put('ROC',i,roc(i,n));
  else if(kind==='MOM'){const a=xs(i,n+1);put('Momentum',i,a?a.at(-1)!-a[0]:null);}
  else if(kind==='AO'){const a=xs(i,c.fast),b=xs(i,c.slow);put('Awesome Oscillator',i,a&&b?mean(a)-mean(b):null,true);}
  else if(kind==='ULTOSC'){
   const bp=x!==null&&valid(prev)?r.close-Math.min(r.low,prev.close):null;const parts=(c.ultimate_periods??[7,14,28]).map((length,j)=>ratio(avg('bp'+j,bp,length),avg('tr'+j,valid(prev)?tr:null,length)));put('Ultimate Oscillator',i,parts.every(v=>v!==null)?100*(4*parts[0]!+2*parts[1]!+parts[2]!)/7:null);
  }else if(kind==='TSI'){const old=get(prev,c),delta=x===null||old===null?null:x-old,a=sm('d2',sm('d1',delta,c.slow),c.fast),b=sm('a2',sm('a1',delta===null?null:Math.abs(delta),c.slow),c.fast),tsi=ratio(a,b,100);put('TSI',i,tsi);put('TSI signal',i,sm('signal',tsi,c.signal));}
  else if(kind==='FISHER'){const a=xs(i,n);let f:N=null,t:N=null;if(!a||Math.max(...a)===Math.min(...a))delete state.fisher;else{const s=state.fisher??{x:0,last:0,ready:false};s.x=Math.max(-.999,Math.min(.999,.33*2*((a.at(-1)!-Math.min(...a))/(Math.max(...a)-Math.min(...a))-.5)+.67*s.x));f=.5*Math.log((1+s.x)/(1-s.x))+.5*s.last;t=s.ready?s.last:null;s.last=f;s.ready=true;state.fisher=s;}put('Fisher',i,f);put('Fisher trigger',i,t);}
  else if(kind==='PPO'){const a=sm('fast',x,c.fast),b=sm('slow',x,c.slow),v=a===null||b===null?null:ratio(a-b,b,100),s=sm('signal',v,c.signal);put('PPO',i,v);put('PPO signal',i,s);put('PPO histogram',i,v===null||s===null?null:v-s,true);}
  else if(kind==='KST'){const a=(c.roc_lengths??[10,15,20,30]).map((length,j)=>avg('kst'+j,roc(i,length),(c.kst_smoothing??[10,10,10,15])[j]));const v=a.every(v=>v!==null)?a.reduce((s,v,j)=>s+(j+1)*v!,0):null;put('KST',i,v);put('KST signal',i,avg('signal',v,c.signal));}
  else if(kind==='COPPOCK'){const a=roc(i,c.fast),b=roc(i,c.slow);put('Coppock',i,avg('coppock',a===null||b===null?null:a+b,n,true));}
  else if(kind==='CKS'||kind==='KC'){const atr=sm('atr',tr,p,true);if(kind==='KC'){const m=sm('middle',x,n);put('Keltner upper',i,m===null||atr===null?null:m+c.multiplier*atr);put('Keltner middle',i,m);put('Keltner lower',i,m===null||atr===null?null:m-c.multiplier*atr);}else{const a=extrema(i,n),up=queue('long',a&&atr!==null?a.hi-c.multiplier*atr:null,c.stop_period??9),dn=queue('short',a&&atr!==null?a.lo+c.multiplier*atr:null,c.stop_period??9);put('CKS short stop',i,up?Math.max(...up):null);put('CKS long stop',i,dn?Math.min(...dn):null);}}
  else if(kind==='STDDEV'||kind==='HV'){let a=xs(i,n);if(kind==='HV'){const old=get(prev,c),log=(c.hv_returns??'log')==='log',ret=x===null||old===null||old===0||(log&&(x<=0||old<=0))?null:log?Math.log(x/old):(x-old)/old;a=queue('returns',ret,n);}const m=a?mean(a):0;put(kind==='HV'?'Historical Volatility':'Standard Deviation',i,a?Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(n-(c.sample?1:0)))*(kind==='HV'?100*Math.sqrt(annualFactor(c,interval)):1):null);}
  else if(kind==='CHAIKIN_VOL'){const a=sm('range',x===null?null:r.high-r.low,n),q=queue('rangeLag',a,p+1);put('Chaikin Volatility',i,q?ratio(q.at(-1)!-q[0],q[0],100):null);}
  else if(kind==='CHOP'){const a=extrema(i,n),sum=avg('tr',tr,n);put('Choppiness',i,a&&a.hi!==a.lo&&sum!==null&&sum>0?100*Math.log10(sum*n/(a.hi-a.lo))/Math.log10(n):null);}
  else if(kind==='MASS'){const a=sm('range1',x===null?null:r.high-r.low,p),b=sm('range2',a,p),v=avg('mass',ratio(a,b),n);put('Mass Index',i,v===null?null:v*n);}
 }
 if(!rows.length){const dummy=momentumCalculate([{time:1,open:1,high:2,low:0,close:1,volume:null}],c,interval);for(const f of dummy.fields)fields.set(f.name,{...f,values:[]});}
 return {fields:[...fields.values()],state,beforeLast};
}
export function momentumStudies(rows:Candle[],c:IndicatorConfig,fields:E2Field[]):Study[]{
 const out:Study[]=[],overlay=e2Overlays.includes(c.kind);
 for(const f of fields){const o=c.line_options?.[f.name]??{};if(o.visible===false)continue;const name=f.name,color=name.endsWith('upper')?c.upper_color:name.endsWith('lower')?c.lower_color:name==='CKS long stop'?c.up_color:name==='CKS short stop'?c.down_color:name.endsWith('signal')||name.endsWith('%D')||name.endsWith('trigger')?c.signal_color:f.histogram?c.up_color:c.color;
 out.push({id:c.id,name,pane:overlay?'main':'e2:'+c.id,histogram:f.histogram,linear_scale:!overlay,vector:overlay,color:o.color??color,down_color:f.histogram?c.down_color:undefined,width:o.width??c.width,style:o.style??c.style,opacity:o.opacity??c.opacity??1,points:rows.map((r,i)=>({time:r.time,value:f.values[i]})),levels:out.length?[]:c.reference_levels??e2Levels[c.kind]??[]});}
 const upper=out.find(s=>s.name.endsWith('upper')),lower=out.find(s=>s.name.endsWith('lower'));if(upper&&lower)upper.cloud={peer:lower.points,up:c.upper_color,down:c.lower_color,opacity:c.cloud_opacity??.16};return out;
}
