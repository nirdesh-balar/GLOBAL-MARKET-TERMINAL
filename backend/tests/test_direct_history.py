import asyncio
import base64
import io
import math
import sqlite3
import threading
import time
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.database import Database
from app.instruments import SOURCES, parse_directory, install_files
from app.history import MemoryCache, HistoryService, aggregate_daily, response
from app.main import create_app, restore_workspace
from app.models import CacheConfig
from app.providers.base import History, ProviderError
from app.providers.nse import NSEHistoricalProvider
from app.providers.yahoo import normalize_ohlcv, trading_time, YahooFinanceProvider, TZ_CACHE, COOKIE_CACHE, ISIN_CACHE
from fixtures import FixtureProvider, candles
from directory_reference import official_reference, installed_reference
RESOURCES=Path(__file__).parents[1]/'resources'
TOKEN='test-local-token-'+'x'*48

@pytest.fixture
def app(tmp_path): return create_app(tmp_path,TOKEN,FixtureProvider(count=900))
@pytest.fixture
def client(app):
    with TestClient(app,headers={'Authorization':'Bearer '+TOKEN}) as c: yield c
@pytest.fixture
def security(app): return app.state.db.resolve('RELIANCE')

def history(rows=None):return History(rows or candles(30),'YAHOO FINANCE')
def frame():
    return pd.DataFrame({'Open':[10.,20.],'High':[13.,23.],'Low':[9.,19.],'Close':[12.,22.],
        'Volume':[100.,200.],'Adj Close':[6.,11.],'Dividends':[0.,1.],'Stock Splits':[2.,0.]},
        index=pd.DatetimeIndex(['2024-01-05','2024-01-08'],tz='Asia/Kolkata'))

def test_full_official_directory(client,app):
    metadata=client.get('/health').json()['catalogue']
    expected=official_reference();combined={**expected['MAINBOARD'],**expected['SME']}
    assert metadata['mainboard']==len(expected['MAINBOARD'])>=1000, 'DIRECTORY_MAINBOARD_COUNT'
    assert metadata['sme']==len(expected['SME'])>=100, 'DIRECTORY_SME_COUNT'
    assert app.state.db.count()==len(combined), 'DIRECTORY_TOTAL_COUNT'
    assert installed_reference(app.state.db)==combined, 'DIRECTORY_ALL_RECORDS'
    for query in ('R.K. Fashion','INE2O2Y01016','RKFAL','20MICRONS'):
        rows=client.get('/api/securities/search',params={'q':query}).json()
        assert rows and all(r['company_name'] and r['isin'] and r['series'] for r in rows), 'DIRECTORY_SEARCH_METADATA'
    assert app.state.history.metrics['provider_requests']==0, 'DIRECTORY_NO_HISTORY_FETCH' # startup does not fetch any stock

@pytest.mark.parametrize('symbol,yahoo',[('RELIANCE','RELIANCE.NS'),('M&M','M&M.NS'),('RKFAL','RKFAL.NS'),('20MICRONS','20MICRONS.NS'),('TCS-EQ','TCS.NS')])
def test_mapping(app,symbol,yahoo): assert app.state.db.resolve(symbol)['yahoo_symbol']==yahoo

@pytest.mark.parametrize('content',[b'<html>Access denied</html>',b'SYMBOL,NAME OF COMPANY,SERIES\nABC,Name,EQ',b'SYMBOL,NAME_OF_COMPANY,SERIES,ISIN_NUMBER\nABC,Name,EQ,bad',b'SYMBOL,NAME_OF_COMPANY,SERIES,ISIN_NUMBER\n'])
def test_invalid_directory_retains_existing(app,content):
    old=app.state.db.count()
    before=installed_reference(app.state.db)
    with pytest.raises(ValueError): install_files(app.state.db,{'MAINBOARD':content,'SME':content})
    assert app.state.db.count()==old
    assert installed_reference(app.state.db)==before

def test_no_index_restriction_and_atomic_import(app):
    main=(RESOURCES/'EQUITY_L.csv').read_bytes();sme=(RESOURCES/'SME_EQUITY_L.csv').read_bytes()
    install_files(app.state.db,{'MAINBOARD':main,'SME':sme})
    expected=official_reference();combined={**expected['MAINBOARD'],**expected['SME']}
    assert installed_reference(app.state.db)==combined, 'IMPORT_ALL_RECORDS'
    assert app.state.db.resolve('RKFAL')['board']=='SME', 'IMPORT_SME_CATEGORY'
    assert app.state.db.resolve('20MICRONS')['board']=='MAINBOARD', 'IMPORT_MAINBOARD_CATEGORY'
    with pytest.raises(ValueError):install_files(app.state.db,{'MAINBOARD':main})
    assert app.state.db.count()==len(combined), 'IMPORT_REJECTED_UPDATE_COUNT'
    assert installed_reference(app.state.db)==combined, 'IMPORT_REJECTED_UPDATE_ATOMIC'

def test_literal_search_and_limit(client):
    assert client.get('/api/securities/search',params={'q':'%_'}).json()==[]
    assert len(client.get('/api/securities/search',params={'limit':999999}).json())==200

def test_conversion_dates_actions_and_volume():
    data=normalize_ohlcv(frame())
    assert data.candles[0]['time']==trading_time(date(2024,1,5))
    assert data.candles[0]['volume']==100
    assert data.actions[0]['split']==2
    assert data.actions[1]['dividend']==1
    assert data.candles[0]['open']==10 # no automatic double-adjustment
    adjusted=response(data,'1d',adjusted=True)
    assert adjusted['candles'][0]['open']==5
    assert adjusted['candles'][0]['volume']==100

@pytest.mark.parametrize('tz',['Asia/Kolkata','UTC',None])
def test_daily_trading_dates(tz):
    f=frame();f.index=pd.DatetimeIndex(['2024-01-05','2024-01-08'],tz=tz)
    assert normalize_ohlcv(f).candles[0]['time']==trading_time(date(2024,1,5))

def test_convert_utc_timestamp_to_indian_trading_date():
    f=frame().iloc[:1];f.index=pd.DatetimeIndex(['2024-01-04T20:00:00Z'])
    assert normalize_ohlcv(f).candles[0]['time']==trading_time(date(2024,1,5))

def test_multiindex_conversion():
    f=frame();f.columns=pd.MultiIndex.from_tuples([(k,'RELIANCE.NS') for k in f.columns])
    assert len(normalize_ohlcv(f,'RELIANCE.NS').candles)==2

@pytest.mark.parametrize('bad',[None,pd.DataFrame(),pd.DataFrame({'Close':[3.]})])
def test_missing_or_invalid_source(bad):
    with pytest.raises(ProviderError): normalize_ohlcv(bad)

@pytest.mark.parametrize('column,value',[('Open',math.nan),('High',1),('Low',99),('Close',math.inf),('Open',0)])
def test_invalid_candles_are_not_invented(column,value):
    f=frame();f.loc[f.index[0],column]=value
    data=normalize_ohlcv(f)
    assert len(data.candles)==1 and 'omitted' in data.notice

def test_missing_volume_is_whitespace():
    f=frame();f.loc[f.index[0],'Volume']=math.nan
    assert normalize_ohlcv(f).candles[0]['volume'] is None

def test_sort_deduplication():
    f=pd.concat([frame().iloc[::-1],frame().iloc[:1]])
    rows=normalize_ohlcv(f).candles
    assert len(rows)==2 and rows[0]['time']<rows[1]['time']

def test_weekly_monthly_ohlcv():
    rows=normalize_ohlcv(frame()).candles
    weekly=aggregate_daily(rows,'1w');monthly=aggregate_daily(rows,'1M')
    assert len(weekly)==2 # Friday and following Monday
    assert monthly[0]['time']==rows[0]['time']
    assert (monthly[0]['open'],monthly[0]['high'],monthly[0]['low'],monthly[0]['close'],monthly[0]['volume'])==(10,23,9,22,300)
    rows[1]['volume']=None
    assert aggregate_daily(rows,'1M')[0]['volume'] is None

def test_ranges_and_complete_calendar_buckets():
    data=normalize_ohlcv(frame())
    daily=response(data,'1d','2024-01-08','2024-01-08')
    assert len(daily['candles'])==1
    monthly=response(data,'1M','2024-01-06','2024-01-06')
    assert monthly['candles'][0]['open']==10 and monthly['candles'][0]['close']==22
    assert monthly['first_available']=='2024-01-05' and monthly['last_available']=='2024-01-08'
    assert not response(data,'1d','2023-01-01','2023-01-31')['candles']
    with pytest.raises(ProviderError):response(data,'1d','2024-02-01','2024-01-01')

def test_memory_lru_expiry_and_size():
    now=[0.];cache=MemoryCache(capacity=2,ttl=10,clock=lambda:now[0])
    a=history();cache.put('a',a);cache.put('b',a);assert cache.get('a') is a
    cache.put('c',a);assert cache.get('b') is None
    now[0]=11;assert cache.get('a') is None;cache.trim();assert cache.bytes==0
    cache=MemoryCache(max_bytes=10);cache.put('a',a);assert not cache.entries

def test_singleflight_shared_daily_all_intervals_and_ranges(security):
    async def run():
        provider=FixtureProvider(delay=.08);service=HistoryService(provider,{'min_interval':0})
        results=await asyncio.gather(*[service.get(security,i,start='2000-01-01' if n%2 else None) for n in range(8) for i in ('1d','1w','1M')])
        assert provider.calls==1 and service.metrics['deduplicated']==23
        assert all(r['first_available']=='1995-01-01' for r in results)
        await service.get(security,'1w');assert provider.calls==1
        await service.get(security,'1d',force=True);assert provider.calls==2
        await service.close();assert not service.cache.entries and provider.closed
    asyncio.run(run())

def test_cancelled_pane_does_not_cancel_shared_fetch(security):
    async def run():
        provider=FixtureProvider(delay=.1);s=HistoryService(provider,{'min_interval':0})
        a=asyncio.create_task(s.get(security));b=asyncio.create_task(s.get(security))
        await asyncio.sleep(.02);a.cancel()
        with pytest.raises(asyncio.CancelledError):await a
        assert (await b)['candles'] and provider.calls==1
        assert s.metrics['cancelled']==1
        await s.close()
    asyncio.run(run())

def test_concurrency_queued_cancellation_and_clear_generation(app):
    async def run():
        p=FixtureProvider(delay=.15,count=30);s=HistoryService(p,{'min_interval':0,'concurrency':1})
        a=asyncio.create_task(s.get(app.state.db.resolve('RELIANCE')))
        await asyncio.sleep(.02)
        b=asyncio.create_task(s.get(app.state.db.resolve('TCS')))
        await asyncio.sleep(.02);assert s.status()['active']==1 and s.status()['queued']==1
        b.cancel()
        with pytest.raises(asyncio.CancelledError):await b
        s.clear();await a;await asyncio.sleep(0)
        assert p.calls==1 and not s.cache.entries
        await s.close()
    asyncio.run(run())

@pytest.mark.parametrize('kind',['missing','access','source','rate'])
def test_error_cooldown_respects_rejections(security,kind):
    class Reject(FixtureProvider):
        def fetch_daily(self,r):self.calls+=1;raise ProviderError('Controlled provider error',kind,60 if kind=='rate' else 0)
    async def run():
        p=Reject(count=2);s=HistoryService(p,{'min_interval':0})
        for _ in range(3):
            with pytest.raises(ProviderError):await s.get(security,force=True)
        assert p.calls==1
        if kind=='rate':assert s.status()['cooldown_seconds']>=59
        await s.close()
    asyncio.run(run())

def test_exponential_backoff_temporary_failures(security,monkeypatch):
    class Flaky(FixtureProvider):
        def fetch_daily(self,r):
            self.calls+=1
            if self.calls<3:raise ProviderError('Temporary network failure','temporary')
            return history()
    waits=[];original=asyncio.sleep
    async def sleep(delay):waits.append(delay);await original(0)
    monkeypatch.setattr(asyncio,'sleep',sleep)
    async def run():
        p=Flaky(count=2);s=HistoryService(p,{'min_interval':0});await s.get(security)
        assert waits==[1,2] and p.calls==3 and s.metrics['retries']==2
        await s.close()
    asyncio.run(run())

def test_no_disk_candles_and_restart(client,app,tmp_path):
    result=client.get('/api/history',params={'symbol':'RELIANCE'});assert result.status_code==200
    assert result.json()['storage']=='memory only'
    with app.state.db.connect() as c:
        assert {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}=={'securities','settings','watchlists','alert_schema','alert_preferences','alerts','alert_history'}
        assert 'candles' not in repr(list(c.execute('SELECT * FROM settings')))
    assert not list(tmp_path.glob('*.csv')) and not list(tmp_path.glob('*.json'))
    new=create_app(tmp_path,TOKEN,FixtureProvider(count=30));assert new.state.history.status()['entries']==0

def test_migrate_legacy_candles_preserve_workspace(tmp_path):
    path=tmp_path/'terminal.sqlite3'
    with sqlite3.connect(path) as c:
        c.executescript('CREATE TABLE historical_candles(time INT,close REAL);INSERT INTO historical_candles VALUES(1,98765);CREATE TABLE candles(close REAL);CREATE TABLE cache_metadata(fetched REAL);CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);')
        c.execute('INSERT INTO settings VALUES(?,?)',('personal_preference','"keep"'))
    db=Database(path);assert db.get('personal_preference')=='keep'
    with db.connect() as c:assert c.execute("SELECT name FROM sqlite_master WHERE name='historical_candles'").fetchone() is None

def test_workspace_migration_and_persistence(client,app):
    w=client.get('/workspace').json();w['layout']=8;w['panes'][0]['timeframe']='1M';w['panes'][0]['indicators']=['RSI14','BB20']
    assert client.put('/workspace',json=w).status_code==200
    assert client.get('/workspace').json()['layout']==w['layout']
    assert [i['kind'] for i in client.get('/workspace').json()['panes'][0]['indicators']]==['RSI','BB']
    w['panes'][0]['timeframe']='15m';w['panes'][0]['token']='2885';app.state.db.put('workspace',w)
    restored=restore_workspace(app.state.db)
    assert restored['layout']==8 and restored['panes'][0]['timeframe']=='15m'
    assert restored['panes'][0]['token']==app.state.db.resolve('RELIANCE')['token']
    assert [i['kind'] for i in restored['panes'][0]['indicators']]==['RSI','BB']

@pytest.mark.parametrize('params',[{'symbol':'NONEXISTENT'},{'symbol':'RELIANCE','interval':'2m'},{'symbol':'RELIANCE','period':'1y'},{'symbol':'RELIANCE','start':'not-a-date'},{'symbol':'RELIANCE','start':'2024-02-01','end':'2024-01-01'}])
def test_invalid_requests_never_fetch(client,app,params):
    assert client.get('/api/history',params=params).status_code in (404,422)
    assert app.state.history.metrics['provider_requests']==0

def test_missing_history_never_switches_to_invented_data(client):
    r=client.get('/api/history',params={'symbol':'RKFAL'});assert r.status_code==404
    assert r.json()['kind']=='missing'
    assert 'candles' not in r.json()

def test_cache_clear_preferences_and_auth(client,app):
    assert client.get('/api/history',params={'symbol':'RELIANCE'}).status_code==200
    assert client.get('/api/history/status').json()['entries']==1
    assert client.post('/api/cache/clear').json()['cleared']
    assert client.get('/api/history/status').json()['entries']==0
    config=dict(capacity=4,ttl=60,concurrency=1,min_interval=2)
    assert client.put('/api/history/preferences',json=config).status_code==200
    assert app.state.db.get('history_preferences')==config
    assert client.put('/api/history/preferences',json={**config,'concurrency':8}).status_code==422
    assert client.get('/health',headers={'Authorization':'bad'}).status_code==401
    assert client.post('/auth/connect').status_code==404
    assert client.get('/health',headers={'Host':'untrusted.example'}).status_code==400

def legacy_csv(symbol='RELIANCE',series='EQ'):
    return f'SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,TOTTRDQTY,TIMESTAMP,ISIN\n{symbol},{series},10,13,9,12,100,05-JAN-2024,INE002A01018\n'.encode()

def test_official_legacy_and_udiff_import(security):
    p=NSEHistoricalProvider()
    legacy=p.parse_files(security,[('cm.csv',legacy_csv())])
    modern=b'TradDt,TckrSymb,SctySrs,OpnPric,HghPric,LwPric,ClsPric,TtlTradgVol,ISIN\n2024-01-08,RELIANCE,EQ,20,23,19,22,200,INE002A01018\n'
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w') as z:z.writestr('nested/official.csv',modern)
    data=p.parse_files(security,[('cm.csv',legacy_csv()),('BhavCopy.zip',buf.getvalue())])
    assert len(data.candles)==2 and data.source=='NSE OFFICIAL FILES'
    assert response(data,'1M')['candles'][0]['volume']==300
    with pytest.raises(ProviderError):response(data,'1d',adjusted=True)

@pytest.mark.parametrize('name,data',[('bad.zip',b'not zip'),('bad.csv',b'<html>denied</html>'),('bad.csv',legacy_csv(series='BE')),('bad.csv',legacy_csv().replace(b'INE002A01018',b'INE123A01018')),('bad.csv',legacy_csv().replace(b'10,13,9,12',b'10,8,9,12'))])
def test_nse_source_errors_not_fabricated(security,name,data):
    with pytest.raises(ProviderError):NSEHistoricalProvider().parse_files(security,[(name,data)])

def test_nse_import_api_memory_only(client):
    body={'symbol':'RELIANCE','files':[{'name':'cm.csv','content':base64.b64encode(legacy_csv()).decode()}]}
    r=client.post('/api/nse/import',json=body);assert r.status_code==200
    r=client.get('/api/history',params={'symbol':'RELIANCE','source':'nse','interval':'1M'});assert r.status_code==200 and r.json()['source']=='NSE OFFICIAL FILES'
    client.post('/api/cache/clear')
    assert client.get('/api/history',params={'symbol':'RELIANCE','source':'nse'}).status_code==409
    assert client.post('/api/nse/import',json={**body,'files':[{'name':'bad.csv','content':'@@@'}]}).status_code==422

def test_yfinance_contract_and_memory_metadata(security,monkeypatch,tmp_path):
    import yfinance as yf
    captured={}
    before={p.name for p in tmp_path.iterdir()}
    class Ticker:
        def __init__(self,symbol):captured['symbol']=symbol
        def history(self,**kwargs):captured.update(kwargs);return frame()
    monkeypatch.setattr(yf,'Ticker',Ticker)
    assert YahooFinanceProvider().fetch_daily(security).candles
    assert captured['symbol']=='RELIANCE.NS' and captured['period']=='max' and captured['interval']=='1d'
    assert captured['auto_adjust'] is False and captured['actions'] is True and captured['repair'] is False
    from yfinance import cache
    cache.get_tz_cache().store('RELIANCE.NS','Asia/Kolkata')
    cache.get_cookie_cache().store('basic',{'test':1})
    cache.get_isin_cache().store('isin','ticker')
    assert cache.get_tz_cache().lookup('RELIANCE.NS')=='Asia/Kolkata'
    assert cache.get_cookie_cache().lookup('basic')['cookie']=={'test':1}
    assert {p.name for p in tmp_path.iterdir()}==before
    YahooFinanceProvider().close()
    assert not TZ_CACHE.values and not COOKIE_CACHE.values and not ISIN_CACHE.values

def test_aggregation_performance_decades():
    rows=candles(30000);start=time.perf_counter()
    weekly=aggregate_daily(rows,'1w');monthly=aggregate_daily(rows,'1M')
    assert len(weekly)>4000 and len(monthly)>900
    assert time.perf_counter()-start<2

@pytest.mark.parametrize('error,kind',[
    (TimeoutError('private raw response'),'temporary'),
    (__import__('yfinance').exceptions.YFRateLimitError(),'rate'),
    (__import__('yfinance').exceptions.YFTzMissingError('RELIANCE.NS'),'missing'),
    (__import__('yfinance').exceptions.YFPricesMissingError('RELIANCE.NS',''),'missing'),
    (__import__('yfinance').exceptions.YFTickerMissingError('RELIANCE.NS',''),'missing'),
])
def test_yahoo_network_error_mapping_and_redaction(security,monkeypatch,error,kind):
    import yfinance as yf
    class Ticker:
        def __init__(self,symbol):pass
        def history(self,**kwargs):raise error
    monkeypatch.setattr(yf,'Ticker',Ticker)
    with pytest.raises(ProviderError) as caught:YahooFinanceProvider().fetch_daily(security)
    assert caught.value.kind==kind
    assert 'private raw response' not in str(caught.value)

def test_rate_api_header_and_global_cooldown(tmp_path):
    class Limited(FixtureProvider):
        def fetch_daily(self,row):self.calls+=1;raise ProviderError('Provider throttled','rate',90)
    p=Limited(count=1);app=create_app(tmp_path,TOKEN,p)
    with TestClient(app,headers={'Authorization':'Bearer '+TOKEN}) as c:
        r=c.get('/api/history',params={'symbol':'RELIANCE'});assert r.status_code==429 and r.headers['Retry-After']=='90'
        assert c.get('/api/history',params={'symbol':'TCS'}).status_code==429
        assert p.calls==1

def test_directory_network_failure_retains_cache(app,monkeypatch):
    import app.instruments as instruments
    monkeypatch.delenv('IMT_OFFLINE',raising=False)
    before=app.state.db.count()
    def unavailable(db):raise TimeoutError('network unavailable')
    monkeypatch.setattr(instruments,'refresh',unavailable)
    asyncio.run(instruments.refresh_startup(app.state.db))
    assert app.state.db.count()==before and app.state.db.get('directory_loading') is False
    assert 'Cached directory retained' in app.state.db.get('catalogue_error')

def test_two_request_concurrency_limit(app):
    async def run():
        lock=threading.Lock();running=[0,0]
        class Slow(FixtureProvider):
            def fetch_daily(self,row):
                with lock:running[0]+=1;running[1]=max(running)
                time.sleep(.06)
                with lock:running[0]-=1
                return history()
        s=HistoryService(Slow(count=2),{'min_interval':0,'concurrency':2})
        await asyncio.gather(*[s.get(app.state.db.resolve(x)) for x in ['RELIANCE','TCS','INFY','SBIN']])
        assert running[1]==2
        await s.close()
    asyncio.run(run())

def test_nse_zip_unpacked_limit(security,monkeypatch):
    from app.providers import nse
    monkeypatch.setattr(nse,'MAX_UNPACKED',500)
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('official.csv',b'a'*1000)
    with pytest.raises(ProviderError):NSEHistoricalProvider().parse_files(security,[('official.zip',buf.getvalue())])

def test_current_symbol_rename_uses_stable_directory_identifier(app,client):
    db=app.state.db;w=client.get('/workspace').json();db.put('workspace',w)
    old=db.resolve('RELIANCE');renamed=dict(old,symbol='RELIANCENEW-EQ',base_symbol='RELIANCENEW',yahoo_symbol='RELIANCENEW.NS')
    rows=db.search('',10000);rows=[renamed if r['token']==old['token'] else r for r in rows]
    db.install(rows,db.get('catalogue'))
    restored=restore_workspace(db)
    assert restored['panes'][0]['symbol']=='RELIANCENEW-EQ' and restored['panes'][0]['token']==old['token']
    assert restored['watchlist'][0]['symbol']=='RELIANCENEW-EQ'

def test_official_security_wise_bhavcopy_format(security):
    content=b'SYMBOL,SERIES,DATE1,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,TTL_TRD_QNTY\nRELIANCE,EQ,05-Jan-2024,10,13,9,12,100\n'
    result=NSEHistoricalProvider().parse_files(security,[('sec_bhavdata.csv',content)])
    assert len(result.candles)==1 and result.candles[0]['volume']==100
