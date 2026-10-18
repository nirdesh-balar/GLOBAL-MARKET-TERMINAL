/** E1 chart studies. Formula/seed conventions: PHASE67E1_FORMULAS.md.
 * Values are indexed by availability bar; visual displacement never changes inputs.
 * State is checkpointed BEFORE the forming bar so revisions cannot compound recursion.
 */
import type {Candle,IndicatorConfig} from '../types';
export const trendNames={HMA:'Hull Moving Average',ICHIMOKU:'Ichimoku Cloud',SAR:'Parabolic SAR',ADX:'Average Directional Index',ZIGZAG:'Zig Zag',AROON:'Aroon Up / Down / Oscillator',LINREG:'Linear Regression Line',CMO:'Chande Momentum Oscillator',DPO:'Detrended Price Oscillator',KAMA:"Kaufman’s Adaptive Moving Average",LSMA:'Least Squares Moving Average',MCGINLEY:'McGinley Dynamic',SMMA:'Smoothed Moving Average',TEMA:'Triple Exponential Moving Average',DEMA:'Double Exponential Moving Average',VORTEX:'Vortex Indicator'};
export const isTrend=(kind:string):kind is keyof typeof trendNames=>kind in trendNames;
type N=number|null;type Smooth={seed:number[];last:N};
export interface TrendState {e1?:Smooth;e2?:Smooth;e3?:Smooth;tr?:Smooth;plus?:Smooth;minus?:Smooth;adx?:Smooth;kama?:N;md?:N;sar?:{bull:boolean;ep:number;af:number;value:number}}
export interface TrendField {name:string;values:N[];offset?:number;dots?:boolean;mutable?:boolean;provisional?:boolean;known_at?:number[]}
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const valid=(r:Candle)=>['open','high','low','close'].every(k=>finite(r[k as 'open']))&&r.high>=Math.max(r.open,r.close,r.low)&&r.low<=Math.min(r.open,r.close,r.high);
const get=(r:Candle,c:IndicatorConfig):N=>!r||!valid(r)?null:c.source==='HL2'?(r.high+r.low)/2:c.source==='HLC3'?(r.high+r.low+r.close)/3:c.source==='OHLC4'?(r.open+r.high+r.low+r.close)/4:r[c.source];
const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
function sm(state:TrendState,key:keyof TrendState,x:N,n:number,wilder=false):N{let s=state[key] as Smooth|undefined;if(!s)s=(state as Record<string,unknown>)[key]={seed:[],last:null} as Smooth;if(x===null){s.seed=[];s.last=null;return null;}if(s.last===null){s.seed.push(x);if(s.seed.length===n)s.last=mean(s.seed);}else s.last+=(x-s.last)*(wilder?1/n:2/(n+1));return s.last;}
const safe=(x:N)=>x!==null&&finite(x)?x:null;
export function trendCalculate(rows:Candle[],c:IndicatorConfig,start=0,initial:TrendState={}):{fields:TrendField[];state:TrendState;beforeLast:TrendState}{
 let state=structuredClone(initial),beforeLast:TrendState={};const n=c.length,p=c.period,kind=c.kind;
 const fields=new Map<string,TrendField>();
 const put=(name:string,i:number,v:N,extra:Partial<TrendField>={})=>{let f=fields.get(name);if(!f){f={name,values:Array(rows.length).fill(null),...extra};fields.set(name,f);}f.values[i]=safe(v);};
 const xs=(end:number,count:number):number[]|null=>{if(end<count-1)return null;const a=rows.slice(end-count+1,end+1).map(r=>get(r,c));return a.some(v=>v===null)?null:a as number[];};
 const window=(i:number,count:number)=>{if(i<count-1)return null;const a=rows.slice(i-count+1,i+1);return a.every(valid)?a:null;};
 const wma=(i:number,count:number)=>{const a=xs(i,count);return a?a.reduce((s,v,j)=>s+v*(j+1),0)/(count*(count+1)/2):null;};
 const mid=(i:number,count:number)=>{const a=window(i,count);return a?(Math.max(...a.map(r=>r.high))+Math.min(...a.map(r=>r.low)))/2:null;};
 const reg=(i:number,count:number)=>{const a=xs(i,count);if(!a)return null;const xm=(count-1)/2,ym=mean(a),den=count*(count*count-1)/12,b=a.reduce((s,y,j)=>s+(j-xm)*(y-ym),0)/den;return {a:ym-b*xm,b};};
 if(kind==='ZIGZAG'){
  const confirmed:TrendField={name:'Confirmed pivots',values:Array(rows.length).fill(null),mutable:true,known_at:Array(rows.length).fill(0)},provisional:TrendField={name:'Provisional leg',values:Array(rows.length).fill(null),mutable:true,provisional:true};
  let last=-1,extreme=-1,dir=0,seed=-1;
  const threshold=(price:number)=>Math.abs(price)*(c.reversal??5)/100;
  const confirm=(idx:number,at:number)=>{confirmed.values[idx]=get(rows[idx],c);confirmed.known_at![idx]=rows[at].time;last=idx;};
  for(let i=0;i<rows.length;i++){const x=get(rows[i],c);if(x===null){seed=last=extreme=-1;dir=0;continue;}if(seed<0){seed=extreme=i;continue;}const s=get(rows[seed],c)!,e=get(rows[extreme],c)!;
   if(!dir){if(x>s&&x-s>=threshold(s)){confirm(seed,i);dir=1;extreme=i;}else if(x<s&&s-x>=threshold(s)){confirm(seed,i);dir=-1;extreme=i;}}
   else if(dir>0){if(x>=e)extreme=i;else if(e-x>=threshold(e)){confirm(extreme,i);dir=-1;extreme=i;}}
   else {if(x<=e)extreme=i;else if(x-e>=threshold(e)){confirm(extreme,i);dir=1;extreme=i;}}
  }
  if(last>=0&&extreme>=0){provisional.values[last]=get(rows[last],c);provisional.values[extreme]=get(rows[extreme],c);}
  // A threshold touched by a still-forming native candle is not a closed-bar confirmation.
  const tail=rows.at(-1);if(tail?.end_time&&tail.end_time>Date.now()/1000){
   const candidate=confirmed.known_at!.findIndex(t=>t===tail.time);
   if(candidate>=0){confirmed.values[candidate]=null;confirmed.known_at![candidate]=0;provisional.values[candidate]=get(rows[candidate],c);provisional.values[rows.length-1]=get(tail,c);let prior=candidate-1;while(prior>=0&&confirmed.values[prior]===null)prior--;if(prior>=0)provisional.values[prior]=confirmed.values[prior];}
  }
  return {fields:[confirmed,provisional],state:{},beforeLast:{}};
 }
 for(let i=start;i<rows.length;i++){
  if(i===rows.length-1)beforeLast=structuredClone(state);
  const r=rows[i],x=get(r,c),previous=i?rows[i-1]:undefined,continuous=x!==null&&previous&&valid(previous);
  if(x===null)state={};
  if(kind==='HMA'){const root=Math.max(1,Math.floor(Math.sqrt(n))),half=Math.max(1,Math.floor(n/2));const a=Array.from({length:root},(_,j)=>{const k=i-root+1+j,b=wma(k,n),h=wma(k,half);return b===null||h===null?null:2*h-b;});put('HMA',i,a.some(v=>v===null)?null:(a as number[]).reduce((s,v,j)=>s+v*(j+1),0)/(root*(root+1)/2));}
  else if(['SMMA','DEMA','TEMA'].includes(kind)){const a=sm(state,'e1',x,n,kind==='SMMA');if(kind==='SMMA')put('SMMA',i,a);else{const b=sm(state,'e2',a,n);if(kind==='DEMA')put('DEMA',i,a===null||b===null?null:2*a-b);else{const d=sm(state,'e3',b,n);put('TEMA',i,a===null||b===null||d===null?null:3*a-3*b+d);}}}
  else if(kind==='ICHIMOKU'){const a=mid(i,c.tenkan??9),b=mid(i,c.kijun??26);put('Tenkan',i,a);put('Kijun',i,b);put('Senkou A',i,a===null||b===null?null:(a+b)/2,{offset:c.displacement??26});put('Senkou B',i,mid(i,c.span_b??52),{offset:c.displacement??26});put('Chikou',i,x===null?null:r.close,{offset:-(c.displacement??26)});}
  else if(kind==='SAR'){
   if(!continuous){delete state.sar;put('SAR',i,null,{dots:true});continue;}
   if(!state.sar){const bull=r.close>previous!.close;state.sar={bull,ep:bull?r.high:r.low,af:c.acceleration??.02,value:bull?previous!.low:previous!.high};}
   else {const s=state.sar;let v=s.value+s.af*(s.ep-s.value);const prior2=i>1&&valid(rows[i-2])?rows[i-2]:previous!;
    if((s.bull&&r.low<v)||(!s.bull&&r.high>v)){v=s.ep;s.bull=!s.bull;s.ep=s.bull?r.high:r.low;s.af=c.acceleration??.02;}
    else {v=s.bull?Math.min(v,previous!.low,prior2.low):Math.max(v,previous!.high,prior2.high);if((s.bull&&r.high>s.ep)||(!s.bull&&r.low<s.ep)){s.ep=s.bull?r.high:r.low;s.af=Math.min(c.acceleration_max??.2,s.af+(c.acceleration_step??.02));}}s.value=v;
   }put('SAR',i,state.sar.value,{dots:true});
  }
  else if(kind==='ADX'){
   const tr=continuous?Math.max(r.high-r.low,Math.abs(r.high-previous!.close),Math.abs(r.low-previous!.close)):null,up=continuous?r.high-previous!.high:0,down=continuous?previous!.low-r.low:0;
   const t=sm(state,'tr',tr,p,true),pos=sm(state,'plus',tr===null?null:up>down&&up>0?up:0,p,true),neg=sm(state,'minus',tr===null?null:down>up&&down>0?down:0,p,true),di=t===null||pos===null?null:t===0?0:100*pos/t,dn=t===null||neg===null?null:t===0?0:100*neg/t,dx=di===null||dn===null?null:di+dn===0?0:100*Math.abs(di-dn)/(di+dn);put('+DI',i,di);put('-DI',i,dn);put('ADX',i,sm(state,'adx',dx,p,true));
  }
  else if(kind==='AROON'){const a=window(i,p+1);let up:N=null,down:N=null;if(a){let h=0,l=0;a.forEach((r,j)=>{if(r.high>=a[h].high)h=j;if(r.low<=a[l].low)l=j;});up=100*h/p;down=100*l/p;}put('Aroon up',i,up);put('Aroon down',i,down);put('Aroon oscillator',i,up===null||down===null?null:up-down);}
  else if(kind==='LINREG'){put('Regression fit',i,null,{mutable:true});}
  else if(kind==='LSMA'){const fit=reg(i,n);put('LSMA',i,fit?fit.a+fit.b*(n-1):null);}
  else if(kind==='CMO'){const a=xs(i,p+1);let v:N=null;if(a){let g=0,l=0;for(let j=1;j<a.length;j++){g+=Math.max(a[j]-a[j-1],0);l+=Math.max(a[j-1]-a[j],0);}v=g+l===0?0:100*(g-l)/(g+l);}put('CMO',i,v);}
  else if(kind==='DPO'){const a=xs(i,n),shift=Math.floor(n/2)+1,z=i>=shift?get(rows[i-shift],c):null;put('DPO',i,a&&z!==null?z-mean(a):null,{offset:c.centered?-shift:0});}
  else if(kind==='KAMA'){const a=xs(i,n+1);if(a){const vol=a.slice(1).reduce((s,v,j)=>s+Math.abs(v-a[j]),0),er=vol===0?0:Math.abs(a[n]-a[0])/vol,slow=2/((c.kama_slow??30)+1),sc=(er*(2/((c.kama_fast??2)+1)-slow)+slow)**2;state.kama=(state.kama??a[n-1])+sc*(x!-(state.kama??a[n-1]));}else state.kama=null;put('KAMA',i,state.kama??null);}
  else if(kind==='MCGINLEY'){if(state.md===undefined||state.md===null){const a=xs(i,n);state.md=a?mean(a):null;}else if(x===null||state.md===0||x===0)state.md=null;else{const den=(c.mcginley_factor??.6)*n*(x/state.md)**4;state.md=finite(den)&&den>0?safe(state.md+(x-state.md)/den):null;}put('McGinley',i,state.md??null);}
  else if(kind==='VORTEX'){const a=window(i,p+1);let pos:N=null,neg:N=null;if(a){let vm=0,vn=0,tr=0;for(let j=1;j<a.length;j++){vm+=Math.abs(a[j].high-a[j-1].low);vn+=Math.abs(a[j].low-a[j-1].high);tr+=Math.max(a[j].high-a[j].low,Math.abs(a[j].high-a[j-1].close),Math.abs(a[j].low-a[j-1].close));}if(tr>0){pos=vm/tr;neg=vn/tr;}}put('+VI',i,pos);put('-VI',i,neg);}
 }
 if(kind==='LINREG'){const fit=reg(rows.length-1,n),f=fields.get('Regression fit');if(f&&fit)for(let j=0;j<n;j++)f.values[rows.length-n+j]=fit.a+fit.b*j;}
 return {fields:[...fields.values()],state,beforeLast};
}
