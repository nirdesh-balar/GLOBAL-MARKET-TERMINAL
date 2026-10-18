import type {ISeriesPrimitive,SeriesAttachedParameter,IChartApi,ISeriesApi,SeriesType,IPrimitivePaneView,AutoscaleInfo} from 'lightweight-charts';
import type {CanvasRenderingTarget2D} from 'fancy-canvas';
import type {Study} from './indicators';
import {estimatedProfile} from '../drawings/analytics';
import {volumeGood} from './volume';
/** Viewport-derived profile, never an anchored/fixed drawing or trade-level VAP.
 * At most one recalculation per 100ms; no OHLC/chart data mutation or autoscale.
 */
export class VisibleProfilePrimitive implements ISeriesPrimitive {
 private chart:IChartApi|null=null;private series:ISeriesApi<SeriesType>|null=null;private update=()=>{};private timer:ReturnType<typeof setTimeout>|undefined;
 private result:ReturnType<typeof estimatedProfile>|null=null;private disposed=false;private lastRows:unknown;private lastConfig='';private lastRange='';
 private stats={from:0,to:0,bars:0,ms:0,total:0,poc:null as number|null,vah:null as number|null,val:null as number|null,error:'Waiting for visible candles',calculations:0};
 private changed=()=>this.schedule();
 private views:IPrimitivePaneView[]=[{zOrder:()=> 'top',renderer:()=>({draw:(target:CanvasRenderingTarget2D)=>target.useMediaCoordinateSpace(({context,mediaSize})=>this.paint(context,mediaSize.width,mediaSize.height))})}];
 constructor(public study:Study){}
 attached(p:SeriesAttachedParameter){this.disposed=false;this.chart=p.chart as IChartApi;this.series=p.series;this.update=p.requestUpdate;this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.changed);this.schedule();}
 detached(){const el=this.chart?.chartElement().closest('.chart-canvas') as HTMLElement|null;if(el){const all=JSON.parse(el.dataset.visibleProfiles??'{}');delete all[this.study.id];el.dataset.visibleProfiles=JSON.stringify(all);}this.disposed=true;clearTimeout(this.timer);this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(this.changed);this.chart=null;this.series=null;}
 paneViews(){return this.views;}autoscaleInfo():AutoscaleInfo|null{return null;}
 set(study:Study){this.study=study;this.schedule();}
 private schedule(){if(!this.timer&&!this.disposed)this.timer=setTimeout(()=>{this.timer=undefined;this.calculate();},100);}
 private calculate(){const p=this.study.profile,range=this.chart?.timeScale().getVisibleLogicalRange();if(!p||!range||!this.chart)return;const from=Math.max(0,Math.ceil(range.from)),to=Math.min(p.rows.length-1,Math.floor(range.to)),config=JSON.stringify([p.config,p.volumeContext.zero_volume_is_missing]),key=from+':'+to;if(this.lastRows===p.rows&&this.lastRange===key&&this.lastConfig===config)return;this.lastRows=p.rows;this.lastRange=key;this.lastConfig=config;const start=performance.now(),rows=p.rows.slice(from,to+1),safe=rows.map(r=>{const copy={...r};return volumeGood(r,p.volumeContext)?r:{...copy,volume:null};});
  this.result=rows.length<=60000?estimatedProfile(safe,p.config.profile_bins??24,p.config.profile_value_area??70):null;
  if(this.result&&!this.result.error&&(!Number.isFinite(this.result.total)||this.result.rows.some(r=>![r.low,r.high,r.volume].every(Number.isFinite))))this.result={error:'Numerical volume/price range unavailable',rows:[],poc:null,vah:null,val:null,total:0,covered:0};
  this.stats={from,to,bars:rows.length,ms:performance.now()-start,total:this.result?.total??0,poc:this.result?.poc??null,vah:this.result?.vah??null,val:this.result?.val??null,error:this.result?.error??(this.result?'':'Visible range exceeds 60,000-candle budget'),calculations:this.stats.calculations+1};
  const el=this.chart.chartElement().closest('.chart-canvas') as HTMLElement|null;if(el){const all=JSON.parse(el.dataset.visibleProfiles??'{}');all[this.study.id]=this.stats;el.dataset.visibleProfiles=JSON.stringify(all);}this.update();
 }
 private paint(ctx:CanvasRenderingContext2D,width:number,height:number){if(!this.series)return;const p=this.study.profile!,c=p.config,result=this.result;ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();ctx.font='10px -apple-system,sans-serif';ctx.fillStyle=this.study.color;ctx.globalAlpha=this.study.opacity??1;ctx.fillText('Estimated Visible Range Volume Profile (OHLCV-based)',Math.max(6,width-440),Math.max(18,height-32));
  if(!result||result.error){ctx.fillText(this.stats.error,Math.max(6,width-440),Math.max(32,height-18));ctx.restore();return;}
  const max=Math.max(...result.rows.map(r=>r.volume)),extent=width*(c.profile_width??30)/100;
  for(const row of result.rows){const a=this.series.priceToCoordinate(row.low),b=this.series.priceToCoordinate(row.high);if(a===null||b===null)continue;const w=max?extent*row.volume/max:0;ctx.globalAlpha=(row.inArea?.22:.12)*(this.study.opacity??1);ctx.fillRect(width-w,Math.min(a,b),w,Math.max(1,Math.abs(a-b)));}
  for(const [name,value]of [['POC',result.poc],['VAH',result.vah],['VAL',result.val]] as const){const o=c.line_options?.[name]??{};if(o.visible===false||value===null)continue;const y=this.series.priceToCoordinate(value);if(y===null)continue;ctx.globalAlpha=o.opacity??this.study.opacity??1;ctx.strokeStyle=o.color??this.study.color;ctx.lineWidth=o.width??this.study.width;const style=o.style??this.study.style;ctx.setLineDash(style===0?[]:style===1?[1,3]:style===2?[6,4]:style===3?[10,5]:[1,7]);ctx.beginPath();ctx.moveTo(width-extent,y);ctx.lineTo(width,y);ctx.stroke();ctx.fillStyle=o.color??this.study.color;ctx.fillText(name+' '+value.toPrecision(7),Math.max(2,width-extent-100),Math.max(12,Math.min(height-40,y-3)));}
  ctx.restore();
 }
}
