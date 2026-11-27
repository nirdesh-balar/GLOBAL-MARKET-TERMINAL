import {compilePine,runPine,type PineProgram} from './pine';
import type {AppliedStudy,LocalStudy} from './recipes';
import type {Candle} from '../types';
import type {Study} from '../charts/indicators';

export interface PineRevision {number:number;version:4|5|6;source:string;title:string;overlay:boolean;plot_count:number}
export interface PineScript {id:string;name:string;language:'pine-subset';category:'indicator';revisions:PineRevision[]}

export const starterSource='//@version=6\nindicator("My EMA", overlay = true)\nperiod = input.int(20, "Length", minval = 1)\nplot(ta.ema(close, period), "EMA", color.orange, linewidth = 2)\n';

export function legacySource(item:LocalStudy, revision=item.revisions.at(-1)!){
  const {source,rsi,ema,wma}=revision.recipe;
  return [
    '//@version=6',
    `indicator("${item.name.replace(/["\\\r\n]/g,' ')}", overlay = false)`,
    `value = ta.rsi(${source.toLowerCase()}, ${rsi})`,
    'plot(value, "RSI", color.blue)',
    `plot(ta.ema(value, ${ema}), "EMA of RSI", color.aqua)`,
    `plot(ta.wma(value, ${wma}), "WMA of RSI", color.orange)`,
    'hline(50, "Reference")',
    '',
  ].join('\n');
}

const programs=new Map<string,PineProgram|null>();
function programFor(source:string){
  if(programs.has(source))return programs.get(source);
  let program:PineProgram|null=null;
  try{program=compilePine(source);}catch{/* Imported/corrupt source is never executed without validation. */}
  programs.set(source,program);
  if(programs.size>32)programs.delete(programs.keys().next().value!);
  return program;
}

export function pineSeries(rows:Candle[], instances:readonly AppliedStudy[], scripts:readonly PineScript[]):Study[]{
  return instances.flatMap(item=>{
    if(!item.visible||!('script_id' in item))return [];
    const revision=scripts.find(script=>script.id===item.script_id)?.revisions.at(-1);
    if(!revision)return [];
    const program=programFor(revision.source);
    if(!program)return [];
    const output=runPine(program,rows);
    return output.plots.map((plot,index)=>({
      id:item.id,name:plot.name,pane:program.overlay?'main':item.id,
      histogram:false,color:'#7f9feb',width:plot.width,style:plot.hline?2:0,levels:[],
      points:plot.points.map(point=>({...point,color:point.color??'#00000000'})),
      scripted:true,
      scriptedFills:output.fills.filter(fill=>fill.left===index).map(fill=>({
        peer:output.plots[fill.right].points,colors:fill.colors,
      })),
    }));
  });
}
