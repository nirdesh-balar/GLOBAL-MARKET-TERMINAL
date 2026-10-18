import type {Timeframe} from '../types';
export const frames:Timeframe[]=['1m','5m','15m','30m','1h','4h','1d','1w','1M'];
export function TimeframeSelector({paneId,value,onChange}:{paneId:string;value:Timeframe;onChange:(value:Timeframe)=>void}){return <select aria-label={`Timeframe pane ${paneId}`} value={value} onChange={e=>onChange(e.target.value as Timeframe)}>{frames.map(f=><option key={f} value={f}>{f==='1d'?'1D':f==='1w'?'1W':f}</option>)}</select>;}
