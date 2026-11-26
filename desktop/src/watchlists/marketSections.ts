import type { SymbolEntry } from '../types';

export const MARKET_SECTIONS = [
    ['commodities', 'Commodities'],
    ['indices_funds', 'Indices & ETFs'],
    ['crypto', 'Crypto'],
    ['stocks', 'Stocks'],
    ['other', 'Other instruments'],
] as const;

export type MarketSection = typeof MARKET_SECTIONS[number][0];

export function marketSection(row: SymbolEntry): MarketSection {
    if (row.kind === 'future' || row.category === 'commodities') return 'commodities';
    if (row.kind === 'index' || row.kind === 'etf' || row.kind === 'fund' ||
        ['indices', 'global_indices', 'funds'].includes(row.category || '')) return 'indices_funds';
    if (row.kind === 'crypto' || row.provider === 'hyperliquid' || row.category === 'crypto') return 'crypto';
    if (row.kind === 'equity' || ['stocks', 'us', 'global'].includes(row.category || '')) return 'stocks';
    return 'other';
}
