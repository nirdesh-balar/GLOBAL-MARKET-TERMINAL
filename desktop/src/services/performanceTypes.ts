export const PERFORMANCE_SAMPLE_MS = 5000;

export interface ProcessSample {
  memoryBytes: number | null;
  cpuPercent: number | null;
}

export interface MarketPerformance {
  historyRequests: number;
  activeHistory: number;
  queuedHistory: number;
  historyConcurrency: number;
  historyCacheBytes: number;
  yahooHistoryAttempts: number;
  yahooCooldownSeconds: number;
  hyperliquidRestRequests: number | null;
  hyperliquidCandleRequests: number | null;
  hyperliquidCooldownSeconds: number | null;
  hyperliquidWeightLimit: number | null;
  streamState: string;
  streamConnections: number;
  streamSubscriptions: number;
  streamConsumers: number;
  streamReconnects: number;
  historyError: boolean;
  streamError: boolean;
}

export interface PerformanceSnapshot {
  sampledAt: number;
  intervalMs: number;
  cpuWindowMs: number | null;
  version: string;
  sourceRevision: string | null;
  electron: string;
  platform: string;
  main: ProcessSample;
  renderer: ProcessSample;
  backend: ProcessSample;
  market: MarketPerformance | null;
}
