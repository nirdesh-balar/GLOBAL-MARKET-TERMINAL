"""Offline global tests; synthetic bars never establish Yahoo availability."""
import asyncio
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
import pandas as pd
import pytest
from app.markets import instrument,samples,MARKETS,canonical,entry
from app.main import restore_workspace
from app.providers.yahoo import normalize_ohlcv
from app.providers.base import ProviderError,History
from app.sessions import aggregate_market_four_hour,segments
from app.history import HistoryService,response
from app.models import Workspace
from fixtures import FixtureProvider

@pytest.mark.parametrize('category',[k for k,_ in MARKETS if k not in ('favourites','indices','stocks')])
def test_categories(category):
    assert any(r['category']==category for r in samples())
    assert all(r['status']==('migration_required' if r['kind']=='crypto' else 'unverified') for r in samples())

@pytest.mark.parametrize('symbol,kind,currency,zone',[('AAPL','equity','USD','America/New_York'),('BTC-USD','crypto','USD','UTC'),('EURUSD=X','forex','','America/New_York'),('GC=F','future','USD','America/Chicago'),('SPY','etf','USD','America/New_York'),('7203.T','equity','JPY','Asia/Tokyo'),('RELIANCE.BO','equity','INR','Asia/Kolkata')])
def test_metadata(symbol,kind,currency,zone):
 r=next(r for r in samples() if r['symbol']==symbol)
 assert (r['kind'],r['currency'],r['timezone'])==(kind,currency,zone)
 assert r['canonical_id']==canonical(symbol,r['exchange'],kind)

def test_duplicate_tickers_disambiguated(app):
 r=app.state.registry
 rows=r.discover([dict(symbol='DUP',exchange='NYQ',quoteType='EQUITY'),dict(symbol='DUP',exchange='LSE',quoteType='EQUITY')])
 assert rows[0]['id']!=rows[1]['id'];assert r.resolve('DUP') is None
 for row in rows:assert r.resolve(row['id'])['exchange']==row['exchange']
 assert len(r.search('DUP'))==2

def test_yahoo_search_dynamic_not_sample_limited(client,app):
 app.state.discovery.remote=lambda q:[dict(symbol='NEWSEARCH',longname='Newly Discovered Company',exchange='NMS',quoteType='EQUITY',currency='USD')]
 value=client.get('/api/instruments/discover',params={'q':'NEWSEARCH'}).json()
 assert value['results'][0]['symbol']=='NEWSEARCH' and value['results'][0]['status']=='unverified'
 assert app.state.registry.resolve(value['results'][0]['id'])
 assert client.get('/api/instruments/discover',params={'q':'NEWSEARCH','category':'crypto'}).json()['results']==[]

def test_search_failure_keeps_directory(client,app):
 def fail(q):raise OSError('offline')
 app.state.discovery.remote=fail
 value=client.get('/api/instruments/discover',params={'q':'RELIANCE'}).json()
 assert value['warning'] and any(r['exchange']=='NSE' for r in value['results'])
 assert app.state.history.metrics['provider_requests']==0

def test_country_exchange_asset_search(app):
 registry=app.state.registry
 assert registry.search('Japan')[0]['country']=='Japan'
 assert all(r['kind']=='crypto' for r in registry.search('crypto'))
 assert registry.search('NASDAQ') and registry.search('Australia')
 assert registry.resolve('RELIANCE.NS')['yahoo_symbol']=='RELIANCE.NS'

def test_watchlist_migration_keeps_saved_symbols_and_state(client,app):
 old=client.get('/workspace').json();old['watchlists']=old['watchlists'][:3]
 old['watchlists'][1]['name']='NSE Stocks';old['active_watchlist']='favourites';old['layout']=4
 old['watchlists'].append(dict(id='my-custom',name='Private research',items=[old['panes'][0]],market=None))
 app.state.db.put('workspace',old)
 w=restore_workspace(app.state.db,app.state.registry)
 assert len(w['watchlists'])==11 and w['layout']==4 and w['active_watchlist']=='favourites'
 assert w['watchlists'][1]['name']=='NSE Stocks'
 assert [r['symbol'] for r in w['watchlists'][1]['items']]==[r['symbol'] for r in old['watchlists'][1]['items']]
 assert w['watchlists'][3]['name']=='Private research'
 assert restore_workspace(app.state.db,app.state.registry)==w

def test_global_layout_save_restore(client):
 w=client.get('/workspace').json();w['layout']=4
 for i,symbol in enumerate(['AAPL','BTC-USD','GC=F','SPY']):
  r=next(r for r in samples() if r['symbol']==symbol);w['panes'][i].update(entry(r))
 assert client.put('/workspace',json=w).status_code==200
 new=client.get('/workspace').json()
 assert [r['symbol'] for r in new['panes'][:4]]==['AAPL','BTC-USD','GC=F','SPY']
 assert new['panes'][0]['timezone']!=new['panes'][1]['timezone']

def bar(t,volume=100):return dict(time=int(t.timestamp()),open=10.,high=12.,low=9.,close=11.,volume=volume,adj_close=11.)
def session_rows(day,zone,start,end):
 a=datetime.fromisoformat(day+'T'+start).replace(tzinfo=ZoneInfo(zone));b=datetime.fromisoformat(day+'T'+end).replace(tzinfo=ZoneInfo(zone))
 return [bar(a+timedelta(minutes=15*i)) for i in range(int((b-a).total_seconds()/900))]

@pytest.mark.parametrize('day,utc_open',[('2024-03-08','14:30'),('2024-03-11','13:30')])
def test_nyse_dst_four_hour(day,utc_open):
 r=next(r for r in samples() if r['symbol']=='AAPL');rows=session_rows(day,r['timezone'],'09:30','16:00')
 out,notice=aggregate_market_four_hour(rows,r)
 assert datetime.fromtimestamp(out[0]['time'],timezone.utc).strftime('%H:%M')==utc_open
 assert len(out)==2 and all(not x['partial'] for x in out) and out[1]['sample_count']==10

def test_nyse_holiday_early_close_and_missing_bar():
 r=next(r for r in samples() if r['symbol']=='AAPL')
 rows=session_rows('2024-11-29',r['timezone'],'09:30','13:00')
 out,_=aggregate_market_four_hour(rows,r);assert len(out)==1 and out[0]['sample_count']==14 and not out[0]['partial']
 out,_=aggregate_market_four_hour(rows[1:],r);assert out[0]['partial']
 with pytest.raises(ProviderError):aggregate_market_four_hour(session_rows('2024-12-25',r['timezone'],'09:30','16:00'),r)

def test_hong_kong_lunch_break():
 r=next(r for r in samples() if r['symbol']=='0700.HK')
 rows=session_rows('2024-01-03',r['timezone'],'09:30','12:00')+session_rows('2024-01-03',r['timezone'],'13:00','16:00')
 out,_=aggregate_market_four_hour(rows,r)
 assert len(out)==2 and out[0]['expected_end']<=out[1]['time'] and out[1]['sample_count']==12

def test_crypto_weekends_utc_four_hour():
 r=next(r for r in samples() if r['symbol']=='BTC-USD')
 rows=session_rows('2024-01-06','UTC','00:00','23:45')+[bar(datetime(2024,1,6,23,45,tzinfo=timezone.utc))]
 out,_=aggregate_market_four_hour(rows,r)
 assert len(out)==6 and all(x['sample_count']==16 for x in out)
 assert datetime.fromtimestamp(out[0]['time'],timezone.utc).weekday()==5

@pytest.mark.parametrize('symbol',['GC=F','EURUSD=X'])
def test_futures_forex_require_verified_periods(symbol):
 r=next(r for r in samples() if r['symbol']==symbol);rows=session_rows('2024-03-11',r['timezone'],'09:00','17:00')
 with pytest.raises(ProviderError,match='Verified session bounds'):aggregate_market_four_hour(rows,r)
 periods={'regular':[[{'start':rows[0]['time'],'end':rows[-1]['time']+900}]]}
 out,_=aggregate_market_four_hour(rows,r,periods);assert len(out)==2
 if r['kind']=='future':assert 'not a tradable expiry' in r['contract']

def test_daily_date_original_market_timezone_and_fx_volume():
 frame=pd.DataFrame(dict(Open=[1.1],High=[1.2],Low=[1.],Close=[1.15],Volume=[999]),index=pd.DatetimeIndex(['2024-03-11 23:30'],tz='America/New_York'))
 history=normalize_ohlcv(frame,interval='1d',kind='forex',market_timezone='America/New_York')
 assert datetime.fromtimestamp(history.candles[0]['time'],timezone.utc).date().isoformat()=='2024-03-11'
 assert history.candles[0]['volume'] is None
 assert next(r for r in samples() if r['symbol']=='EURUSD=X')['precision']==5

def test_intraday_range_dst_local_day():
 r=next(r for r in samples() if r['symbol']=='AAPL')
 rows=session_rows('2024-03-11',r['timezone'],'09:30','16:00')
 h=History(rows,'fixture',interval='15m',metadata=dict(timezone=r['timezone']))
 out=response(h,'15m','2024-03-11','2024-03-11',security=r)
 assert len(out['candles'])==26 and out['timezone']==r['timezone']

def test_canonical_memory_cache_sharing():
 async def run():
  p=FixtureProvider(delay=.01);s=HistoryService(p,dict(min_interval=0));r=next(r for r in samples() if r['symbol']=='AAPL')
  a,b=await asyncio.gather(s.get(r),s.get(dict(r,id='alias')))
  assert p.calls==1 and a['candles']==b['candles'] and s.metrics['deduplicated']==1
  await s.close();assert not s.cache.entries
 asyncio.run(run())

def test_no_global_nse_fallback(client):
 for symbol in ['AAPL','BTC-USD','RELIANCE.BO']:
  assert client.get('/api/history',params={'symbol':symbol,'source':'nse'}).status_code==422

def test_stock_details_remains_absent():
 from pathlib import Path
 source=(Path(__file__).parents[2]/'desktop/src/components/WatchlistSidebar.tsx').read_text()
 assert 'SymbolDetails' not in source and 'Coverage:' not in source and 'Historical bars' not in source
 assert 'data-testid="watchlist-rows"' in source

from test_direct_history import app,client


def test_other_us_exchange_identity():
 a=instrument(dict(symbol='DUP',exchange='PCX',quoteType='EQUITY'))
 b=instrument(dict(symbol='DUP',exchange='PNK',quoteType='EQUITY'))
 assert a['canonical_id']!=b['canonical_id']

def test_negative_futures_candle_is_real_data():
 frame=pd.DataFrame(dict(Open=[-20.],High=[-15.],Low=[-40.],Close=[-30.],Volume=[10]),index=pd.DatetimeIndex(['2020-04-20'],tz='America/Chicago'))
 h=normalize_ohlcv(frame,kind='future',market_timezone='America/Chicago')
 assert h.candles[0]['close']==-30.

def test_search_singleflight_and_rate_limit(client,app):
 from yfinance.exceptions import YFRateLimitError
 calls=[]
 def rate(q):calls.append(q);raise YFRateLimitError()
 app.state.discovery.remote=rate
 value=client.get('/api/instruments/discover',params={'q':'AAPL'}).json()
 assert value['warning'] and app.state.history.cooldown>0
 value=client.get('/api/instruments/discover',params={'q':'MSFT'}).json()
 assert value['warning'] and len(calls)==1 # Shared history/search cooldown.


def test_full_legacy_list_capacity_migration(client,app):
 w=client.get('/workspace').json();w['watchlists']=w['watchlists'][:3]+[dict(id=f'custom-{i}',name=f'Research {i}',items=[],market=None) for i in range(27)]
 app.state.db.put('workspace',w)
 new=restore_workspace(app.state.db,app.state.registry)
 assert len(new['watchlists'])==37
 assert all(any(v['id']==r['id'] for v in new['watchlists']) for r in w['watchlists'])
 assert all(any(v['id']==k for v in new['watchlists']) for k,_ in MARKETS)


def test_missing_global_yahoo_history_records_error_without_prices(client,app,monkeypatch):
 from app.providers.yahoo import YahooFinanceProvider
 import app.providers.yahoo as yahoo
 class EmptyTicker:
  def __init__(self,symbol):pass
  def history(self,**kwargs):return pd.DataFrame()
 monkeypatch.setattr(yahoo.yf,'Ticker',EmptyTicker)
 app.state.history.provider=YahooFinanceProvider()
 value=client.get('/api/history',params={'symbol':'AAPL'})
 assert value.status_code==404 and value.json()['kind']=='missing'
 assert not app.state.history.cache.entries
 assert app.state.registry.resolve('AAPL')['status']=='unavailable'
