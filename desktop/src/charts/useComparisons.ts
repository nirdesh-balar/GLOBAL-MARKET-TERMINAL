import {useEffect,useRef,useState,type RefObject} from 'react';
import {LineSeries,type IChartApi,type ISeriesApi,type UTCTimestamp} from 'lightweight-charts';
import type {Candle,HistoryResult,SymbolEntry,Timeframe} from '../types';
import {acquireHistory} from '../services/api';
import {compareReturns} from './compare';

const comparisonColors=['#7faef1','#c49cf2','#37c5a2'];
export function useComparisons(chart:RefObject<IChartApi|null>,container:RefObject<HTMLDivElement|null>,epoch:number,items:SymbolEntry[]|undefined,enabled:boolean,
  instrument:string,timeframe:Timeframe,start:string|undefined,end:string|undefined,adjusted:boolean,rows:Candle[]){
  const entries=items?.filter(item=>item.canonical_id!==instrument)??[];
  const key=enabled&&entries.length?JSON.stringify([entries.map(row=>[row.canonical_id,row.provider,row.native_mapping]),timeframe,start,end,adjusted]):'';
  const [data,setData]=useState<{key:string;results:HistoryResult[];error:string}|null>(null);
  useEffect(()=>{
    if(!key)return;
    let live=true;
    const leases=entries.map(row=>{
      const source=row.provider==='hyperliquid'?'hyperliquid':'yahoo';
      const params=new URLSearchParams({symbol:row.canonical_id!,interval:timeframe,period:'max',source,adjusted:String(source==='yahoo'&&adjusted),priority:'1'});
      if(start)params.set('start',start);
      if(end)params.set('end',end);
      if(source==='hyperliquid'&&row.native_mapping)params.set('native_mapping',row.native_mapping);
      return acquireHistory('/api/history?'+params);
    });
    Promise.all(leases.map(lease=>lease.promise)).then(results=>{
      if(live)setData({key,results,error:''});
    },error=>{if(live)setData({key,results:[],error:error.message});});
    return()=>{live=false;for(const lease of leases)lease.release();};
  },[key]);
  const loaded=data?.key===key?data:null;
  const handles=useRef<ISeriesApi<'Line'>[]>([]);
  useEffect(()=>{
    const c=chart.current;
    if(!key||!loaded||loaded.error||!c)return;
    const surface=container.current?.parentElement;
    const updateAxisInset=()=>surface?.style.setProperty('--left-axis-inset',c.priceScale('left').width()+'px');
    c.timeScale().subscribeSizeChange(updateAxisInset);
    const series=Array.from({length:1+loaded.results.length},(_,index)=>c.addSeries(LineSeries,{
      color:index===0?'#efb86e':comparisonColors[index-1],lineWidth:1,priceScaleId:'left',
      priceFormat:{type:'custom',minMove:.01,formatter:(value:number)=>value.toFixed(2)+'%'},
      priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false,
    }));
    handles.current=series;
    return()=>{
      handles.current=[];
      surface?.style.removeProperty('--left-axis-inset');
      if(chart.current!==c)return;
      c.timeScale().unsubscribeSizeChange(updateAxisInset);
      for(const line of series)c.removeSeries(line);
      c.applyOptions({leftPriceScale:{visible:false}});
    };
  },[chart,container,epoch,key,loaded]);
  const [status,setStatus]=useState<{key:string;notice:string}>({key:'',notice:''});
  useEffect(()=>{
    const c=chart.current;
    if(!key||!c||!loaded||loaded.error||!handles.current.length)return;
    const returns=compareReturns(rows,loaded.results.map(value=>value.candles));
    if(!returns){
      for(const line of handles.current)line.setData([]);
      c.applyOptions({leftPriceScale:{visible:false}});
      const notice='No shared candle timestamp for these instruments and interval.';
      setStatus(previous=>previous.key===key&&previous.notice===notice?previous:{key,notice});
      return;
    }
    const window=c.timeScale().getVisibleLogicalRange();
    c.applyOptions({leftPriceScale:{visible:true,autoScale:true}});
    [returns.primary,...returns.comparisons].forEach((points,index)=>{
      handles.current[index].setData(points.map(point=>({...point,time:point.time as UTCTimestamp})));
    });
    if(window)c.timeScale().setVisibleLogicalRange(window);
    const date=new Date(returns.base*1000).toISOString().slice(0,10);
    const feeds=loaded.results.map(result=>result.source+(result.stale?' · Stale':''));
    const notice='Returns since '+date+' UTC · Left scale (%) · '+feeds.join(' / ');
    setStatus(previous=>previous.key===key&&previous.notice===notice?previous:{key,notice});
  },[chart,epoch,key,loaded,rows]);
  return !key?'':loaded?.error||(status.key===key?status.notice:'Loading comparison history…');
}
