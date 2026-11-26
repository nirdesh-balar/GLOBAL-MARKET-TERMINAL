import type {Candle} from '../types';

export const COMPARISON_LIMIT=3;

/** Use a common observed timestamp and leave dates without a close unfilled. */
export function compareReturns(primary:Candle[],other:Candle[][]){
  const indexed=other.map(rows=>new Map(rows.map(row=>[row.time,row.close])));
  const usable=(n:number|undefined)=>n!==undefined&&Number.isFinite(n)&&n>0;
  const base=primary.find(row=>usable(row.close)&&indexed.every(series=>usable(series.get(row.time))));
  if(!base)return null;
  const points=primary.slice(primary.indexOf(base));
  const values=(start:number,at:(row:Candle)=>number|undefined)=>points.map(row=>{
    const close=at(row);
    return usable(close)?{time:row.time,value:(close!/start-1)*100}:{time:row.time};
  });
  return {base:base.time,primary:values(base.close,row=>row.close),
    comparisons:indexed.map(series=>values(series.get(base.time)!,row=>series.get(row.time)))};
}
