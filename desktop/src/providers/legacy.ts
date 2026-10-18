import type {SymbolEntry} from '../types';
export const legacyCrypto=(row:Pick<SymbolEntry,'kind'|'provider'>)=>row.kind==='crypto'&&(row.provider||'yahoo')==='yahoo';
export const legacyMessage='This saved symbol uses the old Yahoo cryptocurrency provider. Crypto charts now use Hyperliquid. Select a verified Hyperliquid spot or perpetual market, or open migration.';
export type MigrationRequest={nonce:number;symbol?:string;choose?:boolean;identity?:string;candidate?:string};
