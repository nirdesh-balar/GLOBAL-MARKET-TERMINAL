/** One rendered point per provider candle. Financial calculations use the original candles. */
import {AreaSeries, BarSeries, BaselineSeries, CandlestickSeries, HistogramSeries, LineSeries, LineType,
  type IChartApi, type ISeriesApi, type SeriesType, type UTCTimestamp} from 'lightweight-charts';
import type {Candle} from '../types';
import type {getCandleColors} from './appearance';

export const chartStyleGroups = [
  ['OHLC', [['bars','Bars'],['candles','Candles'],['hollow','Hollow Candles'],['hlc-bars','HLC Bars']]],
  ['Line', [['line','Line'],['markers','Line with Markers'],['steps','Step Line']]],
  ['Area', [['area','Area'],['baseline','Baseline']]],
  ['Other prices', [['columns','Columns'],['high-low','High–Low']]],
  ['Calculated', [['heikin-ashi','Heikin Ashi'],['line-break','Line Break']]],
] as const;
export type ChartStyle = (typeof chartStyleGroups)[number][1][number][0];

type Colors = ReturnType<typeof getCandleColors>;
export function styleRows(rows:Candle[],style:ChartStyle):Candle[] {
  if(style!=='heikin-ashi')return rows;
  let previous:Candle|undefined;
  return rows.map(row=>{
    const close=(row.open+row.high+row.low+row.close)/4;
    const open=previous?(previous.open+previous.close)/2:(row.open+row.close)/2;
    return previous={...row,open,close,high:Math.max(row.high,open,close),low:Math.min(row.low,open,close)};
  });
}

export function chartPoint(row:Candle,style:ChartStyle,colors:Colors) {
  const time=row.time as UTCTimestamp;
  const up=row.close>=row.open;
  const direction=up?colors.upColor:colors.downColor;
  if(style==='high-low')return {time,open:row.low,high:row.high,low:row.low,close:row.high,color:direction,borderColor:direction,wickColor:direction};
  if(style==='hollow')return {...row,time,color:up?'transparent':direction,borderColor:direction,wickColor:direction};
  if(style==='columns')return {time,value:row.close,color:direction};
  return {...row,time,value:row.close};
}

/** One line at most per observed close, with whitespace for unqualified bars. */
export function lineBreakPoints(rows:Candle[]){
  const recent:{open:number;close:number}[]=[];
  let last=rows[0]?.close;
  return rows.map(row=>{
    const time=row.time as UTCTimestamp;
    if(last===undefined||row.close===last)return {time};
    const previous=recent.at(-1);
    if(previous){
      const high=Math.max(...recent.map(line=>Math.max(line.open,line.close)));
      const low=Math.min(...recent.map(line=>Math.min(line.open,line.close)));
      const rising=previous.close>previous.open;
      if(rising?row.close<=previous.close&&row.close>=low:row.close>=previous.close&&row.close<=high)return {time};
    }
    const line={open:last,close:row.close};
    recent.push(line);
    if(recent.length>3)recent.shift();
    last=row.close;
    return {...line,time,high:Math.max(line.open,line.close),low:Math.min(line.open,line.close)};
  });
}

export function chartPoints(rows:Candle[],style:ChartStyle,colors:Colors){
  return style==='line-break'?lineBreakPoints(rows):styleRows(rows,style).map(row=>chartPoint(row,style,colors));
}

export function createMainSeries(chart:IChartApi,style:ChartStyle,colors:Colors,precision:number):ISeriesApi<SeriesType> {
  const common={priceFormat:{type:'price' as const,precision,minMove:10**-precision}};
  switch(style){
    case 'bars':
    case 'hlc-bars':
      return chart.addSeries(BarSeries,{...common,openVisible:style==='bars',upColor:colors.upColor,downColor:colors.downColor});
    case 'candles':
    case 'hollow':
    case 'high-low':
    case 'heikin-ashi':
    case 'line-break':
      return chart.addSeries(CandlestickSeries,{...common,...styleColors(style,colors)});
    case 'area':return chart.addSeries(AreaSeries,{...common,...styleColors(style,colors),lineWidth:2});
    case 'baseline':return chart.addSeries(BaselineSeries,{...common,...styleColors(style,colors),lineWidth:2});
    case 'columns':return chart.addSeries(HistogramSeries,{...common,color:colors.upColor});
    default:return chart.addSeries(LineSeries,{...common,color:colors.upColor,lineWidth:2,
      pointMarkersVisible:style==='markers',lineType:style==='steps'?LineType.WithSteps:LineType.Simple});
  }
}

export function styleColors(style:ChartStyle,c:Colors){
  switch(style){
    case 'candles':
    case 'hollow':
    case 'high-low':
    case 'heikin-ashi':
    case 'line-break':
      return {upColor:c.upColor,downColor:c.downColor,wickUpColor:c.wickUpColor,wickDownColor:c.wickDownColor,
        borderUpColor:c.borderUpColor,borderDownColor:c.borderDownColor,borderVisible:style==='hollow'||c.borders,wickVisible:style!=='high-low'};
    case 'bars':
    case 'hlc-bars':return {upColor:c.upColor,downColor:c.downColor};
    case 'area':return {lineColor:c.upColor,topColor:c.upColor+'30',bottomColor:c.upColor+'00'};
    case 'baseline':return {topLineColor:c.upColor,bottomLineColor:c.downColor,topFillColor1:c.upColor+'33',
      topFillColor2:c.upColor+'00',bottomFillColor1:c.downColor+'00',bottomFillColor2:c.downColor+'33'};
    default:return {color:c.upColor};
  }
}
