import {chartFailure,failureTitle,type ChartFailure}from '../services/errors';
import {providerLabel} from '../providers/label';
import {StudyPaneControls,useStudyWorkspace} from './StudyWorkspace';
import {referenceFreshness} from './custom';
import {useReferences} from './useReferences';
import {isVolume,volumeContext,volumeUnits} from './volume';
import {legacyCrypto,legacyMessage} from '../providers/legacy';
import {LiveIndicators} from '../streams/indicators';
import {useStreamStatus,useStreamFeed,mergeLive,streamView,type StreamFeed} from '../streams/client';
import {useRefreshTask} from '../refresh/hooks';
import {updatedView,mergeCandles} from '../refresh/scheduler';
import { memo,useCallback,useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries, createTextWatermark, ColorType, TickMarkType, PriceScaleMode, type IChartApi, type ISeriesApi, type SeriesType, type UTCTimestamp, type Time } from 'lightweight-charts';
import { CandlestickChart, SlidersHorizontal, RefreshCw, X, Upload } from 'lucide-react';
import type { Candle, Pane, Indicator, Timeframe, HistoryResult, ChartQuote } from '../types';
import {marketDay,marketMidnight} from '../services/marketTime';
import { acquireHistory, subscribeHistory, price, symbolLabel } from '../services/api';
import { calculateIndicators,indicatorLabel } from './indicators';
import { ChartToolbar } from './ChartToolbar';
import { PriceScaleControls } from './PriceScaleControls';
import { ChartSettings } from '../components/ChartSettings';
import { IndicatorSettingsDialog } from '../components/IndicatorSettingsDialog';
import type { DrawingTool } from '../components/DrawingToolbar';
import {DrawingsPrimitive} from './Drawings';
import {drawingStorageKey} from '../drawings/storage';
import {useDrawings} from './useDrawings';
import {ReplayControls,replayPrefix} from './ReplayControls';
import { renderIndicatorPanes,updateIndicatorPanes,detachIndicatorPrimitives } from './IndicatorPane';
const rangeDays:Record<string,number>={'1D':1,'5D':5,'1M':30,'3M':90,'6M':180,'1Y':365,'5Y':1825};
function date(time:Time){return new Date(typeof time==='number'?time*1000:typeof time==='string'?time:`${time.year}-${String(time.month).padStart(2,'0')}-${String(time.day).padStart(2,'0')}T00:00:00Z`);}
function tickLabel(time:Time,type:TickMarkType,zone:string){return new Intl.DateTimeFormat('en-IN',{timeZone:zone,...(type===TickMarkType.Year?{year:'numeric'}:type===TickMarkType.Month?{month:'short'}:type===TickMarkType.DayOfMonth?{day:'2-digit',month:'short'}:{hour:'2-digit',minute:'2-digit',hour12:false})} as Intl.DateTimeFormatOptions).format(date(time));}

export const ChartPane=memo(function ChartPane({refreshPaused=false,refreshSeconds=300,refreshVisible=true,hidden=false,pane,theme,onIndicators,active,expanded,onActive,onChange,onSearch,onMigration,onExpand,onData,onVolume,tool,magnet,syncTime,syncCrosshair,onAlert}:{refreshPaused?:boolean;refreshSeconds?:number;refreshVisible?:boolean;hidden?:boolean;pane:Pane;theme:'dark'|'light';onIndicators:()=>void;active:boolean;expanded:boolean;onActive:()=>void;onChange:(value:Partial<Pane>)=>void;onSearch:()=>void;onMigration:(choose:boolean)=>void;onExpand:()=>void;onData:(symbol:string,row:ChartQuote)=>void;onVolume:(id:string,key:string,available:boolean)=>void;tool:DrawingTool;magnet:boolean;syncTime:boolean;syncCrosshair:boolean;onAlert:(price?:number)=>void}){
  const instrumentZone=pane.timezone||'Asia/Kolkata';
  const precision=pane.precision??2;
  const instrumentKey=pane.canonical_id||pane.instrument_id||pane.symbol;
  const layoutResizing=useRef(false),previousHidden=useRef(false),layoutSnapshot=useRef<{range:{from:number;to:number}|null;price:{from:number;to:number}|null}|null>(null);
  const viewport=useRef<HTMLDivElement>(null);const container=useRef<HTMLDivElement>(null);const chart=useRef<IChartApi|null>(null);
  const [chartEpoch,setChartEpoch]=useState(0),[studyEpoch,setStudyEpoch]=useState(0);const [data,setData]=useState<HistoryResult|null>(null);const [current,setCurrent]=useState<Candle|null>(null);
  const chartZone=data?.timezone||instrumentZone;
  const displayZone=['1d','1w','1M'].includes(pane.timeframe)?'UTC':chartZone;
  const formatActualPrice=(n:number)=>price(n,data?.precision??precision);
  const [refreshing,setRefreshing]=useState(false),[refreshError,setRefreshError]=useState('');
  const refreshLease=useRef<{release:()=>void}|null>(null),refreshGeneration=useRef(0),renderedLength=useRef(0);
  const [failure,setFailure]=useState<ChartFailure|null>(null),[waiting,setWaiting]=useState(false),[retryUntil,setRetryUntil]=useState(0),[retryClock,setRetryClock]=useState(Date.now());const loadBusy=useRef(false);
  useEffect(()=>{if(!failure?.retry_after){setRetryUntil(0);return;}setRetryUntil(Date.now()+failure.retry_after*1000);const timer=setInterval(()=>setRetryClock(Date.now()),1000);return()=>clearInterval(timer);},[failure]);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [refresh,setRefresh]=useState(0);const force=useRef(false);
  const [appearanceOpen,setAppearanceOpen]=useState(false),[editIndicator,setEditIndicator]=useState<Indicator|null>(null),[dataOpen,setDataOpen]=useState(false);
  const [replay,setReplay]=useState<number|null>(null),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[goDate,setGoDate]=useState('');
  const primitive=useRef<DrawingsPrimitive|null>(null),mainSeries=useRef<ISeriesApi<SeriesType>|null>(null),volumeSeries=useRef<ISeriesApi<'Histogram'>|null>(null);
  const syncedCrosshair=useRef<number|null|undefined>(undefined);
  const syncRef=useRef({active,syncTime,syncCrosshair});syncRef.current={active,syncTime,syncCrosshair};
  const [range,setRange]=useState('MAX');const [custom,setCustom]=useState(false);
  const [dates,setDates]=useState({start:'',end:''});const [requested,setRequested]=useState<{start?:string;end?:string}>({});
  const [rangeNotice,setRangeNotice]=useState('');const [source,setSource]=useState<'yahoo'|'nse'|'hyperliquid'>(pane.provider==='hyperliquid'?'hyperliquid':'yahoo');const [adjusted,setAdjusted]=useState(false);
  const sourceKey=useRef(instrumentKey);const onDataRef=useRef(onData);onDataRef.current=onData;
  // LWC applies target ranges on its next draw. Study rebuilds must retain
  // that intent rather than snapshot the previous base-index range.
  const view=useRef<{from:number;to:number}|null>(null);const pendingStudyView=useRef<{from:number;to:number}|null>(null),replayRestore=useRef<{from:number;to:number}|null>(null);
  const dataFor=useRef('');const chartIdentity=useRef('');const paneHeights=useRef(new Map<string,number>());const indicatorRender=useRef<ReturnType<typeof renderIndicatorPanes>>({slots:new Map(),handles:[],primitives:[],owners:[]});
  const replayActive=useRef(false);replayActive.current=replay!==null;
  const liveIdentity=`${instrumentKey}/${pane.timeframe}/${requested.start}/${requested.end}/${source}/${adjusted}`;const latestIdentity=useRef(liveIdentity);latestIdentity.current=liveIdentity;
  const renderRevision=useRef(0);
  const incrementalStudies=useRef(false),studyLayout=useRef('');
  const replayRows=useRef<Candle[]|null>(null),renderedRows=useRef<Candle[]>([]);
  const stream=useStreamStatus(),[streamFrame,setStreamFrame]=useState<StreamFeed|null>(null);
  const streamEnabled=stream.enabled&&pane.auto_refresh&&pane.provider==='hyperliquid'&&source==='hyperliquid'&&refreshVisible&&!refreshPaused&&replay===null&&!requested.end;
  const streamTarget=useRef({identity:instrumentKey,interval:pane.timeframe});streamTarget.current={identity:instrumentKey,interval:pane.timeframe};
  useEffect(()=>setStreamFrame(null),[instrumentKey,pane.timeframe]);
  const receiveEnabled=useRef(streamEnabled);receiveEnabled.current=streamEnabled;
  const receiveLive=useCallback((frame:StreamFeed)=>{if(!receiveEnabled.current||replayActive.current||frame.identity!==streamTarget.current.identity||frame.interval!==streamTarget.current.interval)return;setStreamFrame(frame);if(frame.history){dataFor.current=latestIdentity.current;setLoading(false);setError('');}if(frame.candle||frame.history)setData(old=>old?mergeLive(old,frame):frame.history?mergeLive(frame.history,frame):old);},[]);
  useStreamFeed('chart:'+pane.id,pane,'candle',pane.timeframe,streamEnabled,receiveLive);
  const rows=useMemo(()=>replayPrefix(replay!==null?(replayRows.current||[]):data?.candles||[],replay),[data,replay]);
  useEffect(()=>{onVolume(pane.id,instrumentKey+'/'+pane.timeframe,!loading&&pane.kind!=='index'&&pane.kind!=='forex'&&rows.some(r=>r.volume!==null&&Number.isFinite(r.volume)&&r.volume>0));},[rows,loading,pane.id,instrumentKey,pane.timeframe,pane.kind,onVolume]);
  const rowsRef=useRef(rows);rowsRef.current=rows;const indexed=useMemo(()=>new Map(rows.map(r=>[r.time,r])),[rows]);const indexedRef=useRef(indexed);indexedRef.current=indexed;
  const drawing=useDrawings({container,chart,primitive,pane,rows,interactionScope:liveIdentity+'/'+replay,tool:active?tool:'cursor',magnet,onChange,onActive});
  const showVolume=pane.volume&&!pane.indicators_hidden;
  const volumeInfo=useMemo(()=>volumeContext(pane),[pane.provider,pane.base_asset,pane.kind]);
  const referenceContext=useReferences(pane,pane.indicators_hidden?[]:pane.indicators,adjusted,`${refresh}/${data?.fetched_at??0}`,replay===null,replay===null&&refreshVisible&&!refreshPaused&&pane.auto_refresh);
  const studies=useRef(new LiveIndicators());
  const studyTiming=useRef(0);
  const computed=useMemo(()=>{const start=performance.now();const value=studies.current.evaluate(rows,pane.indicators_hidden?[]:pane.indicators,pane.timeframe,chartZone,!!data?.stream_update_only&&replay===null,volumeInfo,referenceContext);studyTiming.current=performance.now()-start;return value;},[rows,pane.indicators,pane.indicators_hidden,pane.timeframe,chartZone,volumeInfo,referenceContext]);
  const referenceLabels=useMemo(()=>new Map(pane.indicators.filter(c=>['RELATIVE_STRENGTH','INDIA_VIX'].includes(c.kind)).map(c=>[c.id,referenceFreshness(c,referenceContext,rows.at(-1)?.time??0)])),[pane.indicators,referenceContext,rows]);
  useEffect(()=>{setReplay(null);setPlaying(false);},[instrumentKey,pane.timeframe,source,adjusted,requested.start,requested.end]);
  useEffect(()=>{if(!playing||replay===null)return;const timer=setInterval(()=>setReplay(v=>{if(v===null)return v;if((replayRows.current?.length||0)<=v+1){setPlaying(false);return v;}return Math.min((replayRows.current?.length||1)-1,v+1);}),1000/speed);return()=>clearInterval(timer);},[playing,speed,data]);
  const scaleMode=pane.scale.percentage?PriceScaleMode.Percentage:pane.scale.logarithmic?PriceScaleMode.Logarithmic:PriceScaleMode.Normal;
  const scaleRef=useRef(pane.scale);scaleRef.current=pane.scale;
  useEffect(()=>{if(!chart.current)return;chart.current.priceScale('right').applyOptions({mode:scaleMode,autoScale:true});chart.current.priceScale('right').setAutoScale(pane.scale.auto);if(container.current){container.current.dataset.priceMode=String(chart.current.priceScale('right').options().mode);container.current.dataset.autoScale=String(chart.current.priceScale('right').options().autoScale);}},[pane.scale.logarithmic,pane.scale.auto,pane.scale.percentage]);
  useEffect(()=>{const c=chart.current,m=mainSeries.current;if(c&&m){const p=data?.precision??precision;m.applyOptions({priceFormat:{type:'price',precision:p,minMove:10**-p}});c.applyOptions({localization:{priceFormatter:formatActualPrice}});}},[data?.precision,precision]);
  // Fetch only when symbol, timeframe, range, source or Refresh changes.
  // Indicator, volume and layout changes only rebuild series from data in RAM.
  useEffect(()=>{
    let alive=true;
    const changed=sourceKey.current!==instrumentKey;
    if(changed){sourceKey.current=instrumentKey;setSource(pane.provider==='hyperliquid'?'hyperliquid':'yahoo');setAdjusted(false);setRequested({});setRange('MAX');setData(null);if(source!==(pane.provider==='hyperliquid'?'hyperliquid':'yahoo')||adjusted||requested.start||requested.end)return;}
    setLoading(true);loadBusy.current=true;setWaiting(false);setError('');setFailure(null);setRefreshError('');if(dataFor.current!==liveIdentity){setData(null);setCurrent(null);renderedLength.current=0;}
    if(legacyCrypto(pane)){setLoading(false);setError(legacyMessage);return;}
    if(pane.token==='0'){setLoading(false);setError(pane.kind==='crypto'?'Legacy crypto migration required. Hyperliquid provider pending; Yahoo crypto fetching is disabled.':'This symbol is unavailable in the current NSE directory. Search and select a currently listed equity.');return;}
    const params=new URLSearchParams({symbol:instrumentKey,interval:pane.timeframe,period:'max',source,adjusted:String(adjusted),priority:active?'0':'1'});
    if(pane.provider==='hyperliquid'&&pane.native_mapping)params.set('native_mapping',pane.native_mapping);
    if(requested.start)params.set('start',requested.start);if(requested.end)params.set('end',requested.end);
    if(force.current){params.set('refresh','true');force.current=false;}
    const path='/api/history?'+params.toString();
    const unsubscribe=subscribeHistory(path,value=>{if(alive){dataFor.current=`${instrumentKey}/${pane.timeframe}/${requested.start}/${requested.end}/${source}/${adjusted}`;setData(value);setError('');setFailure(value.stale&&value.provider_error?chartFailure(value.provider_error):null);setLoading(false);loadBusy.current=false;}});
    const lease=acquireHistory(path),timer=setTimeout(()=>{if(alive)setWaiting(true);},1500);
    lease.promise.then(()=>clearTimeout(timer),e=>{clearTimeout(timer);if(alive){const problem=chartFailure(e);setFailure(problem);setError(problem.message);if(dataFor.current===liveIdentity)setData(old=>old?{...old,stale:true,provider_error:problem}:old);setLoading(false);loadBusy.current=false;}});
    return()=>{alive=false;clearTimeout(timer);loadBusy.current=false;unsubscribe();lease.release();};
  },[instrumentKey,pane.token==='0',pane.timeframe,requested.start,requested.end,source,adjusted,refresh]);
  useEffect(()=>{
    if(!container.current)return;
    const identity=`${instrumentKey}/${pane.timeframe}/${requested.start}/${requested.end}/${source}/${adjusted}`;
    const preserve=chartIdentity.current===identity;if(!preserve)view.current=null;chartIdentity.current=identity;
    const c=createChart(container.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:theme==='light'?'#ffffff':'#0d131c'},textColor:theme==='light'?'#475569':'#78879b',fontFamily:'-apple-system, BlinkMacSystemFont, sans-serif',fontSize:11,attributionLogo:true,panes:{enableResize:true,separatorColor:theme==='light'?'#d2dbe7':'#263040',separatorHoverColor:'#527baa'}},grid:{vertLines:{color:theme==='light'?'#e8edf4':'#19212d'},horzLines:{color:theme==='light'?'#e8edf4':'#19212d'}},rightPriceScale:{borderColor:'#263040',minimumWidth:70,mode:scaleMode,autoScale:true},timeScale:{shiftVisibleRangeOnNewBar:false,lockVisibleTimeRangeOnResize:true,borderColor:'#263040',timeVisible:!['1d','1w','1M'].includes(pane.timeframe),rightOffset:7,barSpacing:7,minBarSpacing:0.001,tickMarkFormatter:(t:Time,k:TickMarkType)=>tickLabel(t,k,displayZone)},localization:{locale:'en-IN',priceFormatter:formatActualPrice,timeFormatter:(time:Time)=>new Intl.DateTimeFormat('en-IN',{timeZone:displayZone,dateStyle:'medium',...(!['1d','1w','1M'].includes(pane.timeframe)?{timeStyle:'short' as const}:{})}).format(date(time))},crosshair:{vertLine:{color:'#61748e',labelBackgroundColor:'#34445c'},horzLine:{color:'#61748e',labelBackgroundColor:'#34445c'}},handleScroll:true,handleScale:true});
    chart.current=c;setChartEpoch(v=>v+1);container.current.dataset.chartCreations=String(Number(container.current.dataset.chartCreations??0)+1);if(container.current){container.current.dataset.priceMode=String(c.priceScale('right').options().mode);container.current.dataset.autoScale=String(c.priceScale('right').options().autoScale);}
    let main:ISeriesApi<SeriesType>;
    if(pane.chart_type==='candles')main=c.addSeries(CandlestickSeries,{priceFormat:{type:'price',precision:data?.precision??precision,minMove:10**-(data?.precision??precision)},upColor:'#37c5a2',downColor:'#ee6a79',wickUpColor:'#37c5a2',wickDownColor:'#ee6a79',borderVisible:false});
    else if(pane.chart_type==='area')main=c.addSeries(AreaSeries,{priceFormat:{type:'price',precision:data?.precision??precision,minMove:10**-(data?.precision??precision)},lineColor:'#37c5a2',topColor:'#37c5a230',bottomColor:'#37c5a200',lineWidth:2});
    else main=c.addSeries(LineSeries,{priceFormat:{type:'price',precision:data?.precision??precision,minMove:10**-(data?.precision??precision)},color:'#37c5a2',lineWidth:2});
    const ready=dataFor.current===identity;
    const initialRows=ready?rowsRef.current:[];
    main.setData(initialRows.map(r=>({...r,time:r.time as UTCTimestamp,value:r.close})));
    mainSeries.current=main;const drawingsPrimitive=new DrawingsPrimitive();primitive.current=drawingsPrimitive;main.attachPrimitive(drawingsPrimitive);drawingsPrimitive.volumeSupported=pane.kind!=='index'&&pane.kind!=='forex';drawingsPrimitive.rows=initialRows;drawingsPrimitive.currency=data?.currency||pane.currency||"";drawingsPrimitive.precision=data?.precision??precision;drawingsPrimitive.update(pane.drawing_sets[drawingStorageKey(pane)]||[],drawing.selected,pane.drawings_hidden);
    indicatorRender.current={slots:new Map(),handles:[],primitives:[],owners:[]};
    if(initialRows.length){if(preserve&&view.current)c.timeScale().setVisibleLogicalRange(view.current);else c.timeScale().setVisibleLogicalRange({from:Math.max(0,initialRows.length-150),to:initialRows.length+6});}
    const scaleFrame=requestAnimationFrame(()=>{if(chart.current!==c)return;c.priceScale('right').getVisibleRange();c.priceScale('right').setAutoScale(scaleRef.current.auto);if(container.current)container.current.dataset.autoScale=String(c.priceScale('right').options().autoScale);});
    setCurrent(initialRows.at(-1)||null);
    // O(1) crosshair lookup even with decades of history.

    c.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(container.current&&range){container.current.dataset.viewFrom=String(range.from);container.current.dataset.viewTo=String(range.to);if(!layoutResizing.current&&syncRef.current.active&&syncRef.current.syncTime){const visible=c.timeScale().getVisibleRange();if(visible)window.dispatchEvent(new CustomEvent('terminal-sync',{detail:{id:pane.id,range:visible}}));}}});
    c.subscribeCrosshairMove(p=>{
      // Lightweight Charts synthetic positions skip mouse events; later layout
      // recalculations may report a clipped pixel. Keep a synced legend on the
      // requested financial candle until an actual pointer event takes over.
      if(p.sourceEvent)syncedCrosshair.current=undefined;
      const time=!p.sourceEvent&&!syncRef.current.active&&syncRef.current.syncCrosshair&&syncedCrosshair.current!==undefined?syncedCrosshair.current:p.time;
      const row=time?indexedRef.current.get(Number(time))||rowsRef.current.at(-1)||null:rowsRef.current.at(-1)||null;
      setCurrent(row);if(container.current)container.current.dataset.crosshairTime=String(row?.time??'');
      if(syncRef.current.active&&syncRef.current.syncCrosshair)window.dispatchEvent(new CustomEvent('terminal-sync',{detail:{id:pane.id,time:p.time||null}}));
    });
    return()=>{const visible=c.timeScale().getVisibleLogicalRange();if(visible&&initialRows.length)view.current={from:visible.from,to:visible.to};cancelAnimationFrame(scaleFrame);if(showVolume&&c.panes()[1])paneHeights.current.set('volume',c.panes()[1].getStretchFactor());for(const [id,index] of indicatorRender.current.slots)paneHeights.current.set(id,c.panes()[index].getStretchFactor());// Stop owned primitive timers/listeners before LWC disposes its canvases.
      detachIndicatorPrimitives(indicatorRender.current);main.detachPrimitive(drawingsPrimitive);
      c.remove();chart.current=null;primitive.current=null;mainSeries.current=null;volumeSeries.current=null;};
  },[!!data,pane.symbol,pane.timeframe,pane.chart_type,theme]);
  useEffect(()=>{
    const c=chart.current,m=mainSeries.current;if(!c||!m)return;const a=pane.appearance;
    const grid=(a.grid_color||(theme==='light'?'#b4bfce':'#334155'))+Math.round(a.grid_opacity*255).toString(16).padStart(2,'0');
    c.applyOptions({layout:{background:{type:ColorType.Solid,color:a.background||(theme==='light'?'#ffffff':'#0d131c')}},grid:{vertLines:{visible:a.grid_visible,color:grid},horzLines:{visible:a.grid_visible,color:grid}},rightPriceScale:{scaleMargins:{top:a.margin_top,bottom:a.margin_bottom}},timeScale:{visible:a.dates_visible,timeVisible:a.time_visible&&!['1d','1w','1M'].includes(pane.timeframe),barSpacing:a.bar_spacing},crosshair:{vertLine:{visible:a.crosshair,labelVisible:a.crosshair},horzLine:{visible:a.crosshair,labelVisible:a.crosshair}}});
    m.applyOptions({priceLineVisible:a.price_line,lastValueVisible:a.last_value,...(pane.chart_type==='candles'?{upColor:a.up_color,downColor:a.down_color,wickUpColor:a.wick_up,wickDownColor:a.wick_down,borderUpColor:a.border_up,borderDownColor:a.border_down,borderVisible:a.borders}:{})});
    const mark=createTextWatermark(c.panes()[0],{visible:a.watermark,horzAlign:'center',vertAlign:'center',lines:[{text:pane.kind==='index'?pane.name:symbolLabel(pane.symbol),color:theme==='dark'?'#ffffff0d':'#0000000d',fontSize:48,fontStyle:'bold'}]});
    return()=>{if(chart.current===c)mark.detach();};
  },[pane.appearance,!!data,pane.chart_type,pane.volume,pane.timeframe,pane.symbol,theme]);
  useEffect(()=>{
    const c=chart.current,m=mainSeries.current;if(!c||!m)return;
    const identity=`${instrumentKey}/${pane.timeframe}/${requested.start}/${requested.end}/${source}/${adjusted}`;if(dataFor.current!==identity)return;
    const previousRange=c.timeScale().getVisibleLogicalRange(),previousPrice=!scaleRef.current.auto?c.priceScale('right').getVisibleRange():null;
    const nextView=data?.stream_received_at?streamView(previousRange,renderedRows.current,rows,pane.auto_follow):updatedView(previousRange,renderedLength.current,rows.length,pane.auto_follow);renderedLength.current=rows.length;pendingStudyView.current=replay!==null?{from:Math.max(0,rows.length-100),to:rows.length+6}:replayRestore.current??nextView;replayRestore.current=null;
    const tail=rows.at(-1),oldTail=renderedRows.current.at(-1),incremental=!!data?.stream_update_only&&replay===null&&!!tail&&!!oldTail&&renderedRows.current[0]?.time===rows[0]?.time&&(tail.time===oldTail.time||rows.at(-2)?.time===oldTail.time);
    // A shorter replay prefix removes the hovered histogram's first visible value.
    // Clear that obsolete hover before LWC synchronously re-hit-tests old series.
    if(rows.length<renderedRows.current.length)c.clearCrosshairPosition();
    if(incremental){m.update({...tail,time:tail.time as UTCTimestamp,value:tail.close});volumeSeries.current?.update(tail.volume===null?{time:tail.time as UTCTimestamp}:{time:tail.time as UTCTimestamp,value:tail.volume,color:tail.close>=tail.open?'#37c5a255':'#ee6a7955'});}
    else{m.setData(rows.map(r=>({...r,time:r.time as UTCTimestamp,value:r.close})));volumeSeries.current?.setData(rows.map(r=>r.volume===null?{time:r.time as UTCTimestamp}:{time:r.time as UTCTimestamp,value:r.volume,color:r.close>=r.open?'#37c5a255':'#ee6a7955'}));}
    incrementalStudies.current=incremental;renderedRows.current=rows;
    if(container.current)container.current.dataset.streamUpdate=incremental?'incremental':'reset';
    if(pendingStudyView.current&&replay===null)c.timeScale().setVisibleLogicalRange(pendingStudyView.current);
    if(previousPrice)c.priceScale('right').setVisibleRange(previousPrice);
    setCurrent(rows.at(-1)||null);
    if(replay!==null)c.timeScale().setVisibleLogicalRange({from:Math.max(0,rows.length-100),to:rows.length+6});
    if(container.current){container.current.dataset.renderRevision=String(++renderRevision.current);container.current.dataset.lastClose=String(rows.at(-1)?.close??'');container.current.dataset.lastVolume=String(rows.at(-1)?.volume??'');container.current.dataset.renderedBars=String(rows.length);container.current.dataset.replay=String(replay!==null);container.current.dataset.lastRenderedTime=String(rows.at(-1)?.time||0);}
    if(primitive.current){const p=primitive.current;p.volumeSupported=pane.kind!=='index'&&pane.kind!=='forex';p.rows=rows;p.timezone=chartZone;p.interval=pane.timeframe;p.currency=data?.currency||pane.currency||"";p.precision=data?.precision??precision;p.update(pane.drawing_sets[drawingStorageKey(pane)]||[],drawing.selected,pane.drawings_hidden,p.preview);p.replayTime=replay!==null?rows.at(-1)?.time||null:null;const intraday=!['1d','1w','1M'].includes(pane.timeframe);p.sessionTimes=pane.appearance.session_separators&&intraday?rows.filter((r,i)=>i===0||(r.session||marketDay(r.time,chartZone))!==(rows[i-1].session||marketDay(rows[i-1].time,chartZone))).map(r=>r.time):[];p.requestUpdate();}
    if(data&&rows.length){const last=rows.at(-1)!,prev=rows.at(-2);onDataRef.current(instrumentKey,{candle:last,change:pane.timeframe==='1d'&&prev&&prev.close>0?(last.close/prev.close-1)*100:null,source:data.source,first:data.first_available,last:new Date(last.time*1000).toLocaleDateString('en-CA',{timeZone:displayZone}),interval:pane.timeframe,fetched_at:data.fetched_at});}
    let second=0;const frame=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{pendingStudyView.current=null;});});return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(second);};
  },[rows,data,pane.symbol,pane.timeframe,pane.chart_type,pane.volume,theme,pane.appearance.session_separators]);
  // Replace only study series. Main candles, horizontal zoom and a manual
  // logarithmic/linear price range remain on the same chart instance.
  useEffect(()=>{
    const c=chart.current;if(!c)return;
    const previous=pendingStudyView.current??c.timeScale().getVisibleLogicalRange(),manualPrice=!scaleRef.current.auto?c.priceScale('right').getVisibleRange():null;
    for(const [id,index] of indicatorRender.current.slots)if(c.panes()[index])paneHeights.current.set(id,c.panes()[index].getStretchFactor());
    const layout=JSON.stringify([pane.indicators,pane.indicators_hidden,showVolume,pane.chart_type,theme]);
    if(incrementalStudies.current&&studyLayout.current===layout&&data?.stream_update_only&&replay===null&&indicatorRender.current.handles.length===computed.series.length&&computed.series.length&&renderedRows.current[0]?.time===rows[0]?.time){
      updateIndicatorPanes(indicatorRender.current,computed.series);if(pendingStudyView.current)c.timeScale().setVisibleLogicalRange(pendingStudyView.current);
      return;
    }
    studyLayout.current=layout;
    detachIndicatorPrimitives(indicatorRender.current);
    for(const series of [...indicatorRender.current.handles].reverse())c.removeSeries(series);
    if(showVolume&&!volumeSeries.current){volumeSeries.current=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false},1);volumeSeries.current.setData(rows.map(r=>r.volume===null?{time:r.time as UTCTimestamp}:{time:r.time as UTCTimestamp,value:r.volume,color:r.close>=r.open?'#37c5a255':'#ee6a7955'}));}
    else if(!showVolume&&volumeSeries.current){c.removeSeries(volumeSeries.current);volumeSeries.current=null;}
    const identity=`${instrumentKey}/${pane.timeframe}/${requested.start}/${requested.end}/${source}/${adjusted}`;
    indicatorRender.current=renderIndicatorPanes(c,dataFor.current===identity?computed.series:[],showVolume,paneHeights.current,mainSeries.current??undefined);setStudyEpoch(v=>v+1);
    if(previous)c.timeScale().setVisibleLogicalRange(previous);if(manualPrice)c.priceScale('right').setVisibleRange(manualPrice);
  },[computed,data,pane.symbol,pane.timeframe,pane.chart_type,pane.volume,pane.indicators_hidden,theme]);
  useLayoutEffect(()=>{
    const c=chart.current;if(!c)return;const range=c.timeScale().getVisibleLogicalRange(),price=c.priceScale('right').getVisibleRange(),wasHidden=previousHidden.current;previousHidden.current=hidden;layoutResizing.current=true;
    if(hidden){layoutSnapshot.current={range,price};return;}
    const snapshot=wasHidden&&layoutSnapshot.current?layoutSnapshot.current:{range,price};let second=0;
    const frame=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{if(chart.current===c){if(snapshot.range)c.timeScale().setVisibleLogicalRange(snapshot.range);if(snapshot.price&&!scaleRef.current.auto)c.priceScale('right').setVisibleRange(snapshot.price);}layoutResizing.current=false;});});
    return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(second);};
  },[hidden,expanded]);
  const resetChart=()=>{const count=rows.length;chart.current?.timeScale().setVisibleLogicalRange({from:Math.max(0,count-150),to:count+6});};
  const replayView=useRef<{from:number;to:number}|null>(null);
  const exitReplay=()=>{replayRestore.current=replayView.current;replayActive.current=false;setReplay(null);setPlaying(false);requestAnimationFrame(()=>{if(replayView.current)chart.current?.timeScale().setVisibleLogicalRange(replayView.current);else resetChart();});};
  const startReplay=()=>{if(!data?.candles.length){setRangeNotice('Load historical candles before starting replay.');return;}replayRows.current=data.candles.map(r=>({...r}));replayActive.current=true;replayView.current=chart.current?.timeScale().getVisibleLogicalRange()||null;setReplay(Math.max(0,data.candles.length-100));setPlaying(false);};
  const screenshot=async()=>{try{const canvas=chart.current?.takeScreenshot(true,true);if(canvas)await window.terminal.exportScreenshot(canvas.toDataURL('image/png'),`${pane.name||pane.symbol}-${pane.timeframe}${replay!==null?'-replay':''}.png`);}catch(e){setRangeNotice((e as Error).message);}};
  const actionsRef=useRef({drawing,startReplay,exitReplay,screenshot,onExpand});actionsRef.current={drawing,startReplay,exitReplay,screenshot,onExpand};
  useEffect(()=>{const handle=(e:Event)=>{const d=(e as CustomEvent).detail;if(d.id!==pane.id)return;const a=actionsRef.current;if(d.action==='settings')setAppearanceOpen(true);else if(d.action==='replay')a.startReplay();else if(d.action==='screenshot')void a.screenshot();else if(d.action==='fullscreen')a.onExpand();else a.drawing.command(d.action);};window.addEventListener('terminal-command',handle);return()=>window.removeEventListener('terminal-command',handle);},[pane.id]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setAppearanceOpen(false);setEditIndicator(null);drawing.closeEditor();if(active)drawing.reset();return;}if(!active||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement||document.querySelector('[role="dialog"]'))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();drawing.command(e.shiftKey?'redo':'undo');}if(e.key==='Enter'){drawing.command('finish');}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();drawing.command('delete');}if(e.key==='Escape')drawing.reset();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[active,drawing]);
  useEffect(()=>{const receive=(e:Event)=>{const d=(e as CustomEvent).detail,c=chart.current,m=mainSeries.current;if(!c||!m||d.id===pane.id||active||!m.data().length||!c.timeScale().getVisibleRange())return;if(syncTime&&d.range){const items=rowsRef.current;if(items.length){const from=Math.max(Number(d.range.from),items[0].time),to=Math.min(Number(d.range.to),items.at(-1)!.time);if(from<to)c.timeScale().setVisibleRange({from:from as UTCTimestamp,to:to as UTCTimestamp});}}if(syncCrosshair&&'time' in d){syncedCrosshair.current=d.time===null?null:Number(d.time);if(container.current)container.current.dataset.receivedTime=String(d.time);const row=indexedRef.current.get(d.time);if(row){c.setCrosshairPosition(row.close,row.time as UTCTimestamp,m);setCurrent(row);if(container.current)container.current.dataset.crosshairTime=String(row.time);}else{c.clearCrosshairPosition();setCurrent(rowsRef.current.at(-1)||null);}}};window.addEventListener('terminal-sync',receive);return()=>window.removeEventListener('terminal-sync',receive);},[active,pane.id,syncTime,syncCrosshair]);
  const goTo=()=>{const stamp=marketMidnight(goDate,displayZone);if(!Number.isFinite(stamp))return;const index=rows.findIndex(r=>r.time>=stamp);if(index<0){setRangeNotice('That date is outside the fetched history. Choose ALL or a wider range.');return;}chart.current?.timeScale().setVisibleLogicalRange({from:Math.max(0,index-40),to:index+40});};
  const refreshHistory=async(automatic=false)=>{
    if((refreshPaused&&!automatic)||replayActive.current||source==='nse'||!data||refreshLease.current||hidden||!refreshVisible)return;
    const identity=liveIdentity,generation=++refreshGeneration.current;
    const params=new URLSearchParams({symbol:instrumentKey,interval:pane.timeframe,adjusted:String(adjusted),automatic:String(automatic)});
    if(pane.provider==='hyperliquid'&&pane.native_mapping)params.set('native_mapping',pane.native_mapping);
    if(requested.start)params.set('start',requested.start);if(requested.end)params.set('end',requested.end);
    const lease=acquireHistory('/api/history/refresh?'+params);refreshLease.current=lease;setRefreshing(true);
    try{
      const value=await lease.promise;
      if(generation!==refreshGeneration.current||latestIdentity.current!==identity||replayActive.current)return;
      setData(old=>{if(!old||!value.incremental_only)return value;const candles=mergeCandles(old.candles,value.candles);return {...value,candles,returned:candles.length,first_available:old.first_available,last_available:value.last_available>old.last_available?value.last_available:old.last_available,actions:mergeCandles(old.actions,value.actions)};});setRefreshError('');setFailure(null);setError('');
    }catch(e){if(generation===refreshGeneration.current&&!replayActive.current){const problem=chartFailure(e);setRefreshError(problem.message);setFailure(problem);}throw e;}
    finally{lease.release();if(refreshLease.current===lease){refreshLease.current=null;setRefreshing(false);}}
  };
  useEffect(()=>{if(replay!==null){refreshGeneration.current++;refreshLease.current?.release();refreshLease.current=null;setRefreshing(false);}return()=>{};},[replay]);
  useEffect(()=>{setRefreshing(false);return()=>{refreshGeneration.current++;refreshLease.current?.release();refreshLease.current=null;};},[liveIdentity,refreshVisible,refreshPaused]);
  useRefreshTask('chart:'+pane.id+':'+liveIdentity,refreshVisible&&!loading&&!!data&&source!=='nse'&&!(stream.enabled&&pane.provider==='hyperliquid')&&pane.auto_refresh&&replay===null,Math.max(refreshSeconds,['1d','1w','1M'].includes(pane.timeframe)?300:60),()=>refreshHistory(true));
  const doRefresh=()=>{if(replayActive.current||loadBusy.current||Date.now()<retryUntil)return;if(data&&source!=='nse'){void refreshHistory().catch(()=>{});return;}force.current=source!=='nse';setRefresh(r=>r+1);};
  const selectRange=(value:string)=>{setRange(value);setRangeNotice('');if(value==='MAX'||value==='ALL'){setRequested({});return;}const end=new Date(),start=value==='YTD'?new Date(marketMidnight(marketDay(end.getTime()/1000,chartZone).slice(0,4)+'-01-01',chartZone)*1000):new Date(end.getTime()-rangeDays[value]*86400000);setRequested({start:start.toLocaleDateString('en-CA',{timeZone:chartZone}),end:end.toLocaleDateString('en-CA',{timeZone:chartZone})});};
  const applyCustom=()=>{if(!dates.start||!dates.end||dates.start>dates.end){setRangeNotice('Choose a start date on or before the end date.');return;}setRequested(dates);setRange('CUSTOM');setCustom(false);};
  const importNSE=async()=>{setLoading(true);setError('');try{const result=await window.terminal.selectFiles('history',pane.symbol);if(result){setSource('nse');setAdjusted(false);setRefresh(r=>r+1);}}catch(e){setError((e as Error).message);}finally{setLoading(false);}};
  const workspace=useStudyWorkspace(chart,container,viewport,indicatorRender,pane,computed.series,JSON.stringify([chartEpoch,studyEpoch,!!data,pane.symbol,pane.timeframe,pane.chart_type,theme,computed.series.map(s=>[s.id,s.name,s.pane]),showVolume]),onChange);
  const displayed=current||(!loading?rows.at(-1)||null:null);
  return <section className={`chart-pane ${active?'active':''}`} data-testid={`pane-${pane.id}`} hidden={hidden} data-maximized={expanded} onPointerDown={onActive}>
    <ChartToolbar onAlert={()=>onAlert(data?.candles.at(-1)?.close)} pane={pane} replay={replay!==null||refreshPaused||!refreshVisible} loading={loading||refreshing} expanded={expanded} onSearch={onSearch} onChange={onChange} onIndicators={onIndicators} onRefresh={doRefresh} onExpand={onExpand}/>
    <div className="chart-scroll" ref={viewport} tabIndex={0} aria-label={`Chart studies viewport ${pane.id}`}><div className="chart-surface" style={{height:workspace.height||'100%'}}>
    <div className="chart-legend"><div className="legend-title"><CandlestickChart size={14}/><strong>{pane.kind==='index'?pane.name:symbolLabel(pane.symbol)}</strong><span>· {pane.timeframe} · {pane.exchange} · {data?.currency||pane.currency||"Currency unconfirmed"}</span><span className="demo-mini" title={pane.contract||undefined}>{replay!==null?'REPLAY':data?.source?.includes('FIXTURE')?data.source:providerLabel(pane)}</span>{pane.kind==='future'&&<span className="demo-mini" title={data?.contract||pane.contract}>{(data?.contract||pane.contract||'').startsWith('continuous')?'CONTINUOUS · NOT AN EXPIRY':'EXPIRING FUTURE'}</span>}</div><div className="ohlc">{displayed?['open','high','low','close'].map((key,i)=><span key={key}>{['O','H','L','C'][i]} <b className={displayed.close>=displayed.open?'positive':'negative'}>{formatActualPrice(displayed[key as 'open'])}</b></span>):<span>{loading?'Fetching history…':'No candles'}</span>}</div><div className="studies-legend">{pane.indicators.filter(i=>i.visible&&!pane.indicators_hidden).map(i=><span key={i.id} style={{color:i.color}}>{indicatorLabel(i)}{isVolume(i.kind)&&<small data-testid={`volume-study-unit-${pane.id}-${i.id}`} title="Volume units are provider-specific; cumulative values use loaded history and never reset at sessions."> · {volumeUnits(i,volumeInfo)}</small>}{referenceLabels.has(i.id)&&<small data-testid={`reference-status-${pane.id}-${i.id}`} title={referenceLabels.get(i.id)!.title}> · {referenceLabels.get(i.id)!.brief}</small>}{i.kind==='VRVP'&&<small> · {volumeInfo.volume_unit}</small>}<button aria-label={`Legend settings ${i.id}`} title="Edit indicator" onClick={()=>setEditIndicator(i)}><SlidersHorizontal size={10}/></button></span>)}{pane.indicators.some(i=>i.visible&&isVolume(i.kind))&&!pane.indicators_hidden&&<small data-testid={`volume-source-units-${pane.id}`}>Volume input · {volumeInfo.volume_unit}</small>}{showVolume&&<span>{data?.volume_available===false?'Volume unavailable':'Volume · historical'}</span>}{displayed&&<span>{new Intl.DateTimeFormat('en-IN',{timeZone:displayZone,dateStyle:'medium',...(!['1d','1w','1M'].includes(pane.timeframe)?{timeStyle:'short' as const}:{})}).format(new Date(displayed.time*1000))}</span>}</div></div>
    <div className="chart-canvas" data-history-symbol={data?.canonical_id} data-history-interval={data?.interval} data-history-stale={!!data?.stale||!!refreshError} ref={container} data-chart-instance={chartIdentity.current} data-study-ms={studyTiming.current.toFixed(3)} data-study-count={computed.series.length} data-study-series={JSON.stringify(computed.series.map(s=>({id:s.id,name:s.name,pane:s.pane,...(s.units?{units:s.units}:{}),offset:s.offset??0,cloud:!!s.cloud,provisional:!!s.provisional,valid:s.points.filter(p=>p.value!==null).length,last:s.points.at(-1)?.value??null})))}/><StudyPaneControls rows={workspace.headers} pane={pane} onChange={onChange} onSettings={id=>setEditIndicator(pane.indicators.find(i=>i.id===id)??null)}/></div></div>{loading&&<div className="chart-overlay chart-loading" role="status" data-testid={`chart-loading-${pane.id}`}><RefreshCw size={14} className="spin"/> {waiting?'Waiting for provider…':'Loading chart…'}</div>}{error&&<div className={`chart-overlay error ${data?'chart-cached-error':''}`} role="status" data-testid={legacyCrypto(pane)?`legacy-migration-${pane.id}`:`chart-error-${pane.id}`}><strong>{legacyCrypto(pane)?'Migration required':data?'Showing cached data':failure?failureTitle(failure):'Unsupported instrument'}</strong><p>{legacyCrypto(pane)?legacyMessage:error}</p><div className="connection-actions">{legacyCrypto(pane)?<><button onClick={()=>onMigration(true)}>Choose Hyperliquid Market</button><button onClick={()=>onMigration(false)}>Open Migration</button></>:<>{(!failure||failure.retryable)&&<button disabled={loading||retryClock<retryUntil} onClick={doRefresh}>Retry{retryClock<retryUntil?` (${Math.ceil((retryUntil-retryClock)/1000)}s)`:null}</button>}<button onClick={onSearch}>Change Symbol</button></>}{pane.kind==='equity'&&pane.exchange==='NSE'&&<button onClick={importNSE}><Upload size={13}/> Select official NSE files</button>}</div></div>}
    {stream.enabled&&pane.provider==='hyperliquid'&&<div className="stream-status" data-testid={`stream-status-${pane.id}`} data-state={replay!==null?'replay':!streamEnabled?'paused':streamFrame?.state||stream.state}>{replay!==null?'Live isolated · replay':!streamEnabled?'Public WS paused':`Public WS · ${streamFrame?.state||stream.state}`}{streamFrame?.received_at?` · received ${new Date(streamFrame.received_at*1000).toLocaleTimeString()}`:''}{streamFrame?.error||stream.error?` · ${streamFrame?.error||stream.error}`:''}</div>}
    <div className="history-meta" title={data?`${data.source} · ${data.first_available} to ${data.last_available} · ${data.returned} bars · ${data.notice}`:undefined}>{data?`${data.source} · ${data.first_available} → ${data.last_available} · ${data.returned.toLocaleString()} bars · ${data.stale?'Cached / stale · Showing cached data':data.cached?'memory cache':'retrieved'} · Updated at ${new Date(data.fetched_at*1000).toLocaleTimeString('en-IN',{timeZone:chartZone})} ${chartZone}${data.actions.length?' · '+data.actions.length+' corporate actions':''}`:'History stored in memory only'}{data&&!data.candles.length&&<b> · No candles in this range</b>}{data&&<span data-testid={`chart-update-status-${pane.id}`} className={refreshError?'chart-refresh-error':''}> · {replay!==null?'Refresh paused in replay':refreshPaused||!refreshVisible?'Refresh paused · last candle '+new Date((rows.at(-1)?.time||0)*1000).toLocaleString('en-IN',{timeZone:displayZone}):refreshError?'Stale · Showing cached data · '+refreshError:refreshing?`Checking ${data.source}…`:'Last candle '+new Date((rows.at(-1)?.time||0)*1000).toLocaleString('en-IN',{timeZone:displayZone})}</span>}{data&&(data.stale||refreshError)&&<button disabled={refreshing||retryClock<retryUntil} onClick={doRefresh}>Retry chart</button>}</div>
    {replay!==null&&data&&<ReplayControls timezone={displayZone} rows={replayRows.current||[]} position={replay} playing={playing} speed={speed} onPosition={setReplay} onPlaying={setPlaying} onSpeed={setSpeed} onClose={exitReplay}/>}
    <footer className="bottom-chart-toolbar"><div className="range-toolbar">{['1D','5D','1M','3M','6M','YTD','1Y','5Y','ALL'].map(r=><button key={r} aria-label={`Range ${r} pane ${pane.id}`} className={range===r||r==='ALL'&&range==='MAX'?'selected':''} disabled={replay!==null} onClick={()=>selectRange(r)}>{r}</button>)}<button aria-label={`Custom range pane ${pane.id}`} className={custom?'selected':''} disabled={replay!==null} onClick={()=>setCustom(!custom)}>Custom</button><details className="go-date"><summary title="Go to a date in fetched candles">Go to</summary><div><input aria-label={`Go to date pane ${pane.id}`} type="date" value={goDate} onChange={e=>setGoDate(e.target.value)}/><button onClick={goTo}>Go</button></div></details></div><span className="grow"/><span className="timezone" title="Instrument timezone; daily candles use the trading date">{chartZone}</span>
    <PriceScaleControls expanded={expanded} id={pane.id} scale={pane.scale} onChange={scale=>onChange({scale})} onReset={resetChart} onFit={()=>chart.current?.timeScale().fitContent()} onFullscreen={onExpand} onScreenshot={screenshot}/><button aria-label={`Data controls pane ${pane.id}`} aria-pressed={dataOpen} title="Source, corporate actions, adjustment and official NSE files" onClick={()=>setDataOpen(!dataOpen)}>Data</button></footer>
    <div className={`history-controls ${dataOpen?'open':''}`} hidden={!dataOpen}><select aria-label={`History source pane ${pane.id}`} value={source} onChange={e=>{setSource(e.target.value as 'yahoo'|'nse'|'hyperliquid');setAdjusted(false);}}>{pane.provider==='hyperliquid'?<option value="hyperliquid">Hyperliquid historical REST</option>:<option value="yahoo">Yahoo Finance</option>}{pane.kind==='equity'&&pane.exchange==='NSE'&&<option value="nse">Official NSE files</option>}</select><label><input type="checkbox" aria-label={`Auto-follow latest pane ${pane.id}`} checked={pane.auto_follow} onChange={e=>onChange({auto_follow:e.target.checked})}/> Follow latest edge</label><label title="Adjust OHLC by Yahoo Adj Close / Close; dividends and splits may affect historical comparisons"><input aria-label={`Adjusted prices pane ${pane.id}`} type="checkbox" checked={adjusted} disabled={source!=='yahoo'} onChange={e=>setAdjusted(e.target.checked)}/> Adjusted</label>{pane.kind==='equity'&&pane.exchange==='NSE'&&<button aria-label={`Import NSE history pane ${pane.id}`} onClick={importNSE}><Upload size={12}/> NSE files</button>}{data&&<details><summary>Data details</summary><p>{stream.enabled&&pane.provider==='hyperliquid'?'REST baseline notice; live WebSocket state is shown separately. ':''}{data.contract&&data.contract+". "}{data.notice}{computed.warnings.length>0&&' '+computed.warnings.join(' ')}</p><p>{data.actions.filter(a=>a.split!==0).map(a=>`${a.date}: split ${a.split}`).join(' · ')||'No split events supplied.'}</p></details>}</div>
    {data?.notice&&<div className="data-notice" title={data.notice}>{data.lookback_days?`Yahoo intraday request period: ${data.lookback_days}d. `:''}{data.notice.includes('Requested dates extend')?'Selected dates exceed available history. ':''}{data.candles.some(r=>r.partial)?'Some session bars are partial. ':''}</div>}
    {computed.warnings.length>0&&<div className="indicator-warning" title={computed.warnings.join(' ')}>{computed.warnings[0]}</div>}
    {drawing.selected&&(pane.drawing_sets[drawingStorageKey(pane)]||[]).find(d=>d.id===drawing.selected)?.kind==='horizontal'&&<button className="alert-from-line" aria-label={`Create alert from horizontal line pane ${pane.id}`} onClick={()=>onAlert((pane.drawing_sets[drawingStorageKey(pane)]||[]).find(d=>d.id===drawing.selected)?.anchors[0].price)}>Alert from selected price line</button>}{drawing.selected&&!pane.drawings_locked&&<div className="selected-drawing-controls"><button aria-label={`Edit selected drawing pane ${pane.id}`} onClick={drawing.edit}>Edit drawing</button><button aria-label={`Delete selected drawing pane ${pane.id}`} onClick={()=>drawing.command('delete')}>Delete</button></div>}{drawing.editor}{drawing.library}{drawing.confirmation}{drawing.placement&&<div className="drawing-placement-notice">{drawing.placement}{drawing.variable&&<button onClick={drawing.finish}>{tool==='polyline'?'Finish polyline':'Finish drawing'}</button>}</div>}{drawing.notice&&<div className="range-notice">{drawing.notice}<button onClick={drawing.clearNotice}>Dismiss</button></div>}
    {appearanceOpen&&<ChartSettings pane={pane} theme={theme} onChange={onChange} onClose={()=>setAppearanceOpen(false)}/>}
    {editIndicator&&<IndicatorSettingsDialog value={editIndicator} onClose={()=>setEditIndicator(null)} onSave={i=>onChange({indicators:pane.indicators.map(old=>old.id===i.id?i:old)})}/>}
    {custom&&<div className="custom-range"><input type="date" aria-label="Range start" value={dates.start} onChange={e=>setDates({...dates,start:e.target.value})}/><span>to</span><input type="date" aria-label="Range end" value={dates.end} onChange={e=>setDates({...dates,end:e.target.value})}/><button onClick={applyCustom}>Apply</button><button onClick={()=>setCustom(false)}><X size={13}/></button></div>}
    {rangeNotice&&<div className="range-notice">{rangeNotice}<button aria-label="Dismiss range notice" onClick={()=>setRangeNotice('')}><X size={12}/></button></div>}
  </section>;
},(a,b)=>Object.keys(a).every(k=>typeof a[k as keyof typeof a]==='function'||a[k as keyof typeof a]===b[k as keyof typeof b]));
