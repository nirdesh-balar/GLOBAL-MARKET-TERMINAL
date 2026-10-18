"""Bounded runtime history cache and conservative single-flight fetching."""
import asyncio
import math
import inspect
import time
import random
from collections import OrderedDict
from contextlib import suppress, nullcontext
from datetime import datetime, timedelta, timezone
from .request_budget import RequestBudget
from .market_router import MarketDataRouter
from .providers.base import History, HistoricalDataProvider, ProviderError
from .providers.yahoo import YahooFinanceProvider
from .providers.nse import NSEHistoricalProvider
from zoneinfo import ZoneInfo
from .sessions import aggregate_market_four_hour,segments
from .aggregator import INTRADAY, LOOKBACK_DAYS, aggregate_four_hour

class MemoryCache:
    def __init__(self, capacity=32, ttl=900, max_bytes=128*1024*1024, clock=time.monotonic, stale_ttl=0, stale_filter=lambda key:True):
        self.capacity, self.ttl, self.max_bytes, self.clock = capacity, ttl, max_bytes, clock
        self.entries = OrderedDict()
        self.bytes = 0
        self.stale_ttl=stale_ttl
        self.stale_filter=stale_filter
    def retention(self,key):return self.stale_ttl if self.stale_filter(key)else 0
    def get(self, key):
        entry = self.entries.get(key)
        if entry is None: return None
        if self.clock()-entry[0]>=self.ttl:
            if self.clock()-entry[0]>=self.ttl+self.retention(key):self.remove(key)
            return None
        self.entries.move_to_end(key)
        return entry[1]
    def remove(self, key):
        old=self.entries.pop(key,None)
        if old: self.bytes-=old[2]
    def peek_stale(self,key):
        entry=self.entries.get(key)
        if entry and self.clock()-entry[0]<self.ttl+self.retention(key):return entry[1]
        return None
    def put(self, key, value):
        self.remove(key)
        size=len(value.candles)*512+len(value.actions)*256+1024
        if size>self.max_bytes: return
        self.entries[key]=(self.clock(),value,size);self.bytes+=size
        self.trim()
    def trim(self):
        for key in list(self.entries):
            if self.clock()-self.entries[key][0]>=self.ttl+self.retention(key): self.remove(key)
        while self.entries and (len(self.entries)>self.capacity or self.bytes>self.max_bytes):
            self.remove(next(iter(self.entries)))
    def clear(self): self.entries.clear();self.bytes=0


def aggregate_daily(rows, interval):
    if interval=='1d': return [dict(r) for r in rows]
    grouped=OrderedDict()
    for r in rows:
        d=datetime.fromtimestamp(r['time'],timezone.utc).date()
        key=(d-timedelta(days=d.weekday())) if interval=='1w' else d.replace(day=1)
        if key not in grouped:
            grouped[key]=dict(r, last_time=r['time'])
        else:
            candle=grouped[key]
            candle['high']=max(candle['high'],r['high']);candle['low']=min(candle['low'],r['low'])
            candle['close']=r['close'];candle['adj_close']=r.get('adj_close');candle['last_time']=r['time']
            candle['volume']=None if candle['volume'] is None or r['volume'] is None else candle['volume']+r['volume']
    # Time is the first actual trading day, never an invented Sunday/holiday bar.
    return list(grouped.values())


def response(history, interval, start=None, end=None, adjusted=False, cached=False,security=None):
    def day_boundary(value):
        if value is None: return None
        try: return int(datetime.combine(datetime.strptime(value,'%Y-%m-%d').date(),datetime.min.time(),ZoneInfo(history.metadata.get('timezone') or (security or {}).get('timezone','UTC')) if interval in INTRADAY else timezone.utc).timestamp())
        except ValueError: raise ProviderError('Use dates in YYYY-MM-DD format.', 'range') from None
    a,b=day_boundary(start),day_boundary(end)
    if interval in INTRADAY and b is not None:
        zone=ZoneInfo(history.metadata.get('timezone') or (security or {}).get('timezone','UTC'))
        b=int((datetime.fromtimestamp(b,zone)+timedelta(days=1)).timestamp())-1
    if a is not None and b is not None and a>b: raise ProviderError('Start date must precede end date.', 'range')
    if adjusted and (history.source=='NSE OFFICIAL FILES' or any(r.get('adj_close') is None for r in history.candles)):
        raise ProviderError('Adjusted prices are unavailable for this source. Choose Yahoo OHLC or select unadjusted mode.', 'source')
    daily=[]
    for r in history.candles:
        row=dict(r)
        if adjusted:
            ratio=row['adj_close']/row['close']
            for k in ('open','high','low','close'): row[k]*=ratio
        daily.append(row)
    # Aggregate complete calendar buckets first; range selects overlapping
    # buckets so a midweek boundary does not silently compute a partial week.
    session_notice=''
    native=history.metadata.get('native_interval',False)
    if native:aggregated=daily
    elif interval=='4h' and security:
        aggregated,session_notice=aggregate_market_four_hour(daily,{**security,**history.metadata},history.trading_periods)
    else:aggregated=aggregate_four_hour(daily) if interval=='4h' else daily if history.interval==interval else aggregate_daily(daily,interval)
    if not native and interval in INTRADAY and interval!='4h' and security:
        try:
            periods,_=segments(daily,{**security,**history.metadata},history.trading_periods)
            from bisect import bisect_right
            starts=[p[0] for p in periods]
            for row in aggregated:
                n=bisect_right(starts,row['time'])-1
                if n>=0 and periods[n][0]<=row['time']<periods[n][1]:row['session']=periods[n][2]
        except ProviderError:pass # Native bars remain available when verified sessions are absent.
    candles=[r for r in aggregated if (a is None or (r.get('end_time',r['time']+1)-1 if native else r.get('last_time',r['time']))>=a) and (b is None or r['time']<=b)]
    for r in candles: r.pop('last_time',None)
    fmt=lambda t:datetime.fromtimestamp(t,timezone.utc).isoformat() if interval in INTRADAY else datetime.fromtimestamp(t,timezone.utc).date().isoformat()
    return dict(request_diagnostics={k:history.metadata[k]for k in ('provider_http_events','retrieval_seconds','requested_period','actual_period')if k in history.metadata},stale=False,freshness='memory_cache'if cached else'retrieved',timezone=history.metadata.get('timezone') or (security or {}).get('timezone','Asia/Kolkata'),currency=history.metadata.get('currency') or (security or {}).get('currency','INR'),precision=history.metadata.get('precision',(security or {}).get('precision',2)),contract=(security or {}).get('contract',''),source=history.source,candles=candles,actions=history.actions,cached=cached,interval=interval,
        first_available=fmt(history.candles[0]['time']),last_available=fmt(history.candles[-1]['time']),
        fetched_at=history.fetched_at,adjusted=adjusted,notice=history.notice + ((' 4h uses 15m bars; missing bars remain partial. '+session_notice) if interval=='4h' and not native else '') + (f' Intraday request uses Yahoo period {LOOKBACK_DAYS[interval]}d. Yahoo controls the actual available dates; these may differ from the requested period. Older unavailable history is not filled.' if interval in INTRADAY and not native else ''),
        stream_received_at=history.metadata.get('stream_received_at'),provider=history.metadata.get('provider','yahoo' if history.source=='YAHOO FINANCE' else 'nse'),canonical_id=history.metadata.get('canonical_id') or (security or {}).get('canonical_id'),native_id=history.metadata.get('native_id'),market_type=history.metadata.get('market_type'),history_limit=history.metadata.get('history_limit'),last_candle_end=history.candles[-1].get('end_time'),
        returned=len(candles),available_daily=len(history.candles),storage='memory only',timestamp_convention='UTC instants (displayed in instrument timezone)' if interval in INTRADAY or native else 'UTC midnight of trading date',lookback_days=None if native else LOOKBACK_DAYS.get(interval),volume_available=any(r.get('volume') is not None and r['volume']>0 for r in candles))

class HistoryService:
    def __init__(self, provider:HistoricalDataProvider|None=None, config=None):
        self.provider=provider or YahooFinanceProvider()
        self.router=MarketDataRouter()
        self.nse=NSEHistoricalProvider()
        self.config={'capacity':32,'ttl':900,'concurrency':2,'min_interval':1.5,'request_timeout':90,**(config or {})}
        self.cache=MemoryCache(self.config['capacity'],self.config['ttl'],stale_ttl=3600,stale_filter=lambda key:key[0]=='yahoo')
        self.quote_cache=MemoryCache(capacity=128,ttl=900,max_bytes=4*1024*1024)
        self.refresh_attempts={}
        self.budget=RequestBudget(self.config['concurrency'])
        self.gate=asyncio.Lock()
        self.next_request=0.0
        self.cooldown=0.0
        self.inflight={};self.waiters={};self.active_keys=set();self.errors={}
        self.generation=0;self.closed=False
        self.metrics=dict(history_requests=0,provider_requests=0,cache_hits=0,cache_misses=0,deduplicated=0,cancelled=0,retries=0,search_requests=0,quote_provider_requests=0)
        self.last_error=None
    def key(self, security, source='yahoo', interval='1d'):
        if security.get('provider')=='hyperliquid':return ('hyperliquid',security['native_id'],security['canonical_id'],interval)
        base='quote' if interval=='quote' else '1d' if source=='nse' or not hasattr(self.provider,'fetch') else '15m' if interval=='4h' else interval
        return (source,(security.get('native_id') or security.get('yahoo_symbol') or security['symbol']) if source=='yahoo' else security['symbol'],security.get('canonical_id') or security.get('isin') or security.get('id',''),base)
    async def throttle(self):
        async with self.gate:
            now=time.monotonic()
            if now<self.cooldown:raise ProviderError('Yahoo requests paused after throttling. Please wait.','rate',math.ceil(self.cooldown-now))
            delay=max(0,self.next_request-now)
            if delay:await asyncio.sleep(delay)
            if time.monotonic()<self.cooldown:raise ProviderError('Yahoo cooldown active. Please wait.','rate',math.ceil(self.cooldown-time.monotonic()))
            self.next_request=time.monotonic()+self.config['min_interval']
    async def _download(self, key, security, generation, loader=None, priority=0):
        try:
            crypto=key[0]=='hyperliquid'
            async with nullcontext() if crypto else self.budget.slot(priority):
                self.active_keys.add(key)
                for attempt in range(3):
                    if attempt and not self.waiters.get(key):raise asyncio.CancelledError()
                    if not crypto:
                        await self.throttle()
                        self.metrics['quote_provider_requests' if key[-1]=='quote' else 'provider_requests']+=1
                    try:
                        data=(await loader() if inspect.iscoroutinefunction(loader) else await asyncio.to_thread(loader)) if loader else await asyncio.to_thread(self.provider.fetch,security,key[-1]) if hasattr(self.provider,'fetch') else await asyncio.to_thread(self.provider.fetch_daily,security)
                        if not data.candles: raise ProviderError('Provider returned no candles.', 'missing')
                        if generation==self.generation and not self.closed: (self.quote_cache if key[-1]=='quote' else self.cache).put(key,data)
                        self.last_error=None
                        if key[-1]!='quote' and getattr(self,'registry',None) and not crypto and self.provider.name=='YAHOO FINANCE': self.registry.record(security,'verified',interval=key[-1],metadata=data.metadata)
                        return data
                    except ProviderError as e:
                        if e.kind=='rate' and not crypto:
                            self.cooldown=time.monotonic()+max(60,e.retry_after)
                        if e.kind=='temporary'and e.retry_after>5 and not crypto:self.cooldown=max(self.cooldown,time.monotonic()+e.retry_after)
                        if e.kind=='temporary' and e.retryable and e.retry_after<=5 and not crypto and attempt<2:
                            if not self.waiters.get(key):raise
                            self.metrics['retries']+=1
                            await asyncio.sleep(max(e.retry_after,2**attempt+(random.uniform(0,.25)if self.provider.name=='YAHOO FINANCE'else 0)))
                            continue
                        self.last_error=str(e)
                        if key[-1]!='quote' and getattr(self,'registry',None) and not crypto and self.provider.name=='YAHOO FINANCE': self.registry.record(security,'unavailable' if e.kind in ('missing','access') else 'unverified',str(e),interval=key[-1])
                        self.errors[key]=(time.monotonic()+max(30,e.retry_after),e)
                        raise
        finally:
            self.active_keys.discard(key)
            if self.inflight.get(key) is asyncio.current_task(): self.inflight.pop(key,None)
    async def daily(self, security, source='yahoo', force=False, interval='1d', loader=None, priority=0):
        route=self.router.require(security,'history')
        if source=='hyperliquid' and route!='hyperliquid':raise ProviderError('Non-crypto cannot use Hyperliquid.','policy')
        if route=='hyperliquid':
            if source=='nse':raise ProviderError('Crypto cannot use NSE archives.','policy')
            verified=await self.hyperliquid.catalogue.validate(security)
            security={**verified,**security}
            source='hyperliquid'
            if loader is None:
                async def loader():return await self.hyperliquid.fetch(security,interval,priority=priority)
        key=self.key(security,source,interval)
        if self.closed: raise ProviderError('The local history service is closing.', 'source')
        # A simultaneous refresh joins an already-running download, too.
        if key in self.inflight:
            self.metrics['deduplicated']+=1
            task=self.inflight[key]
        else:
            if not force:
                cached=(self.quote_cache if key[-1]=='quote' else self.cache).get(key)
                if cached and route=='hyperliquid' and cached.metadata.get('native_mapping')!=verified['native_mapping']:
                    self.cache.remove(key);self.quote_cache.remove(key);cached=None
                if cached: self.metrics['cache_hits']+=1;return cached,True
            if source=='nse':
                raise ProviderError('NSE history is not in memory. Select official archive files again; imported candles are discarded on close or cache expiry.', 'manual')
            error=self.errors.get(key)
            if error and force and error[1].kind=='temporary'and not error[1].retry_after:
                self.errors.pop(key,None);error=None
            if error and time.monotonic()<error[0]: raise error[1]
            if route!='hyperliquid' and time.monotonic()<self.cooldown: raise ProviderError('Yahoo rate limit cooldown is active. Please wait before retrying.', 'rate', math.ceil(self.cooldown-time.monotonic()))
            self.metrics['cache_misses']+=1
            if force and route!='hyperliquid':
                clear=getattr(self.provider,'clear_http_cache',None)
                if clear: clear()
            task=asyncio.create_task(self._download(key,security,self.generation,loader,priority))
            self.inflight[key]=task
            # Retrieve errors even if every renderer request is cancelled.
            task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        self.waiters[key]=self.waiters.get(key,0)+1
        try:
            return (await asyncio.shield(task)if key[0]=='hyperliquid'else await asyncio.wait_for(asyncio.shield(task),timeout=self.config['request_timeout'])),False
        except asyncio.TimeoutError:
            raise ProviderError('Waiting for provider timed out. Retry this chart; other panes remain available.','temporary',code='timeout')from None
        except asyncio.CancelledError:
            self.metrics['cancelled']+=1
            raise
        finally:
            self.waiters[key]-=1
            if not self.waiters[key]:
                self.waiters.pop(key,None)
                # A blocking yfinance HTTP call cannot be interrupted safely.
                # Keep its slot until it finishes (20s socket timeout). Queued
                # downloads with no consumers are cancelled immediately.
                if (key not in self.active_keys or key[0]=='hyperliquid') and not task.done(): task.cancel()
    async def get(self, security, interval='1d', start=None, end=None, source='yahoo', force=False, adjusted=False, priority=0):
        # Validate before network work.
        if start: datetime.strptime(start,'%Y-%m-%d')
        if end: datetime.strptime(end,'%Y-%m-%d')
        if start and end and start>end: raise ProviderError('Start date must precede end date.', 'range')
        if source=='nse' and (interval in INTRADAY or security.get('kind')!='equity' or security.get('exchange','NSE')!='NSE'):
            raise ProviderError('Official equity bhavcopy files support equity daily/weekly/monthly charts only.', 'range')
        try:daily,cached=await self.daily(security,source,force,interval,priority=priority)
        except ProviderError as e:
            old=self.cache.peek_stale(self.key(security,source,interval))if security.get('provider')!='hyperliquid'and source=='yahoo'and e.kind in ('temporary','rate')else None
            if not old:raise
            result=response(old,interval,start,end,adjusted,True,security)
            result.update(stale=True,freshness='cached_stale',provider_error=e.structured())
            result['notice']+=' Showing cached data after a provider failure. Historical prices may be stale; not a real-time quote.'
            return result
        result=response(daily,interval,start,end,adjusted,cached,security)
        if interval in INTRADAY and start and int(datetime.strptime(start,'%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp())<daily.candles[0]['time']:
            result['notice']+=' Requested dates extend before the available intraday history. Only available candles are shown.'
        return result
    async def quote(self, security, force=False):
        route=self.router.require(security,'quote')
        if route=='hyperliquid':
            async def loader():return await self.hyperliquid.fetch_quote(security)
            return await self.daily(security,force=force,interval='quote',loader=loader,priority=1)
        if not hasattr(self.provider,'fetch_quote'):
            raise ProviderError('This provider has no quote-sized historical snapshot.','source')
        return await self.daily(security,force=force,interval='quote',loader=lambda:self.provider.fetch_quote(security),priority=1)
    async def incremental(self, security, interval='1d', start=None, end=None, adjusted=False, automatic=False):
        route=self.router.require(security,'refresh/replay')
        if route=='hyperliquid':
            key=self.key(security,interval=interval);old=self.cache.get(key)
            floor=60 if interval in INTRADAY else 300
            if old and automatic and time.monotonic()-self.refresh_attempts.get(key,0)<floor:return response(old,interval,start,end,adjusted,True,security)
            if key not in self.inflight:self.refresh_attempts[key]=time.monotonic()
            async def load_crypto():
                delta=await self.hyperliquid.fetch(security,interval,recent=old is not None)
                if old:
                    merged={r['time']:r for r in old.candles};merged.update({r['time']:r for r in delta.candles})
                    delta.candles=[merged[t] for t in sorted(merged)][-5000:]
                return delta
            data,cached=await self.daily(security,force=True,interval=interval,loader=load_crypto)
            result=response(data,interval,start,end,adjusted,cached,security);result['incremental_only']=False
            return result
        key=self.key(security,interval=interval)
        old=self.cache.get(key)
        # Periodic daily/weekly/monthly checks are bounded to five minutes;
        # intraday checks to one minute. Manual requests still respect cooldown.
        floor=300 if interval not in INTRADAY else 60
        from .refresh import market_session
        session=market_session(security,time.time(),(old.metadata.get('quote_metadata') or {}) if old else {})
        if session['state']=='closed' and session['reliable']:floor=max(900,floor)
        recent=self.refresh_attempts.get(key,0)
        if old and automatic and time.monotonic()-recent<floor:
            return response(old,interval,start,end,adjusted,True,security)
        if key not in self.inflight:self.refresh_attempts[key]=time.monotonic()
        incremental_only=old is None and hasattr(self.provider,'fetch_recent')
        async def fetch():
            nonlocal incremental_only
            if not hasattr(self.provider,'fetch_recent'):
                return await asyncio.to_thread(self.provider.fetch,security,key[-1]) if hasattr(self.provider,'fetch') else await asyncio.to_thread(self.provider.fetch_daily,security)
            delta=await asyncio.to_thread(self.provider.fetch_recent,security,key[-1])
            # A newly supplied corporate action can change Yahoo's earlier price
            # basis. Reconcile the visible instrument's full series in that case.
            prior={r['time']:r for r in old.actions} if old else {}
            if any(prior.get(a['time'])!=a for a in delta.actions):
                incremental_only=False
                await self.throttle();self.metrics['provider_requests']+=1
                return await asyncio.to_thread(self.provider.fetch,security,key[-1])
            if old is None:return delta
            merged={r['time']:r for r in old.candles}
            merged.update({r['time']:r for r in delta.candles})
            actions={r['time']:r for r in old.actions};actions.update({r['time']:r for r in delta.actions})
            return History([merged[t] for t in sorted(merged)],delta.source,[actions[t] for t in sorted(actions)],delta.notice,delta.fetched_at,delta.interval,delta.metadata,delta.trading_periods)
        async def load():
            value=await fetch();value.metadata['incremental_only']=incremental_only;return value
        data,cached=await self.daily(security,source='delta' if old is None else 'yahoo',force=True,interval=interval,loader=load,priority=0)
        # A delta after LRU expiry must not masquerade as maximum history. The
        # renderer merges it with its existing series, or replaces on an action.
        result=response(data,interval,start,end,adjusted,cached,security)
        result['incremental_only']=data.metadata.get('incremental_only',False)
        if not result['incremental_only']:self.cache.put(key,data)
        return result
    async def import_nse(self, security, files):
        generation=self.generation
        data=await asyncio.to_thread(self.nse.parse_files,security,files)
        if generation!=self.generation or self.closed:raise ProviderError('File import cancelled because the temporary cache was cleared.', 'busy')
        key=self.key(security,'nse')
        old=self.cache.get(key)
        if old:
            merged={r['time']:r for r in old.candles}
            for r in data.candles:
                if r['time'] in merged and merged[r['time']]!=r: raise ProviderError('Imported archive conflicts with a candle already in memory. Clear the cache first.', 'file')
                merged[r['time']]=r
            data.candles=[merged[t] for t in sorted(merged)]
        self.cache.put(key,data)
        return response(data,'1d')
    def status(self):
        self.cache.trim()
        return dict(source=self.provider.name,storage='memory only',entries=len(self.cache.entries),bytes=self.cache.bytes,
            active=len(self.active_keys),queued=max(0,len(self.inflight)-len(self.active_keys)),**self.metrics,
            total_provider_requests=self.metrics['provider_requests']+self.metrics['quote_provider_requests'],quote_entries=len(self.quote_cache.entries),
            hyperliquid=self.hyperliquid.status() if hasattr(self,'hyperliquid') else None,
            cooldown_seconds=max(0,math.ceil(self.cooldown-time.monotonic())),error=self.last_error,config=self.config)
    def configure(self, config):
        if self.inflight: raise ProviderError('Wait for current history requests before changing cache settings.', 'busy')
        self.config.update(config)
        self.cache.capacity=self.config['capacity'];self.cache.ttl=self.config['ttl'];self.cache.trim()
        self.budget.capacity=self.config['concurrency'];self.budget.drain()
    def clear(self):
        self.generation+=1;self.cache.clear();self.quote_cache.clear();self.errors.clear();self.refresh_attempts.clear()
        clear=getattr(self.provider,'clear_http_cache',None)
        if clear: clear()
    async def close(self):
        self.closed=True;self.clear()
        for task in list(self.inflight.values()): task.cancel()
        for task in list(self.inflight.values()):
            with suppress(asyncio.CancelledError,ProviderError): await task
        self.inflight.clear();self.provider.close();self.nse.close()
        if hasattr(self,'hyperliquid'):
            await self.hyperliquid.catalogue.close();self.hyperliquid.close()

HistoricalDataService = HistoryService
InMemoryCache = MemoryCache
