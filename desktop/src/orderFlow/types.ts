export interface BookLevel {
  price: string;
  size: string;
  count: number;
  cumulative: string;
}

export interface BookSnapshot {
  time_ms: number;
  bids: BookLevel[];
  asks: BookLevel[];
  spread: string | null;
  spread_percent: string | null;
  imbalance: string | null;
  imbalance_depth: number;
}

export interface TradePrint {
  time_ms: number;
  id: number;
  price: string;
  size: string;
  side: 'A' | 'B' | null;
}

export interface TapeFrame {
  session: number;
  opened_ms: number;
  cutoff_ms: number;
  last_gap_ms: number | null;
  cursor_gap: boolean;
  retained: number;
  evicted: number;
  trades: TradePrint[];
}

export function mergeTape(previous: TapeFrame | undefined, latest: TapeFrame): TapeFrame {
  const sameSession = previous?.session === latest.session;
  const unique = new Map<string, TradePrint>();
  for (const row of [...(sameSession ? previous.trades : []), ...latest.trades]) {
    if (row.time_ms >= latest.cutoff_ms) unique.set(`${row.time_ms}:${row.id}`, row);
  }
  const trades = [...unique.values()].sort((a, b) => b.time_ms - a.time_ms || b.id - a.id).slice(0, latest.retained);
  return { ...latest, trades, cursor_gap: latest.cursor_gap || Boolean(sameSession && previous.cursor_gap) };
}
