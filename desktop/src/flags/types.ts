import type { FlagColor } from './constants';
import type { SymbolEntry } from '../types';

export interface FlagEntry {
  canonical_id: string;
  color: FlagColor;
  symbol: string;
  name: string;
  exchange: string;
  provider: string;
  kind: string;
  metadata?: Record<string, unknown>;
  created_at?: number;
  updated_at?: number;
}

export interface FlagsApiResponse {
  flags: Record<string, FlagEntry>;
  counts: Record<FlagColor, number>;
  aliases: Record<string, string>;
}

export interface SetFlagPayload {
  canonical_id?: string;
  color: FlagColor;
  symbol: string;
  name?: string;
  exchange?: string;
  provider?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
}

export interface FlagStoreState {
  flags: Record<string, FlagEntry>;
  counts: Record<FlagColor, number>;
  aliases: Record<string, string>;
  loaded: boolean;
  error: string | null;
}
