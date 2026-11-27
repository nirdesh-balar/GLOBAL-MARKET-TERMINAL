"""Selected-watchlist snapshots and refresh settings. Prices stay in memory."""
import asyncio
import logging
import math
import time
import uuid
from collections import OrderedDict
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Annotated, Literal
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from .models import Timeframe
from .providers.base import ProviderError

log = logging.getLogger(__name__)
ScopeId = Annotated[str, Field(pattern=r'^[a-f0-9]{32}$')]
Counter = Annotated[int, Field(strict=True, ge=1, le=2**53 - 1)]
WatchlistId = Annotated[str, Field(min_length=1, max_length=80)]


class RefreshPreferences(BaseModel):
    model_config = ConfigDict(extra='forbid')
    startup_quotes: bool = True
    watchlist_interval: Literal[0, 60, 300, 900] = 300
    chart_interval: Literal[60, 300, 900] = 300


class Selection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    watchlist: WatchlistId
    timeframe: Timeframe = '1d'


class Ownership(BaseModel):
    model_config = ConfigDict(extra='forbid')
    client: ScopeId
    generation: Counter


class Operation(Ownership):
    sequence: Counter


class SelectRequest(Selection):
    ownership: Ownership


class SnapshotRequest(Selection):
    force: bool = False
    automatic: bool = False
    active_symbol: str | None = None
    ownership: Operation | None = None


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    job: ScopeId


@dataclass
class QuoteClient:
    generation: int = 0
    revision: int = 0
    selection: Selection | None = None
    sequence: int = 0
    job: dict | None = None
    task: asyncio.Task | None = None


def identity(item):
    return item.get('canonical_id') or item.get('instrument_id') or item['symbol']


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


def quote_value(history, security, now=None, timeframe='1d'):
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
                timeframe=timeframe,
                session=session, notice=f'Latest available {history.source} historical candle close; bounded REST retrieval, not a realtime quote.')


class WatchlistRefresh:
    MAX_CLIENTS = 8
    MAX_VALUES = 512

    def __init__(self, db, registry, history, workspace, clock=time.time):
        self.db, self.registry, self.history, self.workspace = db, registry, history, workspace
        self.clock = clock
        self.values = OrderedDict()
        self.clients = {}
        self.legacy = QuoteClient()
        self.closed = False
        self.selection_revision = 0
        self.attempts = 0
        self.selection_lock = asyncio.Lock()

    @property
    def job(self):
        return self.legacy.job

    @property
    def task(self):
        return self.legacy.task

    def preferences(self):
        return RefreshPreferences.model_validate(self.db.get('refresh_preferences') or {}).model_dump()

    def items(self, watchlist):
        if watchlist.startswith('color:'):
            color = watchlist.split(':', 1)[1].lower()
            from .database import VALID_FLAG_COLORS
            if color in VALID_FLAG_COLORS:
                from .flags import flag_row_to_symbol_entry
                rows = self.db.get_flags_by_color(color)
                return [flag_row_to_symbol_entry(r) for r in rows]
            raise HTTPException(404, f'Unknown color watchlist: {color}')
        selected = next((w for w in self.workspace()['watchlists'] if w['id'] == watchlist), None)
        if selected is None:
            raise HTTPException(404, 'Watchlist no longer exists.')
        return selected['items']

    def status(self, watchlist, timeframe='1d', owner=None, sequence=None, job_id=None):
        selection = Selection(watchlist=watchlist, timeframe=timeframe)
        if owner:
            client = self.clients.get(owner.client)
            if not self._owns(client, owner, selection):
                return dict(accepted=False)
            if sequence is not None and (client.sequence != sequence or not client.job or client.job['id'] != job_id):
                return dict(accepted=False)
        else:
            # Unscoped reads support existing diagnostics. Unscoped writes can
            # only affect the separate legacy job.
            matching = (c for c in (*self.clients.values(), self.legacy) if c.selection == selection)
            client = max(matching, key=lambda c: c.revision, default=self.legacy)
        return self._status(selection, client)

    def cached_quote(self, item, timeframe):
        saved = self.values.get((identity(item), timeframe)) or {}
        value = saved.get('value')
        if value is None or value.get('source') != 'YAHOO FINANCE':
            return None
        return dict(value=value, stale=self._quote_stale(item, value, saved.get('error'),
                                                        self.preferences()['watchlist_interval'] or 300))

    def _quote_stale(self, item, value, error, interval):
        age_limit = (2 if item.get('kind') == 'crypto' else 7)*86400
        now = self.clock()
        return bool(value and (error or now-value['fetched_at'] > max(120, interval*2)
                               or now-value['latest_bar_time'] > age_limit))

    def _status(self, selection, client):
        watchlist, timeframe = selection.watchlist, selection.timeframe
        items = self.items(watchlist)
        job = client.job if client.selection == selection else None
        interval = self.preferences()['watchlist_interval'] or 300
        rows = {}
        for item in items:
            key = identity(item)
            saved = self.values.get((key, timeframe)) or {}
            value, error = saved.get('value'), saved.get('error')
            state = (job or {}).get('states', {}).get(key, 'idle')
            if state == 'idle':
                state = 'ready' if value is not None else saved.get('failure_state', 'idle')
            elif state == 'ready' and value is None:
                state = 'missing'
            stale = self._quote_stale(item, value, error, interval)
            rows[key] = dict(identity=key, state=state, value=value, stale=stale,
                             error=error, retry_at=saved.get('retry_at'), attempted_at=saved.get('attempted_at'))
        return dict(accepted=True, job=job['id'] if job else None, watchlist=watchlist, timeframe=timeframe,
                    generation=client.generation if client.selection == selection else 0,
                    sequence=client.sequence if client.selection == selection else 0, rows=rows,
                    pending=sum(r['state'] in ('pending', 'loading') for r in rows.values()),
                    completed_at=job.get('completed_at') if job else None,
                    provider=self.history.status(), storage='memory only', attempts=self.attempts,
                    owned_clients=len(self.clients), active_jobs=sum(
                        bool(c.task and not c.task.done()) for c in (*self.clients.values(), self.legacy)),
                    cached_values=len(self.values))

    @staticmethod
    def _owns(client, owner, selection):
        return bool(client and client.generation == owner.generation and client.selection == selection)

    def _touch(self, client):
        self.selection_revision += 1
        client.revision = self.selection_revision

    async def register(self):
        async with self.selection_lock:
            if self.closed or len(self.clients) >= self.MAX_CLIENTS:
                raise HTTPException(503, 'No Watchlist refresh scope is available.')
            key = uuid.uuid4().hex
            self.clients[key] = QuoteClient()
            return dict(client=key)

    async def release(self, key):
        async with self.selection_lock:
            client = self.clients.pop(key, None)
            if client:
                await self._cancel(client=client)

    async def select(self, selection, owner):
        async with self.selection_lock:
            client = self.clients.get(owner.client)
            if not client or owner.generation <= client.generation:
                return dict(accepted=self._owns(client, owner, selection))
            self.items(selection.watchlist)
            await self._cancel(client=client)
            client.generation, client.selection = owner.generation, selection
            client.job, client.task, client.sequence = None, None, 0
            self._touch(client)
            log.debug('quote_selection generation=%s timeframe=%s', owner.generation, selection.timeframe)
            return dict(accepted=True)

    async def retire(self, owner):
        async with self.selection_lock:
            client = self.clients.get(owner.client)
            if not client or owner.generation < client.generation:
                return False
            await self._cancel(client=client)
            # Preserve the watermark when cleanup beats selection to the backend.
            client.generation, client.selection = owner.generation, None
            client.job, client.task, client.sequence = None, None, 0
            return True

    async def cancel(self, job=None):
        async with self.selection_lock:
            await self._cancel(job)

    async def _cancel(self, job=None, *, client=None):
        client = client or self.legacy
        current = client.job
        if not current or (job is not None and current['id'] != job):
            return
        if client.task and not client.task.done():
            current['cancelled'] = True
            client.task.cancel()
            with suppress(asyncio.CancelledError):
                await client.task
            log.debug('quote_job_cancelled generation=%s sequence=%s', client.generation, current['started_sequence'])
            for key, state in current['states'].items():
                if state in ('pending', 'loading'):
                    current['states'][key] = 'cancelled'

    async def start(self, watchlist, force=False, automatic=False, timeframe='1d', active_symbol=None, owner=None):
        selection = Selection(watchlist=watchlist, timeframe=timeframe)
        async with self.selection_lock:
            if self.closed:
                return dict(accepted=False)
            client = self.clients.get(owner.client) if owner else self.legacy
            if owner and (not self._owns(client, owner, selection) or owner.sequence < client.sequence):
                log.debug('quote_start_rejected generation=%s sequence=%s', owner.generation, owner.sequence)
                return dict(accepted=False)
            if owner and owner.sequence == client.sequence:
                return self._status(selection, client)
            return await self._start(client, selection, force, automatic, active_symbol, owner)

    async def _start(self, client, selection, force, automatic, active_symbol, owner):
        watchlist, timeframe = selection.watchlist, selection.timeframe
        items = self.items(watchlist)
        keys = list(dict.fromkeys(identity(r) for r in items))
        if active_symbol:
            matched = [key for key in keys if key == active_symbol or key.endswith(':' + active_symbol)]
            if matched:
                keys.remove(matched[0])
                keys.insert(0, matched[0])
        job = client.job
        if owner:
            client.sequence = owner.sequence
        self._touch(client)
        if (job and client.selection == selection and job['states'].keys() == set(keys)
                and client.task and not client.task.done()
                and (job['force'] or (not force and (automatic or not job['automatic'])))):
            log.debug('quote_start_coalesced generation=%s sequence=%s', client.generation, client.sequence)
            return self._status(selection, client)
        if owner:
            await self._cancel(client=client)
        else:
            await self._cancel()
        generation, sequence = client.generation, client.sequence
        job = dict(id=uuid.uuid4().hex, states={k: 'pending' for k in keys}, completed_at=None,
                   cancelled=False, force=force, automatic=automatic, watchlist=watchlist, started_sequence=sequence)
        client.selection, client.job = selection, job
        log.debug('quote_start_accepted generation=%s sequence=%s rows=%s', generation, sequence, len(keys))

        async def run():
            queue = asyncio.Queue()
            for key in keys:
                queue.put_nowait(key)
            async def worker():
                while not job['cancelled'] and not queue.empty():
                    key = queue.get_nowait()
                    job['states'][key] = 'loading'
                    previous = self.values.get((key, timeframe)) or {}
                    value = previous.get('value')
                    interval = self.preferences()['watchlist_interval'] or 300
                    if value and value['session']['state'] == 'closed' and value['session']['reliable']:
                        interval = max(900, interval)
                    if not force and value and self.clock()-value['fetched_at'] < interval:
                        job['states'][key] = 'ready';continue
                    if (previous.get('retry_at') or 0) > self.clock():
                        job['states'][key] = previous.get('failure_state', 'error');continue
                    if automatic and getattr(self.history,'streams',None) and self.history.streams.enabled:
                        selected=next((r for r in items if identity(r)==key),{})
                        if selected.get('provider')=='hyperliquid':job['states'][key]='ready' if value else 'idle';continue
                    self.attempts += 1
                    record = dict(previous, attempted_at=self.clock(), attempt=self.attempts)
                    try:
                        if key.startswith('hyperliquid:') and getattr(self.registry,'hyperliquid',None):await self.registry.hyperliquid.ensure()
                        security = self.registry.resolve(key)
                        if security and security.get('provider')=='hyperliquid':
                            saved=next((r for w in self.workspace().get('watchlists',[]) for r in w['items'] if (r.get('canonical_id') or r.get('instrument_id'))==key),{})
                            if not saved and watchlist.startswith('color:'):
                                saved=next((r for r in items if (r.get('canonical_id') or r.get('instrument_id') or r.get('symbol'))==key),{})
                            if saved.get('native_mapping'):security={**security,'native_mapping':saved['native_mapping']}
                        if not security:
                            raise ProviderError('Instrument identity is no longer available.', 'missing')
                        result, _ = await self.history.quote(security, force=force or bool(value), interval=timeframe)
                        if job['cancelled']:
                            return
                        record.update(value=quote_value(result, security, self.clock(), timeframe=timeframe), error=None, retry_at=None, failures=0)
                        record.pop('failure_state', None)
                        job['states'][key] = 'ready'
                    except ProviderError as e:
                        if job['cancelled']:
                            return
                        latest = self.values.get((key, timeframe)) or previous
                        if latest.get('value') is not None:
                            record['value'] = latest['value']
                        failures = latest.get('failures', 0)+1
                        state = 'missing' if e.kind == 'missing' else 'error'
                        record.update(error=str(e), failure_state=state, failures=failures, retry_at=self.clock()+max(e.retry_after, min(900, 30*2**min(failures-1, 5))))
                        job['states'][key] = state
                    if (self.values.get((key, timeframe)) or {}).get('attempt', 0) > record['attempt']:
                        continue
                    self.values[(key, timeframe)] = record
                    self.values.move_to_end((key, timeframe))
                    while len(self.values) > self.MAX_VALUES:
                        self.values.popitem(last=False)
            await asyncio.gather(*(worker() for _ in range(min(2, len(keys)))))
            job['completed_at'] = self.clock()
            log.debug('quote_job_completed generation=%s sequence=%s', generation, sequence)

        client.task = asyncio.create_task(run())
        client.task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        return self._status(selection, client)

    async def close(self):
        async with self.selection_lock:
            self.closed = True
            for client in self.clients.values():
                await self._cancel(client=client)
            await self._cancel()
            self.clients.clear()
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

    @router.post('/api/quotes/client')
    async def register():
        return await service.register()

    @router.delete('/api/quotes/client')
    async def release(client: Annotated[str, Query(pattern=r'^[a-f0-9]{32}$')]):
        await service.release(client)
        return dict(released=True)

    @router.put('/api/quotes/selection')
    async def select(value: SelectRequest):
        return await service.select(Selection(watchlist=value.watchlist, timeframe=value.timeframe), value.ownership)

    @router.delete('/api/quotes/selection')
    async def retire(value: Ownership):
        return dict(cancelled=await service.retire(value))

    @router.get('/api/quotes/status')
    async def status(watchlist: Annotated[str, Query(min_length=1, max_length=80)], timeframe: Timeframe = '1d',
                     client: Annotated[str | None, Query(pattern=r'^[a-f0-9]{32}$')] = None,
                     generation: Annotated[int | None, Query(ge=1, le=2**53 - 1)] = None,
                     sequence: Annotated[int | None, Query(ge=1, le=2**53 - 1)] = None,
                     job: Annotated[str | None, Query(pattern=r'^[a-f0-9]{32}$')] = None):
        if (client is None) != (generation is None) or (sequence is None) != (job is None) or (sequence and not client):
            raise HTTPException(422, 'Incomplete Watchlist refresh ownership.')
        owner = Ownership(client=client, generation=generation) if client is not None else None
        return service.status(watchlist, timeframe, owner, sequence, job)

    @router.post('/api/quotes/snapshot')
    async def snapshot(value: SnapshotRequest):
        return await service.start(value.watchlist, value.force, value.automatic, value.timeframe, value.active_symbol, value.ownership)

    @router.post('/api/quotes/cancel')
    async def cancel(value: CancelRequest):
        await service.cancel(value.job)
        return dict(cancelled=True)

    return router
