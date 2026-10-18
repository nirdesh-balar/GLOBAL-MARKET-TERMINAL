import {VisibleProfilePrimitive} from './VisibleProfilePrimitive';
import {StudyPrimitive} from './StudyPrimitive';
import {HistogramSeries,LineSeries,type IChartApi,type UTCTimestamp,type ISeriesApi,type SeriesType} from 'lightweight-charts';
import type {Study} from './indicators';
export function renderIndicatorPanes(chart:IChartApi,series:Study[],volume:boolean,heights:Map<string,number>,priceSeries?:ISeriesApi<SeriesType>){const slots=new Map<string,number>();const handles:ISeriesApi<SeriesType>[]=[];const primitives:(StudyPrimitive|VisibleProfilePrimitive|null)[]=[];const owners:ISeriesApi<SeriesType>[]=[];for(const study of series){let index=0;if(study.pane!=='main'){if(!slots.has(study.pane)){const n=chart.panes().length;chart.addPane();slots.set(study.pane,n);chart.panes()[n].setStretchFactor(heights.get(study.pane)||.28);}index=slots.get(study.pane)!;}
 const s=study.histogram?chart.addSeries(HistogramSeries,{priceLineVisible:false,lastValueVisible:false,color:alphaColor(study.color,study.opacity)},index):chart.addSeries(LineSeries,{color:alphaColor(study.color,study.opacity),lineVisible:!(study.vector||study.offset||study.dots),pointMarkersVisible:!!study.dots&&!study.vector,pointMarkersRadius:2,lineWidth:study.width,lineStyle:study.style,...(study.vector&&priceSeries?{autoscaleInfoProvider:()=>null}:{}),priceLineVisible:false,lastValueVisible:index===0&&!study.vector,crosshairMarkerVisible:false},index);
 if(study.linear_scale)s.priceScale().applyOptions({mode:0,autoScale:true});
 handles.push(s);const primitive=study.profile?new VisibleProfilePrimitive(study):study.vector||study.offset||study.cloud||study.known_at?new StudyPrimitive(study):null;primitives.push(primitive);const owner=study.vector&&priceSeries?priceSeries:s;owners.push(owner);if(primitive)owner.attachPrimitive(primitive);s.setData((study.mutable?study.points.filter(p=>p.value!==null):study.points).map(p=>p.value===null?{time:p.time as UTCTimestamp}:{time:p.time as UTCTimestamp,value:p.value,...(study.histogram?{color:alphaColor(p.value>=0?study.color:study.down_color||study.color,study.opacity)}:{})}));
 for(const level of study.levels)s.createPriceLine({price:level,color:study.color,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:''});
 }return {slots,handles,primitives,owners};}

export function alphaColor(color:string,opacity=1){return color+Math.round(opacity*255).toString(16).padStart(2,'0');}

export function updateIndicatorPanes(render:{handles:ISeriesApi<SeriesType>[];primitives:(StudyPrimitive|VisibleProfilePrimitive|null)[]},studies:Study[]){
 for(const [i,s]of studies.entries()){
  if(s.vector||s.offset||s.cloud||s.mutable){render.handles[i].setData((s.mutable?s.points.filter(p=>p.value!==null):s.points).map(p=>p.value===null?{time:p.time as UTCTimestamp}:{time:p.time as UTCTimestamp,value:p.value}));render.primitives[i]?.set(s);}
  else {const p=s.points.at(-1);if(p)render.handles[i].update(p.value===null?{time:p.time as UTCTimestamp}:{time:p.time as UTCTimestamp,value:p.value,...(s.histogram?{color:alphaColor(p.value>=0?s.color:s.down_color||s.color,s.opacity)}:{})});}
 }
}

export function detachIndicatorPrimitives(render:{primitives:(StudyPrimitive|VisibleProfilePrimitive|null)[];owners:ISeriesApi<SeriesType>[]}){for(const [i,p]of render.primitives.entries())if(p)render.owners[i]?.detachPrimitive(p);}
