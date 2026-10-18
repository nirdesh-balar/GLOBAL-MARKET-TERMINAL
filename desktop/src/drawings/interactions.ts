import type {Drawing,DrawingAnchor,Candle} from '../types';
import {logicalForTime,type Point} from './geometry';
/** Translate in chart scale coordinates, then invert the chart transform.
 * On LOG this yields a common multiplicative price factor; on linear/% a common
 * scale translation. Time translation preserves trading-bar distance at edges.
 */
export function translateDrawing(d:Drawing,rows:Candle[],barDelta:number,pixelDelta:number,point:(a:DrawingAnchor)=>Point|null,priceAtY:(y:number)=>number|null):Drawing{
 const indices=d.anchors.map(a=>Math.round(logicalForTime(rows,a.time)));
 const future=d.kind==='position_forecast'||d.kind==='bars_pattern';const delta=Math.max(-Math.min(...indices),Math.min(rows.length-1-(future?indices[0]:Math.max(...indices)),barDelta));
 return {...d,anchors:d.anchors.map((a,i)=>{const p=point(a),price=p?priceAtY(p.y+pixelDelta):null;return {time:rows[indices[i]+delta]?.time??(future?Math.max(0,Math.min(4102444800,Math.round(rows.at(-1)!.time+(indices[i]+delta-rows.length+1)*(rows.at(-1)!.time-(rows.at(-2)?.time??rows.at(-1)!.time-86400))))):a.time),price:price!==null&&Number.isFinite(price)&&(d.version===2||price>0)?price:a.price};})};
}
export function resizeDrawing(d:Drawing,index:number,anchor:DrawingAnchor):Drawing{if(d.kind==='rectangle'&&index>=2){const [a,b]=d.anchors;return {...d,anchors:index===2?[{time:a.time,price:anchor.price},{time:anchor.time,price:b.price}]:[{time:anchor.time,price:a.price},{time:b.time,price:anchor.price}]};}return {...d,anchors:d.anchors.map((a,i)=>i===index?anchor:a)};}
