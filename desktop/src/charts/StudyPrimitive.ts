/** Native LWC primitive: bar offsets, Ichimoku cloud, and confirmed pivot markers.
 * Uses the chart's financial price transform and actual logical bar spacing;
 * does not insert synthetic candles or guess future exchange sessions.
 */
import type {ISeriesPrimitive,SeriesAttachedParameter,IChartApi,ISeriesApi,SeriesType,IPrimitivePaneView,UTCTimestamp,Coordinate,AutoscaleInfo} from 'lightweight-charts';
import type {CanvasRenderingTarget2D} from 'fancy-canvas';
import type {Study} from './indicators';
export class StudyPrimitive implements ISeriesPrimitive {
 private chart:IChartApi|null=null;private series:ISeriesApi<SeriesType>|null=null;private update=()=>{};
 private views:IPrimitivePaneView[]=[{zOrder:()=>this.study.cloud?'bottom':'normal',renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>target.useMediaCoordinateSpace(({context,mediaSize})=>this.paint(context,mediaSize.width,mediaSize.height))})}];
 constructor(public study:Study){}
 attached(p:SeriesAttachedParameter){this.chart=p.chart as IChartApi;this.series=p.series;this.update=p.requestUpdate;}
 detached(){this.chart=null;this.series=null;this.update=()=>{};}
 paneViews(){return this.views;}
 set(study:Study){this.study=study;this.update();}
 private x(time:number){const scale=this.chart?.timeScale(),x=scale?.timeToCoordinate(time as UTCTimestamp);return x===undefined||x===null?null:x+(this.study.offset??0)*(scale!.options().barSpacing);}
 autoscaleInfo(start:number,end:number):AutoscaleInfo|null{
  if(!this.chart||!this.series)return null;let min=Infinity,max=-Infinity;
  const range=this.indices(start,end);if(!range)return null;
  for(let i=range.from;i<=range.to;i++)for(const v of [this.study.points[i]?.value,this.study.cloud?.peer[i]?.value])if(v!==null&&v!==undefined&&Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}

  return min===Infinity?null:{priceRange:{minValue:min,maxValue:max}};
 }
 private indices(start:number,end:number){
  const first=this.study.points[0];if(!first||!this.chart)return null;const scale=this.chart.timeScale(),x=scale.timeToCoordinate(first.time as UTCTimestamp);if(x===null)return null;
  const base=scale.coordinateToLogical(x);if(base===null)return null;const offset=this.study.offset??0;
  return {from:Math.max(0,Math.floor(start-base-offset)-1),to:Math.min(this.study.points.length-1,Math.ceil(end-base-offset)+1)};
 }
 private paint(ctx:CanvasRenderingContext2D,width:number,height:number){
  if(!this.chart||!this.series)return;const s=this.study;
  const visible=this.chart.timeScale().getVisibleLogicalRange?.();const bounds=visible?this.indices(visible.from,visible.to):null;let from=bounds?.from??0,to=bounds?.to??s.points.length-1;if(s.mutable){while(from>0&&s.points[from]?.value===null)from--;while(to<s.points.length-1&&s.points[to]?.value===null)to++;}
  const xy=(p:{time:number;value:number|null})=>{if(p.value===null||!Number.isFinite(p.value))return null;const x=this.x(p.time),y=this.series!.priceToCoordinate(p.value);return x===null||y===null?null:{x,y};};
  ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
  if(s.cloud){const cloud=s.cloud;ctx.globalAlpha=cloud.opacity;
   const fill=(points:{x:number;y:number}[],color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fill();};
   for(let i=Math.max(1,from);i<=to;i++){const a=xy(s.points[i-1]),b=xy(s.points[i]),c=cloud.peer[i]&&xy(cloud.peer[i]),d=cloud.peer[i-1]&&xy(cloud.peer[i-1]);if(!a||!b||!c||!d||b.x<0||a.x>width)continue;
    const left=a.y-d.y,right=b.y-c.y;if(left*right<0){const t=left/(left-right),cross={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)};fill([a,cross,d],left<0?cloud.up:cloud.down);fill([cross,b,c],right<0?cloud.up:cloud.down);}else fill([a,b,c,d],left<=0?cloud.up:cloud.down);
   }
  }
  ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=s.width;ctx.globalAlpha=s.opacity??1;ctx.setLineDash(s.style===0?[]:s.style===1?[1,3]:s.style===2?[6,4]:s.style===3?[10,5]:[1,7]);
  if(s.vector||s.offset){let active=false,previous:{x:number;y:number}|null=null;ctx.beginPath();for(let i=from;i<=to;i++){const p=s.points[i];if(!p)continue;const q=xy(p);if(!q){if(!s.mutable){active=false;previous=null;}continue;}if(s.dots){const radius=s.width+1;ctx.moveTo(q.x+radius,q.y);ctx.arc(q.x,q.y,radius,0,Math.PI*2);continue;}if(active){if(s.step&&previous)ctx.lineTo(q.x,previous.y);ctx.lineTo(q.x,q.y);}else ctx.moveTo(q.x,q.y);active=true;previous=q;}if(s.dots)ctx.fill();else ctx.stroke();}
  if(s.known_at){const points=s.points.slice(from,to+1).map((p,i)=>({p,q:xy(p),at:s.known_at![from+i]})).filter(({q,at})=>q&&at&&q.x>=0&&q.x<=width);for(const {p,q,at}of points){ctx.beginPath();ctx.arc(q!.x,q!.y,3,0,Math.PI*2);ctx.fill();if(points.slice(-2).some(v=>v.p===p)){ctx.font='10px -apple-system,sans-serif';ctx.fillText('confirmed '+new Date(at*1000).toISOString().slice(0,16).replace('T',' ')+' UTC',Math.min(width-210,Math.max(2,q!.x+5)),q!.y-7);}}}
  ctx.restore();
 }
}
