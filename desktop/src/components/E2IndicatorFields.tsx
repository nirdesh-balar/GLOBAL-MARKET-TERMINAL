import type {ReactElement} from 'react';
import type {IndicatorConfig} from '../types';
import {isMomentum,e2Levels} from '../charts/momentum';
export function E2IndicatorFields({draft,set,num}:{draft:IndicatorConfig;set:(key:keyof IndicatorConfig,value:unknown)=>void;num:(key:keyof IndicatorConfig,label:string,min?:number,max?:number,step?:number)=>ReactElement}){
 const kind=draft.kind;if(!isMomentum(kind))return null;
 const array=(key:'roc_lengths'|'kst_smoothing'|'ultimate_periods',labels:string[],fallback:number[])=>labels.map((label,i)=><label key={label}>{label}<input type="number" aria-label={label} min={1} max={500} step={1} value={String((draft[key]??fallback)[i])} onChange={e=>{const a=[...(draft[key]??fallback)];a[i]=e.target.value===''?NaN:Number(e.target.value);set(key,a);}}/></label>);
 return <>
 {['CCI','ROC','MOM','WILLR','FISHER','COPPOCK','CKS','KC','DC','STDDEV','HV','CHAIKIN_VOL','CHOP','MASS'].includes(kind)&&num('length',kind==='CKS'?'High/low lookback':kind==='MASS'?'Sum length':kind==='CHAIKIN_VOL'?'Range EMA length':'Length',['CCI','STDDEV','HV','CHOP'].includes(kind)?2:1)}
 {kind==='STOCH'&&<>{num('stoch_period','Stochastic period',2)}{num('k','K smoothing',1,50)}{num('d','D smoothing',1,50)}</>}
 {['AO','PPO','TSI','COPPOCK'].includes(kind)&&<>{num('fast','Fast period')}{num('slow','Slow period',2)}</>}
 {['PPO','TSI','KST'].includes(kind)&&num('signal','Signal period')}
 {kind==='ULTOSC'&&array('ultimate_periods',['Ultimate short period','Ultimate middle period','Ultimate long period'],[7,14,28])}
 {kind==='KST'&&<>{array('roc_lengths',['KST ROC 1','KST ROC 2','KST ROC 3','KST ROC 4'],[10,15,20,30])}{array('kst_smoothing',['KST smoothing 1','KST smoothing 2','KST smoothing 3','KST smoothing 4'],[10,10,10,15])}</>}
 {['CKS','KC'].includes(kind)&&<>{num('period','ATR period',2)}{num('multiplier','ATR multiplier',.01,20,.01)}<p>Wilder ATR with an SMA seed. This is a price overlay; no orders are placed.</p></>}
 {kind==='CKS'&&num('stop_period','Stop lookback')}
 {kind==='MASS'&&num('period','Range EMA period',2)}
 {kind==='CHAIKIN_VOL'&&<>{num('period','Range change period',2)}<p>Percentage change of EMA(high − low). Volume is not an input.</p></>}
 {['AO','PPO'].includes(kind)&&<>{(['up_color','down_color'] as const).map((key,i)=><label key={key}>{i?'Negative':'Positive'} histogram color<input type="color" aria-label={(i?'Negative':'Positive')+' histogram color'} value={draft[key]} onChange={e=>set(key,e.target.value)}/></label>)}</>}
 {['KC','DC'].includes(kind)&&<>{(['upper_color','lower_color'] as const).map((key,i)=><label key={key}>{i?'Lower':'Upper'} channel fill color<input type="color" aria-label={(i?'Lower':'Upper')+' channel fill color'} value={draft[key]} onChange={e=>set(key,e.target.value)}/></label>)}</>}
 {['KC','DC'].includes(kind)&&num('cloud_opacity','Channel fill opacity',0,1,.01)}
 {['STDDEV','HV'].includes(kind)&&<label><input type="checkbox" aria-label="Sample standard deviation" checked={!!draft.sample} onChange={e=>set('sample',e.target.checked)}/>Sample standard deviation (n − 1)</label>}
 {kind==='HV'&&<><label>Returns<select aria-label="Volatility returns" value={draft.hv_returns??'log'} onChange={e=>set('hv_returns',e.target.value)}><option value="log">Log returns (positive prices)</option><option value="arithmetic">Arithmetic returns (nonzero base)</option></select></label><label>Annualization<select aria-label="Volatility annualization" value={draft.annualization??'per_bar'} onChange={e=>set('annualization',e.target.value)}><option value="per_bar">Per bar — unannualized</option><option value="sessions">Trading sessions — configure below</option><option value="crypto">24/7 crypto — 365 days</option><option value="custom">Custom bars per year</option></select></label>{draft.annualization==='sessions'&&<>{num('annual_days','Trading days per year',1,366)}{num('session_minutes','Trading minutes per day',1,1440)}</>}{draft.annualization==='custom'&&num('annual_bars','Bars per year',.01,10000000,.01)}<p>Output is percent. Annualization is explicit; choose the cadence for this instrument. NSE sessions typically use 375 minutes; US equities use 390. Irregular or partial bars may require a custom factor.</p></>}
 <label>Reference levels (comma separated; empty hides)<input aria-label="Reference levels" defaultValue={(draft.reference_levels??e2Levels[kind]??[]).join(', ')} onChange={e=>set('reference_levels',e.target.value.trim()?e.target.value.split(',').map(Number):[])}/></label>
 </>;
}
