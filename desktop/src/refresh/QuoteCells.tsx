import { memo, useLayoutEffect, useRef } from 'react';
import type { QuoteRow } from './hooks';
import { quoteTime } from './hooks';
import { price } from '../services/api';

const volumeFormat = Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 });
const changeClass = (value?: number | null) => value ? value > 0 ? 'positive' : 'negative' : '';

export const QuoteCells = memo(function QuoteCells({ row, migrationRequired = false, showVolume = false, paused = false, expired = false }: {
    row: QuoteRow | undefined;
    migrationRequired?: boolean;
    showVolume?: boolean;
    paused?: boolean;
    expired?: boolean;
}) {
    const value = row?.value;
    const state = paused ? 'cancelled' : row?.state;
    const pending = state === 'pending' || state === 'loading';
    const unavailable = migrationRequired ? 'Migration required' : row?.stream_state || (
        pending ? 'Loading…' : row?.error?.includes('Hyperliquid') ? 'Crypto pending' :
            row?.error ? 'Unavailable' : state === 'cancelled' ? 'Paused' : row?.stale ? 'Stale' : 'Not fetched'
    );
    const stale = paused || expired || !!(row?.stale || row?.error);
    const status = value ? [
        row?.stream_state, stale && 'Stale', pending && 'Loading', state === 'cancelled' && 'Paused', quoteTime(value),
    ].filter(Boolean).join(' · ') : unavailable;
    const shown = value ? price(value.price, value.precision) : '—';
    const flashTarget = useRef<HTMLElement>(null);
    const previous = useRef<{ amount: number; shown: string } | null>(null);

    useLayoutEffect(() => {
        const before = previous.current;
        const amount = value?.price;
        previous.current = amount !== undefined && Number.isFinite(amount) ? { amount, shown } : null;
        const element = flashTarget.current;
        if (!element || !before || amount === undefined || before.shown === shown || before.amount === amount ||
            stale || pending || state === 'cancelled' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const direction = amount > before.amount ? 'up' : 'down';
        element.dataset.quoteFlash = direction;
        const color = direction === 'up' ? 'var(--watchlist-tick-up)' : 'var(--watchlist-tick-down)';
        const animation = element.animate([{ backgroundColor: color }, { backgroundColor: 'transparent' }], {
            duration: 600, easing: 'ease-out',
        });
        void animation.finished.then(() => { delete element.dataset.quoteFlash; }, () => {});
        return () => {
            animation.cancel();
            delete element.dataset.quoteFlash;
        };
    }, [value?.price, shown, stale, pending, state]);

    const title = value ? [
        `${shown} ${value.currency || 'unit unknown'} · ${status}`,
        `${value.source} · ${value.notice}`,
        `Data: ${value.timestamp_kind === 'trading_date' ? 'trading date ' : ''}${quoteTime(value)} · ${value.timezone}`,
        `Received/retrieved: ${new Date((value.received_at || value.fetched_at) * 1000).toLocaleString()}`,
        `Session: ${value.session.state} (${value.session.basis})`,
        `Previous close: ${value.previous_close ?? 'unavailable'}`,
        `Last confirmed completed bar: ${value.last_completed_bar_time ? new Date(value.last_completed_bar_time * 1000).toISOString().slice(0, 10) : 'unconfirmed'}`,
        row?.error,
    ].filter(Boolean).join('\n') : row?.error || unavailable;
    const abnormal = stale || pending || !value || state === 'cancelled' ||
        (row?.stream_state && row.stream_state.toLowerCase() !== 'live');

    return <>
        <span className={`quote ${stale ? 'stale-quote' : ''}`} title={title} data-quote-warning={abnormal ? 'true' : undefined}>
            <strong><b className="quote-number" ref={flashTarget}>{shown}</b></strong>
            <small className="watch-quote-status">{value?.currency} {status}</small>
        </span>
        <span className={`watch-num-change ${changeClass(value?.absolute_change)}`} title={title}>
            <strong>{value?.absolute_change != null ? (value.absolute_change > 0 ? '+' : '') + price(value.absolute_change, value.precision) : '—'}</strong>
        </span>
        <span className={`watch-change ${changeClass(value?.change)}`} title={title}>
            <strong>{value?.change != null ? (value.change > 0 ? '+' : '') + value.change.toFixed(2) + '%' : '—'}</strong>
        </span>
        {showVolume && <span className="watch-volume" title={value?.volume != null ? value.volume.toLocaleString() : 'Volume unavailable'}>
            {value?.volume != null ? volumeFormat.format(value.volume) : '—'}
        </span>}
    </>;
});
