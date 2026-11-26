import asyncio
import math
import threading
import time
from datetime import datetime, timezone
from unittest.mock import patch
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.history import HistoryService
from app.providers.base import History, ProviderError
from app.providers.yahoo import YahooFinanceProvider
from app.refresh import quote_value, market_session, RefreshPreferences, Ownership, Selection, Operation
from app.request_budget import RequestBudget
from fixtures import candles

TOKEN = 'stage66-test-token-'+'x'*48
SEC = dict(symbol='TEST', yahoo_symbol='TEST', canonical_id='yahoo:TEST:NYSE:equity', kind='equity', exchange='NYSE', timezone='America/New_York', currency='USD', precision=2)


class Provider:
    name='TEST FIXTURE · SYNTHETIC'
    def __init__(self):
        self.rows=candles(80);self.calls=[];self.active=0;self.maximum=0;self.lock=threading.Lock();self.error=None
    def fetch(self, security, interval):
        return self.result(security,interval,'max',self.rows)
    def fetch_quote(self, security):
        return self.result(security,'1d','quote',self.rows[-5:])
    def fetch_recent(self, security, interval):
        return self.result(security,interval,'recent',self.rows[-5:])
    def result(self,security,interval,mode,rows):
        with self.lock:
            self.calls.append((security.get('canonical_id'),mode,time.monotonic()));self.active+=1;self.maximum=max(self.maximum,self.active)
        try:
            time.sleep(.01)
            if self.error:raise ProviderError('Controlled provider failure',self.error,60 if self.error=='rate' else 0)
            return History([dict(r) for r in rows],self.name,interval=interval,metadata=dict(currency=security.get('currency','USD'),timezone=security.get('timezone','UTC')))
        finally:
            with self.lock:self.active-=1
    def close(self):pass


def app_for(path, provider=None):
    app=create_app(path,TOKEN,provider or Provider());app.state.history.config['min_interval']=0
    return app


@pytest.mark.parametrize('start,end,kind,delta,percent',[(100,110,'equity',10,10),(100,90,'equity',-10,-10),(100,100,'equity',0,0),(-20,-37,'future',-17,-85),(-20,10,'future',30,150),(0,-2,'future',-2,None),(None,2,'equity',None,None)])
def test_quote_comparable_close(start,end,kind,delta,percent):
    rows=[dict(candles(1)[0],close=end)]
    if start is not None:rows.insert(0,dict(rows[0],time=rows[0]['time']-86400,close=start))
    q=quote_value(History(rows,'TEST'),dict(SEC,kind=kind))
    assert q['absolute_change']==delta and q['change']==percent
    assert q['timestamp_kind']=='trading_date'


@pytest.mark.parametrize('currency',['GBP','GBp','USD','INR','JPY',''])
def test_native_currency_units(currency):
    q=quote_value(History(candles(2),'TEST',metadata={'currency':currency}),dict(SEC,currency=currency))
    assert q['currency']==currency


@pytest.mark.parametrize('value',[math.nan,math.inf,0,-1])
def test_invalid_equity_quote_not_fabricated(value):
    with pytest.raises(ProviderError):quote_value(History([dict(candles(1)[0],close=value)],'TEST'),SEC)


def test_no_metadata_time_attached_to_different_price():
    t=int(datetime(2026,10,15,12,tzinfo=timezone.utc).timestamp())
    h=History([dict(candles(1)[0],time=t//86400*86400,close=10)],'TEST',metadata={'quote_metadata':{'regularMarketTime':t,'regularMarketPrice':12}})
    assert quote_value(h,SEC,t)['timestamp_kind']=='trading_date'
    h.metadata['quote_metadata']['regularMarketPrice']=10
    q=quote_value(h,SEC,t);assert q['data_time']==t and q['timestamp_kind']=='provider_market_time'
    h.metadata['quote_metadata']['regularMarketTime']=t+86400
    assert quote_value(h,SEC,t)['timestamp_kind']=='trading_date'


@pytest.mark.parametrize('interval,period',[('1m','5d'),('5m','1mo'),('15m','1mo'),('30m','1mo'),('1h','1mo'),('4h','1mo'),('1d','1mo'),('1w','3mo'),('1M','1y')])
def test_yahoo_recent_requests_bounded(interval,period):
    provider=YahooFinanceProvider()
    with patch.object(provider,'fetch',return_value=History(candles(2),'TEST')) as fetch:
        provider.fetch_recent(SEC,interval);fetch.assert_called_once_with(SEC,interval,period=period)


def test_yahoo_quote_never_max_history():
    p=YahooFinanceProvider()
    with patch.object(p,'fetch',return_value=History(candles(2),'TEST')) as fetch:
        p.fetch_quote(SEC);fetch.assert_called_once_with(SEC,'1d',period='5d')


@pytest.mark.parametrize('exchange,kind,zone,stamp,state,reliable',[
    ('CRYPTO','crypto','UTC','2026-10-18T01:00:00+00:00','open',True),
    ('NSE','equity','Asia/Kolkata','2026-10-18T10:00:00+05:30','closed',False),
    ('BSE','equity','Asia/Kolkata','2026-10-15T18:00:00+05:30','closed',False),
    ('NSE','equity','Asia/Kolkata','2026-10-15T12:00:00+05:30','unknown',False),
    ('CME','future','America/Chicago','2026-10-15T12:00:00+00:00','unknown',False),
    ('FX','forex','UTC','2026-10-15T12:00:00+00:00','unknown',False),
])
def test_market_session_cautious(exchange,kind,zone,stamp,state,reliable):
    value=market_session(dict(SEC,exchange=exchange,kind=kind,timezone=zone),datetime.fromisoformat(stamp).timestamp())
    assert value['state']==state and value['reliable']==reliable


@pytest.mark.parametrize('stamp,state',[('2026-03-09T14:00:00+00:00','open'),('2026-03-09T13:00:00+00:00','closed'),('2026-10-18T14:00:00+00:00','closed')])
def test_us_calendar_dst_and_weekends(stamp,state):
    assert market_session(dict(SEC,calendar='XNYS'),datetime.fromisoformat(stamp).timestamp())['state']==state


def test_provider_session_and_completed_bar():
    t=int(datetime(2026,10,15,tzinfo=timezone.utc).timestamp())
    meta={'currentTradingPeriod':{'regular':{'start':t+9*3600,'end':t+15*3600}}}
    s=dict(SEC,timezone='UTC');assert market_session(s,t+12*3600,meta)['state']=='open'
    h=History([dict(candles(1)[0],time=t)],'TEST',metadata={'quote_metadata':meta})
    assert quote_value(h,s,t+16*3600)['last_completed_bar_time']==t
    assert quote_value(h,s,t+12*3600)['last_completed_bar_time'] is None


def test_startup_no_background_bulk_job(tmp_path):
    a=app_for(tmp_path);assert a.state.history.status()['total_provider_requests']==0
    assert a.state.quotes.task is None
    assert a.state.quotes.preferences()==dict(startup_quotes=True,watchlist_interval=300,chart_interval=300)


def test_selected_watchlist_every_identity_attempted_and_cached(tmp_path):
    a=app_for(tmp_path);q=a.state.quotes;p=a.state.history.provider
    async def run():
        first=await q.start('stocks');assert first['pending']>0
        repeated=await q.start('stocks');assert repeated['job']==first['job']
        await q.task;done=q.status('stocks');assert not done['pending']
        ids=set(done['rows']);assert ids=={c[0] for c in p.calls}
        assert all(c[1]=='quote' for c in p.calls)
        assert all(r['value'] for r in done['rows'].values())
        count=len(p.calls);await q.start('stocks');await q.task;assert len(p.calls)==count
        await q.close();await a.state.history.close()
    asyncio.run(run())


def test_quote_singleflight_and_chart_shared_concurrency(tmp_path):
    a=app_for(tmp_path);h=a.state.history;p=h.provider;security=a.state.registry.resolve('RELIANCE')
    async def run():
        await asyncio.gather(*[h.quote(security) for _ in range(5)],*[h.get(a.state.registry.resolve(s)) for s in ('TCS','SBIN','INFY')])
        assert len([r for r in p.calls if r[1]=='quote'])==1
        assert p.maximum<=2 and h.metrics['deduplicated']==4
        assert h.metrics['quote_provider_requests']==1 and h.metrics['provider_requests']==3
        await h.close()
    asyncio.run(run())


def test_switch_cancels_old_queued_quotes(tmp_path):
    a=app_for(tmp_path);q=a.state.quotes;h=a.state.history;h.budget.capacity=1
    async def run():
        first=await q.start('stocks');await asyncio.sleep(.002)
        second=await q.start('indices');assert first['job']!=second['job']
        await q.task;assert q.status('indices')['pending']==0
        assert set(q.job['states'])==set(q.status('indices')['rows'])
        await q.cancel(first['job']);assert q.job['id']==second['job']
        await q.close();await h.close()
    asyncio.run(run())


@pytest.mark.parametrize('kind',['missing','access','rate','temporary'])
def test_quote_failures_backoff_and_global_rate_limit(tmp_path,kind):
    a=app_for(tmp_path);p=a.state.history.provider;p.error=kind;q=a.state.quotes
    async def run():
        await q.start('indices');await q.task;state=q.status('indices');assert all(r['error'] and r['value'] is None for r in state['rows'].values())
        count=len(p.calls);await q.start('indices',True);await q.task;assert len(p.calls)==count
        if kind=='rate':
            assert a.state.history.status()['cooldown_seconds']>0
            with pytest.raises(ProviderError):await a.state.history.get(SEC)
            assert len(p.calls)==count
        await q.close();await a.state.history.close()
    asyncio.run(run())


def test_last_success_retained_and_marked_stale_on_failure(tmp_path):
    a=app_for(tmp_path);q=a.state.quotes
    async def run():
        await q.start('indices');await q.task;before=q.status('indices');a.state.history.provider.error='missing'
        await q.start('indices',True);await q.task;after=q.status('indices')
        for key in before['rows']:
            assert after['rows'][key]['value']==before['rows'][key]['value']
            assert after['rows'][key]['stale'] and after['rows'][key]['error']
        await q.close();await a.state.history.close()
    asyncio.run(run())


@pytest.mark.parametrize('interval',['1m','5m','15m','30m','1h','1d','1w','1M'])
def test_incremental_merge_and_updated_timestamps(tmp_path,interval):
    a=app_for(tmp_path);h=a.state.history;p=h.provider;sec=a.state.registry.resolve('RELIANCE')
    async def run():
        before=await h.get(sec,interval);old=list(p.rows);last=old[-1]
        p.rows=old[:-1]+[dict(last,close=last['close']+0.1),dict(last,time=last['time']+86400)]
        results=await asyncio.gather(*[h.incremental(sec,interval) for _ in range(4)])
        rows=results[0]['candles'];assert len(rows)==len(before['candles'])+1
        assert rows[-2]['close']==last['close']+.1 and rows[0]==before['candles'][0]
        assert len([r for r in p.calls if r[1]=='recent'])==1
        count=len(p.calls);await h.incremental(sec,interval,automatic=True);assert len(p.calls)==count
        await h.close()
    asyncio.run(run())


def test_priority_budget_charts_overtake_queued_background_and_cancel():
    async def run():
        budget=RequestBudget(1);order=[];release=asyncio.Event()
        async def job(name,priority,hold=False):
            async with budget.slot(priority):
                order.append(name)
                if hold:await release.wait()
        first=asyncio.create_task(job('first',2,True));await asyncio.sleep(0)
        background=asyncio.create_task(job('screener',2));quote=asyncio.create_task(job('quote',1));chart=asyncio.create_task(job('chart',0));cancelled=asyncio.create_task(job('cancelled',0));await asyncio.sleep(0);cancelled.cancel()
        with pytest.raises(asyncio.CancelledError):await cancelled
        release.set();await asyncio.gather(first,background,quote,chart)
        assert order==['first','chart','quote','screener'] and budget.active==0 and not budget.waiting
    asyncio.run(run())


def test_authenticated_apis_preferences_restart_no_price_tables(tmp_path):
    a=app_for(tmp_path)
    with TestClient(a) as client:
        assert client.get('/api/refresh/preferences').status_code==401
        client.headers['Authorization']='Bearer '+TOKEN
        for value in (0,60,300,900):
            assert client.put('/api/refresh/preferences',json=dict(startup_quotes=False,watchlist_interval=value,chart_interval=300)).status_code==200
        assert client.put('/api/refresh/preferences',json={'watchlist_interval':1}).status_code==422
        assert client.put('/api/refresh/preferences',json={'file':'bad'}).status_code==422
        assert client.post('/api/quotes/snapshot',json={'watchlist':'missing'}).status_code==404
        assert client.get('/api/history/refresh?symbol=RELIANCE&start=bad').status_code==422
        assert client.get('/api/history/refresh?symbol=RELIANCE&start=2026-02-02&end=2026-01-01').status_code==422
    b=app_for(tmp_path)
    assert b.state.quotes.preferences()['startup_quotes'] is False
    assert b.state.quotes.preferences()['watchlist_interval']==900
    assert not b.state.quotes.values and not b.state.history.quote_cache.entries
    with b.state.db.connect() as c:
        assert not any('quote' in r[0] or 'candle' in r[0] or 'ohlc' in r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'"))


def test_four_hour_incremental_session_aggregation(tmp_path):
    a=app_for(tmp_path);h=a.state.history;p=h.provider;sec=a.state.registry.resolve('RELIANCE')
    opening=int(datetime.fromisoformat('2026-10-14T09:15:00+05:30').timestamp())
    p.rows=[dict(candles(1)[0],time=opening+i*900) for i in range(8)]
    async def run():
        before=await h.get(sec,'4h');assert len(before['candles'])==1
        p.rows.append(dict(p.rows[-1],time=opening+14400))
        after=await h.incremental(sec,'4h');assert len(after['candles'])==2
        assert after['candles'][0]['open']==before['candles'][0]['open']
        assert after['candles'][1]['time']==opening+14400
        await h.close()
    asyncio.run(run())


def test_corporate_action_reconciles_full_series(tmp_path):
    a=app_for(tmp_path);h=a.state.history;p=h.provider;sec=a.state.registry.resolve('RELIANCE')
    original=p.fetch_recent
    def split(sec,interval):
        value=original(sec,interval);value.actions=[dict(time=value.candles[-1]['time'],split=2,dividend=0)];return value
    p.fetch_recent=split
    async def run():
        await h.get(sec);await h.incremental(sec)
        assert [r[1] for r in p.calls]==['max','recent','max']
        await h.close()
    asyncio.run(run())


def test_closed_session_refresh_reduction_and_manual_override(tmp_path):
    a=app_for(tmp_path);q=a.state.quotes;p=a.state.history.provider
    async def run():
        await q.start('indices');await q.task;count=len(p.calls)
        for record in q.values.values():
            record['value']['fetched_at']=time.time()-301
            record['value']['session']=dict(state='closed',reliable=True,basis='TEST calendar')
        await q.start('indices');await q.task;assert len(p.calls)==count
        await q.start('indices',True);await q.task;assert len(p.calls)>count
        await q.close();await a.state.history.close()
    asyncio.run(run())


def test_shared_start_spacing(tmp_path):
    a=app_for(tmp_path);h=a.state.history;h.config['min_interval']=.03;p=h.provider
    async def run():
        await asyncio.gather(h.quote(a.state.registry.resolve('RELIANCE')),h.get(a.state.registry.resolve('TCS')),h.get(a.state.registry.resolve('SBIN'),priority=1))
        stamps=sorted(r[2] for r in p.calls)
        assert all(b-a>=.025 for a,b in zip(stamps,stamps[1:]))
        await h.close()
    asyncio.run(run())


def test_cache_expiry_delta_does_not_poison_max_history(tmp_path):
    a=app_for(tmp_path);h=a.state.history;p=h.provider;sec=a.state.registry.resolve('RELIANCE')
    async def run():
        before=await h.get(sec);h.cache.clear()
        delta=await h.incremental(sec)
        assert delta['incremental_only'] and len(delta['candles'])==5
        assert [c[1] for c in p.calls]==['max','recent']
        full=await h.get(sec);assert len(full['candles'])==len(before['candles'])
        assert p.calls[-1][1]=='max'
        await h.close()
    asyncio.run(run())


def test_rapid_watchlist_selection_changes_are_serialized(tmp_path):
    a=app_for(tmp_path);q=a.state.quotes;original=q._cancel;active=0;maximum=0
    async def delayed(job=None):
        nonlocal active,maximum
        active+=1;maximum=max(maximum,active)
        try:
            await asyncio.sleep(.005)
            await original(job)
        finally:active-=1
    q._cancel=delayed
    async def run():
        await asyncio.gather(q.start('stocks'),q.start('indices'),q.start('us'),q.start('crypto'))
        await q.task
        assert maximum==1 and q.job['watchlist']=='crypto'
        assert not q.status('crypto')['pending']
        await q.close();await a.state.history.close()
    asyncio.run(run())


def test_same_ticker_different_exchange_has_separate_quote_cache():
    provider=Provider();h=HistoryService(provider,{'min_interval':0})
    async def run():
        nasdaq=dict(SEC,canonical_id='yahoo:TEST:NASDAQ:equity',exchange='NASDAQ')
        nyse=dict(SEC,canonical_id='yahoo:TEST:NYSE:equity',exchange='NYSE')
        await asyncio.gather(h.quote(nasdaq),h.quote(nyse))
        assert len(provider.calls)==2 and len(h.quote_cache.entries)==2
        await h.quote(nasdaq);await h.quote(nyse);assert len(provider.calls)==2
        await h.close()
    asyncio.run(run())


async def select_scope(q, client, generation, watchlist, timeframe='1d'):
    owner = Ownership(client=client, generation=generation)
    result = await q.select(Selection(watchlist=watchlist, timeframe=timeframe), owner)
    assert result['accepted']
    return owner


async def owned_start(q, owner, watchlist, sequence=1, *, timeframe='1d', force=False, automatic=False):
    return await q.start(watchlist, force, automatic, timeframe,
                         owner=Operation(**owner.model_dump(), sequence=sequence))


def test_delayed_start_and_cancel_cannot_replace_return_to_warm_stocks(tmp_path):
    a = app_for(tmp_path)
    q, history = a.state.quotes, a.state.history

    async def run():
        client = (await q.register())['client']
        initial = await select_scope(q, client, 1, 'stocks')
        await owned_start(q, initial, 'stocks')
        await q.clients[client].task
        original = q.status('stocks', owner=initial)['rows']
        assert len(original) == 8 and all(row['state'] == 'ready' and row['value'] for row in original.values())
        provider_calls = len(history.provider.calls)

        for cycle in range(12):
            generation = 2 + 3*cycle
            us = await select_scope(q, client, generation, 'us')
            crypto = await select_scope(q, client, generation+1, 'crypto')
            stocks = await select_scope(q, client, generation+2, 'stocks')
            warm = q.status('stocks', owner=stocks)
            assert warm['job'] is None and warm['rows'] == original
            current = await owned_start(q, stocks, 'stocks')
            if cycle % 2:
                assert not await q.retire(crypto)
            # These posts are delivered after Stocks is accepted. Neither can
            # start work, even with force, or reset the current job and status.
            assert not (await owned_start(q, crypto, 'crypto', force=True))['accepted']
            assert not (await owned_start(q, us, 'us', force=True))['accepted']
            if not cycle % 2:
                assert not await q.retire(crypto)
            assert not q.status('stocks', owner=initial)['accepted']
            assert not q.status('crypto', owner=crypto)['accepted']
            assert await q.select(q.clients[client].selection.model_copy(update={'watchlist':'crypto'}), crypto) == {'accepted':False}
            await q.clients[client].task
            done = q.status('stocks', owner=stocks, sequence=1, job_id=current['job'])
            assert done['pending'] == done['active_jobs'] == 0
            assert done['rows'] == original
            assert done['cached_values'] == 8 and done['owned_clients'] == 1
            assert len(history.provider.calls) == provider_calls
        assert provider_calls == 8
        await q.close()
        await history.close()

    asyncio.run(run())


def test_owned_manual_refresh_wins_and_equal_requests_coalesce(tmp_path):
    a = app_for(tmp_path)
    q, history = a.state.quotes, a.state.history

    async def run():
        entered, release = asyncio.Event(), asyncio.Event()
        original_quote = history.quote
        calls = []

        async def slow_quote(security, force=False, interval='1d'):
            calls.append((security['canonical_id'], force))
            entered.set()
            await release.wait()
            return await original_quote(security, force, interval)

        history.quote = slow_quote
        client = (await q.register())['client']
        owner = await select_scope(q, client, 1, 'stocks')
        automatic = await owned_start(q, owner, 'stocks', automatic=True)
        await asyncio.wait_for(entered.wait(), 2)
        manual = await owned_start(q, owner, 'stocks', sequence=3, force=True)
        assert manual['job'] != automatic['job']
        assert not (await owned_start(q, owner, 'stocks', sequence=2, automatic=True))['accepted']
        assert not q.status('stocks', owner=owner, sequence=1, job_id=automatic['job'])['accepted']
        retry = await owned_start(q, owner, 'stocks', sequence=3, force=True)
        assert retry['job'] == manual['job']
        duplicate = await owned_start(q, owner, 'stocks', sequence=4, force=True)
        assert duplicate['job'] == manual['job']
        assert not q.status('stocks', owner=owner, sequence=3, job_id=manual['job'])['accepted']
        await q.cancel(manual['job'])  # An unowned request cannot cancel it.
        assert q.status('stocks', owner=owner, sequence=4, job_id=manual['job'])['pending'] == 8
        release.set()
        await q.clients[client].task
        result = q.status('stocks', owner=owner, sequence=4, job_id=manual['job'])
        assert all(row['state'] == 'ready' for row in result['rows'].values())
        assert len({key for key, force in calls if force}) == sum(force for _,force in calls) == 8
        assert len(history.provider.calls) == 8 and history.provider.maximum <= 2
        await q.close()
        await history.close()

    asyncio.run(run())


def test_pending_provider_completion_and_scope_release_are_isolated(tmp_path):
    a = app_for(tmp_path)
    q, history = a.state.quotes, a.state.history

    async def run():
        entered, complete = asyncio.Event(), asyncio.Event()
        original_quote = history.quote

        async def provider_work():
            entered.set()
            await complete.wait()

        download = asyncio.create_task(provider_work())

        async def slow_quote(security, force=False, interval='1d'):
            if interval == '15m':
                await asyncio.shield(download)
            return await original_quote(security, force, interval)

        history.quote = slow_quote
        first, second = [(await q.register())['client'] for _ in range(2)]
        old = await select_scope(q, first, 1, 'stocks', '15m')
        other = await select_scope(q, second, 1, 'us')
        old_job = await owned_start(q, old, 'stocks', timeframe='15m')
        await asyncio.wait_for(entered.wait(), 2)
        other_job = await owned_start(q, other, 'us')
        current = await select_scope(q, first, 2, 'stocks', '1h')
        assert not q.status('stocks', '15m', old, 1, old_job['job'])['accepted']
        assert q.status('us', owner=other)['job'] == other_job['job']
        assert not (await owned_start(q, current, 'stocks', timeframe='15m'))['accepted']
        await owned_start(q, current, 'stocks', timeframe='1h')
        await q.clients[first].task
        complete.set()
        await download
        cached = q.status('stocks', '1h')['rows']
        assert all(row['value']['timeframe'] == '1h' for row in cached.values())
        assert not any(row['value'] for row in q.status('stocks', '15m')['rows'].values())
        await q.release(first)
        assert not (await owned_start(q, current, 'stocks', timeframe='1h', force=True))['accepted']
        remount = (await q.register())['client']
        assert remount != first
        new = await select_scope(q, remount, 1, 'stocks', '1h')
        assert q.status('stocks', '1h', new)['rows'] == cached
        assert q.status('us', owner=other)['job'] == other_job['job']
        await q.close()
        await history.close()
        assert not q.clients and not q.values and not history.inflight

    asyncio.run(run())


def test_flagged_scope_keeps_cached_provenance_and_honest_missing_status(tmp_path):
    a = app_for(tmp_path)
    q, history = a.state.quotes, a.state.history

    async def run():
        client = (await q.register())['client']
        ordinary = await select_scope(q, client, 1, 'stocks')
        await owned_start(q, ordinary, 'stocks')
        await q.clients[client].task
        rows = q.status('stocks', owner=ordinary)['rows']
        key = next(iter(rows))
        item = next(row for row in q.items('stocks') if row.get('canonical_id') == key)
        q.db.set_flag(key, 'red', item['symbol'], item['name'], item['exchange'], 'yahoo', 'equity')
        flagged = await select_scope(q, client, 2, 'color:red')
        assert q.status('color:red', owner=flagged)['rows'] == {key: rows[key]}

        history.provider.error = 'missing'
        await owned_start(q, flagged, 'color:red', force=True)
        await q.clients[client].task
        failed = q.status('color:red', owner=flagged)['rows'][key]
        assert failed['state'] == 'missing' and failed['stale'] and failed['error']
        assert failed['value'] == rows[key]['value']
        assert await q.retire(flagged)
        restored = q.status('color:red')['rows'][key]
        assert restored['state'] == 'ready' and restored['stale'] and restored['value'] == failed['value']

        intraday = await select_scope(q, client, 3, 'color:red', '5m')
        await owned_start(q, intraday, 'color:red', timeframe='5m')
        await q.clients[client].task
        missing = q.status('color:red', '5m', intraday)['rows'][key]
        assert missing['state'] == 'missing' and missing['value'] is None and not missing['stale']
        await q.close()
        await history.close()

    asyncio.run(run())


def test_owned_endpoints_tombstone_and_scope_bounds(tmp_path):
    a = app_for(tmp_path)
    with TestClient(a, headers={'Authorization':'Bearer '+TOKEN}) as client:
        route, selection = '/api/quotes/client', '/api/quotes/selection'
        leases = [client.post(route).json()['client'] for _ in range(a.state.quotes.MAX_CLIENTS)]
        assert len(set(leases)) == len(leases)
        assert client.post(route).status_code == 503
        owner = dict(client=leases[0], generation=2)
        assert client.request('DELETE', selection, json=owner).json() == {'cancelled':True}
        assert client.put(selection, json=dict(watchlist='stocks', ownership=owner)).json() == {'accepted':False}
        assert client.put(selection, json=dict(watchlist='stocks', ownership=dict(owner, generation=0))).status_code == 422
        assert client.put(selection, json=dict(watchlist='stocks', ownership=dict(owner, generation=True))).status_code == 422
        assert client.get('/api/quotes/status', params=dict(watchlist='stocks', client=leases[0])).status_code == 422
        assert client.delete(route, params=dict(client='bad')).status_code == 422
        assert client.delete(route, params=dict(client=leases[0])).status_code == 200
        assert client.post(route).json()['client'] not in leases
        assert client.post('/api/quotes/snapshot', json=dict(watchlist='stocks', ownership=dict(owner, generation=3, sequence=1))).json() == {'accepted':False}
    assert not a.state.quotes.clients


def test_shutdown_cancels_active_workers_in_all_owned_scopes(tmp_path):
    a = app_for(tmp_path)
    q, history = a.state.quotes, a.state.history

    async def run():
        all_entered = asyncio.Event()
        unfinished = asyncio.Event()
        entered, cancelled = [], []

        async def pending_quote(security, force=False, interval='1d'):
            key = security['canonical_id']
            entered.append(key)
            if len(entered) == 4:
                all_entered.set()
            try:
                await unfinished.wait()
            finally:
                cancelled.append(key)

        history.quote = pending_quote
        client_a, client_b = [(await q.register())['client'] for _ in range(2)]
        owner_a = await select_scope(q, client_a, 1, 'stocks')
        owner_b = await select_scope(q, client_b, 1, 'us')
        await owned_start(q, owner_a, 'stocks')
        await owned_start(q, owner_b, 'us')
        jobs = [scope.task for scope in q.clients.values()]
        await asyncio.wait_for(all_entered.wait(), 2)
        assert q.status('stocks', owner=owner_a)['active_jobs'] == 2
        await q.close()
        await history.close()
        assert sorted(cancelled) == sorted(entered)
        assert all(job.cancelled() for job in jobs)
        assert not q.clients and not q.values
        assert q.status('stocks')['active_jobs'] == 0
        assert not (await owned_start(q, owner_a, 'stocks'))['accepted']

    asyncio.run(run())


def test_evicted_quote_is_no_longer_reported_ready(tmp_path):
    a = app_for(tmp_path)
    q, history = a.state.quotes, a.state.history

    async def run():
        q.MAX_VALUES = 4
        client = (await q.register())['client']
        owner = await select_scope(q, client, 1, 'stocks')
        await owned_start(q, owner, 'stocks')
        await q.clients[client].task
        done = q.status('stocks', owner=owner)
        assert done['pending'] == 0 and done['cached_values'] == 4
        assert len(done['rows']) == 8
        assert sum(row['state'] == 'ready' for row in done['rows'].values()) == 4
        assert all(row['state'] == 'missing' for row in done['rows'].values() if row['value'] is None)
        await q.close()
        await history.close()

    asyncio.run(run())
