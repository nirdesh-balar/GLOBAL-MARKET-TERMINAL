import type { SymbolEntry, Timeframe } from '../types';

export const GRID_PAGE_SIZE = 8;
export const GRID_CARD_LIMIT = 128;
export const GRID_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M', '1Y'] as const;

export interface GridCard {
  canonical_id: string;
  timeframe: Timeframe;
  sma: boolean;
  ema: boolean;
  instrument?: SymbolEntry;
}

export interface GridPreferences {
  version: 1;
  source_label: string;
  timeframe: Timeframe;
  columns: 1 | 2 | 3 | 4;
  size: 'compact' | 'comfortable';
  cards: GridCard[];
}

export const DEFAULT_GRID: GridPreferences = {
  version: 1,
  source_label: '',
  timeframe: '1d',
  columns: 4,
  size: 'compact',
  cards: [],
};

export type GridInstrument = SymbolEntry & { timeframe?: Timeframe };

export function gridIdentity(row: SymbolEntry) {
  const provider = row.kind === 'crypto' ? 'hyperliquid' : 'yahoo';
  const id = row.canonical_id;
  return !row.legacy_unresolved && row.token !== '0' && row.provider === provider
    && id?.startsWith(provider + ':') && id.length <= 180 && !/\s/.test(id) ? id : undefined;
}

export function gridCards(rows: readonly GridInstrument[], timeframe: Timeframe) {
  const cards: GridCard[] = [];
  const seen = new Set<string>();
  let unavailable = 0;
  let duplicates = 0;
  let excess = 0;
  for (const row of rows) {
    const id = gridIdentity(row);
    if (!id) { unavailable++; continue; }
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    if (cards.length >= GRID_CARD_LIMIT) { excess++; continue; }
    cards.push({
      canonical_id: id,
      timeframe: row.timeframe && GRID_TIMEFRAMES.includes(row.timeframe) ? row.timeframe : timeframe,
      sma: false,
      ema: false,
      instrument: row,
    });
  }
  return { cards, unavailable, duplicates, excess };
}

export function gridHistoryPath(card: GridCard) {
  const source = card.canonical_id.startsWith('hyperliquid:') ? 'hyperliquid' : 'yahoo';
  const params = new URLSearchParams({
    symbol: card.canonical_id,
    interval: card.timeframe,
    period: 'max',
    source,
    adjusted: 'false',
    priority: '1',
  });
  if (source === 'hyperliquid' && card.instrument?.native_mapping) {
    params.set('native_mapping', card.instrument.native_mapping);
  }
  return '/api/history?' + params;
}
