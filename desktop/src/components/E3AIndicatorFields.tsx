import type {ReactElement} from 'react';
import type {IndicatorConfig} from '../types';
import {isVolume,volumeLevels} from '../charts/volume';
export function E3AIndicatorFields({draft,set,num}:{draft:IndicatorConfig;set:(key:keyof IndicatorConfig,value:unknown)=>void;num:(key:keyof IndicatorConfig,label:string,min?:number,max?:number,step?:number)=>ReactElement}){
 if(!isVolume(draft.kind))return null;const k=draft.kind;
 return <>
 {['CMF','MFI','EOM','TMF','VROC'].includes(k)&&num('length','Length')}
 {k==='VO'&&<>{num('fast','Fast period')}{num('slow','Slow period',2)}<label>Volume average<select aria-label="Volume average" value={draft.volume_ma??'ema'} onChange={e=>set('volume_ma',e.target.value)}><option value="ema">EMA (SMA seed)</option><option value="sma">SMA</option></select></label><label>Oscillator units<select aria-label="Volume oscillator units" value={draft.volume_osc_mode??'percent'} onChange={e=>set('volume_osc_mode',e.target.value)}><option value="percent">Percent of slow average</option><option value="absolute">Absolute provider volume units</option></select></label></>}
 {k==='EOM'&&<>{num('eom_divisor','EOM volume divisor',.00000001,1e12,.00000001)}<p>EOM uses midpoint movement × range × divisor / volume, then SMA. Default divisor 100,000,000 follows the shares convention; choose a suitable scale for native crypto units.</p></>}
 {['NVI','PVI'].includes(k)&&num('volume_seed','Initial index value',.00000001,1e12,.00000001)}
 {['OBV','ADL','PVT','NVI','PVI'].includes(k)&&<p>Cumulative from the first loaded candle; no session reset. Unknown volume/price or an undefined required return stops the cumulative value. Corrected history recalculates it; values are never silently restarted.</p>}
 {k==='MFI'&&<p>Selected source × volume, classified by source movement. Negative source prices are unavailable for money-flow ratios; zero total directional flow is undefined.</p>}
 {k==='TMF'&&<p>True-range money flow / volume with Wilder smoothing and full-window SMA seeds, expressed as percent. <a href="https://www.incrediblecharts.com/indicators/twiggs_money_flow.php" onClick={e=>{e.preventDefault();void window.terminal.openExternal(e.currentTarget.href);}}>Twiggs Money Flow formula and attribution</a></p>}
 <p>Volume units vary by provider. Shares, native base-asset units and unconfirmed futures/index/FX measures are labeled on the chart. Unknown volume is never treated as zero; provider zero placeholders on FX/indices are unavailable.</p>
 <label>Reference levels (empty hides)<input aria-label="Reference levels" defaultValue={(draft.reference_levels??volumeLevels[k]??[]).join(', ')} onChange={e=>set('reference_levels',e.target.value.trim()?e.target.value.split(',').map(Number):[])}/></label>
 </>;
}
