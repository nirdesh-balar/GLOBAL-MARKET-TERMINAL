import type {SymbolEntry} from '../types';
export function providerLabel(row:Pick<SymbolEntry,'provider'|'market_type'|'native_id'>){return row.provider==='hyperliquid'?row.native_id?.includes(':')?'Hyperliquid Crypto HIP-3':row.market_type==='spot'?'Hyperliquid Spot':'Hyperliquid Perpetual':'Yahoo Finance';}
