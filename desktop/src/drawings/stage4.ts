import type {Drawing,Candle} from '../types';
import {definition} from './registry';
import {position,parseGhost,anchoredVWAP,estimatedProfile,memoAnalysis,volumeTools} from './analytics';
import {marketDate} from './finance';
import type {Geometry,GeometryContext,Point,clipLine,logicalForTime} from './geometry';
export function stage4Geometry(d:Drawing,c:GeometryContext,logical:typeof logicalForTime,clip:typeof clipLine):Geometry|null{
 if(definition(d.kind)?.stage!==4)return null;
 const g:Geometry={paths:[],fills:[],labels:[],handles:d.anchors.map(c.point).filter((p):p is Point=>p!==null),styles:[],fillColors:[]},p=d.params||{},a=d.anchors[0],origin=logical(c.rows,a.time),fmt=(v:number|null)=>v===null?'undefined':v.toFixed((d.kind==='long_position'||d.kind==='short_position')&&(p.price_precision??-1)>=0?p.price_precision!:c.precision),bull=p.bull_color||'#37c5a2',bear=p.bear_color||'#ee6a79';
 const point=(n:number,price:number):Point|null=>{const x=c.logicalToX(n),y=c.priceToY(price);return x!==null&&y!==null&&Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;};
 const path=(points:(Point|null)[],color=d.color,style?:{width?:1|2|3|4;dash?:'solid'|'dash'|'dot'})=>{let segment:Point[]=[];const flush=()=>{if(segment.length>1){g.paths.push(segment);g.styles!.push({color,...style});}segment=[];};for(const v of points){if(v)segment.push(v);else flush();}flush();};
 const label=(text:string,v=g.handles[0],color=d.color)=>{if(v)g.labels.push({text,point:{x:Math.max(8,Math.min(v.x+8,c.width-380)),y:Math.max(24,Math.min(v.y-18,c.height-140))},fontSize:11,box:true,color,maxWidth:370});};
 const polygon=(points:(Point|null)[],color=d.color)=>{if(points.every((v):v is Point=>v!==null)){g.fills.push(points);g.fillColors!.push(color);path([...points,points[0]],color);}};
 const line=(price:number,left:number,right:number,color=d.color)=>{const start=point(left,price),end=point(right,price);if(start&&end){const v=clip(start,end,c.width,c.height);if(v)path(v,color);}};
 const selected=(end?:number)=>c.rows.filter(r=>r.time>=Math.min(a.time,end??a.time)&&r.time<=Math.max(a.time,end??c.rows.at(-1)!.time));
 const candle=(n:number,r:Pick<Candle,'open'|'high'|'low'|'close'>,width=.65,color=r.close>=r.open?bull:bear)=>{path([point(n,r.high),point(n,r.low)],color);polygon([point(n-width/2,r.open),point(n+width/2,r.open),point(n+width/2,r.close),point(n-width/2,r.close)],color);if(r.open===r.close)line(r.open,n-width/2,n+width/2,color);};
 if(volumeTools.has(d.kind)&&c.volumeSupported===false){label('Volume tool unavailable for this instrument; no volume is invented.');return g;}
 if(d.kind==='long_position'||d.kind==='short_position'){
  const [entry,stop,target]=d.anchors,short=d.kind==='short_position',m=position(entry.price,stop.price,target.price,short,p),right=Math.max(origin+5,...d.anchors.map(v=>logical(c.rows,v.time)));
  for(const [price,color] of [[stop.price,bear],[target.price,bull]] as const){polygon([point(origin,entry.price),point(right,entry.price),point(right,price),point(origin,price)],color);line(price,origin,right,color);}line(entry.price,origin,right);
  label(`${short?'Short':'Long'} · entry ${fmt(entry.price)} ${c.currency}\nStop ${fmt(stop.price)} · target ${fmt(target.price)}\nRisk / unit ${fmt(m.risk)} · reward ${fmt(m.reward)} · R:R ${fmt(m.ratio)}\nRisk ${fmt(m.riskPercent)}% · reward ${fmt(m.rewardPercent)}%\n${m.conventional?'Conventional levels':'UNCONVENTIONAL levels — check entry / stop / target'}\n${p.sizing_confirmed?`Quantity ${fmt(m.quantity)} · risk cash ${fmt(m.riskCash)}\nStop P&L ${fmt(m.stopPL)} · target P&L ${fmt(m.targetPL)} ${p.display_currency||c.currency}`:'Quantity / P&L: confirm contract, lot and currency settings'}`);return g;
 }
 if(d.kind==='position_forecast'){
  const end=d.anchors.at(-1)!,color=end.price>=a.price?bull:bear;path(d.anchors.map(c.point),color);
  label(`HYPOTHETICAL · ${p.text||'My scenario'}\nTarget ${fmt(end.price)} ${c.currency} · ${a.price===0?'undefined (zero base)':((end.price-a.price)/Math.abs(a.price)*100).toFixed(2)+'%'}\nTarget ${marketDate(end.time,c.timezone||'UTC',c.interval||'1d')}\nUser-created scenario; no guarantee.`,g.handles.at(-1),color);return g;
 }
 if(d.kind==='ghost_feed'){
  let caption=g.handles[0];try{const candles=parseGhost(p.ghost_bars||'0,0,2,-1,1');for(const row of candles)candle(origin+row.bar,{open:a.price+row.open,high:a.price+row.high,low:a.price+row.low,close:a.price+row.close});const edge=point(origin+candles.at(-1)!.bar+3,a.price+Math.max(...candles.map(r=>r.high)));if(edge)caption={x:edge.x+12,y:edge.y-12};}catch(e){g.warning=(e as Error).message;}
  label('HYPOTHETICAL · manual ghost candles\nSeparate drawing overlay; not market data.'+(g.warning?'\n'+g.warning:''),caption);return g;
 }
 if(d.kind==='bars_pattern'){
  const source=selected(d.anchors[1].time),target=d.anchors[2],n=logical(c.rows,target.time);
  if(!source.length||source.length>256){label('Select 1–256 already fetched historical bars.');return g;}
  const base=source[0].open,scale=p.scale_factor??1,barScale=p.bar_scale??1,displacement=p.displacement??0;
  for(const [i,row] of source.entries())candle(n+i*barScale,{open:target.price+(row.open-base)*scale+displacement,high:target.price+(row.high-base)*scale+displacement,low:target.price+(row.low-base)*scale+displacement,close:target.price+(row.close-base)*scale+displacement},Math.min(.8,barScale*.65));
  path([c.point(a),c.point(d.anchors[1])]);label(`HYPOTHETICAL · copied ${source.length} historical bars\nSource ${marketDate(source[0].time,c.timezone||'UTC',c.interval||'1d')} → ${marketDate(source.at(-1)!.time,c.timezone||'UTC',c.interval||'1d')}\nProjected drawing only; no future market data.`,g.handles[2]);return g;
 }
 if(d.kind==='sector'){
  const b=d.anchors[1],unit=p.price_unit??1,barUnit=p.bar_unit??1,dx=(logical(c.rows,b.time)-origin)/barUnit,dy=(b.price-a.price)/unit,r=Math.hypot(dx,dy),theta=Math.atan2(dy,dx),angle=(p.sector_angle??90)*Math.PI/180;
  const arc=Array.from({length:129},(_,i)=>point(origin+r*Math.cos(theta+angle*i/128)*barUnit,a.price+r*Math.sin(theta+angle*i/128)*unit));polygon([point(origin,a.price),...arc]);return g;
 }
 if(d.kind==='anchored_vwap'){
  const result=memoAnalysis(c.rows,`vwap:${a.time}:${p.price_source??'HLC3'}`,()=>anchoredVWAP(selected(),p.price_source??'HLC3'));
  if(result.error){label(result.error);return g;}const stride=Math.max(1,Math.ceil(result.points.length/2000)),samples=result.points.filter((_,i)=>i%stride===0||i===result.points.length-1);
  const curve=(band:number)=>samples.map(r=>r.value===null?null:point(logical(c.rows,r.time),r.value+band*(r.deviation??0)));
  const configured=p.levels??[{ratio:0}],levels=configured.some(l=>l.ratio!==0)||!p.bands?configured:[...configured,{ratio:p.bands,color:bull},{ratio:-p.bands,color:bear}];
  for(const level of levels)if(level.visible!==false)path(curve(level.ratio),level.color??d.color,level);
  if(p.fill_bands){const active=levels.filter(l=>l.visible!==false).map(l=>l.ratio);if(active.length>1){const upper=curve(Math.max(...active)),lower=curve(Math.min(...active));let top:Point[]=[],bottom:Point[]=[];const flush=()=>{if(top.length>1){g.fills.push([...top,...bottom.reverse()]);g.fillColors!.push(d.color);}top=[];bottom=[];};upper.forEach((v,i)=>{const b=lower[i];if(v&&b){top.push(v);bottom.push(b);}else flush();});flush();}}

  label(`Anchored VWAP · ${p.price_source??'HLC3'} · ${fmt(result.points.at(-1)?.value??null)} ${c.currency}\nBar-derived approximation; not trade VWAP.\n${result.points.at(-1)!.volume.toLocaleString()} supplied volume · zero-volume bars add no weight`);return g;
 }
 if(d.kind==='fixed_volume_profile'||d.kind==='anchored_volume_profile'){
  const end=d.kind==='fixed_volume_profile'?d.anchors[1].time:c.rows.at(-1)!.time,result=memoAnalysis(c.rows,`profile:${a.time}:${end}:${p.bins??24}:${p.value_area??70}`,()=>estimatedProfile(selected(end),p.bins??24,p.value_area??70));
  if(result.error){label(result.error);return g;}const endIndex=logical(c.rows,end),left=Math.min(origin,endIndex),right=Math.max(origin,endIndex),span=Math.max(8,right-left),max=Math.max(...result.rows.map(r=>r.volume)),width=span*(p.histogram_width??40)/100,edge=p.profile_left?left:right;
  if(p.show_histogram!==false)for(const row of result.rows){const extent=row.volume/max*width,other=edge+(p.profile_left?extent:-extent),high=row.high===row.low?row.high+Math.max(1e-8,Math.abs(row.high)*1e-5):row.high;polygon([point(edge,row.low),point(other,row.low),point(other,high),point(edge,high)],row.inArea?bull:bear);}
  if(p.show_poc!==false)line(result.poc!,left,right,d.color);if(p.show_value_area!==false){line(result.vah!,left,right,bull);line(result.val!,left,right,bull);}
  label(`Estimated OHLCV Volume Profile\nPOC ${fmt(result.poc)} · VAH ${fmt(result.vah)} · VAL ${fmt(result.val)} ${c.currency}\nVA target ${p.value_area??70}% · covered ${(result.covered/result.total*100).toFixed(1)}%\nUniform candle-range allocation; not exact volume at price.\n${result.total.toLocaleString()} supplied volume`);return g;
 }
 return g;
}
