Error.stackTraceLimit=0;
import {build} from 'esbuild';import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:"export * from './desktop/src/drawings/geometry';export * from './desktop/src/drawings/interactions';export * from './desktop/src/drawings/registry';export * from './desktop/src/drawings/codec';export * from './desktop/src/drawings/storage';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const rows=Array.from({length:60},(_,i)=>({time:1704067200+i*86400,open:100+i,high:104+i,low:98+i,close:101+i+Math.sin(i),volume:100}));
const context={width:800,height:400,rows,point:a=>({x:m.logicalForTime(rows,a.time)*10+20,y:350-a.price}),logicalToX:n=>n*10+20,priceToY:p=>350-p,currency:'USD',precision:2};
const anchors=[3,20,10,25,30,35,40,45,50].map((i,n)=>({time:rows[i].time,price:110+n*12}));
for(const tool of m.implementedTools){
 const d={id:'math-'+tool.id,kind:tool.id,version:2,anchors:anchors.slice(0,tool.anchors),color:'#86aaf9',width:2,params:m.parametersFor(tool.id)};
 m.validateDrawing(d);const g=m.drawingGeometry(d,context);
 assert.ok(g.paths.length||g.labels.length,tool.name+' produces actual geometry');assert.equal(g.handles.length,tool.id==='rectangle'?4:['arrow_marker','arrow_up','arrow_down'].includes(tool.id)?2:tool.anchors);
 const p=g.labels[0]?.point||g.paths[0][0];assert.notEqual(m.geometryHit(g,p,false,(s,size)=>s.length*size*.6),undefined,tool.name+' is selectable');
 assert.deepEqual(m.deserializeDrawings(m.serializeDrawings([d])),[d],tool.name+' round trip');
 assert.equal(m.drawingGeometry({...d,visible:false},context).paths.length,0);
 for(const mode of ['log','percentage']){
  const y=mode==='log'?p=>350-Math.log(p)*40:p=>350-(p/100-1)*100;
  const transformed={...context,point:a=>({x:context.point(a).x,y:y(a.price)}),priceToY:y};const g=m.drawingGeometry(d,transformed);
  assert.ok(g.paths.length||g.labels.length,tool.name+' transforms in '+mode);
  assert.ok(g.paths.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 }
 const moved=m.translateDrawing(d,rows,1,5,context.point,y=>350-y);assert.equal(moved.anchors.length,d.anchors.length);assert.ok(moved.anchors.every((a,i)=>a.time===rows[m.logicalForTime(rows,d.anchors[i].time)+1].time&&a.price===d.anchors[i].price-5));
 const resized=m.resizeDrawing(d,0,{...d.anchors[0],price:123});assert.equal(resized.anchors[0].price,123);assert.equal(d.anchors[0].price,110);
}
assert.deepEqual(m.clipLine({x:100,y:100},{x:200,y:150},300,250,'ray'),[{x:100,y:100},{x:300,y:200}]);
assert.deepEqual(m.clipLine({x:100,y:100},{x:200,y:150},300,250,'line'),[{x:0,y:50},{x:300,y:200}]);
assert.equal(m.clipLine({x:400,y:100},{x:500,y:150},300,250,'ray'),null);
assert.deepEqual(m.clipLine({x:50,y:100},{x:50,y:200},300,250,'line'),[{x:50,y:0},{x:50,y:250}]);
assert.equal(m.clipLine({x:50,y:100},{x:50,y:100},300,250,'ray'),null);
assert.deepEqual(m.regression([1,3,5,7].map(close=>({close}))),{slope:2,intercept:1,deviation:0,count:4});
const angle=m.trendAngle(anchors[0],{time:rows[13].time,price:120},rows);assert.ok(Math.abs(angle-45)<1e-12);
const d={id:'translate',kind:'trend',anchors:anchors.slice(0,2),color:'#86aaf9',width:2};
const logPoint=a=>({x:0,y:400-80*Math.log(a.price)}),priceAtY=y=>Math.exp((400-y)/80);
const moved=m.translateDrawing(d,rows,2,40,logPoint,priceAtY);
for(let i=0;i<2;i++)assert.ok(Math.abs(moved.anchors[i].price/d.anchors[i].price-Math.exp(-.5))<1e-12);
assert.equal(moved.anchors[0].time,rows[5].time);
const edge=m.translateDrawing(d,rows,10000,0,context.point,y=>350-y);assert.equal(m.logicalForTime(rows,edge.anchors[1].time)-m.logicalForTime(rows,edge.anchors[0].time),17);
const percentagePoint=a=>({x:0,y:300-2*(a.price-100)}),pct=m.translateDrawing(d,rows,0,20,percentagePoint,y=>100+(300-y)/2);assert.equal(pct.anchors[0].price,100);assert.equal(pct.anchors[1].price,112);
assert.equal(m.drawingGeometry(d,{...context,rows:rows.slice(0,10)}).handles.length,0,'Replay hides future anchors');
assert.throws(()=>m.validateDrawing({...d,kind:'pending_gann_fan'}));assert.throws(()=>m.validateDrawing({...d,params:{html:'<script>'}}));assert.throws(()=>m.validateDrawing({...d,opacity:NaN}));assert.throws(()=>m.deserializeDrawings('{"version":99,"drawings":[]}'));
const pane={symbol:'AAPL',canonical_id:'yahoo:AAPL:NASDAQ:equity',instrument_id:'old-aapl',timeframe:'1d',drawing_sets:{}};
assert.equal(m.drawingStorageKey(pane),'yahoo:AAPL:NASDAQ:equity/1d');assert.equal(m.drawingStorageKey({...pane,drawing_sets:{'old-aapl/1d':[d]}}),'old-aapl/1d');
const benchmark=performance.now();for(let n=0;n<500;n++)for(const tool of m.implementedTools)m.drawingGeometry({id:'stress',kind:tool.id,anchors:anchors.slice(0,tool.anchors),color:'#86aaf9',width:2,params:m.parametersFor(tool.id)},context);
console.log(`PASS: all ${m.implementedTools.length} enabled tools, clipping, OLS, data-space angle, hit testing, anchor resizing, LOG/% translation, replay, canonical/legacy persistence, interchange validation. ${500*m.implementedTools.length} geometry evaluations: ${(performance.now()-benchmark).toFixed(1)} ms.`);
