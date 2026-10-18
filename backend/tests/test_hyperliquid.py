import asyncio,copy,json,time
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.database import Database
from app.request_budget import RequestBudget
from app.providers.hyperliquid import *
from app.markets import instrument,entry
from app.models import SymbolEntry
from app.screener_conditions import completed_rows
from app.indicators import IndicatorCalculator
from fixtures import FixtureProvider
from hyperliquid_fixtures import SPOT,PERPS,CATEGORIES,ANNOTATIONS,PublicFixture,raw_candles
from test_direct_history import TOKEN

def catalogue():return parse_catalogue(copy.deepcopy(SPOT),copy.deepcopy(PERPS),copy.deepcopy(CATEGORIES),copy.deepcopy(ANNOTATIONS),time.time())
def market(native='BTC',kind='perpetual'):return next(r for r in catalogue()[0] if r['native_id']==native and r['market_type']==kind)
@pytest.fixture
def transport():return PublicFixture()
@pytest.fixture
def application(tmp_path,transport):
 client=HyperliquidClient(RequestBudget(2),transport,min_interval=0,weight_limit=100000)
 app=create_app(tmp_path,TOKEN,FixtureProvider(count=100),client);app.state.history.config['min_interval']=0
 return app
@pytest.fixture
def client(application):
 with TestClient(application,headers={'Authorization':'Bearer '+TOKEN}) as c:yield c

def test_official_parser_and_hip3_classification():
 rows,excluded=catalogue();assert len(rows)==6;assert {r['native_id'] for r in excluded}=={'flx:COIN','flx:UNKNOWN'}
 assert market('@1','spot')['base_asset']=='UBTC';assert market('flx:BTC')['official_category']=='crypto'
 assert market('OLD')['status']=='delisted';assert market('BTC')['canonical_id']!=market('@1','spot')['canonical_id']
 assert len({r['canonical_id'] for r in rows})==len(rows)
@pytest.mark.parametrize('shape',['metadata','documented_pairs'])
def test_documented_metadata_shapes(shape):
 values=copy.deepcopy(PERPS)
 if shape=='documented_pairs':values=[[v,[]] for v in values]
 assert len(parse_catalogue(SPOT,values,CATEGORIES,ANNOTATIONS,time.time())[0])==6
@pytest.mark.parametrize('mutation',['token_duplicate','unknown_token','pair_native','wrong_purr','duplicate_market','bad_precision','missing_quote'])
def test_bad_metadata_rejected_or_excluded(mutation):
 spot=copy.deepcopy(SPOT);perps=copy.deepcopy(PERPS)
 if mutation=='token_duplicate':spot['tokens'].append(spot['tokens'][0])
 if mutation=='unknown_token':spot['universe'][0]['tokens']=[10,0]
 if mutation=='pair_native':spot['universe'][1]['name']='UBTC'
 if mutation=='wrong_purr':spot['universe'][1]['name']='PURR/USDC'
 if mutation=='duplicate_market':perps[0]['universe'].append(perps[0]['universe'][0])
 if mutation=='bad_precision':spot['tokens'][0]['szDecimals']=True
 if mutation=='missing_quote':perps[0]['collateralToken']=100
 if mutation=='missing_quote':
  rows,ex=parse_catalogue(spot,perps,CATEGORIES,ANNOTATIONS,time.time());assert all(r['native_id']!='BTC' for r in rows);assert ex
 else:
  with pytest.raises(ProviderError):parse_catalogue(spot,perps,CATEGORIES,ANNOTATIONS,time.time())
def test_conflicting_and_unclassified_builder_never_crypto():
 rows,_=parse_catalogue(SPOT,PERPS,CATEGORIES,[['flx:BTC',{'category':'stocks'}]],time.time());assert not any(r.get('dex') for r in rows)
@pytest.mark.parametrize('interval',INTERVALS)
def test_all_nine_utc_native_intervals(interval):
 now=time.time();rows,precision=normalize_candles(raw_candles('BTC',interval,now),market(),interval,now)
 assert len(rows)==100 and rows==sorted(rows,key=lambda r:r['time']);assert len({r['time'] for r in rows})==100
 assert all(r['end_time']>r['time'] for r in rows);assert precision==0
 assert len(completed_rows(rows,market(),interval,rows[-1]['time']+1))==99
@pytest.mark.parametrize('field,value',[('o','NaN'),('c','Infinity'),('v','-1'),('o',True),('h','0'),('l','104'),('s','ETH'),('i','5m'),('t',1),('T',5),('o',None)])
def test_invalid_candle_rejected(field,value):
 rows=raw_candles('BTC','1h',count=2);rows[0][field]=value
 with pytest.raises(ProviderError):normalize_candles(rows,market(),'1h',time.time())
def test_unsorted_exact_duplicates_normalized_and_gaps_retained():
 rows=raw_candles('BTC','1h',count=4);result,_=normalize_candles([rows[3],rows[0],rows[0],rows[2]],market(),'1h',time.time())
 assert len(result)==3 and result[1]['time']-result[0]['time']==7200
 rows.append(dict(rows[0],c='101'))
 with pytest.raises(ProviderError,match='Conflicting'):normalize_candles(rows,market(),'1h',time.time())
@pytest.mark.parametrize('body',[{'type':'order'},{'type':'clearinghouseState','user':'0x1'},{'type':'meta','user':'0x1'},{'type':'candleSnapshot','req':{'coin':'BTC','interval':'2m','startTime':0,'endTime':1}}])
def test_public_request_allowlist(body):
 with pytest.raises(ProviderError):request_body(body)
def test_singleflight_metadata_persistence_and_expiry(tmp_path,transport):
 async def run():
  db=Database(tmp_path/'catalogue.sqlite3');client=HyperliquidClient(RequestBudget(2),transport,min_interval=0,weight_limit=100000);cat=HyperliquidCatalogue(db,client)
  await asyncio.gather(*(cat.ensure() for _ in range(8)));assert len(transport.calls)==4 and cat.status()['spot']==2
  saved=HyperliquidCatalogue(db,client);assert saved.fresh();assert saved.status()['perpetual']==3
  saved.clock=lambda:cat.fetched_at+3601;assert not saved.candidates()
  transport.fail=ProviderError('denied','access')
  with pytest.raises(ProviderError):await saved.ensure()
  assert saved.rows and not saved.candidates() and saved.retry_at>saved.clock()
  value=db.get('hyperliquid_catalogue_v1');assert 'candles' not in json.dumps(value)
 asyncio.run(run())
def test_native_mapping_revalidation(application,transport):
 async def run():
  cat=application.state.registry.hyperliquid;await cat.ensure();r=copy.deepcopy(cat.rows[market()['canonical_id']]);r['native_mapping']='changed'
  with pytest.raises(ProviderError,match='mapping changed'):await cat.validate(r)
 asyncio.run(run())
@pytest.mark.parametrize('interval',INTERVALS)
def test_real_adapter_fixture_all_timeframes(client,application,transport,interval):
 assert client.get('/api/hyperliquid/catalogue').status_code==200
 r=client.get('/api/history',params={'symbol':market()['canonical_id'],'interval':interval}).json()
 assert r['source']=='HYPERLIQUID' and r['provider']=='hyperliquid' and r['interval']==interval and len(r['candles'])==100
 assert r['lookback_days'] is None and 'Yahoo period' not in r['notice'] and '4h uses 15m' not in r['notice']
 assert application.state.history.provider.calls==0
 assert transport.calls[-1]['req']['interval']==interval
@pytest.mark.parametrize('native,kind',[('BTC','perpetual'),('@1','spot'),('flx:BTC','perpetual')])
def test_search_watchlist_csv_verified_identities(client,application,native,kind):
 result=client.get('/api/instruments/discover',params={'category':'crypto_'+kind,'q':native}).json();assert any(r['native_id']==native for r in result['results'])
 r=market(native,kind);csv=client.post('/api/watchlists/import/preview',json={'content':f'symbol,provider,asset_type\n{native},hyperliquid,crypto\n'}).json();assert csv['counts']['valid']==1
 w=client.get('/workspace').json();created=client.post('/api/watchlists/mutate',json={'action':'create','name':'HL Test','revision':w['watchlist_revision']}).json()
 w=created.get('workspace',created);assert client.post('/api/watchlists/mutate',json={'action':'add','id':w['active_watchlist'],'instrument':r['canonical_id'],'revision':w['watchlist_revision']}).status_code==200
 assert SymbolEntry.model_validate(entry(r)).native_mapping==r['native_mapping']
def test_csv_spot_perpetual_ambiguity_explicit_resolution(client):
 preview=client.post('/api/watchlists/import/preview',json={'content':'symbol,provider,asset_type\nPURR,hyperliquid,crypto\n'}).json();assert preview['counts']['ambiguous']==1
 row=market('PURR/USDC','spot');resolved=client.post('/api/watchlists/import/preview',json={'content':'symbol,provider,asset_type\nPURR,hyperliquid,crypto\n','resolutions':{'2':row['canonical_id']}}).json();assert resolved['counts']['valid']==1
@pytest.mark.parametrize('market_type',['crypto','crypto_spot','crypto_perpetual'])
def test_crypto_search_no_yahoo(client,application,market_type,monkeypatch):
 monkeypatch.setattr(application.state.discovery,'remote',lambda q:pytest.fail('Yahoo crypto search'))
 result=client.get('/api/instruments/discover',params={'q':'BTC','category':market_type,'limit':1}).json();assert len(result['results'])==1
 assert all(r['provider']=='hyperliquid' for r in result['results'])
def test_pending_legacy_never_fallback(client,application):
 r=client.get('/api/history',params={'symbol':'BTC-USD'});assert r.status_code==409 and application.state.history.provider.calls==0
@pytest.mark.parametrize('symbol',['RELIANCE.NS','RELIANCE.BO','AAPL','EURUSD=X','^GSPC','GC=F'])
def test_yahoo_isolation(client,application,transport,symbol):
 r=client.get('/api/history',params={'symbol':symbol});assert r.status_code==200 and application.state.history.provider.calls==1 and not transport.calls
 def run():return application.state.history.get(application.state.registry.resolve(symbol),source='hyperliquid')
 with pytest.raises(ProviderError):asyncio.run(run())
def test_multichart_shares_cache_and_refresh_does_not_yahoo(application,transport):
 async def run():
  s=application.state.history;r=market();results=await asyncio.gather(*(s.get(r,'4h') for _ in range(8)))
  assert all(v['source']=='HYPERLIQUID' for v in results);assert len([c for c in transport.calls if c['type']=='candleSnapshot'])==1
  assert s.metrics['deduplicated']>=7
  await s.incremental(r,'4h');n=len(transport.calls);await s.incremental(r,'4h',automatic=True);assert len(transport.calls)==n
  assert s.provider.calls==0 and len(s.cache.entries)==1
  await s.close();assert not s.cache.entries and not s.quote_cache.entries
 asyncio.run(run())
def test_migration_preview_verified_without_automatic_commit(client,application):
 before=application.state.db.get('crypto_migration_postponed');r=client.get('/api/crypto-migration/preview').json();assert r['metadata_available']
 assert all(c['provider']=='hyperliquid' for row in r['entries'] for c in row['candidates'])
 assert application.state.db.get('crypto_migration_postponed')==before
 assert client.post('/api/crypto-migration/commit',json={'preview_hash':r['preview_hash'],'selections':{},'confirm':False}).status_code==422
 result=client.get('/api/crypto-migration/candidates',params={'q':'flx:BTC','market_type':'perpetual'}).json();assert len(result['results'])==1
@pytest.mark.parametrize('failure',['empty','invalid','temporary','rate','access'])
def test_provider_errors_no_fallback(application,transport,failure):
 async def run():
  s=application.state.history;await s.hyperliquid.catalogue.ensure()
  if failure=='empty':s.hyperliquid.client.transport=lambda body:[]
  elif failure=='invalid':s.hyperliquid.client.transport=lambda body:{}
  else:transport.fail=ProviderError('test '+failure,failure,60 if failure=='rate' else 0)
  async def no_sleep(seconds):pass
  s.hyperliquid.client.sleep=no_sleep
  with pytest.raises(ProviderError):await s.get(market())
  assert s.provider.calls==0 and not s.cache.entries
  if failure=='temporary':assert s.hyperliquid.client.metrics['retries']==2
  if failure=='rate':assert s.hyperliquid.client.status()['cooldown_seconds']>0
 asyncio.run(run())
def test_conservative_budget_and_no_cooldown_bypass():
 async def run():
  calls=[];c=HyperliquidClient(RequestBudget(2),lambda body:calls.append(body) or {},min_interval=0,weight_limit=20)
  await c.request({'type':'meta'})
  with pytest.raises(ProviderError) as e:await c.request({'type':'meta'})
  assert e.value.kind=='rate' and len(calls)==1
 asyncio.run(run())
def test_indicator_and_replay_prefix_compatibility():
 rows,_=normalize_candles(raw_candles('BTC','1h'),market(),'1h',time.time());cutoff=rows[50]['time']
 prefix=completed_rows(rows,market(),'1h',cutoff);assert len(prefix)==50
 configs=[{'id':kind,'kind':kind,'length':20,'anchor':'week'} for kind in ['SMA','EMA','WMA','VWMA','RSI','MACD','STOCHRSI','BB','ATR','SUPERTREND','VWAP']]
 result=IndicatorCalculator.calculate(rows,configs,'1h','UTC')
 assert len({s['id'] for s in result['series']})==11
 assert all(any(p['value'] is not None for s in result['series'] if s['id']==cfg['id'] for p in s['points']) for cfg in configs)
 sma=next(s for s in result['series'] if s['id']=='SMA');assert sma['points'][-1]['value']==pytest.approx(sum(r['close'] for r in rows[-20:])/20)
 first=IndicatorCalculator.calculate(prefix,configs,'1h','UTC')
 changed=copy.deepcopy(rows)
 for r in changed[50:]:r['close']*=10
 assert first==IndicatorCalculator.calculate(completed_rows(changed,market(),'1h',cutoff),configs,'1h','UTC')
 assert prefix==rows[:50]

@pytest.mark.parametrize('interval',INTERVALS)
def test_alert_completion_native_windows(interval):
 from app.alerts import candle_end
 rows,_=normalize_candles(raw_candles('BTC',interval),market(),interval,time.time())
 assert candle_end(rows[-1]['time'],market(),interval)==rows[-1]['end_time']
def test_quote_source_and_provenance_query(client,application):
 client.get('/api/hyperliquid/catalogue');r=market()
 assert client.get('/api/history',params={'symbol':r['canonical_id'],'native_mapping':'changed'}).status_code==502
 async def run():
  from app.refresh import quote_value
  h,_=await application.state.history.quote(r)
  q=quote_value(h,r,time.time());assert q['source']=='HYPERLIQUID' and 'Yahoo' not in q['notice']
  assert q['timestamp_kind']=='native_candle_start' and q['last_completed_bar_time']==h.candles[-2]['time']
 asyncio.run(run())
def test_discovery_pagination_no_missing_markets(client):
 first=client.get('/api/instruments/discover',params={'category':'crypto','limit':2}).json();assert first['total']==5 and first['next_offset']==2
 seen=first['results'];offset=2
 while offset is not None:
  value=client.get('/api/instruments/discover',params={'category':'crypto','limit':2,'offset':offset}).json();seen+=value['results'];offset=value['next_offset']
 assert len({r['canonical_id'] for r in seen})==5

def test_cancel_outdated_socket_holds_concurrency_until_finished(tmp_path):
 import threading
 async def run():
  started=threading.Event();release=threading.Event();budget=RequestBudget(1)
  def transport(body):started.set();release.wait(2);return {}
  client=HyperliquidClient(budget,transport,min_interval=0)
  task=asyncio.create_task(client.request({'type':'meta'}))
  await asyncio.to_thread(started.wait,1);task.cancel();await asyncio.sleep(.01)
  assert not task.done() # Cancellation cannot abandon the counted live socket.
  release.set()
  with pytest.raises(asyncio.CancelledError):await task
  assert budget.active==0
 asyncio.run(run())

def test_noncrypto_csv_independent_of_crypto_metadata_failure(client,transport):
 transport.fail=ProviderError('crypto offline','access')
 value=client.post('/api/watchlists/import/preview',json={'content':'symbol,provider,asset_type\nAAPL,yahoo,equity\nRELIANCE.NS,yahoo,equity\n'}).json()
 assert value['counts']['valid']==2 and not transport.calls

def test_mixed_csv_crypto_outage_retains_noncrypto_rows(client,transport):
 transport.fail=ProviderError('crypto offline','access')
 value=client.post('/api/watchlists/import/preview',json={'content':'symbol,provider,asset_type\nAAPL,yahoo,equity\n@1,hyperliquid,crypto\n'}).json()
 assert value['counts']['valid']==1 and value['counts']['failed']==1 and 'Crypto metadata unavailable' in value['warning']
 assert all(b['type']!='candleSnapshot' for b in transport.calls)

@pytest.mark.parametrize('interval',['1w','1M'])
def test_native_date_range_selects_overlapping_whole_buckets(interval):
 from app.history import response
 from app.providers.base import History
 rows,_=normalize_candles(raw_candles('BTC',interval,count=3),market(),interval,time.time())
 middle=rows[1];day=datetime.fromtimestamp(middle['time']+86400,timezone.utc).date().isoformat()
 value=response(History(rows,'HYPERLIQUID',interval=interval,metadata={'native_interval':True,'timezone':'UTC'}),interval,day,day,security=market())
 assert value['candles']==[middle] and value['candles'][0]['time']==middle['time']
