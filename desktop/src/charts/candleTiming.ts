import type { Candle, CandleClockBounds, HistoryResult } from '../types';

const MAX_AGE_SECONDS = 90;

export function countdownBounds(history: HistoryResult, candle: Candle, streamState?: string): CandleClockBounds | undefined {
  if (history.stale || history.provider_error) return;
  if (history.source === 'HYPERLIQUID') {
    if (streamState && streamState !== 'live') return;
    if (candle.complete !== false || !Number.isFinite(candle.end_time)) return;
    return { bar_time: candle.time, close_time: candle.end_time!, observed_at: history.stream_received_at ?? history.fetched_at };
  }
  if (history.source === 'YAHOO FINANCE' && history.candle_clock?.bar_time === candle.time) return history.candle_clock;
}

export function remainingCandleSeconds(bounds: CandleClockBounds, now: number) {
  const { bar_time, close_time, observed_at } = bounds;
  if (![bar_time, close_time, observed_at, now].every(Number.isFinite) ||
      observed_at < bar_time || now < Math.floor(observed_at) || now >= close_time ||
      now - observed_at > MAX_AGE_SECONDS) return null;
  return Math.ceil(close_time - now);
}

export function candleDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
    : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
