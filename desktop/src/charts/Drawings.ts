import {interpolateLogicalCoordinate} from '../drawings/coordinates';
import type {IChartApi,ISeriesApi,SeriesType,ISeriesPrimitive,SeriesAttachedParameter,IPrimitivePaneView,UTCTimestamp,Logical} from 'lightweight-charts';
import type {CanvasRenderingTarget2D} from 'fancy-canvas';
import type {Candle,Drawing,DrawingAnchor} from '../types';
import {drawingGeometry,geometryHit,labelBox,logicalForTime,type GeometryContext,type Point} from '../drawings/geometry';
export {segmentDistance} from '../drawings/geometry';
export type PixelPoint=Point;
export function drawingKey(symbol:string,timeframe:string){return `${symbol}/${timeframe}`;}
export class DrawingsPrimitive implements ISeriesPrimitive {
 chart:IChartApi|null=null;series:ISeriesApi<SeriesType>|null=null;requestUpdate=()=>{};
 drawings:Drawing[]=[];selected:string|null=null;hidden=false;preview:Drawing|null=null;sessionTimes:number[]=[];replayTime:number|null=null;
 rows:Candle[]=[];currency='';precision=2;timezone='UTC';interval='1d';volumeSupported=true;
 private images=new Map<string,HTMLImageElement>();
 private measureContext=document.createElement('canvas').getContext('2d')!;
 private views:IPrimitivePaneView[]=[{zOrder:()=> 'top',renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>target.useMediaCoordinateSpace(({context,mediaSize})=>this.paint(context,mediaSize.width,mediaSize.height))})}];
 attached(param:SeriesAttachedParameter){this.chart=param.chart as IChartApi;this.series=param.series;this.requestUpdate=param.requestUpdate;}
 detached(){this.images.clear();this.chart=null;this.series=null;this.rows=[];this.requestUpdate=()=>{};}
 paneViews(){return this.views;}
 update(drawings:Drawing[],selected:string|null,hidden:boolean,preview:Drawing|null=null){this.drawings=drawings;this.selected=selected;this.hidden=hidden;this.preview=preview;this.requestUpdate();}
 point(anchor:DrawingAnchor):Point|null{
  if(!this.chart||!this.series)return null;
  const x=this.chart.timeScale().timeToCoordinate(anchor.time as UTCTimestamp)??this.logicalCoordinate(logicalForTime(this.rows,anchor.time)),y=this.series.priceToCoordinate(anchor.price);
  return x===null||y===null||!Number.isFinite(x)||!Number.isFinite(y)?null:{x,y};
 }
 logicalCoordinate(n:number){return interpolateLogicalCoordinate(n,i=>this.chart?.timeScale().logicalToCoordinate(i as Logical)??null);}
 private context(width:number,height:number):GeometryContext{return {width,height,rows:this.rows,point:a=>this.point(a),logicalToX:n=>this.logicalCoordinate(n),priceToY:p=>this.series?.priceToCoordinate(p)??null,currency:this.currency,precision:this.precision,timezone:this.timezone,interval:this.interval,volumeSupported:this.volumeSupported};}
 hit(p:Point):{id:string;anchor:number|null}|null{
  if(this.hidden||!this.chart)return null;const {width,height}=this.chart.paneSize(0);if(p.x<0||p.y<0||p.x>width||p.y>height)return null;
  for(const d of [...this.drawings].reverse()){
   const g=drawingGeometry(d,this.context(width,height));const anchor=geometryHit(g,p,d.id===this.selected,(text,size)=>{this.measureContext.font=`${size}px -apple-system, sans-serif`;return this.measureContext.measureText(text).width;});
   if(anchor!==undefined)return {id:d.id,anchor};
  }return null;
 }
 private paint(ctx:CanvasRenderingContext2D,width:number,height:number){
  const active=new Set([...this.drawings,...(this.preview?[this.preview]:[])].map(d=>d.params?.image_data).filter(Boolean));for(const key of this.images.keys())if(!active.has(key))this.images.delete(key);
  ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
  if(this.chart){ctx.strokeStyle='#64748b55';ctx.lineWidth=1;ctx.setLineDash([2,5]);for(const time of this.sessionTimes){const x=this.chart.timeScale().timeToCoordinate(time as UTCTimestamp);if(x!==null){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}}if(this.replayTime!==null){const x=this.chart.timeScale().timeToCoordinate(this.replayTime as UTCTimestamp);if(x!==null){ctx.strokeStyle='#f4bd61';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}}}
  if(!this.hidden)for(const d of [...this.drawings,...(this.preview?[this.preview]:[])]){
   const g=drawingGeometry(d,this.context(width,height));ctx.save();ctx.strokeStyle=d.color;ctx.fillStyle=d.color;ctx.lineWidth=d.width;ctx.globalAlpha=(d.opacity??1)*(d.kind==='highlighter'?.35:1);ctx.setLineDash(d.dash==='dash'?[8,5]:d.dash==='dot'?[2,4]:[]);
   for(const [index,fill] of g.fills.entries()){if(!fill.length)continue;ctx.save();ctx.fillStyle=g.fillColors?.[index]??d.color;ctx.globalAlpha=(d.opacity??1)*(d.fill_opacity??.08);ctx.beginPath();ctx.moveTo(fill[0].x,fill[0].y);for(const p of fill.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();ctx.restore();}
   for(const [index,path] of g.paths.entries()){const style=g.styles?.[index];ctx.strokeStyle=style?.color??d.color;ctx.lineWidth=g.strokeWidth??style?.width??d.width;const dash=style?.dash??d.dash;ctx.setLineDash(dash==='dash'?[8,5]:dash==='dot'?[2,4]:[]);if(!path.length)continue;ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();}
   for(const asset of g.images??[]){let img=this.images.get(asset.data);if(!img){img=new Image();img.onload=()=>this.requestUpdate();img.src=asset.data;this.images.set(asset.data,img);}if(img.complete&&img.naturalWidth)ctx.drawImage(img,asset.rect.x,asset.rect.y,asset.rect.width,asset.rect.height);}
   ctx.setLineDash([]);for(const label of g.labels){ctx.font=`${label.fontSize}px -apple-system, sans-serif`;const box=labelBox(label,t=>ctx.measureText(t).width);if(label.box){ctx.save();ctx.fillStyle='#172437';ctx.globalAlpha=.9*(d.opacity??1);ctx.fillRect(box.x,box.y,box.width,box.height);ctx.restore();ctx.strokeRect(box.x,box.y,box.width,box.height);}ctx.fillStyle=label.color??d.color;box.lines.forEach((text,i)=>ctx.fillText(text,label.point.x,label.point.y+i*(label.fontSize+4),label.maxWidth??460));}
   if(this.selected===d.id)for(const p of g.handles){ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();if(d.locked){ctx.strokeStyle='#ffffff';ctx.stroke();}}
   ctx.restore();
  }
  ctx.restore();
 }
}
