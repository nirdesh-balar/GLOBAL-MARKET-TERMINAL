import type {SymbolEntry} from '../types';
export function providerLabel(row:Pick<SymbolEntry,'provider'|'market_type'|'native_id'>){return row.provider==='hyperliquid'?row.native_id?.includes(':')?'Hyperliquid Crypto HIP-3':row.market_type==='spot'?'Hyperliquid Spot':'Hyperliquid Perpetual':'Yahoo Finance';}

export function marketIdentity(row:Pick<SymbolEntry,'provider'|'market_type'|'exchange'|'kind'>){
  if(row.kind==='crypto'||row.provider==='hyperliquid'){
    return row.market_type==='spot'?'Spot':row.market_type==='perpetual'?'Perpetual':'Crypto';
  }
  return row.exchange;
}
