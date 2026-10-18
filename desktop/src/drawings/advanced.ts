import type {Drawing,FibLevel} from '../types';
import type {Geometry,GeometryContext,Point} from './geometry';
import {parametersFor,definition} from './registry';
export type FinancialPoint={bar:number;price:number};
export const midpoint=(a:FinancialPoint,b:FinancialPoint):FinancialPoint=>({bar:(a.bar+b.bar)/2,price:(a.price+b.price)/2});
export function pitchforkFrame(points:FinancialPoint[],kind:string){const [a,b,c]=points,m=midpoint(b,c),ab=midpoint(a,b);const origin=kind==='schiff_pitchfork'?{bar:a.bar,price:ab.price}:['modified_schiff','inside_pitchfork'].includes(kind)?ab:a,end=kind==='inside_pitchfork'?c:m;const ref=kind==='inside_pitchfork'?origin:m;return {origin,end,offset:{bar:b.bar-ref.bar,price:b.price-ref.price}};}
export function goldenSpiral(a:FinancialPoint,b:FinancialPoint,theta:number,priceUnit=1,barUnit=1,reverse=false){const dx=(b.bar-a.bar)/barUnit,dy=(b.price-a.price)/priceUnit,r=Math.hypot(dx,dy)*Math.exp(Math.log((1+Math.sqrt(5))/2)*theta/(Math.PI/2)),angle=Math.atan2(dy,dx)+(reverse?-theta:theta);return {bar:a.bar+r*Math.cos(angle)*barUnit,price:a.price+r*Math.sin(angle)*priceUnit};}
export function gannSlope(ratio:number,pricePerBar:number,reverse=false){return ratio*pricePerBar*(reverse?-1:1);}
export function legRatio(points:FinancialPoint[],i:number){const denominator=Math.abs(points[i-1].price-points[i-2].price);return denominator===0?null:Math.abs(points[i].price-points[i-1].price)/denominator;}
export function sinePrice(origin:FinancialPoint,period:number,amplitude:number,bar:number,phase=0){return origin.price+amplitude*Math.sin(2*Math.PI*(bar-origin.bar)/period+phase*Math.PI/180);}
export const patternLabels:Record<string,string[]>={elliott_impulse:['0','1','2','3','4','5'],elliott_correction:['0','A','B','C'],elliott_triangle:['0','A','B','C','D','E'],elliott_double:['0','W','X','Y'],elliott_triple:['0','W','X','Y','X','Z'],xabcd:['X','A','B','C','D'],cypher:['X','A','B','C','D'],abcd:['A','B','C','D'],head_shoulders:['Start','LS','Neck L','Head','Neck R','RS','End'],triangle_pattern:['A','B','C','D','E'],three_drives:['0','1','A','2','B','3','C']};
export function rotatedRectangle(a:FinancialPoint,b:FinancialPoint,c:FinancialPoint,pu=1,bu=1){const dx=(b.bar-a.bar)/bu,dy=(b.price-a.price)/pu,ux=(c.bar-a.bar)/bu,uy=(c.price-a.price)/pu,scale=(dx*uy-dy*ux)/(dx*dx+dy*dy||1),offset={bar:-dy*scale*bu,price:dx*scale*pu};return [a,b,{bar:b.bar+offset.bar,price:b.price+offset.price},{bar:a.bar+offset.bar,price:a.price+offset.price}];}
export function circumcircle(a:FinancialPoint,b:FinancialPoint,c:FinancialPoint){const bx=b.bar-a.bar,by=b.price-a.price,cx=c.bar-a.bar,cy=c.price-a.price,det=2*(bx*cy-by*cx);if(Math.abs(det)<1e-9)return null;const bb=bx*bx+by*by,cc=cx*cx+cy*cy,center={bar:a.bar+(bb*cy-cc*by)/det,price:a.price+(bx*cc-cx*bb)/det};return {center,radius:Math.hypot(a.bar-center.bar,a.price-center.price)};}
export function bezier(points:FinancialPoint[],t:number):FinancialPoint{let p=points.map(a=>({...a}));while(p.length>1)p=p.slice(0,-1).map((a,i)=>({bar:a.bar+(p[i+1].bar-a.bar)*t,price:a.price+(p[i+1].price-a.price)*t}));return p[0];}
export function advancedGeometry(d:Drawing,c:GeometryContext,logical:(rows:GeometryContext['rows'],time:number)=>number,clip:(a:Point,b:Point,w:number,h:number,mode?:'segment'|'ray'|'line')=>Point[]|null):Geometry|null{
 if(definition(d.kind).stage!==3)return null;
 const g:Geometry={paths:[],fills:[],labels:[],handles:d.anchors.map(c.point).filter((p):p is Point=>p!==null),styles:[]};
 const a=d.anchors.map(v=>({bar:logical(c.rows,v.time),price:v.price})),[A,B,C]=a,params={...parametersFor(d.kind),...d.params},levels=(params.levels??[]) as FibLevel[];
 const x0=c.logicalToX(0),x1=c.logicalToX(1),step=x0!==null&&x1!==null?x1-x0:0;
 const lo=step?(-x0!)/step:0,hi=step?(c.width-x0!)/step:c.rows.length-1;
 const point=(p:FinancialPoint):Point|null=>{const x=c.logicalToX(p.bar),y=c.priceToY(p.price);return x!==null&&y!==null&&Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;};
 const label=(text:string,p:FinancialPoint,color?:string)=>{const v=point(p);if(v&&params.labels!==false)g.labels.push({point:{x:v.x+5,y:v.y-5},text,box:false,fontSize:11,color});};
 const path=(points:FinancialPoint[],style?:FibLevel)=>{let chain:Point[]=[];const flush=()=>{if(chain.length>1){g.paths.push(chain);g.styles!.push(style??{});}chain=[];};for(const value of points){const p=point(value);if(p)chain.push(p);else flush();}flush();};
 const curve=(fn:(t:number)=>FinancialPoint,start=0,end=1,steps=128,style?:FibLevel)=>path(Array.from({length:Math.min(1024,Math.max(2,steps))+1},(_,i)=>fn(start+(end-start)*i/Math.min(1024,Math.max(2,steps)))),style);
 const line=(p:FinancialPoint,q:FinancialPoint,style?:FibLevel,extendLeft=false,extendRight=false)=>{
  if(Math.abs(q.bar-p.bar)<1e-9){const v=point(p),w=point(q);if(v&&w){const clipped=clip(v,w,c.width,c.height,extendLeft?'line':extendRight?'ray':'segment');if(clipped){g.paths.push(clipped);g.styles!.push(style??{});}}return;}
  const slope=(q.price-p.price)/(q.bar-p.bar);let from=p.bar,to=q.bar;
  if(extendLeft)from=q.bar>p.bar?lo:hi;if(extendRight)to=q.bar>p.bar?hi:lo;
  curve(t=>({bar:t,price:p.price+slope*(t-p.bar)}),from,to,Math.min(512,Math.max(2,Math.ceil(Math.abs(to-from)))),style);
 };
 const visible=levels.filter(l=>l.visible!==false),add=(p:FinancialPoint,q:FinancialPoint)=>({bar:p.bar+q.bar,price:p.price+q.price}),scaled=(p:FinancialPoint,r:number)=>({bar:p.bar*r,price:p.price*r});
 if(['pitchfork','schiff_pitchfork','modified_schiff','inside_pitchfork'].includes(d.kind)){
  const f=pitchforkFrame(a,d.kind);for(const l of visible){const p=add(f.origin,scaled(f.offset,l.ratio)),q=add(f.end,scaled(f.offset,l.ratio));line(p,q,l,!!params.extend_left,params.extend_right!==false);label(`${l.ratio}`,q,l.color);}line(B,C);
 }else if(d.kind==='fib_channel'){
  if(B.bar===A.bar){g.warning='Channel baseline needs distinct trading bars.';label(g.warning,A);return g;}
  const slope=(B.price-A.price)/(B.bar-A.bar),offset=C.price-(A.price+slope*(C.bar-A.bar));for(const l of visible){line({...A,price:A.price+l.ratio*offset},{...B,price:B.price+l.ratio*offset},l,!!params.extend_left,params.extend_right!==false);label(`${l.ratio}`,{...B,price:B.price+l.ratio*offset},l.color);}
 }else if(d.kind==='fib_time_zone'||d.kind==='fib_trend_time'){
  const base=d.kind==='fib_trend_time'?C:A;for(const l of visible){const bar=base.bar+l.ratio*(B.bar-A.bar),x=c.logicalToX(bar);if(x!==null&&Number.isFinite(x)){g.paths.push([{x,y:0},{x,y:c.height}]);g.styles!.push(l);if(params.labels!==false)g.labels.push({point:{x:x+4,y:20},text:`${l.ratio} · bar ${bar.toFixed(2)}`,fontSize:11,box:false,color:l.color});}}
 }else if(d.kind==='fib_speed_fan'||d.kind==='pitchfan'){
  for(const l of visible){const q=d.kind==='pitchfan'?{bar:B.bar+l.ratio*(C.bar-B.bar),price:B.price+l.ratio*(C.price-B.price)}:{bar:B.bar,price:A.price+l.ratio*(B.price-A.price)};line(A,q,l,false,true);label(`${l.ratio}`,q,l.color);}

 }else if(d.kind.startsWith('gann_')){
  const ppb=Number(params.price_per_bar??1),sign=(B.price>=A.price?1:-1)*(params.reverse?-1:1),span=B.bar-A.bar;
  if(d.kind!=='gann_box'&&!params.calibrated){line(A,B);label('Set and confirm price / trading bar',A);return g;}
  label(d.kind==='gann_box'?`Observed ${span===0?'n/a':(Math.abs((B.price-A.price)/span)).toFixed(4)} price/bar`:`Calibration ${ppb} price/bar`,A);
  if(d.kind==='gann_fan'){for(const l of visible){const direction=B.bar>=A.bar?1:-1,q={bar:A.bar+direction,price:A.price+gannSlope(l.ratio,ppb)*sign};line(A,q,l,false,true);label(`${l.ratio} × ${ppb}`,{bar:A.bar+direction*Math.max(1,Math.abs(span)),price:A.price+gannSlope(l.ratio,ppb)*sign*Math.max(1,Math.abs(span))},l.color);}}
  else{
   const D=d.kind==='gann_square_fixed'?{bar:B.bar,price:A.price+sign*Math.abs(span)*ppb}:B;
   const corners=[A,{bar:D.bar,price:A.price},D,{bar:A.bar,price:D.price}];path([...corners,A]);const polygon=corners.map(point).filter((v):v is Point=>v!==null);if(polygon.length===4)g.fills.push(polygon);
   for(const l of visible){const n=A.bar+l.ratio*(D.bar-A.bar),price=A.price+l.ratio*(D.price-A.price);line({bar:n,price:A.price},{bar:n,price:D.price},l);line({bar:A.bar,price},{bar:D.bar,price},l);}
   if(d.kind!=='gann_box'){
    // Calibrated fans from all corners for the adjustable square; origin only for fixed square.
    for(const origin of d.kind==='gann_square'?corners:[A])for(const r of [.5,1,2])for(const direction of [-1,1]){const endBar=origin.bar===A.bar?D.bar:A.bar;const slope=direction*r*ppb;line(origin,{bar:endBar,price:origin.price+slope*(endBar-origin.bar)});}
    const radius=Math.abs(span);for(const r of [.5,1])curve(t=>({bar:A.bar+Math.cos(t)*radius*r,price:A.price+Math.sin(t)*radius*r*ppb}),0,Math.PI*2,128);
   }
  }


 }else if(['brush','highlighter','path','curve','double_curve','rotated_rectangle','arc'].includes(d.kind)){
  if(d.kind==='curve'||d.kind==='double_curve')curve(t=>bezier(a,t),0,1,128);
  else if(d.kind==='rotated_rectangle'){const corners=rotatedRectangle(A,B,C,Number(params.price_unit),Number(params.bar_unit));path([...corners,A]);const poly=corners.map(point).filter((p):p is Point=>p!==null);if(poly.length===4)g.fills.push(poly);}
  else if(d.kind==='arc'){
   const pu=Number(params.price_unit),bu=Number(params.bar_unit),normalized=a.map(p=>({bar:p.bar/bu,price:p.price/pu})),circle=circumcircle(...normalized.slice(0,3) as [FinancialPoint,FinancialPoint,FinancialPoint]);
   if(!circle){path(a);g.warning='Collinear arc: straight-line limit.';}else{const angle=(p:FinancialPoint)=>Math.atan2(p.price-circle.center.price,p.bar-circle.center.bar),start=angle(normalized[0]),middle=angle(normalized[1]),end=angle(normalized[2]),tau=2*Math.PI,wrap=(v:number)=>(v%tau+tau)%tau,ccw=wrap(end-start),sweep=wrap(middle-start)<=ccw?ccw:ccw-tau;curve(t=>({bar:(circle.center.bar+circle.radius*Math.cos(t))*bu,price:(circle.center.price+circle.radius*Math.sin(t))*pu}),start,start+sweep,128);}
  }else{path(a,d.kind==='highlighter'?{ratio:1,width:d.width}:undefined);if(d.kind==='highlighter')g.strokeWidth=Number(params.stroke_size??16);if(d.kind==='path'&&params.arrowhead!==false){const p=point(a.at(-2)!),q=point(a.at(-1)!);if(p&&q){const theta=Math.atan2(q.y-p.y,q.x-p.x),size=12;g.paths.push([{x:q.x-size*Math.cos(theta-.45),y:q.y-size*Math.sin(theta-.45)},q,{x:q.x-size*Math.cos(theta+.45),y:q.y-size*Math.sin(theta+.45)}]);g.styles!.push({});}}}
 }else if(['callout','comment','pin','price_label','signpost','flag_mark','table','image'].includes(d.kind)){
  const pixels=a.map(point),first=pixels[0]!;
  if(d.kind==='table'||d.kind==='image'){
   const second=pixels[1]!,left=Math.min(first.x,second.x),top=Math.min(first.y,second.y),width=Math.max(1,Math.abs(second.x-first.x)),height=Math.max(1,Math.abs(second.y-first.y)),polygon=[{x:left,y:top},{x:left+width,y:top},{x:left+width,y:top+height},{x:left,y:top+height}];g.paths.push([...polygon,polygon[0]]);g.styles!.push({});g.fills.push(polygon);
   if(d.kind==='image'){if(params.image_data)g.images=[{data:String(params.image_data),rect:{x:left,y:top,width,height}}];else g.labels.push({point:{x:left+5,y:top+20},text:'Choose a local PNG / JPEG',fontSize:12,box:false});}
   else{const rows=String(params.text??'').split('\n').slice(0,20).map(row=>row.split(/\t|\|/).slice(0,10)),columns=Math.max(1,...rows.map(r=>r.length)),cw=width/columns,rh=height/Math.max(1,rows.length),size=Math.min(Number(params.font_size??12),Math.max(4,rh-4));for(let n=1;n<columns;n++){g.paths.push([{x:left+n*cw,y:top},{x:left+n*cw,y:top+height}]);g.styles!.push({});}for(let n=1;n<rows.length;n++){g.paths.push([{x:left,y:top+n*rh},{x:left+width,y:top+n*rh}]);g.styles!.push({});}rows.forEach((row,i)=>row.forEach((text,j)=>g.labels.push({text,point:{x:left+j*cw+3,y:top+i*rh+size+2},box:false,fontSize:size,maxWidth:Math.max(1,cw-6)})));}
  }else{
   const boxAnchor=d.kind==='callout'?pixels[1]!:first,size=Number(params.font_size??14),text=d.kind==='price_label'?`${A.price.toFixed(c.precision)} ${c.currency} ${params.text??''}`:String(params.text??'Text'),textPoint={x:boxAnchor.x+Number(params.offset_x??8),y:boxAnchor.y+Number(params.offset_y??-12)};
   g.labels.push({text,point:textPoint,fontSize:size,box:true});g.paths.push([first,textPoint]);g.styles!.push({});
   if(d.kind==='pin'){g.paths.push([{x:first.x-7,y:first.y-14},{x:first.x,y:first.y},{x:first.x+7,y:first.y-14},{x:first.x-7,y:first.y-14}]);g.styles!.push({});}
   if(d.kind==='flag_mark'){g.paths.push([first,{x:first.x,y:first.y-30},{x:first.x+25,y:first.y-30},{x:first.x+16,y:first.y-22},{x:first.x+25,y:first.y-14},{x:first.x,y:first.y-14}]);g.styles!.push({});}
   if(d.kind==='signpost'){g.paths.push([first,{x:first.x,y:first.y-25},{x:first.x+20,y:first.y-25},{x:first.x+26,y:first.y-18},{x:first.x+20,y:first.y-11},{x:first.x,y:first.y-11}]);g.styles!.push({});}
   if(d.kind==='comment'){g.paths.push([first,{x:textPoint.x-5,y:textPoint.y+6},{x:textPoint.x+7,y:textPoint.y+6}]);g.styles!.push({});}
  }
 }else if(['cyclic_lines','time_cycles','sine_line'].includes(d.kind)){
  const period=Math.abs(B.bar-A.bar);if(period<1e-6){g.warning='Select different trading bars for the period.';label(g.warning,A);return g;}
  label(`Period ${period.toFixed(2)} trading bars`,A);
  if(d.kind==='sine_line')curve(bar=>({bar,price:sinePrice(A,period,C.price-A.price,bar,Number(params.phase??0))}),Math.max(lo,A.bar),hi,1024);
  else{const first=Math.ceil((lo-A.bar)/period),last=Math.floor((hi-A.bar)/period);for(let n=first;n<=last&&n<first+256;n++){const bar=A.bar+n*period;if(d.kind==='cyclic_lines'){const x=c.logicalToX(bar);if(x!==null){g.paths.push([{x,y:0},{x,y:c.height}]);g.styles!.push({});}}else curve(t=>({bar:bar+period*t,price:A.price+Math.abs(B.price-A.price)*Math.sqrt(Math.max(0,1-(2*t-1)**2))}),0,1,64);}}
 }else if(patternLabels[d.kind]){
  path(a);const names=patternLabels[d.kind];a.forEach((p,i)=>label(names[i],p));
  if(params.show_ratios!==false)for(let i=2;i<a.length;i++){const ratio=legRatio(a,i);label(`leg ${i}/${i-1}: ${ratio===null?'n/a':ratio.toFixed(3)}`,midpoint(a[i-1],a[i]));}
  if(d.kind==='xabcd'||d.kind==='cypher'){for(const ids of [[0,1,2],[2,3,4]]){const poly=ids.map(i=>point(a[i])).filter((p):p is Point=>p!==null);if(poly.length===3)g.fills.push(poly);}line(a[0],a[2]);line(a[2],a[4]);}
  if(d.kind==='head_shoulders')line(a[2],a[4],undefined,false,true);
  if(d.kind==='triangle_pattern'){line(a[0],a[4]);line(a[1],a[3],undefined,false,true);}
 }else if(['fib_circles','fib_arcs','fib_wedge','fib_spiral'].includes(d.kind)){
  const pu=Number(params.price_unit),bu=Number(params.bar_unit),dx=(B.bar-A.bar)/bu,dy=(B.price-A.price)/pu,radius=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
  if(d.kind==='fib_spiral'){curve(t=>goldenSpiral(A,B,t,pu,bu,!!params.reverse),-Math.PI*2,Number(params.turns)*Math.PI*2,512);label('φ per quarter turn',B);}
  else{const aperture=d.kind==='fib_circles'?Math.PI*2:d.kind==='fib_arcs'?Math.PI:Number(params.aperture)*Math.PI/180;
   for(const l of visible){curve(t=>({bar:A.bar+radius*l.ratio*Math.cos(t)*bu,price:A.price+radius*l.ratio*Math.sin(t)*pu}),angle-aperture/2,angle+aperture/2,128,l);label(`${l.ratio}`,{bar:A.bar+radius*l.ratio*Math.cos(angle)*bu,price:A.price+radius*l.ratio*Math.sin(angle)*pu},l.color);}
   if(d.kind==='fib_wedge'){const max=Math.max(0,...visible.map(l=>Math.abs(l.ratio)));for(const t of [angle-aperture/2,angle+aperture/2])line(A,{bar:A.bar+radius*max*Math.cos(t)*bu,price:A.price+radius*max*Math.sin(t)*pu});}
  }
 }
 return g;
}
