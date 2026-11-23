import { memo, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, CandlestickChart, Maximize2, Minimize2, RefreshCw, Search } from 'lucide-react';
import { price, symbolLabel } from '../services/api';
import type { HistoryResult, Timeframe } from '../types';
import { GridChart, gridDateFormatter } from './GridChart';
import { gridHistory } from './history';
import { GRID_TIMEFRAMES, type GridCard, gridHistoryPath } from './model';

type HistoryState = { path: string; value?: HistoryResult; error?: string };
type Props = {
  card: GridCard;
  theme: 'dark' | 'light';
  maximized: boolean;
  openSymbol: (id: string) => void;
  toggleMaximize: (id: string) => void;
  openNormal: (card: GridCard) => void;
  onChange: (id: string, patch: Partial<Pick<GridCard, 'timeframe' | 'sma' | 'ema'>>) => void;
};

export const GridTile = memo(function GridTile({ card, theme, maximized, openSymbol, toggleMaximize, openNormal, onChange }: Props) {
  const { canonical_id: id, instrument, timeframe } = card;
  const path = gridHistoryPath(card);
  const [result, setResult] = useState<HistoryState>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    const lease = gridHistory.request(path);
    void lease.promise.then(value => {
      if (!current) return;
      setResult(value.canonical_id === id && value.interval === timeframe
        ? { path, value }
        : { path, error: 'The history response did not match this instrument and timeframe.' });
    }, (error: unknown) => {
      if (current) setResult({ path, error: error instanceof Error ? error.message : 'Unable to load history.' });
    });
    return () => { current = false; lease.release(); };
  }, [path, id, timeframe, attempt]);

  const data = result?.path === path ? result.value : undefined;
  const failure = result?.path === path ? result.error : undefined;
  const status = failure ? 'error' : !data ? 'loading' : !data.candles.length ? 'empty' : data.stale ? 'stale' : 'ready';
  const last = data?.candles.at(-1);
  const previous = data?.candles.at(-2);
  const change = last && previous ? last.close - previous.close : undefined;
  const percent = change !== undefined && previous?.close ? change / previous.close * 100 : undefined;
  const precision = data?.precision ?? instrument?.precision ?? 2;
  const currency = data?.currency || instrument?.currency;
  const symbol = instrument ? symbolLabel(instrument.symbol) : id.split(':')[1];
  const exchange = instrument?.exchange || (id.startsWith('hyperliquid:') ? 'Hyperliquid' : 'Yahoo Finance');
  const timeframeDate = useMemo(() => gridDateFormatter(timeframe, data?.timezone), [timeframe, data?.timezone]);
  const update = (patch: Parameters<Props['onChange']>[1]) => onChange(id, patch);

  return <article className="grid-tile" aria-label={symbol + ' chart'} data-testid="grid-card"
    data-grid-id={id} data-status={status} data-timeframe={timeframe}>
    <header className="grid-tile-header">
      <div className="grid-tile-identity">
        <button className="grid-symbol" title="Change instrument" onClick={() => openSymbol(id)} aria-label={'Change symbol for ' + symbol}>
          {symbol}<Search size={12} aria-hidden="true" />
        </button>
        <span className="grid-market">{exchange}{instrument?.market_type ? ' · ' + instrument.market_type : ''}</span>
        <small title={instrument?.name}>{instrument?.name || id}</small>
      </div>
      <div className="grid-tile-actions">
        <button className="grid-icon" aria-label={'Open ' + symbol + ' in Charts'} title="Open in Charts" disabled={!instrument} onClick={() => openNormal(card)}>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
        <button className="grid-icon" data-grid-maximize aria-label={(maximized ? 'Restore ' : 'Maximize ') + symbol} title={maximized ? 'Restore card' : 'Maximize card'}
          onClick={() => toggleMaximize(id)}>{maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
      </div>
    </header>
    <div className="grid-quote">
      <strong>{last ? price(last.close, precision) : '—'} {last && currency && <small>{currency}</small>}</strong>
      {change !== undefined && <span className={change > 0 ? 'grid-up' : change < 0 ? 'grid-down' : ''} title="Change from previous displayed candle">
        {change > 0 ? '+' : ''}{price(change, precision)}{percent !== undefined && ' (' + (percent > 0 ? '+' : '') + price(percent) + '%)'}
      </span>}
    </div>
    <div className="grid-tile-plot">
      {last && data ? <GridChart data={data} theme={theme} showSma={card.sma} showEma={card.ema} />
        : <div className="grid-tile-placeholder" role={failure ? 'alert' : 'status'}>
          {failure ? <><AlertCircle size={20} /><span>{failure}</span><button onClick={() => { setResult(undefined); setAttempt(i => i + 1); }}><RefreshCw size={13} /> Retry</button></>
            : <><CandlestickChart size={22} /><span>{data ? 'No candles available' : 'Loading history…'}</span></>}
        </div>}
    </div>
    <footer className="grid-tile-footer">
      <select aria-label={'Timeframe for ' + symbol} value={timeframe} onChange={e => update({ timeframe: e.target.value as Timeframe })}>
        {GRID_TIMEFRAMES.map(value => <option key={value}>{value}</option>)}
      </select>
      <button className="grid-overlay-sma" aria-pressed={card.sma} title="20-candle simple moving average" onClick={() => update({ sma: !card.sma })}>SMA</button>
      <button className="grid-overlay-ema" aria-pressed={card.ema} title="20-candle exponential moving average" onClick={() => update({ ema: !card.ema })}>EMA</button>
      <small className={data?.stale ? 'grid-stale' : ''} title={data?.provider_error?.message || data?.notice}>
        {last && ((data?.stale ? 'Stale · ' : last.partial ? 'Partial · ' : '') + timeframeDate.format(last.time * 1000))}
      </small>
    </footer>
  </article>;
});
