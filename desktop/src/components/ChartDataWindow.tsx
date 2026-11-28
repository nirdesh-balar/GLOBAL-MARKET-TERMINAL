import {useEffect,useState} from 'react';
import {X} from 'lucide-react';
import type {Candle,Pane} from '../types';
import {marketIdentity} from '../providers/label';
import {price,symbolLabel} from '../services/api';

export interface CandleInspection {
  pane:string; instrument:string; interval:string; zone:string; currency:string; precision:number;
  candle:Candle|null; previous:Candle|null; source:string; stale:boolean; hovered:boolean; replay:boolean;
  dividend:{date:string;amount:number}[];
}

export function ChartDataWindow({pane,onClose}:{pane:Pane;onClose:()=>void}){
  const [data,setData]=useState<CandleInspection|null>(null);
  const identity=pane.canonical_id||pane.instrument_id||pane.symbol;
  useEffect(()=>{
    const inspect=(event:Event)=>{
      const value=(event as CustomEvent<CandleInspection>).detail;
      if(value.pane===pane.id&&value.instrument===identity&&value.interval===pane.timeframe)setData(value);
    };
    window.addEventListener('gmt-inspect-candle',inspect);
    window.dispatchEvent(new CustomEvent('gmt-request-inspection',{detail:pane.id}));
    return()=>window.removeEventListener('gmt-inspect-candle',inspect);
  },[pane.id,identity,pane.timeframe]);
  const current=data?.pane===pane.id&&data.instrument===identity&&data.interval===pane.timeframe?data:null;
  const candle=current?.candle;
  const precision=current?.precision??pane.precision??2;
  const format=(value:number|null|undefined)=>value!=null&&Number.isFinite(value)?price(value,precision):'—';
  const previous=current?.previous?.close;
  const change=candle&&previous!=null?candle.close-previous:null;
  return <aside className="chart-data-window" aria-label="Data Window" data-testid="chart-data-window" data-candle-time={candle?.time}>
    <header><h2>Data Window</h2><button aria-label="Close Data Window" onClick={onClose}><X size={16}/></button></header>
    <div className="data-window-body">
      <strong>{pane.kind==='index'?pane.name:symbolLabel(pane.symbol)}</strong>
      <p className="data-window-source">{[marketIdentity(pane),pane.timeframe,current?.source,current?.currency].filter(Boolean).join(' · ')}</p>
      {candle&&current ? <>
        <p className="data-window-time">{new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:
          ['1d','1w','1M','1Y'].includes(current.interval)?undefined:'short',timeZone:current.zone}).format(candle.time*1000)} · {current.zone}</p>
        <p className="data-window-source">{current.hovered?'Crosshair bar':'Latest displayed bar'}{current.replay?' · Replay':''}{current.stale?' · Stale history':''}{candle.partial?' · Partial':''}</p>
        <dl>{(['open','high','low','close'] as const).map(key=><div key={key}><dt>{key}</dt><dd data-testid={'inspect-'+key}>{format(candle[key])}</dd></div>)}
          <div><dt>Bar change</dt><dd>{format(change)}{change!==null&&previous!==undefined&&previous!==0?' ('+(change/Math.abs(previous)*100).toFixed(2)+'%)':''}</dd></div>
          <div><dt>Volume</dt><dd>{candle.volume==null?'—':new Intl.NumberFormat('en-IN',{maximumFractionDigits:8}).format(candle.volume)}</dd></div>
        </dl>
        {current.dividend.length>0&&<ul className="data-window-events" aria-label="Provider dividends">{current.dividend.map(item=><li key={item.date}>Dividend · {item.date} · {format(item.amount)} {current.currency}</li>)}</ul>}
      </>:<p role="status">No candle data available.</p>}
    </div>
  </aside>;
}
