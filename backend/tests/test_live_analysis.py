import asyncio,time,copy
import pytest
from pydantic import ValidationError
from app.main import create_app
from app.alert_models import AlertDefinition,AlertSettings
from app.alert_store import AlertStore
from app.screener_conditions import CATALOG,Condition,ConditionGroup,ScreenConfig,evaluate
from app.live_analysis import evaluate_price,safe_history,context
from app.hyperliquid_stream import Feed,feed_key
from test_hyperliquid_stream import setup,consumer
from test_hyperliquid import market
from hyperliquid_fixtures import raw_candles

def definition(sec=None,kind='price_cross_up',mode='live_price',**kwargs):
 sec=sec or market();return AlertDefinition(instrument=sec['canonical_id'],evaluation=mode,interval='1m',conditions=ConditionGroup(children=[Condition(kind=kind,params={'value':200,'currency':'USDC'})]),**kwargs)
def quote(price,t=None,tid=1):
 t=t or time.time();return dict(price=price,data_time=t,received_at=t,trade_id=tid)
@pytest.mark.parametrize('kind',list(CATALOG))
def test_all_59_conditions_verified_crypto(tmp_path,kind):
 async def run():
  app,m,ws,t=await setup(tmp_path);sec=market();h=await app.state.history.get(sec,'1m');params={}
  defaults=CATALOG[kind]['defaults']
  if 'currency' in defaults:params['currency']='USDC'
  if 'volume_unit' in defaults:params['volume_unit']='provider'
  config=ScreenConfig(interval='1m',conditions=ConditionGroup(children=[Condition(kind=kind,params=params)]))
  r=evaluate(h,sec,config,time.time());assert r['status'] in ('matched','no_match','unknown');assert len(r['details'])==1 and r['source']=='HYPERLIQUID'
  if kind.startswith('year_'):assert r['status']=='unknown'
  await app.state.alerts.close();await m.close();await app.state.history.close()
 asyncio.run(run())
@pytest.mark.parametrize('kind,a,b,expected',[('price_cross_up',199,201,True),('price_cross_up',201,202,False),('price_cross_down',201,199,True),('close_above',199,201,True),('close_below',201,199,True)])
def test_price_mathematics(kind,a,b,expected):
 d=definition(kind=kind);assert evaluate_price(b,a,market(),d.conditions)[0] is expected
@pytest.mark.parametrize('kind',['rsi_above','ema_cross_up','volume_above'])
def test_indicator_live_price_mode_rejected(kind):
 with pytest.raises(ValidationError):AlertDefinition(instrument=market()['canonical_id'],evaluation='live_price',conditions=ConditionGroup(children=[Condition(kind=kind)]))
def test_safe_completed_history_uses_provider_confirmation(tmp_path):
 async def run():
  app,m,ws,t=await setup(tmp_path);s=market();h=await app.state.history.get(s,'1m');f=Feed(s,'candle','1m',state='live',received_at=time.time(),candle=h['candles'][-1]);m.feeds[feed_key(s,'candle','1m')]=f;m.state='connected'
  v=safe_history(h,s,'1m',m);assert v['candles'][-1]['end_time']<=f.candle['time'];assert len(h['candles'])==len(v['candles'])+1
  assert context(h,s,'1m',m)['live_enabled'];await app.state.alerts.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_price_trigger_duplicate_restart_reconnect_and_quiet(tmp_path):
 async def run():
  app,m,ws,t=await setup(tmp_path);e=app.state.alerts;e.started=time.time()-10;row=e.store.save(definition());await e.live.sync(e.store.settings());m.generation=1
  def apply(p,tick,gen=1,settings=None):
   r=e.store.get(row['id']);v=e.live.assess(r,quote(p,time.time(),tick),market(),settings or e.store.settings(),time.time(),gen)
   if v:e.store.update_runtime(r,**v)
  apply(199,1);apply(201,2);assert len(e.store.history())==1
  apply(202,3);assert len(e.store.history())==1
  apply(199,4,2);apply(201,5,2);assert len(e.store.history())==2
  e.live.primed.clear();apply(201,6,2);assert len(e.store.history())==2
  r=e.store.get(row['id']);q=quote(199,time.time()-100,99);v=e.live.assess(r,q,market(),e.store.settings(),time.time(),2);assert not v or 'trigger' not in v
  # Persisted checkpoints survive a new store without creating historical catch-up.
  assert AlertStore(app.state.db).get(row['id'])['runtime']==e.store.get(row['id'])['runtime']
  await e.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_alert_subscription_ownership_and_lifecycle(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);e=app.state.alerts;row=e.store.save(definition());await e.live.sync(e.store.settings());await m.plan([consumer(owner='watchlist:A',feed='trades',interval='')]);await asyncio.sleep(.4)
  assert m.status()['subscriptions']==1 and m.status()['consumers']==2
  await m.plan([]);assert m.status()['subscriptions']==1
  e.store.save(definition(enabled=False),row['id']);e.notify_change(row['id']);await e.live.sync(e.store.settings());assert not m.feeds
  await e.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_bounded_alert_budget_and_public_owner_rejection(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path)
  clients=[dict(consumer(feed='trades',interval=''),identity='id'+str(i)) for i in range(100)]
  alerts=[dict(consumer(owner='alert:'+str(i)),identity='alert'+str(i)) for i in range(40)]
  combined,status=m.allocate(clients,alerts);assert len(combined)==108 and list(status.values()).count('bounded_rest')==32
  with pytest.raises(Exception):await m.plan([consumer(owner='alert:spoof')])
  await app.state.alerts.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_mixed_screener_no_subscriptions_or_yahoo_crypto(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);reg=app.state.registry;rows=[market(),market('@1','spot'),reg.resolve('AAPL')];screen=app.state.screener
  config=ScreenConfig(mode='symbols',symbols=[r['canonical_id'] for r in rows],interval='1m',conditions=ConditionGroup(children=[Condition(kind='rsi_above',params={'value':0})]))
  job=screen.submit(config);await screen.tasks[job['id']];result=screen.get(job['id'])['results'];assert len(result)==3
  for r in result:
   assert r['source']=='HYPERLIQUID' if r['provider']=='hyperliquid' else r['source'].startswith('TEST FIXTURE')
   assert r['analysis_basis'] and r['connection']=='rest_only'
  assert m.status()['subscriptions']==0 and app.state.history.metrics['provider_requests']==1
  await app.state.alerts.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_bounded_price_queue_and_pause(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);e=app.state.alerts;r=e.store.save(definition());await e.live.sync(e.store.settings());k=r['definition']['instrument']+'|trades|'
  for i in range(600):e.live.receive(k,'trades',quote(201,tid=i))
  assert len(e.live.queue)<=512 and e.live.metrics['overflows']>0
  paused=AlertSettings(paused=True);await e.live.drain(paused);assert not e.live.queue
  await e.live.sync(paused);assert not m.feeds
  await e.close();await m.close();await app.state.history.close()
 asyncio.run(run())
@pytest.mark.parametrize('market_type',['spot','perpetual'])
@pytest.mark.parametrize('interval',['1m','5m','15m','30m','1h','4h','1d','1w','1M'])
def test_completed_boundary_snapshot_excludes_current(tmp_path,market_type,interval):
 async def run():
  app,m,c,t=await setup(tmp_path);s=market('@1','spot') if market_type=='spot' else market();h=await app.state.history.get(s,interval);f=Feed(s,'candle',interval,state='live',received_at=time.time(),candle=h['candles'][-1]);m.feeds[feed_key(s,'candle',interval)]=f;m.state='connected'
  frozen=safe_history(h,s,interval,m);assert len(frozen['candles'])==len(h['candles'])-1
  assert all(r['end_time']<=f.candle['time'] for r in frozen['candles'])
  assert safe_history(h,s,interval,m,False)['candles']==h['candles']
  await app.state.alerts.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_price_pump_survives_slow_historical_worker(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);e=app.state.alerts;d=definition(kind='close_above',repeat='once');d=d.model_copy(update={'conditions':ConditionGroup(children=[Condition(kind='close_above',params={'value':0.01,'currency':'USDC'})])});r=e.store.save(d)
  us=app.state.registry.resolve('AAPL');e.store.save(AlertDefinition(instrument=us['canonical_id'],conditions=ConditionGroup(children=[Condition(kind='close_above',params={'value':100,'currency':'USD'})])))
  original=app.state.history.get;gate=asyncio.Event()
  async def slow(sec,*args,**kwargs):
   if sec.get('provider')=='yahoo':await gate.wait()
   return await original(sec,*args,**kwargs)
  app.state.history.get=slow;e.start()
  await asyncio.sleep(1);assert any(s['alert_id']==r['id'] for s in e.store.history())
  assert e.live.task and not e.live.task.done();assert e.live.metrics['evaluations']>=2
  await e.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_closed_candle_alert_never_uses_current_revisions(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);e=app.state.alerts;s=market();h=await app.state.history.get(s,'1m');r=e.store.save(definition(kind='close_above',mode='candles',repeat='candle'));f=Feed(s,'candle','1m',state='live',received_at=time.time(),candle=h['candles'][-1]);m.feeds[feed_key(s,'candle','1m')]=f;m.state='connected';m.generation=1
  await e.group([r],e.store.settings());r=e.store.get(r['id']);assert r['runtime']['last_evaluated_candle']==h['candles'][-2]['time']
  for i in range(5):
   h['candles'][-1]={**h['candles'][-1],'close':201+i*.001};await e.group([e.store.get(r['id'])],e.store.settings())
  assert not e.store.history();await e.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_nested_price_and_currency_unknown():
 d=definition();tree=ConditionGroup(op='or',children=[d.conditions,Condition(kind='close_below',params={'value':202,'currency':'USDC'})]);assert evaluate_price(201,199,market(),tree)[0] is True
 bad=ConditionGroup(children=[Condition(kind='close_above',params={'value':0,'currency':'INR'})]);assert evaluate_price(201,199,market(),bad)[0] is None
def test_price_quiet_hours_no_duplicate_outbox(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);e=app.state.alerts;r=e.store.save(definition());now=time.time();local=time.gmtime(now);start=f'{local.tm_hour:02d}:00';end=f'{(local.tm_hour+1)%24:02d}:00';settings=AlertSettings(quiet_enabled=True,timezone='UTC',quiet_start=start,quiet_end=end)
  e.started=now-10
  for i,p in enumerate([199,201,201]):
   row=e.store.get(r['id']);v=e.live.assess(row,quote(p,now+i*.001,i),market(),settings,now+.1,1)
   if v:e.store.update_runtime(row,**v)
  history=e.store.history();assert len(history)==1 and history[0]['delivery']=='quiet_hours';assert e.store.pending(now)==[]
  await e.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_live_price_api_rejects_noncrypto_and_legacy(tmp_path):
 from fastapi.testclient import TestClient
 from test_direct_history import TOKEN
 async def run():
  app,m,c,t=await setup(tmp_path);client=TestClient(app,headers={'Authorization':'Bearer '+TOKEN})
  for symbol in ['AAPL','BTC-USD']:
   sec=app.state.registry.resolve(symbol);assert client.post('/api/alerts',json=definition().model_copy(update={'instrument':sec['canonical_id']}).model_dump()).status_code==422
  await app.state.alerts.close();await m.close();await app.state.history.close()
 asyncio.run(run())
@pytest.mark.parametrize('market_type',['spot','perpetual'])
def test_verified_hyperliquid_base_volume_units(tmp_path,market_type):
 async def run():
  app,m,c,t=await setup(tmp_path);sec=market('@1','spot') if market_type=='spot' else market();h=await app.state.history.get(sec,'1m');cfg=ScreenConfig(interval='1m',conditions=ConditionGroup(children=[Condition(kind='volume_above',params={'volume_unit':'base','value':0})]));r=evaluate(h,sec,cfg,time.time());assert r['status']=='matched' and r['volume_unit'].endswith('(base)')
  h['candles']=[{**row,'volume':None} for row in h['candles']];r=evaluate(h,sec,cfg,time.time());assert r['status']=='unknown' and r['volume'] is None
  await app.state.alerts.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_invalidated_market_is_unmonitored_and_queued_trade_cannot_trigger(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);e=app.state.alerts;s=market();r=e.store.save(definition());await e.live.sync(e.store.settings());await asyncio.sleep(.3);f=m.feeds[feed_key(s,'trades')];f.blocked=True;f.state='unavailable';f.error='Native market mapping no longer valid'
  assert e.live.monitoring(r)=='unmonitored_invalid_market' and e.live.connection(r)=='unavailable'
  e.live.receive(feed_key(s,'trades'),'trades',quote(201));await e.live.drain(e.store.settings());assert not e.store.history()
  await e.close();await m.close();await app.state.history.close()
 asyncio.run(run())
def test_invalid_remaining_client_mapping_cannot_block_shutdown(tmp_path):
 async def run():
  app,m,c,t=await setup(tmp_path);e=app.state.alerts;await m.plan([consumer()]);await asyncio.sleep(.3)
  async def invalid(_):raise RuntimeError('Expired client mapping')
  m.set_alerts=invalid;await e.close();assert m.closed and m.socket is None and not m.feeds
  await app.state.history.close()
 asyncio.run(run())
