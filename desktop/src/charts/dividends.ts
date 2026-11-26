import type {Candle,HistoryResult} from '../types';
import {marketDay} from '../services/marketTime';

export function chartDividends(rows:Candle[],history:HistoryResult|null,replaying:boolean){
  if(replaying||history?.source!=='YAHOO FINANCE'||history.interval!=='1d'||!history.actions.length)return [];
  // Daily provider bars have a UTC trading-date timestamp. Match supplied dates
  // exactly, so a dividend can never appear on a nearby but unrelated session.
  const days=new Map(rows.map(row=>[marketDay(row.time,'UTC'),row.time]));
  return history.actions.flatMap(action=>{
    const time=days.get(action.date);
    return time!==undefined&&Number.isFinite(action.dividend)&&action.dividend>0?
      [{time,date:action.date,amount:action.dividend}]:[];
  }).sort((a,b)=>a.time-b.time);
}
