import { api } from '../services/api';
import type { Instrument, SymbolEntry } from '../types';
import { FlagColor, ORDERED_FLAG_COLORS } from './constants';
import type { FlagEntry, FlagsApiResponse, FlagStoreState, SetFlagPayload } from './types';

let state: FlagStoreState = {
  flags: {},
  counts: {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
    purple: 0,
    cyan: 0,
    pink: 0
  },
  aliases: {},
  loaded: false,
  error: null
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.error('FlagStore listener error:', e);
    }
  }
}

function computeCounts(flags: Record<string, FlagEntry>): Record<FlagColor, number> {
  const counts: Record<FlagColor, number> = {
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
    purple: 0,
    cyan: 0,
    pink: 0
  };
  for (const f of Object.values(flags)) {
    if (f.color in counts) {
      counts[f.color] += 1;
    }
  }
  return counts;
}

let initPromise: Promise<void> | null = null;

export const flagStore = {
  getState(): FlagStoreState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  async init(force = false): Promise<void> {
    if (state.loaded && !force) return;
    if (initPromise && !force) return initPromise;

    initPromise = (async () => {
      try {
        const resp = await api<FlagsApiResponse>('/api/flags', 'GET');
        state = {
          flags: resp.flags || {},
          counts: resp.counts || computeCounts(resp.flags || {}),
          aliases: resp.aliases || {},
          loaded: true,
          error: null
        };
        notify();
      } catch (e) {
        state = { ...state, error: (e as Error).message };
        notify();
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  },

  getFlag(idOrSymbol?: string | null): FlagEntry | undefined {
    if (!idOrSymbol) return undefined;
    if (state.flags[idOrSymbol]) return state.flags[idOrSymbol];
    for (const f of Object.values(state.flags)) {
      if (f.canonical_id === idOrSymbol || f.symbol === idOrSymbol) {
        return f;
      }
    }
    return undefined;
  },

  getSymbolsForColor(color: FlagColor): SymbolEntry[] {
    const list: SymbolEntry[] = [];
    for (const f of Object.values(state.flags)) {
      if (f.color === color) {
        const meta = f.metadata || {};
        list.push({
          symbol: f.symbol,
          token: String(meta.token || '0'),
          instrument_id: String(meta.instrument_id || meta.id || f.canonical_id),
          kind: (f.kind || 'equity') as SymbolEntry['kind'],
          name: f.name || f.symbol,
          exchange: f.exchange || '',
          canonical_id: f.canonical_id,
          provider: f.provider || 'yahoo',
          category: typeof meta.category === 'string' ? meta.category : undefined,
          country: typeof meta.country === 'string' ? meta.country : undefined,
          currency: typeof meta.currency === 'string' ? meta.currency : undefined,
          timezone: typeof meta.timezone === 'string' ? meta.timezone : 'Asia/Kolkata',
          calendar: typeof meta.calendar === 'string' ? meta.calendar : null,
          precision: typeof meta.precision === 'number' ? meta.precision : 2,
          contract: typeof meta.contract === 'string' ? meta.contract : '',
          market_type: typeof meta.market_type === 'string' ? meta.market_type : 'cash',
          native_id: typeof meta.native_id === 'string' ? meta.native_id : f.symbol,
          base_asset: typeof meta.base_asset === 'string' ? meta.base_asset : '',
          quote_asset: typeof meta.quote_asset === 'string' ? meta.quote_asset : '',
          identity_version: meta.identity_version === 1 ? 1 : undefined,
          legacy_unresolved: Boolean(meta.legacy_unresolved),
          native_mapping: typeof meta.native_mapping === 'string' ? meta.native_mapping : undefined,
          size_decimals: typeof meta.size_decimals === 'number' ? meta.size_decimals : null,
          trading_availability: typeof meta.trading_availability === 'string' ? meta.trading_availability : undefined,
          verified_at: typeof meta.verified_at === 'number' ? meta.verified_at : undefined
        });
      }
    }
    return list;
  },

  async assignFlag(
    inst: Instrument | SymbolEntry | { symbol: string; canonical_id?: string; name?: string; exchange?: string; provider?: string; kind?: string; [key: string]: unknown },
    color: FlagColor
  ): Promise<void> {
    const cid = inst.canonical_id || (inst as any).id || (inst as any).instrument_id || inst.symbol;
    const oldState = state;

    const newEntry: FlagEntry = {
      canonical_id: cid,
      color,
      symbol: inst.symbol,
      name: inst.name || inst.symbol,
      exchange: inst.exchange || '',
      provider: inst.provider || 'yahoo',
      kind: inst.kind || 'equity',
      metadata: { ...inst },
      updated_at: Date.now() / 1000
    };

    const updatedFlags = { ...state.flags, [cid]: newEntry };
    state = {
      ...state,
      flags: updatedFlags,
      counts: computeCounts(updatedFlags)
    };
    notify();

    try {
      const payload: SetFlagPayload = {
        canonical_id: cid,
        color,
        symbol: inst.symbol,
        name: inst.name,
        exchange: inst.exchange,
        provider: inst.provider,
        kind: inst.kind,
        metadata: { ...inst }
      };
      const res = await api<{ flag: FlagEntry; flags: Record<string, FlagEntry>; counts: Record<FlagColor, number> }>('/api/flags', 'POST', payload);
      if (res.flags) {
        state = {
          ...state,
          flags: res.flags,
          counts: res.counts || computeCounts(res.flags)
        };
        notify();
      }
    } catch (e) {
      state = oldState;
      notify();
      throw e;
    }
  },

  async removeFlag(canonical_id: string): Promise<void> {
    const cid = canonical_id;
    if (!cid) return;
    const oldState = state;

    const updatedFlags = { ...state.flags };
    delete updatedFlags[cid];

    state = {
      ...state,
      flags: updatedFlags,
      counts: computeCounts(updatedFlags)
    };
    notify();

    try {
      const res = await api<{ removed: boolean; flags: Record<string, FlagEntry>; counts: Record<FlagColor, number> }>('/api/flags/remove', 'POST', { canonical_id: cid });
      if (res.flags) {
        state = {
          ...state,
          flags: res.flags,
          counts: res.counts || computeCounts(res.flags)
        };
        notify();
      }
    } catch (e) {
      state = oldState;
      notify();
      throw e;
    }
  },

  async clearColor(color: FlagColor): Promise<void> {
    const oldState = state;
    const updatedFlags: Record<string, FlagEntry> = {};
    for (const [k, v] of Object.entries(state.flags)) {
      if (v.color !== color) {
        updatedFlags[k] = v;
      }
    }

    state = {
      ...state,
      flags: updatedFlags,
      counts: computeCounts(updatedFlags)
    };
    notify();

    try {
      const res = await api<{ cleared: number; flags: Record<string, FlagEntry>; counts: Record<FlagColor, number> }>('/api/flags/clear', 'POST', { color, confirm: true });
      if (res.flags) {
        state = {
          ...state,
          flags: res.flags,
          counts: res.counts || computeCounts(res.flags)
        };
        notify();
      }
    } catch (e) {
      state = oldState;
      notify();
      throw e;
    }
  },

  async setAlias(color: FlagColor, alias: string): Promise<void> {
    const res = await api<{ aliases: Record<string, string> }>('/api/flags/aliases', 'POST', { color, alias });
    state = {
      ...state,
      aliases: res.aliases || {}
    };
    notify();
  }
};
