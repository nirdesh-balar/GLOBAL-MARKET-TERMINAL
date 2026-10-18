import asyncio,copy,json,time
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.history import response
from app.hyperliquid_stream import *
from app.providers.hyperliquid import HyperliquidClient
from app.request_budget import RequestBudget
from app.markets import instrument
from app.alert_models import AlertDefinition,AlertSettings
from app.screener_conditions import ConditionGroup,Condition
from fixtures import FixtureProvider
from hyperliquid_fixtures import PublicFixture,raw_candles
from stream_fixtures import FixtureConnector
from test_direct_history import TOKEN
from test_hyperliquid import market

def consumer(row=None,owner='chart:0',feed='candle',interval='1m'):
 r=row or market();return dict(owner=owner,identity=r['canonical_id'],native_mapping=r['native_mapping'],feed=feed,interval=interval)
async def setup(tmp_path,clock=time.time):
 transport=PublicFixture();connector=FixtureConnector();client=HyperliquidClient(RequestBudget(2),transport,min_interval=0,weight_limit=100000)
 app=create_app(tmp_path,TOKEN,FixtureProvider(count=100),client,connector);m=app.state.streams;m.clock=clock;m.jitter=lambda:0
 await app.state.registry.hyperliquid.ensure();return app,m,connector,transport
async def settle():await asyncio.sleep(.05)
@pytest.mark.parametrize('interval',INTERVALS)
@pytest.mark.parametrize('native,kind',[('BTC','perpetual'),('@1','spot')])
def test_public_candle_schema(interval,native,kind):
 r=market(native,kind);assert wire('subscribe',subscription('candle',r,interval))==dict(method='subscribe',subscription=dict(type='candle',coin=native,interval=interval))
 assert wire('unsubscribe',subscription('candle',r,interval))['method']=='unsubscribe'
@pytest.mark.parametrize('feed',['allMids','userFills','clearinghouseState','orderUpdates','post','l2Book','activeAssetData'])
def test_disallowed_feed(feed):
 with pytest.raises(ProviderError):subscription(feed,market(),'1m')
 with pytest.raises(ProviderError):wire('subscribe',{'type':feed,'coin':'BTC'})
@pytest.mark.parametrize('method',['order','post','exchange','approveAgent','subscribeAccount'])
def test_no_execution_messages(method):
 with pytest.raises(ProviderError):wire(method,{'type':'trades','coin':'BTC'})
@pytest.mark.parametrize('field,value',[('user','0xabc'),('signature','abc'),('wallet','abc'),('dex','other')])
def test_private_subscription_fields_forbidden(field,value):
 with pytest.raises(ProviderError):wire('subscribe',dict(type='trades',coin='BTC',**{field:value}))
def test_noncrypto_and_legacy_cannot_subscribe():
 for r in [instrument(dict(symbol='AAPL',exchange='NMS',quoteType='EQUITY')),instrument(dict(symbol='BTC-USD',exchange='CCC',quoteType='CRYPTOCURRENCY'))]:
  with pytest.raises(ProviderError):subscription('trades',r)
@pytest.mark.parametrize('native,kind',[('BTC','perpetual'),('@1','spot')])
def test_live_price_utc_native_units(native,kind):
 now=time.time();r=market(native,kind);value=trade_price([dict(coin=native,time=int(now*1000),tid=12,px='80234.12',sz='.3')],r,now)[0]
 assert value['price']==80234.12 and abs(value['time']-now)<.001
@pytest.mark.parametrize('field,value',[('px','NaN'),('px',0),('px',True),('sz',-1),('sz','Infinity'),('time',True),('time',99999999999999999),('tid',-1),('coin','ETH')])
def test_malformed_trade(field,value):
 r=dict(coin='BTC',time=int(time.time()*1000),tid=1,px='100',sz='1');r[field]=value
 with pytest.raises(ProviderError):trade_price([r],market(),time.time())
def test_trade_dedup_out_of_order_and_no_invented_reference(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);r=market();f=Feed(r,'trades',owners={'watchlist:one'});k=feed_key(r,'trades');m.feeds[k]=f
  now=int(time.time()*1000);data=dict(coin='BTC',time=now,tid=1,px='100',sz='.1')
  m.receive(dict(channel='trades',data=[data,data]));assert m.metrics['trade_updates']==1 and m.metrics['duplicates']==1
  m.receive(dict(channel='trades',data=[dict(data,time=now-100,tid=2,px='90')]))
  assert f.quote['price']==100 and f.quote['previous_close'] is f.quote['change'] is f.quote['volume'] is None
  assert f.quote['currency']=='USDC' and f.quote['timestamp_kind']=='provider_trade_time'
  assert f.received_at>=f.market_time and m.metrics['out_of_order']==1;await m.close();await app.state.history.close()
 asyncio.run(run())
@pytest.mark.parametrize('interval',INTERVALS)
def test_live_revision_and_new_candle_math(tmp_path,interval):
 async def run():
  now=[time.time()];app,m,c,t=await setup(tmp_path,lambda:now[0]);r=market();h,_=await app.state.history.daily(r,interval=interval)
  f=Feed(r,'candle',interval,owners={'chart:0'},candle=h.candles[-1]);k=feed_key(r,'candle',interval);m.feeds[k]=f
  raw=raw_candles('BTC',interval,count=100)[-1];raw.update(c='201.5',v='1200',n=20)
  m.receive(dict(channel='candle',data=raw));assert app.state.history.cache.get(app.state.history.key(r,interval=interval)).candles[-1]['close']==201.5
  count=len(h.candles);m.receive(dict(channel='candle',data=raw));assert len(h.candles)==count
  nxt=dict(raw,t=raw['t']+INTERVALS[interval]*1000,T=raw['T']+INTERVALS[interval]*1000,o='201.5',h='203',l='200',c='202',v='1',n=1);now[0]=nxt['t']/1000+1
  m.receive(dict(channel='candle',data=nxt));assert h.candles[-1]['time']==nxt['t']//1000 and h.candles[-1]['volume']==1 and len(h.candles)==count+1
  assert m.metrics['candle_appends']==1;await m.close();await app.state.history.close()
 asyncio.run(run())
def test_backward_volume_and_trade_counter_cannot_overwrite(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);r=market();h,_=await app.state.history.daily(r,interval='1m');f=Feed(r,'candle','1m',candle=h.candles[-1],trades_count=100);k=feed_key(r,'candle','1m');m.feeds[k]=f;f.reconcile_at=time.time()
  raw=raw_candles('BTC','1m')[-1];raw.update(v='1',n=1);m.receive(dict(channel='candle',data=raw));assert h.candles[-1]['volume']==1099 and m.metrics['out_of_order']==1
  await m.close();await app.state.history.close()
 asyncio.run(run())
def test_shared_refcounts_subscribe_unsubscribe_and_shutdown(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);r=market();await app.state.history.daily(r,interval='1m')
  items=[consumer(owner='chart:'+str(i)) for i in range(8)];await m.plan(items)
  await asyncio.sleep(.8);assert m.status()['connection_count']==1 and m.status()['subscriptions']==1 and m.status()['consumers']==8
  assert m.metrics['sent_subscribe']==1 and m.metrics['candle_updates']>0
  await m.plan(items[:2]);await asyncio.sleep(.1);assert m.metrics['sent_unsubscribe']==0
  await m.plan([]);await asyncio.sleep(.2);assert m.metrics['sent_unsubscribe']==1
  await m.close();assert m.status()['subscriptions']==0 and m.socket is None
  assert not any(b.get('user') for ws in c.sockets for b in ws.sent);await app.state.history.close()
 asyncio.run(run())
def test_timeframe_watchlist_switch_and_no_universe_feed(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);await app.state.history.daily(market(),interval='1m')
  await m.plan([consumer(),consumer(market('@1','spot'),'watchlist:A','trades','')]);await asyncio.sleep(.5)
  await m.plan([consumer(interval='5m'),consumer(market(),'watchlist:B','trades','')]);await asyncio.sleep(1.3)
  assert len(m.feeds)==2 and all(f.sub()['type'] in ('candle','trades') for f in m.feeds.values())
  assert m.metrics['connections']==1 and m.metrics['sent_unsubscribe']==2;await m.close();await app.state.history.close()
 asyncio.run(run())
def test_reconnect_reconciles_once_and_resubscribes(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);await app.state.history.daily(market(),interval='1m');await m.plan([consumer(),consumer(owner='chart:1')]);await asyncio.sleep(.5)
  await c.sockets[0].close();await asyncio.sleep(2.8)
  assert m.metrics['connections']==2 and m.metrics['reconnections']==1 and m.metrics['reconciliations']==1
  assert m.metrics['sent_subscribe']==2 and len(m.feeds)==1;await m.close();await app.state.history.close()
 asyncio.run(run())
def test_malformed_unrequested_and_unknown_identity_no_cache_injection(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path)
  for value in [{},dict(channel='user',data={}),dict(channel='candle',data=None)]:
   with pytest.raises(ProviderError):m.receive(value)
  m.receive(dict(channel='candle',data=raw_candles('FAKE','1m')[-1]));assert not app.state.history.cache.entries
  with pytest.raises(ProviderError):await m.plan([dict(consumer(),identity='hyperliquid:perpetual:FAKE:FAKE:USDC')])
  await m.close();await app.state.history.close()
 asyncio.run(run())
def test_plan_limit_atomicity_and_metadata_mapping(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path)
  with pytest.raises(ProviderError):await m.plan([consumer(owner='chart:'+str(i)) for i in range(9)])
  with pytest.raises(ProviderError):await m.plan([dict(consumer(),native_mapping='changed')])
  assert not m.feeds and not c.sockets;await m.close();await app.state.history.close()
 asyncio.run(run())
def test_sleep_wake_and_clear_plan_no_metadata_network(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);await m.plan([consumer(feed='trades',interval='')]);await asyncio.sleep(.3)
  await m.lifecycle(True);await asyncio.sleep(.1);count=len(c.sockets);await asyncio.sleep(.2);assert len(c.sockets)==count
  await m.lifecycle(False);await asyncio.sleep(2.3);assert m.metrics['connections']==2
  app.state.registry.hyperliquid.fetched_at=0;t.fail=ProviderError('offline','access');before=len(t.calls);await m.plan([]);assert len(t.calls)==before
  await m.close();await app.state.history.close()
 asyncio.run(run())
def test_events_coalesce_bounded_and_snapshot_reset(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);await app.state.history.daily(market(),interval='1m');await m.plan([consumer()]);await asyncio.sleep(.6)
  value=await m.events(0,0);assert len(value['feeds'])==1 and value['feeds'][0]['history']['candles']
  cursor=value['cursor'];await asyncio.sleep(.4);delta=await m.events(cursor,0);assert delta['cursor']>=cursor and delta['feeds'][0].get('candle')
  assert m.metrics['coalesced']>=0 and len(m.feeds)<=108;await m.close();await app.state.history.close()
 asyncio.run(run())
def test_no_noncrypto_http_stream_routes_and_auth(tmp_path):
 app=create_app(tmp_path,TOKEN,FixtureProvider(count=100))
 with TestClient(app,headers={'Authorization':'Bearer '+TOKEN}) as c:
  assert c.get('/api/streams/status').json()['enabled'] is False
  assert c.get('/api/streams/status',headers={'Authorization':'wrong'}).status_code==401
  assert c.put('/api/streams/consumers',json={'consumers':[],'wallet':'0x1'}).status_code==422

@pytest.mark.parametrize('http_status,retry,minimum',[(429,'180',180),(429,'invalid',60),(401,'1',300),(403,'120',300)])
def test_handshake_rate_restrictions_respected(tmp_path,monkeypatch,http_status,retry,minimum):
 async def run():
  from types import SimpleNamespace
  app,m,c,t=await setup(tmp_path);m.feeds[feed_key(market(),'trades')]=Feed(market(),'trades')
  class Rejected(Exception):pass
  async def refused():
   e=Rejected('public access rejected');e.response=SimpleNamespace(status_code=http_status,headers={'Retry-After':retry});raise e
  m.connector=refused;delays=[]
  async def sleep(seconds):delays.append(seconds);raise asyncio.CancelledError()
  monkeypatch.setattr('app.hyperliquid_stream.asyncio.sleep',sleep)
  with pytest.raises(asyncio.CancelledError):await m.run()
  assert delays[0]>=minimum and m.state=='limited' and m.metrics['connections']==0
  await m.close();await app.state.history.close()
 asyncio.run(run())
def test_exponential_backoff_no_tight_loop(tmp_path,monkeypatch):
 async def run():
  now=[time.time()];app,m,c,t=await setup(tmp_path,lambda:now[0]);m.feeds[feed_key(market(),'trades')]=Feed(market(),'trades');delays=[]
  async def offline():raise OSError('offline fixture')
  async def sleep(seconds):
   delays.append(seconds);now[0]+=seconds
   if len(delays)==8:raise asyncio.CancelledError()
  m.connector=offline;monkeypatch.setattr('app.hyperliquid_stream.asyncio.sleep',sleep)
  with pytest.raises(asyncio.CancelledError):await m.run()
  assert delays[:4]==[2,4,8,16] and max(delays)<=120
  await m.close();await app.state.history.close()
 asyncio.run(run())
def test_reconciliation_failure_respects_retry_window(tmp_path):
 async def run():
  from unittest.mock import AsyncMock
  app,m,c,t=await setup(tmp_path);r=market();f=Feed(r,'candle','1m',reconcile_at=time.time()+3600);key=feed_key(r,'candle','1m');m.feeds[key]=f
  app.state.history.daily=AsyncMock(side_effect=ProviderError('rate','rate',3600))
  for _ in range(10):m.queue_reconcile(key,f)
  await settle();app.state.history.daily.assert_not_called();assert not f.reconciling
  await m.close();await app.state.history.close()
 asyncio.run(run())
def test_only_selected_quote_feed_and_no_previous_close_reference(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);await m.plan([consumer(market('@1','spot'),'watchlist:selected','trades','')]);await asyncio.sleep(.5)
  assert len(m.feeds)==1 and m.metrics['sent_subscribe']==1
  frame=(await m.events(0,0))['feeds'][0];assert frame['quote']['previous_close'] is None and frame['quote']['change'] is None and frame['quote']['currency']=='USDC'
  assert not any(v['type']=='candleSnapshot' for v in t.calls);await m.close();await app.state.history.close()
 asyncio.run(run())
def test_closed_candle_alert_deduplicates_stream_revisions(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);sec=market();rows,_=normalize_candles(raw_candles('BTC','1m'),sec,'1m',time.time());start=rows[-1]['time']+10
  engine=app.state.alerts;engine.started=start;definition=AlertDefinition(instrument=sec['canonical_id'],interval='1m',repeat='candle',conditions=ConditionGroup(children=[Condition(kind='close_above',params={'value':200.5,'currency':'USDC'})]))
  saved=engine.store.save(definition,now=start);h=dict(candles=rows,source='HYPERLIQUID',timezone='UTC',currency='USDC',fetched_at=start,stream_received_at=start,first_available=str(rows[0]['time']),last_available=str(rows[-1]['time']))
  first=engine.assess(saved,h,sec,AlertSettings(),start);engine.store.update_runtime(saved,**first);saved=engine.store.get(saved['id']);assert not engine.store.history()
  now=rows[-1]['end_time']+1;h['stream_received_at']=now
  second=engine.assess(saved,h,sec,AlertSettings(),now);engine.store.update_runtime(saved,**second);saved=engine.store.get(saved['id']);assert len(engine.store.history())==1
  for _ in range(5):
   rows[-1]['close']+=.01;h['stream_received_at']=now+1;engine.store.update_runtime(saved,**engine.assess(saved,h,sec,AlertSettings(),now+1));saved=engine.store.get(saved['id'])
  assert len(engine.store.history())==1;await m.close();await app.state.history.close()
 asyncio.run(run())

def test_live_precision_increases_from_actual_provider_prices(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);sec=market();h,_=await app.state.history.daily(sec,interval='1m');f=Feed(sec,'candle','1m',candle=h.candles[-1]);k=feed_key(sec,'candle','1m');m.feeds[k]=f
  raw=raw_candles('BTC','1m')[-1];raw.update(c='201.125',v='1200',n=20);m.receive(dict(channel='candle',data=raw))
  frame=(await m.events(0,0))['feeds'][0];assert frame['precision']==3 and h.metadata['precision']==3
  await m.close();await app.state.history.close()
 asyncio.run(run())
def test_initial_history_failure_is_reconciled_without_renderer_polling(tmp_path):
 async def run():
  from unittest.mock import AsyncMock
  app,m,c,t=await setup(tmp_path);sec=market();f=Feed(sec,'candle','1m');key=feed_key(sec,'candle','1m');m.feeds[key]=f
  real=app.state.history.daily;app.state.history.daily=AsyncMock(side_effect=ProviderError('retry later','rate',60))
  m.queue_reconcile(key,f,force=False);await settle();assert f.state=='stale' and f.reconcile_at>m.clock()
  app.state.history.daily=real;f.reconcile_at=0;m.queue_reconcile(key,f,force=False);await asyncio.sleep(.1)
  assert f.reset and f.reset['candles'] and app.state.history.provider.calls==0
  await m.close();await app.state.history.close()
 asyncio.run(run())
