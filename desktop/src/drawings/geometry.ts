import {stage4Geometry} from './stage4';
import {advancedGeometry} from './advanced';
import {fibonacci,retracementLevels,extensionLevels,measurements,marketDate,elapsed} from './finance';
import type {Candle,Drawing,DrawingAnchor} from '../types';
export type Point={x:number;y:number};
export interface GeometryContext {width:number;height:number;rows:Candle[];point:(a:DrawingAnchor)=>Point|null;logicalToX:(n:number)=>number|null;priceToY:(price:number)=>number|null;currency:string;precision:number;timezone?:string;interval?:string;volumeSupported?:boolean}
export interface Label {point:Point;text:string;box:boolean;fontSize:number;color?:string;maxWidth?:number}
export interface Geometry {paths:Point[][];fills:Point[][];labels:Label[];handles:Point[];warning?:string;strokeWidth?:number;fillColors?:string[];images?:{data:string;rect:{x:number;y:number;width:number;height:number}}[];styles?:{color?:string;dash?:'solid'|'dash'|'dot';width?:1|2|3|4}[]}
export function segmentDistance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
/** Parametric slab clipping, with the same geometry used for paint and hit testing. */
export function clipLine(a:Point,b:Point,width:number,height:number,mode:'segment'|'ray'|'line'='segment'):Point[]|null{
 let lo=mode==='line'?-Infinity:0,hi=mode==='segment'?1:Infinity;
 const direction={x:b.x-a.x,y:b.y-a.y};if(Math.hypot(direction.x,direction.y)<1e-9)return null;
 for(const [axis,size] of [['x',width],['y',height]] as const){const v=direction[axis];if(Math.abs(v)<1e-12){if(a[axis]<0||a[axis]>size)return null;}else{const p=-a[axis]/v,q=(size-a[axis])/v;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}}
 if(lo>hi||!Number.isFinite(lo)||!Number.isFinite(hi))return null;
 return [lo,hi].map(t=>({x:a.x+direction.x*t,y:a.y+direction.y*t}));
}
/** Logical trading-bar interpolation, not elapsed wall-clock time across holidays. */
export function logicalForTime(rows:Candle[],time:number){
 if(!rows.length)return NaN;let lo=0,hi=rows.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].time<time)lo=mid+1;else hi=mid;}
 if(lo<rows.length&&rows[lo].time===time)return lo;
 if(!lo)return rows.length>1?(time-rows[0].time)/(rows[1].time-rows[0].time):0;
 if(lo===rows.length)return rows.length-1+(time-rows.at(-1)!.time)/(rows.length>1?rows.at(-1)!.time-rows.at(-2)!.time:1);
 return lo-1+(time-rows[lo-1].time)/(rows[lo].time-rows[lo-1].time);
}
export function regression(rows:Candle[]){
 if(rows.length<2)return null;const n=rows.length,meanX=(n-1)/2,meanY=rows.reduce((s,r)=>s+r.close,0)/n;
 let xx=0,xy=0;for(let i=0;i<n;i++){xx+=(i-meanX)**2;xy+=(i-meanX)*(rows[i].close-meanY);}
 const slope=xy/xx,intercept=meanY-slope*meanX;
 const deviation=Math.sqrt(rows.reduce((s,r,i)=>s+(r.close-intercept-slope*i)**2,0)/n);
 return {slope,intercept,deviation,count:n};
}
export function trendAngle(a:DrawingAnchor,b:DrawingAnchor,rows:Candle[],priceUnit=1,barUnit=1){return Math.atan2((b.price-a.price)/priceUnit,(logicalForTime(rows,b.time)-logicalForTime(rows,a.time))/barUnit)*180/Math.PI;}
export function drawingGeometry(d:Drawing,c:GeometryContext):Geometry{
 const g:Geometry={paths:[],fills:[],labels:[],handles:[]};
 if(d.visible===false||!c.rows.length)return g;
 // A replay prefix must never expose future anchors or future regression bars.
 if(d.anchors.some((a,i)=>a.time<c.rows[0].time||a.time>c.rows.at(-1)!.time&&!((d.kind==='position_forecast'&&i>0)||(d.kind==='bars_pattern'&&i===2))))return g;
 const points=d.anchors.map(c.point);if(points.some(p=>!p))return g;
 const stage4=stage4Geometry(d,c,logicalForTime,clipLine);if(stage4)return stage4;
 const advanced=advancedGeometry(d,c,logicalForTime,clipLine);if(advanced)return advanced;
 const p=points as Point[],a=p[0],b=p[1];g.handles=p;
 const line=(a:Point,b:Point,mode:'segment'|'ray'|'line'='segment')=>{const path=clipLine(a,b,c.width,c.height,mode);if(path)g.paths.push(path);};
 const label=(text:string,point:Point,box=true,fontSize=12)=>g.labels.push({text,point,box,fontSize});
 if(d.kind==='horizontal'||d.kind==='crossline')line({x:0,y:a.y},{x:c.width,y:a.y});
 if(d.kind==='vertical'||d.kind==='crossline')line({x:a.x,y:0},{x:a.x,y:c.height});
 if(d.kind==='horizontal_ray')line(a,{x:a.x+1,y:a.y},'ray');
 if(['trend','ray','extended','info_line','trend_angle'].includes(d.kind)&&b){
  line(a,b,d.kind==='ray'?'ray':d.kind==='extended'?'line':'segment');
  if(d.kind==='info_line'){
   const first=d.anchors[0],last=d.anchors[1],change=last.price-first.price,count=Math.abs(Math.round(logicalForTime(c.rows,last.time)-logicalForTime(c.rows,first.time)));
   label(`${change.toFixed(c.precision)} ${c.currency} · ${first.price===0?'n/a':(change/first.price*100).toFixed(2)+'%'} · ${count} bars · ${(Math.abs(last.time-first.time)/86400).toFixed(2)} days`,{x:(a.x+b.x)/2,y:(a.y+b.y)/2-12});
  }
  if(d.kind==='trend_angle')label(`${trendAngle(d.anchors[0],d.anchors[1],c.rows,d.params?.price_unit??1,d.params?.bar_unit??1).toFixed(2)}° · data units`,{x:a.x+8,y:a.y-12});
 }

 if(d.kind==='fib_retracement'||d.kind==='fib_extension'){
  const levels=fibonacci(d.anchors,d.kind==='fib_extension',d.params?.levels??(d.kind==='fib_extension'?extensionLevels:retracementLevels),!!d.params?.reverse);
  const left=d.params?.extend_left?0:Math.min(...p.map(v=>v.x)),right=d.params?.extend_right===false?Math.max(...p.map(v=>v.x)):c.width;
  g.styles=[];const ys:{y:number;price:number}[]=[];
  for(const level of levels){const y=c.priceToY(level.price);if(y===null||!Number.isFinite(y))continue;
   const path=clipLine({x:left,y},{x:right,y},c.width,c.height);if(path){g.paths.push(path);g.styles.push(level);}
   ys.push({y,price:level.price});if(d.params?.labels!==false)g.labels.push({text:`${level.ratio} · ${level.price.toFixed(c.precision)} ${c.currency}`,point:{x:Math.max(6,Math.min(left+6,c.width-180)),y:y-4},box:false,fontSize:11,color:level.color});
  }
  ys.sort((a,b)=>a.price-b.price);for(let n=1;n<ys.length;n++)g.fills.push([{x:left,y:ys[n-1].y},{x:right,y:ys[n-1].y},{x:right,y:ys[n].y},{x:left,y:ys[n].y}]);
 }
 if(['price_range','date_range','date_price_range','ruler'].includes(d.kind)&&b){
  const m=measurements(d.anchors[0],d.anchors[1],c.rows),fmt=(n:number)=>`${n.toFixed(c.precision)} ${c.currency}`;
  const date=(t:number)=>marketDate(t,c.timezone||'UTC',c.interval||'1d');
  const polygon=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];
  if(d.kind==='price_range'){g.paths.push([{x:b.x-8,y:a.y},{x:b.x+8,y:a.y}],[{x:b.x,y:a.y},b],[{x:b.x-8,y:b.y},{x:b.x+8,y:b.y}]);}
  else if(d.kind==='date_range'){g.paths.push([{x:a.x,y:b.y-8},{x:a.x,y:b.y+8}],[{x:a.x,y:b.y},b],[{x:b.x,y:b.y-8},{x:b.x,y:b.y+8}]);}
  else{g.paths.push(d.kind==='ruler'?[a,b]:[...polygon,a]);g.fills.push(polygon);}
  label(`${fmt(m.start)} → ${fmt(m.end)}\nΔ ${fmt(m.change)} · |Δ| ${fmt(m.absolute)}\n${m.percent===null?'n/a (zero base)':m.percent.toFixed(2)+'%'}\n${date(d.anchors[0].time)} → ${date(d.anchors[1].time)}\n${elapsed(m.seconds)} · ${m.bars} supplied bars`,{x:Math.max(8,Math.min((a.x+b.x)/2,c.width-310)),y:Math.max(20,Math.min(a.y,b.y)-15)});
 }
 if(d.kind==='arrow'&&b){line(a,b);const theta=Math.atan2(b.y-a.y,b.x-a.x),size=10+d.width*2;g.paths.push([{x:b.x-size*Math.cos(theta-.45),y:b.y-size*Math.sin(theta-.45)},b,{x:b.x-size*Math.cos(theta+.45),y:b.y-size*Math.sin(theta+.45)}]);}
 if(['arrow_marker','arrow_up','arrow_down'].includes(d.kind)){
  const size=d.params?.marker_size??22,sign=d.kind==='arrow_down'?1:-1;
  const polygon=[a,{x:a.x-size*.5,y:a.y-sign*size*.55},{x:a.x-size*.2,y:a.y-sign*size*.55},{x:a.x-size*.2,y:a.y-sign*size},{x:a.x+size*.2,y:a.y-sign*size},{x:a.x+size*.2,y:a.y-sign*size*.55},{x:a.x+size*.5,y:a.y-sign*size*.55}];const shape=d.kind==='arrow_marker'?polygon.map(p=>({x:a.x+(p.x-a.x)*Math.SQRT1_2-(p.y-a.y)*Math.SQRT1_2,y:a.y+(p.x-a.x)*Math.SQRT1_2+(p.y-a.y)*Math.SQRT1_2})):polygon;g.paths.push([...shape,a]);g.fills.push(shape);g.handles=[a,{x:a.x+size,y:a.y}];
 }
 if((d.kind==='circle'||d.kind==='ellipse')&&b){
  const center=d.kind==='circle'?a:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},rx=d.kind==='circle'?Math.hypot(b.x-a.x,b.y-a.y):Math.abs(b.x-a.x)/2,ry=d.kind==='circle'?rx:Math.abs(b.y-a.y)/2;
  const path=Array.from({length:97},(_,i)=>({x:center.x+rx*Math.cos(i*Math.PI/48),y:center.y+ry*Math.sin(i*Math.PI/48)}));g.paths.push(path);g.fills.push(path);
 }
 if(d.kind==='triangle'){g.paths.push([...p,a]);g.fills.push(p);}
 if(d.kind==='polyline')g.paths.push(p);
 if(d.kind==='rectangle'&&b){const polygon=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];g.fills.push(polygon);g.paths.push([...polygon,a]);g.handles=[...p,{x:b.x,y:a.y},{x:a.x,y:b.y}];}
 if(['text','note','price_note'].includes(d.kind)){
  const params=d.params||{},text=params.text??(d.kind==='text'?'Text':d.kind==='note'?'Note':'');
  label(d.kind==='price_note'?`${d.anchors[0].price.toFixed(c.precision)} ${c.currency}${text?'\n'+text:''}`:text,{x:a.x+(params.offset_x??8),y:a.y+(params.offset_y??-12)},d.kind!=='text',params.font_size??14);
  // Anchor connector for boxed notes, including zero-length-safe connectors.
  if(d.kind!=='text')line(a,g.labels[0].point);
 }
 if(['parallel_channel','regression_channel','flat_channel','disjoint_channel'].includes(d.kind)&&b){
  const start=Math.min(logicalForTime(c.rows,d.anchors[0].time),logicalForTime(c.rows,d.anchors[1].time)),end=Math.max(logicalForTime(c.rows,d.anchors[0].time),logicalForTime(c.rows,d.anchors[1].time));
  if(end-start<1e-9){g.warning='Select distinct trading bars for a channel.';return g;}
  const i0=logicalForTime(c.rows,d.anchors[0].time),i1=logicalForTime(c.rows,d.anchors[1].time),slope=(d.anchors[1].price-d.anchors[0].price)/(i1-i0);
  const base=(n:number)=>d.anchors[0].price+slope*(n-i0);
  const curve=(fn:(n:number)=>number,from=start,to=end)=>{
   const path:Point[]=[];const steps=Math.max(1,Math.min(1024,Math.ceil(Math.abs(to-from))));
   for(let j=0;j<=steps;j++){const n=from+(to-from)*j/steps,x=c.logicalToX(n),y=c.priceToY(fn(n));if(x!==null&&y!==null&&Number.isFinite(x)&&Number.isFinite(y))path.push({x,y});}
   return path;
  };
  let lower:Point[]=[],upper:Point[]=[];
  if(d.kind==='regression_channel'){
   const left=Math.ceil(start),right=Math.floor(end),fit=regression(c.rows.slice(left,right+1));
   if(!fit){g.warning='Regression needs at least two supplied closes.';return g;}
   const center=(n:number)=>fit.intercept+fit.slope*(n-left),width=d.params?.channel_width||fit.deviation*(d.params?.deviation??2);
   lower=curve(n=>center(n)-width,left,right);upper=curve(n=>center(n)+width,left,right);g.paths.push(curve(center,left,right));
   g.handles=d.anchors.map(a=>{const n=logicalForTime(c.rows,a.time);return {x:c.logicalToX(n)!,y:c.priceToY(center(n))!};});
   label(`OLS · ${fit.count} supplied closes · σ ${fit.deviation.toFixed(c.precision)}`,{x:g.handles[0].x+8,y:g.handles[0].y-12});
  }else if(d.kind==='parallel_channel'&&d.anchors[2]){
   const third=d.anchors[2],offset=third.price-base(logicalForTime(c.rows,third.time)),width=d.params?.channel_width;
   lower=curve(base);upper=curve(n=>base(n)+(width?Math.sign(offset||1)*width:offset));
  }else if(d.kind==='flat_channel'&&d.anchors[2]){
   lower=curve(base);const level=d.params?.channel_width?d.anchors[0].price+Math.sign(d.anchors[2].price-d.anchors[0].price||1)*d.params.channel_width:d.anchors[2].price;
   upper=curve(()=>level);
  }else if(d.kind==='disjoint_channel'&&d.anchors[3]){
   const third=d.anchors[2],fourth=d.anchors[3],j0=logicalForTime(c.rows,third.time),j1=logicalForTime(c.rows,fourth.time);
   if(Math.abs(j1-j0)<1e-9){g.warning='The second channel boundary needs distinct trading bars.';return g;}
   lower=curve(base);upper=curve(n=>third.price+(fourth.price-third.price)*(n-j0)/(j1-j0)+(d.params?.channel_width??0),Math.min(j0,j1),Math.max(j0,j1));
  }
  if(lower.length&&upper.length){g.paths.push(lower,upper);g.fills.push([...lower,...[...upper].reverse()]);}
 }
 return g;
}
export function labelBox(label:Label,measure:(text:string)=>number){const lines=label.text.split('\n').slice(0,20),width=Math.min(460,Math.max(20,...lines.map(measure)))+12,height=lines.length*(label.fontSize+4)+8;return {x:label.point.x-6,y:label.point.y-label.fontSize-4,width,height,lines};}
export function geometryHit(g:Geometry,p:Point,selected:boolean,measure:(text:string,size:number)=>number):number|null|undefined{
 const handle=g.handles.findIndex(a=>Math.hypot(p.x-a.x,p.y-a.y)<(selected?9:6));if(handle>=0)return selected?handle:null;
 for(const path of g.paths)for(let i=1;i<path.length;i++)if(segmentDistance(p,path[i-1],path[i])<Math.max(7,(g.strokeWidth??0)/2))return null;
 for(const label of g.labels){const box=labelBox(label,t=>measure(t,label.fontSize));if(p.x>=box.x&&p.x<=box.x+box.width&&p.y>=box.y&&p.y<=box.y+box.height)return null;}
 for(const polygon of g.fills){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}if(inside)return null;}
 return undefined;
}
