import {parseGhost,priceSources} from './analytics';
import type {Drawing} from '../types';
import {toolRegistry} from './registry';
/** Validates drawing-only interchange before anything can enter chart state. */
export function validateDrawing(input:unknown):Drawing{
 if(!input||typeof input!=='object')throw Error('Invalid drawing');const d=input as Drawing,t=toolRegistry.get(d.kind);
 if(!t?.enabled)throw Error('Unknown or unavailable drawing tool');
 if(Object.keys(d).some(k=>!['id','kind','anchors','color','width','version','dash','opacity','fill_opacity','visible','locked','params'].includes(k)))throw Error('Unknown drawing field');
 if(typeof d.id!=='string'||!d.id||d.id.length>80||!Array.isArray(d.anchors)||(t.variable?(d.anchors.length<2||d.anchors.length>(t.maxAnchors??32)):d.anchors.length!==t.anchors))throw Error('Invalid drawing identity or anchor count');
 for(const a of d.anchors)if(!a||typeof a!=='object'||Object.keys(a).some(k=>!['time','price'].includes(k))||!Number.isInteger(a.time)||a.time<0||a.time>4102444800||!Number.isFinite(a.price)||(d.version!==2&&a.price<=0))throw Error('Use finite financial time/price anchors');
 if(!/^#[0-9a-f]{6}$/i.test(d.color)||![1,2,3,4].includes(d.width))throw Error('Invalid drawing style');
 if(d.version!==undefined&&![1,2].includes(d.version)||d.dash!==undefined&&!['solid','dash','dot'].includes(d.dash))throw Error('Unsupported drawing format');
 for(const [key,min,max] of [['opacity',0,1],['fill_opacity',0,1]] as const){const n=d[key];if(n!==undefined&&(!Number.isFinite(n)||n<min||n>max))throw Error('Invalid drawing opacity');}
 for(const key of ['locked','visible'] as const)if(d[key]!==undefined&&typeof d[key]!=='boolean')throw Error('Invalid drawing state');
 if(d.params!==undefined&&(d.params===null||typeof d.params!=='object'||Array.isArray(d.params)))throw Error('Invalid parameter object');
 const allowed=new Set(t.parameters.map(p=>p.key));
 for(const [key,value] of Object.entries(d.params||{})){
  if(!allowed.has(key))throw Error('Unknown tool parameter');const schema=t.parameters.find(p=>p.key===key)!;
  if(schema.type==='image'){validateImageData(value);}
  else if(schema.type==='levels'){validateLevels(value);}
  else if(schema.type==='boolean'){if(typeof value!=='boolean')throw Error('Invalid boolean parameter');}
  else if(schema.type==='text'){if(typeof value!=='string'||value.length>2000)throw Error('Annotation text is limited to 2000 characters');}
  else if(typeof value!=='number'||!Number.isFinite(value)||schema.min!==undefined&&value<schema.min||schema.max!==undefined&&value>schema.max)throw Error('Invalid tool parameter');
 }
 if(['polyline','path','brush','highlighter','position_forecast'].includes(d.kind)&&d.anchors.some((a,i)=>i>0&&a.time===d.anchors[i-1].time&&a.price===d.anchors[i-1].price))throw Error('Polyline vertices must be distinct');
 if(['parallel_channel','regression_channel','flat_channel','disjoint_channel'].includes(d.kind)&&d.anchors[0].time===d.anchors[1].time)throw Error('A channel needs distinct trading bars');
 if(d.kind==='disjoint_channel'&&d.anchors[2].time===d.anchors[3].time)throw Error('The second channel boundary needs distinct trading bars');
 if(d.version===2&&['trend','ray','extended','info_line','trend_angle'].includes(d.kind)&&d.anchors[0].time===d.anchors[1].time&&d.anchors[0].price===d.anchors[1].price)throw Error('Choose two distinct anchors');
 if(d.params?.ghost_bars!==undefined)parseGhost(d.params.ghost_bars);
 if(d.params?.price_source!==undefined&&!priceSources.includes(d.params.price_source))throw Error('Unknown VWAP price source');
 for(const k of ['bull_color','bear_color'] as const)if(d.params?.[k]!==undefined&&!/^#[0-9a-f]{6}$/i.test(d.params[k]!))throw Error('Use a six-digit hexadecimal color');
 if(d.params?.price_precision!==undefined&&!Number.isInteger(d.params.price_precision))throw Error('Price precision must be an integer');
 if(d.params?.bins!==undefined&&!Number.isInteger(d.params.bins))throw Error('Price bins must be an integer');
 return structuredClone(d);
}
export function serializeDrawings(drawings:Drawing[]){if(drawings.length>100)throw Error('Drawing limit reached');return JSON.stringify({version:2,drawings:drawings.map(validateDrawing)});}
export function deserializeDrawings(text:string){if(text.length>2_000_000)throw Error('Drawing JSON is too large');const v=JSON.parse(text);if(!v||![1,2].includes(v.version)||Object.keys(v).some(k=>!['version','drawings'].includes(k))||!Array.isArray(v.drawings)||v.drawings.length>100)throw Error('Unsupported drawing document');const drawings=v.drawings.map((d:Drawing)=>validateDrawing(v.version===1?{...d,version:1}:d)) as Drawing[];if(new Set(drawings.map(d=>d.id)).size!==drawings.length)throw Error('Duplicate drawing IDs');return drawings;}

export function validateLevels(value:unknown){
 if(!Array.isArray(value)||!value.length||value.length>32)throw Error('Use 1–32 Fibonacci levels');
 const ratios=new Set<number>();
 for(const l of value){if(!l||typeof l!=='object'||Object.keys(l).some(k=>!['ratio','color','width','dash','visible'].includes(k))||typeof l.ratio!=='number'||!Number.isFinite(l.ratio)||Math.abs(l.ratio)>1000||ratios.has(l.ratio))throw Error('Use unique finite Fibonacci ratios between −1000 and 1000');ratios.add(l.ratio);
 if(l.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(l.color)||l.width!==undefined&&![1,2,3,4].includes(l.width)||l.dash!==undefined&&!['solid','dash','dot'].includes(l.dash)||l.visible!==undefined&&typeof l.visible!=='boolean')throw Error('Invalid Fibonacci level style');}
}

export function validateImageData(value:unknown){
 if(value==='')return;
 if(typeof value!=='string'||value.length>175000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Only bounded embedded PNG images are permitted');
 let bytes:string;try{bytes=atob(value.slice(22));}catch{throw Error('Invalid PNG encoding');}
 if(bytes.length<33||bytes.length>131072||bytes.slice(0,8)!=='\x89PNG\r\n\x1a\n'||bytes.slice(12,16)!=='IHDR')throw Error('Invalid or oversized PNG');
 const n=(i:number)=>((bytes.charCodeAt(i)*0x1000000)+(bytes.charCodeAt(i+1)<<16)+(bytes.charCodeAt(i+2)<<8)+bytes.charCodeAt(i+3));if(n(16)<1||n(16)>1024||n(20)<1||n(20)>1024)throw Error('PNG dimensions exceed 1024 pixels');
}
