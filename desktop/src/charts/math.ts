/** Shared nullable rolling/EMA/Wilder/RSI helpers, unchanged from E3A. */
type N=number|null;
export function rolling(values:N[],p:number,weighted=false):N[]{let total=0,weight=0,invalid=0;return values.map((x,i)=>{const v=x??0;if(weighted)weight=i>=p?weight-total+p*v:weight+(i+1)*v;total+=v;invalid+=x===null?1:0;if(i>=p){const old=values[i-p];total-=old??0;invalid-=old===null?1:0;}return i<p-1||invalid?null:weighted?weight/(p*(p+1)/2):total/p;});}
export const sma=(values:number[],p:number)=>rolling(values,p);
export function smooth(values:N[],p:number,wilder=false):N[]{let seed:number[]=[],last:N=null;const alpha=wilder?1/p:2/(p+1);return values.map(x=>{if(x===null){seed=[];last=null;return null;}if(last===null){seed.push(x);if(seed.length===p)last=seed.reduce((a,b)=>a+b,0)/p;}else last=x*alpha+last*(1-alpha);return last;});}
export const ema=(values:number[],p:number)=>smooth(values,p);
export function rsi(values:number[],p=14):N[]{const gains:N[]=[null,...values.slice(1).map((b,i)=>Math.max(0,b-values[i]))],losses:N[]=[null,...values.slice(1).map((b,i)=>Math.max(0,values[i]-b))];const g=smooth(gains,p,true),l=smooth(losses,p,true);return g.map((a,i)=>a===null?null:a===0&&l[i]===0?50:l[i]===0?100:100-100/(1+a/l[i]!));}
