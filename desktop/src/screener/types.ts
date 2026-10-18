import type {SymbolEntry,Timeframe} from '../types';
export interface Condition {type:'condition';kind:string;params:Record<string,number|string>}
export interface Group {type:'group';op:'and'|'or';children:Node[]}
export type Node=Condition|Group;
export interface ScreenConfig {version:1;universe:string;mode:'universe'|'watchlist'|'symbols';symbols:string[];watchlist:string;interval:Timeframe;as_of:number|null;completed:boolean;adjusted:boolean;batch_size:number;offset:number;conditions:Group}
export interface ConditionDefinition {kind:string;label:string;family:string;defaults:Record<string,number|string>}
export interface Universe {id:string;name:string;count:number;complete:boolean;scope:string;directory:{updated?:number};symbols:(SymbolEntry&{id:string;yahoo_symbol:string;status:string})[]}
export interface ScreenResult extends SymbolEntry {analysis_basis?:string;connection?:string;live_enabled?:boolean;received_at?:number;source?:string;status:'matched'|'no_match'|'unknown'|'missing'|'failed';market:string;timeframe:Timeframe;close?:number;change?:number|null;rsi?:number|null;ema?:Record<string,number|null>;sma?:Record<string,number|null>;macd?:number|null;volume?:number|null;relative_volume?:number|null;volume_unit?:string;candle_time?:number;fetched_at?:number;as_of?:number;bars?:number;notice?:string;error?:string;details?:{kind:string;state:string;reason:string|null}[]}
export interface Job {id:string;state:'running'|'cooldown'|'completed'|'cancelled';universe_total:number;batch_total:number;next_offset:number;offset:number;cooldown_seconds:number;warning:string;counts:Record<string,number>}
export interface Preset {id:string;name:string;config:ScreenConfig}
export const defaultConfig=():ScreenConfig=>({version:1,universe:'nse_mainboard',mode:'universe',symbols:[],watchlist:'stocks',interval:'1d',as_of:null,completed:true,adjusted:false,batch_size:25,offset:0,conditions:{type:'group',op:'and',children:[{type:'condition',kind:'rsi_below',params:{period:14,source:'close',value:30}}]}});
