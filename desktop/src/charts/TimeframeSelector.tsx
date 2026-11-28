import type {Timeframe} from '../types';
export const frames:Timeframe[]=['1m','5m','15m','30m','1h','4h','1d','1w','1M','1Y'];
export function timeframeLabel(frame:Timeframe){return frame==='1d'?'1D':frame==='1w'?'1W':frame;}
export function TimeframeOptions(){
  return [['Intraday',frames.slice(0,6)],['Calendar',frames.slice(6)]].map(([name,items])=><optgroup label={String(name)} key={String(name)}>
    {(items as Timeframe[]).map(f=><option key={f} value={f}>{timeframeLabel(f)}</option>)}
  </optgroup>);
}
export function TimeframeSelector({paneId,value,onChange}:{paneId:string;value:Timeframe;onChange:(value:Timeframe)=>void}){
  return <select aria-label={`Timeframe pane ${paneId}`} value={value} onChange={e=>onChange(e.target.value as Timeframe)}><TimeframeOptions/></select>;
}
