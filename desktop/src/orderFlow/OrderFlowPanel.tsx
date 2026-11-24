import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { symbolLabel } from '../services/api';
import { useStreamFeed, useStreamStatus, type StreamFeed, type StreamStatus } from '../streams/client';
import type { SymbolEntry } from '../types';
import { mergeTape, type BookLevel, type BookSnapshot } from './types';
import './order-flow.css';

const OWNER = 'order-flow';
const UTC = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
const PERCENT = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const SPREAD_PERCENT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 });

function managedState(status: StreamStatus, frame: StreamFeed | undefined, identity: string, now: number) {
  if (status.order_flow?.identity === identity && status.order_flow.state === 'limited') return 'Limit reached';
  if (status.paused || status.state === 'suspended') return 'Suspended';
  if (status.state === 'initializing') return 'Connecting';
  if (!status.enabled || status.state === 'unavailable') return 'Unavailable';
  if (status.state === 'disconnected') return 'Disconnected';
  if (status.state === 'limited') return 'Waiting to reconnect';
  if (status.state !== 'connected' || frame?.generation !== status.generation || !frame || frame.state === 'connecting') {
    return status.generation > 1 || status.state === 'connecting' && status.generation > 0 ? 'Reconnecting' : 'Connecting';
  }
  if (frame.state === 'live') {
    const age = now - 1000 * Math.min(frame.received_at, frame.market_time ?? frame.received_at);
    return age >= (frame.feed === 'l2Book' ? 12000 : 75000) ? 'Stale' : 'Live';
  }
  if (frame.state === 'stale') return 'Stale';
  if (frame.state === 'unavailable') return 'Unavailable';
  return 'Disconnected';
}

function DepthChart({ book, currency }: { book: BookSnapshot; currency: string }) {
  const low = book.bids.at(-1)?.price ?? book.asks[0]?.price;
  const high = book.asks.at(-1)?.price ?? book.bids[0]?.price;
  const span = Number(high) - Number(low);
  const peak = Math.max(Number(book.bids.at(-1)?.cumulative ?? 0), Number(book.asks.at(-1)?.cumulative ?? 0));
  if (!low || !high || span <= 0 || peak <= 0) return <p className="flow-note">Depth needs more distinct price levels.</p>;

  const x = (price: string) => (Number(price) - Number(low)) / span * 310 + 5;
  const y = (size: string) => 83 - Number(size) / peak * 69;
  const area = (levels: BookLevel[]) => levels.length ? `M ${x(levels[0].price)} 83 ${levels.map(level =>
    `H ${x(level.price)} V ${y(level.cumulative)}`).join(' ')} V 83 Z` : '';
  return (
    <figure className="flow-depth" data-testid="order-flow-depth">
      <figcaption><strong>Market depth</strong><span>Cumulative size</span></figcaption>
      <svg viewBox="0 0 320 92" role="img" aria-label={`Cumulative bid and ask size across observed prices from ${low} to ${high} ${currency}`}>
        <path className="depth-grid" d="M5 14H315 M5 37H315 M5 60H315 M5 83H315" />
        <path className="depth-area flow-bid" d={area(book.bids)} />
        <path className="depth-area flow-ask" d={area(book.asks)} />
      </svg>
      <div className="flow-depth-axis"><span>{low}</span><span>{currency}</span><span>{high}</span></div>
    </figure>
  );
}

export function OrderFlowPanel({ instrument, onClose }: { instrument: SymbolEntry; onClose: () => void }) {
  const status = useStreamStatus();
  const [bookFrame, setBookFrame] = useState<StreamFeed>();
  const [tapeFrame, setTapeFrame] = useState<StreamFeed>();
  const [view, setView] = useState<'book' | 'tape'>('book');
  const [tapeRows, setTapeRows] = useState(50);
  const [now, setNow] = useState(Date.now);
  const identity = instrument.canonical_id || instrument.instrument_id || '';
  const mapping = instrument.native_mapping || '';
  const supported = instrument.provider === 'hyperliquid' && identity.startsWith('hyperliquid:') && !!mapping && !instrument.legacy_unresolved;
  const acceptBook = useCallback((next: StreamFeed) => {
    if (next.native_mapping === mapping) setBookFrame(previous => previous && next.version < previous.version ? previous : next);
  }, [mapping]);
  const acceptTape = useCallback((next: StreamFeed) => {
    const tape = next.tape;
    if (next.native_mapping !== mapping || !tape) return;
    setTapeFrame(previous => previous && next.version < previous.version ? previous : { ...next, tape: mergeTape(previous?.tape, tape) });
  }, [mapping]);
  useStreamFeed(OWNER, instrument, 'l2Book', '', supported && status.enabled, acceptBook, false);
  useStreamFeed(OWNER, instrument, 'trades', '', supported && status.enabled, acceptTape, false);
  useEffect(() => {
    if (!supported) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [supported]);

  const book = bookFrame?.book;
  const tape = tapeFrame?.tape;
  const bookState = managedState(status, bookFrame, identity, now);
  const tapeState = managedState(status, tapeFrame, identity, now);
  const state = view === 'book' ? bookState : tapeState;
  const stamp = view === 'book' ? book?.time_ms : tape?.trades[0]?.time_ms;
  const quote = instrument.quote_asset ?? '';
  const base = instrument.base_asset ?? '';
  const received = tape?.trades.filter(row => row.time_ms >= now - 30 * 60_000) ?? [];
  const error = (view === 'book' ? bookFrame : tapeFrame)?.error || status.error;

  return (
    <aside className="order-flow-panel" aria-label="Order Flow" data-testid="order-flow-panel"
      data-identity={identity} data-book-state={supported ? bookState : 'Unsupported'}
      data-tape-state={supported ? tapeState : 'Unsupported'}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header className="flow-header">
        <div><h2>Order Flow</h2><span>{symbolLabel(instrument.symbol)}{supported && ` · ${instrument.market_type === 'spot' ? 'Spot' : 'Perpetual'}`}</span></div>
        <button type="button" aria-label="Close Order Flow" title="Close Order Flow" onClick={onClose}><X size={16} /></button>
      </header>
      {!supported ? <p className="flow-note">Live order book and Time &amp; Sales are available for verified Hyperliquid markets.</p> :
        <>
          <div className="flow-tabs" aria-label="Order Flow view">
            <button type="button" aria-pressed={view === 'book'} onClick={() => setView('book')}>Order book</button>
            <button type="button" aria-pressed={view === 'tape'} onClick={() => setView('tape')}>Time &amp; Sales</button>
          </div>
          <div className="flow-status" data-live={state === 'Live'}>
            <span role="status">{state}</span>
            {stamp && <time dateTime={new Date(stamp).toISOString()}> {UTC.format(stamp)} UTC · {Math.max(0, Math.floor((now - stamp) / 1000))}s ago</time>}
          </div>
          {state !== 'Live' && error && <p className="flow-note">{error}</p>}
          <div className="flow-scroll">
            {view === 'book' ? book ? <>
              <dl className="flow-metrics">
                <div><dt>Best bid</dt><dd className="flow-bid" data-testid="order-flow-bid">{book.bids[0]?.price ?? '—'}</dd></div>
                <div><dt>Best ask</dt><dd className="flow-ask" data-testid="order-flow-ask">{book.asks[0]?.price ?? '—'}</dd></div>
                <div><dt>Spread · {quote}</dt><dd data-testid="order-flow-spread">{book.spread ?? '—'}</dd></div>
                <div><dt>Spread · %</dt><dd data-testid="order-flow-spread-percent">{book.spread_percent === null ? '—' : `${SPREAD_PERCENT.format(Number(book.spread_percent))}%`}</dd></div>
                <div className="flow-imbalance"><dt>Imbalance · top {book.imbalance_depth} per side</dt>
                  <dd data-testid="order-flow-imbalance">{book.imbalance === null ? 'Insufficient depth' : PERCENT.format(Number(book.imbalance))}</dd>
                </div>
              </dl>
              <DepthChart book={book} currency={quote} />
              <table aria-label="Observed order book levels">
                <thead><tr><th>Bid · {quote}</th><th>Size · {base}</th><th>Ask · {quote}</th><th>Size · {base}</th></tr></thead>
                <tbody>{Array.from({ length: Math.max(book.bids.length, book.asks.length) }, (_, index) => {
                  const bid = book.bids[index], ask = book.asks[index];
                  return <tr key={index}>
                    <td className="flow-bid" title={bid ? `${bid.count} orders · cumulative ${bid.cumulative}` : undefined}>{bid?.price ?? '—'}</td><td>{bid?.size ?? '—'}</td>
                    <td className="flow-ask" title={ask ? `${ask.count} orders · cumulative ${ask.cumulative}` : undefined}>{ask?.price ?? '—'}</td><td>{ask?.size ?? '—'}</td>
                  </tr>;
                })}</tbody>
              </table>
              {!book.bids.length && !book.asks.length && <p className="flow-note">The latest snapshot contains no price levels.</p>}
            </> : <p className="flow-note">Waiting for a public book snapshot.</p> :
              <>
                <div className="flow-tape-options">
                  <span>{received.length.toLocaleString()} retained</span>
                  <label>Rows <select value={tapeRows} onChange={event => setTapeRows(Number(event.target.value))}>
                    <option value={50}>50</option><option value={100}>100</option><option value={250}>250</option>
                  </select></label>
                </div>
                {tape?.last_gap_ms && <p className="flow-note">Tape interrupted at {UTC.format(tape.last_gap_ms)} UTC. Coverage may have a gap.</p>}
                {tape?.cursor_gap && <p className="flow-note">Some prints fell outside the local delivery window.</p>}
                {tape?.evicted ? <p className="flow-note">Older prints have rotated out of this session.</p> : null}
                {received.length ? <table aria-label="Public trade prints">
                  <thead><tr><th>UTC</th><th>Price · {quote}</th><th>Size · {base}</th><th title="Raw Hyperliquid side code">Side</th></tr></thead>
                  <tbody>{received.slice(0, tapeRows).map(row => <tr key={`${row.time_ms}:${row.id}`}>
                    <td>{UTC.format(row.time_ms)}</td><td>{row.price}</td><td>{row.size}</td><td>{row.side ?? '—'}</td>
                  </tr>)}</tbody>
                </table> : <p className="flow-note">No public trades observed in this session yet.</p>}
              </>}
          </div>
          <footer className="flow-footer">Hyperliquid public stream · observed session</footer>
        </>}
    </aside>
  );
}
