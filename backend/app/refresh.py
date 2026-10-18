"""Selected-watchlist snapshots and refresh settings. Prices stay in memory."""
import asyncio
import math
import time
import uuid
from collections import OrderedDict
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from .providers.base import ProviderError


class RefreshPreferences(BaseModel):
    model_config = ConfigDict(extra='forbid')
    startup_quotes: bool = True
    watchlist_interval: Literal[0, 60, 300, 900] = 300
    chart_interval: Literal[60, 300, 900] = 300


class SnapshotRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    watchlist: str = Field(min_length=1, max_length=80)
    force: bool = False
    automatic: bool = False


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    job: str = Field(min_length=32, max_length=32, pattern='^[a-f0-9]+$')


def market_session(security, now, metadata=None):
    """Only report open/closed when a calendar or current provider bounds agree.

    Indian off-hours are known, but an ordinary weekday is not proof of an
    open session (holidays/special sessions). FX/futures need provider bounds.
    """
    zone = ZoneInfo(security.get('timezone') or 'UTC')
    stamp = datetime.fromtimestamp(now, zone)
    if security.get('kind') == 'crypto':
        return dict(state='open', reliable=True, basis='Crypto 24/7 UTC sessions')
    regular = (metadata or {}).get('currentTradingPeriod', {}).get('regular', {})
    a, b = regular.get('start'), regular.get('end')
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and a < b:
        if datetime.fromtimestamp(a, zone).date() == stamp.date():
            return dict(state='open' if a <= now < b else 'closed', reliable=True, basis='Yahoo regular session bounds')
    calendar = security.get('calendar')
    if calendar:
        try:
            import exchange_calendars as xcals
            import pandas as pd
            cal = xcals.get_calendar(calendar, start=str(stamp.date()-timedelta(days=3)), end=str(stamp.date()+timedelta(days=3)))
            for _, r in cal.schedule.iterrows():
                if r['open'].timestamp() <= now < r['close'].timestamp():
                    in_break = pd.notna(r['break_start']) and r['break_start'].timestamp() <= now < r['break_end'].timestamp()
                    return dict(state='closed' if in_break else 'open', reliable=True, basis=f'{calendar} exchange calendar')
            return dict(state='closed', reliable=True, basis=f'{calendar} exchange calendar')
        except (ValueError, KeyError, RuntimeError):
            pass
    if security.get('exchange') in ('NSE', 'BSE'):
        minutes = stamp.hour*60+stamp.minute
        if stamp.weekday() >= 5 or minutes < 555 or minutes >= 930:
            return dict(state='closed', reliable=False, basis='Outside ordinary Indian 09:15–15:30 weekday hours; special sessions unverified')
    return dict(state='unknown', reliable=False, basis='Current session/holiday bounds unverified')


def quote_value(history, security, now=None):
    now = time.time() if now is None else now
    rows = history.candles
    if not rows:
        raise ProviderError('No historical price supplied.', 'missing')
    last = rows[-1]
    value = last['close']
    if not math.isfinite(value) or (value <= 0 and security.get('kind') != 'future'):
        raise ProviderError('No valid historical close supplied.', 'missing')
    previous = rows[-2]['close'] if len(rows) > 1 else None
    if previous is not None and not math.isfinite(previous):
        previous = None
    delta = value-previous if previous is not None else None
    change = delta/abs(previous)*100 if previous is not None and previous != 0 else None
    meta = history.metadata.get('quote_metadata') or {}
    data_time, timestamp_kind = last['time'], 'trading_date'
    market_time, market_price = meta.get('regularMarketTime'), meta.get('regularMarketPrice')
    zone = ZoneInfo(history.metadata.get('timezone') or security.get('timezone') or 'UTC')
    # A metadata time is only attached to this price when price and trading date
    # actually match. Otherwise retain the supplied daily date, not a fake tick.
    if isinstance(market_time, (int, float)) and isinstance(market_price, (int, float)) and 0 < market_time <= now+60 and math.isclose(value, market_price, rel_tol=1e-9):
        if datetime.fromtimestamp(market_time, zone).date() == datetime.fromtimestamp(last['time'], timezone.utc).date():
            data_time, timestamp_kind = int(market_time), 'provider_market_time'
    session = market_session(security, now, meta)
    completed = None
    regular = meta.get('currentTradingPeriod', {}).get('regular', {})
    if isinstance(regular.get('end'), (int, float)) and regular['end'] <= now:
        if datetime.fromtimestamp(regular['end'], zone).date() == datetime.fromtimestamp(last['time'], timezone.utc).date():
            completed = last['time']
    if completed is None and len(rows) > 1:
        # An earlier supplied trading date is complete; today's latest bar may
        # still be forming. Do not infer a precise close for an unknown session.
        if datetime.fromtimestamp(rows[-2]['time'], timezone.utc).date() < datetime.fromtimestamp(now, zone).date():
            completed = rows[-2]['time']
    if security.get('provider')=='hyperliquid':
        completed=next((r['time'] for r in reversed(rows) if r.get('end_time',float('inf'))<=now),None)
        timestamp_kind='native_candle_start'
    return dict(price=value, previous_close=previous, absolute_change=delta, change=change,
                volume=last.get('volume'), currency=history.metadata.get('currency',security.get('currency') or ''),
                timezone=str(zone), precision=history.metadata.get('precision', security.get('precision', 2)),
                data_time=data_time, timestamp_kind=timestamp_kind, latest_bar_time=last['time'],
                last_completed_bar_time=completed, fetched_at=history.fetched_at, source=history.source,
                session=session, notice=f'Latest available {history.source} historical candle close; bounded REST retrieval, not a realtime quote.')


class WatchlistRefresh:
    def __init__(self, db, registry, history, workspace, clock=time.time):
        self.db, self.registry, self.history, self.workspace = db, registry, history, workspace
        self.clock = clock
        self.values = OrderedDict()
        self.job = None
        self.task = None
        self.attempts = 0
        self.selection_lock = asyncio.Lock()

    def preferences(self):
        return RefreshPreferences.model_validate(self.db.get('refresh_preferences') or {}).model_dump()

    def items(self, watchlist):
        selected = next((w for w in self.workspace()['watchlists'] if w['id'] == watchlist), None)
        if selected is None:
            raise HTTPException(404, 'Watchlist no longer exists.')
        return selected['items']

    def status(self, watchlist):
        items = self.items(watchlist)
        job = self.job if self.job and self.job['watchlist'] == watchlist else None
        interval = self.preferences()['watchlist_interval'] or 300
        rows = {}
        for item in items:
            key = item.get('canonical_id') or item.get('instrument_id') or item['symbol']
            saved = dict(self.values.get(key) or {})
            state = (job or {}).get('states', {}).get(key, 'idle')
            value = saved.get('value')
            error = saved.get('error')
            stale = bool(value and (error or self.clock()-value['fetched_at'] > max(120, interval*2) or self.clock()-value['latest_bar_time'] > (2 if item.get('kind') == 'crypto' else 7)*86400))
            rows[key] = dict(identity=key, state=state, value=value, stale=stale,
                             error=error, retry_at=saved.get('retry_at'), attempted_at=saved.get('attempted_at'))
        return dict(job=job['id'] if job else None, watchlist=watchlist, rows=rows,
                    pending=sum(r['state'] in ('pending', 'loading') for r in rows.values()),
                    completed_at=job.get('completed_at') if job else None,
                    provider=self.history.status(), storage='memory only', attempts=self.attempts)

    async def cancel(self, job=None):
        async with self.selection_lock:
            await self._cancel(job)

    async def _cancel(self, job=None):
        if job is not None and (not self.job or self.job['id'] != job):
            return
        if self.task and not self.task.done():
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task
        if self.job:
            for key, state in self.job['states'].items():
                if state in ('pending', 'loading'):
                    self.job['states'][key] = 'cancelled'

    async def start(self, watchlist, force=False,automatic=False):
        async with self.selection_lock:
            return await self._start(watchlist, force,automatic)

    async def _start(self, watchlist, force=False,automatic=False):
        items = self.items(watchlist)
        keys = [r.get('canonical_id') or r.get('instrument_id') or r['symbol'] for r in items]
        if self.job and self.job['watchlist'] == watchlist and list(self.job['states']) == keys and self.task and not self.task.done():
            return self.status(watchlist)
        await self._cancel()
        job = dict(id=uuid.uuid4().hex, watchlist=watchlist, states={k:'pending' for k in keys}, completed_at=None)
        self.job = job
        async def run():
            queue = asyncio.Queue()
            for key in keys:
                queue.put_nowait(key)
            async def worker():
                while not queue.empty():
                    key = queue.get_nowait()
                    job['states'][key] = 'loading'
                    previous = self.values.get(key) or {}
                    value = previous.get('value')
                    interval = self.preferences()['watchlist_interval'] or 300
                    if value and value['session']['state'] == 'closed' and value['session']['reliable']:
                        interval = max(900, interval)
                    if not force and value and self.clock()-value['fetched_at'] < interval:
                        job['states'][key] = 'ready';continue
                    if (previous.get('retry_at') or 0) > self.clock():
                        job['states'][key] = 'error';continue
                    if automatic and getattr(self.history,'streams',None) and self.history.streams.enabled:
                        selected=next((r for r in items if (r.get('canonical_id') or r.get('instrument_id') or r['symbol'])==key),{})
                        if selected.get('provider')=='hyperliquid':job['states'][key]='ready' if value else 'idle';continue
                    self.attempts += 1
                    record = dict(previous, attempted_at=self.clock())
                    try:
                        if key.startswith('hyperliquid:') and getattr(self.registry,'hyperliquid',None):await self.registry.hyperliquid.ensure()
                        security = self.registry.resolve(key)
                        if security and security.get('provider')=='hyperliquid':
                            saved=next((r for w in self.workspace().get('watchlists',[]) for r in w['items'] if (r.get('canonical_id') or r.get('instrument_id'))==key),{})
                            if saved.get('native_mapping'):security={**security,'native_mapping':saved['native_mapping']}
                        if not security:
                            raise ProviderError('Instrument identity is no longer available.', 'missing')
                        result, _ = await self.history.quote(security, force=force or bool(value))
                        record.update(value=quote_value(result, security, self.clock()), error=None, retry_at=None, failures=0)
                        job['states'][key] = 'ready'
                    except ProviderError as e:
                        failures = previous.get('failures', 0)+1
                        record.update(error=str(e), failures=failures, retry_at=self.clock()+max(e.retry_after, min(900, 30*2**min(failures-1, 5))))
                        job['states'][key] = 'error'
                    self.values[key] = record
                    self.values.move_to_end(key)
                    while len(self.values) > 512:
                        self.values.popitem(last=False)
            await asyncio.gather(*(worker() for _ in range(min(2, len(keys)))))
            job['completed_at'] = self.clock()
        self.task = asyncio.create_task(run())
        self.task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        return self.status(watchlist)

    async def close(self):
        await self.cancel()
        self.values.clear()


def routes(service):
    router = APIRouter()
    @router.get('/api/refresh/preferences')
    def preferences():
        return service.preferences()
    @router.put('/api/refresh/preferences')
    def save(value: RefreshPreferences):
        service.db.put('refresh_preferences', value.model_dump())
        return value.model_dump()
    @router.get('/api/quotes/status')
    def status(watchlist: str):
        return service.status(watchlist)
    @router.post('/api/quotes/snapshot')
    async def snapshot(value: SnapshotRequest):
        return await service.start(value.watchlist, value.force,value.automatic)
    @router.post('/api/quotes/cancel')
    async def cancel(value: CancelRequest):
        await service.cancel(value.job)
        return dict(cancelled=True)
    return router
