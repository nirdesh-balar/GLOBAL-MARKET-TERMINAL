import type {SymbolEntry,Watchlist} from '../types';
export const identity=(r:SymbolEntry)=>r.canonical_id||r.instrument_id||r.symbol;
export const systemList=(w:Watchlist)=>!!w.market||['stocks','us','global','indices','global_indices','crypto','forex','commodities','funds','favourites'].includes(w.id);
export interface WatchlistMutation {action:'create'|'rename'|'delete'|'duplicate'|'add'|'remove'|'reorder'|'transfer';id?:string;name?:string;instrument?:string;destination?:string;move?:boolean;order?:string[];confirm?:boolean}
export interface ImportInput {content:string;mapping:Record<string,number|null>;resolutions:Record<string,string>}
export interface ImportCommit extends ImportInput {target:string|null;name:string;mode:'append'|'replace';confirm_replace:boolean;skip_failed:boolean;preview_hash:string}
export interface ImportPreview {headers:string[];mapping:Record<string,number|null>;needs_mapping:boolean;preview:string[][];total:number;preview_hash:string;counts:Record<string,number>;rows:{row:number;values:string[];symbol:string;status:'valid'|'duplicate'|'failed'|'ambiguous';error:string;identity:SymbolEntry|null;candidates:SymbolEntry[]}[]}
export interface WatchlistResult {watchlists:Watchlist[];active_watchlist:string;watchlist_revision:number;summary:Record<string,number|string>}
