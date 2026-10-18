import type {CustomContext} from '../charts/custom';
import {isVolume,volumeCalculate,volumeStudies,volumeWarning,volumeGood,type VolumeState,type VolumeContext} from '../charts/volume';
import {isMomentum,momentumCalculate,momentumStudies,type E2State,type E2Field} from '../charts/momentum';
import {isTrend,trendCalculate,type TrendState,type TrendField} from '../charts/trend';
/** E1 recursive checkpoints resume before the forming bar; reconciliation invalidates them. */
import {trendStudies,validateIndicator,calculateIndicators,type Study} from '../charts/indicators';
import type {Candle,IndicatorConfig,Timeframe} from '../types';
const EMPTY_CONTEXT:CustomContext={};
export class LiveIndicators {
 private volumeCache=new Map<string,{signature:string;rows:Candle[];values:(number|null)[];state:VolumeState;beforeLast:VolumeState}>();
 private momentumCache=new Map<string,{signature:string;rows:Candle[];fields:E2Field[];state:E2State;beforeLast:E2State}>();
 private trendCache=new Map<string,{signature:string;rows:Candle[];fields:TrendField[];state:TrendState;beforeLast:TrendState}>();
 private referenceContext:CustomContext={};
 private volumeOriginNotice='';
 private rows:Candle[]=[];private signature='';private result:ReturnType<typeof calculateIndicators>|null=null;
 private calculate(rows:Candle[],configs:IndicatorConfig[],interval:Timeframe,zone:string,incremental:boolean,volumeContext:VolumeContext={},referenceContext:CustomContext=EMPTY_CONTEXT){
  const base=calculateIndicators(rows,configs.filter(c=>!isTrend(c.kind)&&!isMomentum(c.kind)&&!isVolume(c.kind)),interval,zone,volumeContext,referenceContext);
  for(const cfg of configs.filter(c=>isTrend(c.kind)&&c.visible)){
   const error=validateIndicator(cfg);if(error){base.warnings.push(`${cfg.id}: ${error}`);continue;}
   const signature=JSON.stringify(cfg),old=this.trendCache.get(cfg.id),last=old?.rows.at(-1),next=rows.at(-1);
   const revised=last&&next&&last.time===next.time&&old?.rows.length===rows.length;
   const appended=last&&rows.at(-2)?.time===last.time&&old?.rows.length===rows.length-1;
   const resume=incremental&&old&&old.signature===signature&&old.rows[0]===rows[0]&&(revised||appended)&&rows.at(revised?-2:-3)===old.rows.at(-2)&&!['ZIGZAG','LINREG'].includes(cfg.kind);
   const start=resume?rows.length-1:0;
   const output=trendCalculate(rows,cfg,start,resume?(revised?old.beforeLast:old.state):{});
   if(resume)for(const field of output.fields){const previous=old.fields.find(f=>f.name===field.name);if(previous)for(let i=0;i<start;i++)field.values[i]=previous.values[i];}
   this.trendCache.set(cfg.id,{signature,rows,fields:output.fields,state:output.state,beforeLast:output.beforeLast});
   const series=trendStudies(rows,cfg,output.fields);base.series.push(...series);if(!series.some(s=>s.points.some(p=>p.value!==null)))base.warnings.push(`${cfg.id}: Insufficient candles or undefined values for these parameters.`);
  }
  for(const cfg of configs.filter(c=>isMomentum(c.kind)&&c.visible)){
   const error=validateIndicator(cfg);if(error){base.warnings.push(`${cfg.id}: ${error}`);continue;}
   const signature=JSON.stringify([cfg,interval]),old=this.momentumCache.get(cfg.id),last=old?.rows.at(-1),next=rows.at(-1);
   const revised=last&&next&&last.time===next.time&&old?.rows.length===rows.length,appended=last&&rows.at(-2)?.time===last.time&&old?.rows.length===rows.length-1;
   const resume=incremental&&old&&old.signature===signature&&old.rows[0]===rows[0]&&(revised||appended)&&rows.at(revised?-2:-3)===old.rows.at(-2);
   const start=resume?rows.length-1:0,output=momentumCalculate(rows,cfg,interval,start,resume?(revised?old.beforeLast:old.state):undefined);
   if(resume)for(const f of output.fields){const previous=old.fields.find(p=>p.name===f.name);if(previous)for(let i=0;i<start;i++)f.values[i]=previous.values[i];}
   this.momentumCache.set(cfg.id,{signature,rows,fields:output.fields,state:output.state,beforeLast:output.beforeLast});
   const series=momentumStudies(rows,cfg,output.fields);base.series.push(...series);if(!series.some(s=>s.points.some(p=>p.value!==null)))base.warnings.push(`${cfg.id}: Insufficient candles or undefined values for these parameters.`);
  }
  for(const cfg of configs.filter(c=>isVolume(c.kind)&&c.visible)){
   const error=validateIndicator(cfg);if(error){base.warnings.push(`${cfg.id}: ${error}`);continue;}
   const signature=JSON.stringify([cfg,volumeContext]),old=this.volumeCache.get(cfg.id),last=old?.rows.at(-1),next=rows.at(-1);
   const revised=last&&next&&last.time===next.time&&old?.rows.length===rows.length,appended=last&&rows.at(-2)?.time===last.time&&old?.rows.length===rows.length-1;
   const resume=incremental&&old&&old.signature===signature&&old.rows[0]===rows[0]&&(revised||appended)&&rows.at(revised?-2:-3)===old.rows.at(-2);
   const start=resume?rows.length-1:0,output=volumeCalculate(rows,cfg,volumeContext,start,resume?(revised?old.beforeLast:old.state):undefined);
   if(resume)for(let i=0;i<start;i++)output.values[i]=old.values[i];
   this.volumeCache.set(cfg.id,{signature,rows,values:output.values,state:output.state,beforeLast:output.beforeLast});
   const series=volumeStudies(rows,cfg,output.values,volumeContext);base.series.push(...series);if(output.state.invalidSeen||!series.some(s=>s.points.some(p=>p.value!==null)))base.warnings.push(volumeWarning(rows,cfg,volumeContext));
  }
  const active=new Set(configs.map(c=>c.id));if(configs.length>1)for(const id of this.volumeCache.keys())if(!active.has(id))this.volumeCache.delete(id);if(configs.length>1)for(const id of this.momentumCache.keys())if(!active.has(id))this.momentumCache.delete(id);if(configs.length>1)for(const id of this.trendCache.keys())if(!active.has(id))this.trendCache.delete(id);
  return base;
 }
 evaluate(rows:Candle[],configs:IndicatorConfig[],interval:Timeframe,zone:string,incremental:boolean,volumeContext:VolumeContext={},referenceContext:CustomContext=EMPTY_CONTEXT){
  const cumulative=configs.some(c=>c.visible&&['OBV','ADL','NVI','PVI','PVT'].includes(c.kind));if(!cumulative)this.volumeOriginNotice='';else if(this.rows[0]&&rows[0]&&this.rows[0].time!==rows[0].time)this.volumeOriginNotice=`Cumulative volume rebased: loaded history now starts ${new Date(rows[0].time*1000).toISOString()}. Session boundaries do not reset values.`;
  const signature=JSON.stringify([configs,interval,zone,volumeContext]),last=this.rows.at(-1),next=rows.at(-1),tail=!!last&&!!next&&(last.time===next.time||rows.at(-2)?.time===last.time);
  const stablePrefix=tail&&rows.length>=this.rows.length&&rows.every((r,i)=>i===rows.length-1||r===this.rows[i]);
  if(!incremental||!tail||!stablePrefix||!this.result||signature!==this.signature||referenceContext!==this.referenceContext){this.trendCache.clear();this.momentumCache.clear();this.volumeCache.clear();this.result=this.calculate(rows,configs,interval,zone,false,volumeContext,referenceContext);}
  else {
   const series:Study[]=[],warnings:string[]=[];
   for(const cfg of configs){
    if(!cfg.visible)continue;const previous=this.result.series.filter(s=>s.id===cfg.id);let current:ReturnType<typeof calculateIndicators>;
    if(isTrend(cfg.kind)||isMomentum(cfg.kind)||isVolume(cfg.kind)){current=this.calculate(rows,[cfg],interval,zone,true,volumeContext,referenceContext);}
    else if(['SMA','WMA','VWMA','BB'].includes(cfg.kind)&&rows.length>cfg.length&&previous.length){
     current=calculateIndicators(rows.slice(-cfg.length),[cfg],interval,zone);
     current.series=current.series.map((s,i)=>({...s,points:[...previous[i].points.filter(p=>p.time>=rows[0].time&&p.time<next!.time),s.points.at(-1)!]}));
    }else if(cfg.kind==='EMA'&&previous.length&&rows.length>cfg.length){
     const point=previous[0].points.filter(p=>p.time<next!.time).at(-1),r=next!,x=cfg.source==='HL2'?(r.high+r.low)/2:cfg.source==='HLC3'?(r.high+r.low+r.close)/3:cfg.source==='OHLC4'?(r.open+r.high+r.low+r.close)/4:r[cfg.source];
     if(point?.value!==null&&point?.value!==undefined){const value=x*2/(cfg.length+1)+point.value*(1-2/(cfg.length+1));current={series:[{...previous[0],points:[...previous[0].points.filter(p=>p.time>=rows[0].time&&p.time<r.time),{time:r.time,value}]}],warnings:[]};}
     else current=calculateIndicators(rows,[cfg],interval,zone,volumeContext,referenceContext);
    }else current=calculateIndicators(rows,[cfg],interval,zone,volumeContext,referenceContext);
    series.push(...current.series);warnings.push(...current.warnings);
   }
   this.result={series,warnings};
  }
  if(this.volumeOriginNotice&&!this.result.warnings.includes(this.volumeOriginNotice))this.result.warnings.unshift(this.volumeOriginNotice);
  this.referenceContext=referenceContext;this.rows=rows;this.signature=signature;return this.result;
 }
}
