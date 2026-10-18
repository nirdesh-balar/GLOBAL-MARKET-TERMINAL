import asyncio,copy,json,math,sqlite3,time
from datetime import datetime,timezone
from unittest.mock import AsyncMock
import pytest
from pydantic import ValidationError
from app.alert_models import AlertDefinition,AlertSettings,quiet_now
from app.alert_store import AlertStore
from app.alerts import AlertEngine,candle_end,market_open
from app.screener_conditions import CATALOG,Condition,ConditionGroup
from app.providers.base import ProviderError
from test_direct_history import app,client
from test_screener import rows,stamp

SEC=dict(kind='equity',exchange='NSE',currency='INR',timezone='Asia/Kolkata')
def definition(kind='close_above',**kw):
    params=kw.pop('params',{'value':0,'currency':'INR'} if kind=='close_above' else {})
    return AlertDefinition(instrument='RELIANCE',interval='1d',conditions=ConditionGroup(children=[Condition(kind=kind,params=params)]),**kw)
def history(data,now):return dict(candles=data,source='TEST FIXTURE · SYNTHETIC',fetched_at=now,first_available='2020-01-01',last_available='2025-01-01',currency='INR',timezone='Asia/Kolkata')
def setup(app,kind='close_above',**kw):
    data=rows();now=data[-2]['time']+36000+1;engine=app.state.alerts;engine.started=now;engine.clock=lambda:now
    row=engine.store.save(definition(kind,**kw),now=now);sec=app.state.registry.resolve('RELIANCE')
    engine.store.update_runtime(row,**engine.assess(row,history(data[:-1],now),sec,AlertSettings(),now));row=engine.store.get(row['id']);return engine,row,sec,data

def assess(engine,row,sec,data,settings=None,offset=0):
    now=data[-1]['time']+36000+1+offset;value=engine.assess(row,history(data,now),sec,settings or AlertSettings(),now);engine.store.update_runtime(row,**value);return engine.store.get(row['id'])

@pytest.mark.parametrize('kind',list(CATALOG))
def test_every_alert_condition_arms_without_backfill_and_evaluates(kind,app):
    e,r,s,data=setup(app,kind,params={});assert r['runtime']['status']=='armed';assert e.store.history()==[]
    current=assess(e,r,s,data);assert current['runtime']['last_evaluated_candle']==data[-1]['time']
    assert current['runtime']['status'] in ('watching','triggered','unknown')
    for event in e.store.history():assert event['payload']['source'].startswith('TEST FIXTURE')

@pytest.mark.parametrize('repeat,count',[('once',1),('candle',2),('crossing',0)])
def test_repeat_modes_and_duplicate_candles(app,repeat,count):
    e,r,s,data=setup(app,repeat=repeat);r=assess(e,r,s,data)
    if r['definition']['enabled']:
        for _ in range(3):r=assess(e,r,s,data)
        more=data+[{**data[-1],'time':data[-1]['time']+86400}];r=assess(e,r,s,more)
    assert len(e.store.history())==count
    assert r['definition']['enabled']==(repeat!='once')

def test_threshold_crossing_uses_adjacent_data_not_stale_saved_state(app):
    e,r,s,data=setup(app,repeat='crossing',params={'value':200,'currency':'INR'})
    data[-2].update(open=199,high=201,low=198,close=199);data[-1].update(open=200,high=202,low=199,close=201)
    r=assess(e,r,s,data);assert len(e.store.history())==1
    data2=data+[{**data[-1],'time':data[-1]['time']+86400}];assess(e,r,s,data2);assert len(e.store.history())==1

@pytest.mark.parametrize('kind',['price_cross_up','rsi_cross_up','ema_cross_up','sma_cross_up','macd_cross_up'])
def test_crossing_types_use_existing_consecutive_candle_math(kind,app):
    e,r,s,data=setup(app,kind,params={});r=assess(e,r,s,data)
    from app.screener_conditions import Evaluation
    state,_=Evaluation(data,s,'1d').condition(Condition(kind=kind))
    assert len(e.store.history())==(1 if state else 0)

def test_restart_baselines_new_history_and_preserves_checkpoint(app):
    e,r,s,data=setup(app,repeat='candle');r=assess(e,r,s,data);assert len(e.store.history())==1
    new=AlertEngine(app.state.db,app.state.registry,app.state.history);now=data[-1]['time']+86400+36001
    data=data+[{**data[-1],'time':data[-1]['time']+86400}];value=new.assess(new.store.get(r['id']),history(data,now),s,AlertSettings(),now);new.store.update_runtime(r,**value)
    assert len(new.store.history())==1 and new.store.get(r['id'])['runtime']['status']=='armed'
    assert new.store.history()[0]['delivery']=='not_sent_restart'

def test_old_downloaded_signal_not_notified(app):
    e,r,s,data=setup(app,repeat='candle');r=assess(e,r,s,data,offset=900)
    assert r['runtime']['status']=='skipped_old_signal' and e.store.history()==[]

def test_missing_and_stale_data_never_signal(app):
    e,r,s,data=setup(app,repeat='candle');now=data[-1]['time']+36001
    h=history(data,now-9999);v=e.assess(r,h,s,AlertSettings(),now);assert v['runtime']['status']=='stale' and not v.get('trigger')
    h=history([],now);assert e.assess(r,h,s,AlertSettings(),now)['runtime']['status']=='unknown'

def test_unknown_never_becomes_false_or_crossing(app):
    e,r,s,data=setup(app,'close_above',repeat='crossing');s={**s,'currency':'USD'};h=history(data,0);h['currency']='USD';now=data[-1]['time']+36001;h['fetched_at']=now
    v=e.assess(r,h,s,AlertSettings(),now);assert v['runtime']['status']=='unknown' and not v.get('trigger')

def test_expiration_and_stale_edit_cannot_commit(app):
    e,r,s,data=setup(app,repeat='candle');now=data[-1]['time']+36001
    edited=e.store.save(definition(enabled=False),r['id'],now=now)
    value=e.assess(r,history(data,now),s,AlertSettings(),now);assert not e.store.update_runtime(r,**value);assert e.store.history()==[]
    expired={**edited,'definition':{**edited['definition'],'expires_at':now-1,'enabled':True}}
    assert e.assess(expired,history(data,now),s,AlertSettings(),now)['runtime']['status']=='expired'

@pytest.mark.parametrize('hour,expected',[(21,False),(22,True),(0,True),(7,True),(8,False)])
def test_quiet_hours_overnight(hour,expected):
    assert quiet_now(AlertSettings(quiet_enabled=True,timezone='UTC'),stamp(f'2024-03-10T{hour:02d}:30:00')) is expected
@pytest.mark.parametrize('utc', ['2024-11-03T05:30:00','2024-11-03T06:30:00'])
def test_quiet_hours_dst_repeated_hour(utc):assert quiet_now(AlertSettings(quiet_enabled=True,quiet_start='01:00',quiet_end='02:00',timezone='America/New_York'),stamp(utc))

def test_quiet_trigger_is_consumed_not_queued_for_later(app):
    e,r,s,data=setup(app,repeat='once');settings=AlertSettings(quiet_enabled=True,quiet_start='00:00',quiet_end='23:59',timezone='UTC')
    r=assess(e,r,s,data,settings);assert e.store.history()[0]['delivery']=='quiet_hours';assert not r['definition']['enabled'];assert e.store.pending(data[-1]['time']+36001)==[]

def test_outbox_claim_is_at_most_once_and_failure_does_not_requeue(app):
    e,r,s,data=setup(app,repeat='candle');assess(e,r,s,data);now=data[-1]['time']+36001
    first=e.store.pending(now);assert len(first)==1 and e.store.pending(now)==[]
    e.store.delivery(first[0]['id'],'permission_denied','Denied by macOS');assert e.store.pending(now)==[]
    e.store.clear_history();assert e.store.get(r['id'])['runtime']['last_evaluated_candle']==data[-1]['time']

@pytest.mark.parametrize('pause,quiet,delivery',[(True,False,'paused'),(False,True,'quiet_hours')])
def test_dispatch_rechecks_global_pause_and_quiet_hours(app,pause,quiet,delivery):
    e,r,s,data=setup(app,repeat='candle');assess(e,r,s,data);e.store.save_settings(AlertSettings(paused=pause,quiet_enabled=quiet,quiet_start='00:00',quiet_end='23:59',timezone='UTC'))
    assert e.store.pending(data[-1]['time']+36001)==[];assert e.store.history()[0]['delivery']==delivery

def test_history_and_alert_limits(app):
    store=app.state.alerts.store;store.HISTORY_LIMIT=3
    for i in range(6):store.test({'test':i},float(i))
    assert len(store.history())==3
    store.LIMIT=2;store.save(definition(enabled=False));store.save(definition(enabled=False))
    with pytest.raises(ValueError,match='100 alerts'):store.save(definition(enabled=False))

@pytest.mark.parametrize('field,value',[('poll_seconds',59),('poll_seconds',True),('timezone','Not/AZone'),('quiet_start','25:00'),('sound','/tmp/execute.sh')])
def test_invalid_settings(field,value):
    with pytest.raises(ValidationError):AlertSettings.model_validate({field:value})
@pytest.mark.parametrize('changes',[{'instrument':''},{'repeat':'every_tick'},{'version':99},{'conditions':{'type':'group','op':'and','children':[{'type':'condition','kind':'__import__(os)'}]}},{'message':'bad\x00text'}])
def test_invalid_definition(changes):
    with pytest.raises(ValidationError):AlertDefinition.model_validate({**definition().model_dump(),**changes})

def test_future_schema_and_corruption_preserved_without_touching_workspace(app):
    db=app.state.db;before=db.get('workspace');
    with db.connect() as c:c.execute('UPDATE alert_schema SET version=99')
    store=AlertStore(db);assert store.error
    with pytest.raises(ValueError):store.list()
    with db.connect() as c:assert c.execute('SELECT version FROM alert_schema').fetchone()[0]==99
    assert db.get('workspace')==before

def test_idempotent_migration_and_metadata_only_tables(app):
    store=app.state.alerts.store;row=store.save(definition(enabled=False));new=AlertStore(app.state.db);assert new.get(row['id'])==row
    with app.state.db.connect() as c:
        for table in ['alerts','alert_history']:
            columns={r[1] for r in c.execute('PRAGMA table_info('+table+')')};assert not columns.intersection({'open','high','low','close','candles','volume'})

def test_authenticated_routes_validation_and_confirmation(client,app):
    headers={'authorization':'Bearer wrong'};assert client.get('/api/alerts',headers=headers).status_code==401
    before=app.state.db.get('workspace');res=client.post('/api/alerts',json=definition(enabled=False).model_dump());assert res.status_code==200;row=res.json()
    assert client.get('/api/alerts').json()['status']['total']==1
    assert client.post('/api/alerts/history/clear',json={}).status_code==422
    assert client.post(f"/api/alerts/{row['id']}/delete",json={'confirm':False}).status_code==422
    assert client.put('/api/alerts/settings',json={'poll_seconds':1}).status_code==422
    assert client.post('/api/alerts',json={**definition().model_dump(),'instrument':'doesnotexist'}).status_code==422
    assert client.post(f"/api/alerts/{row['id']}/delete",json={'confirm':True}).status_code==200
    assert app.state.db.get('workspace')==before

@pytest.mark.parametrize('day,close',[('2024-03-08',21),('2024-03-11',20),('2024-07-03',17)])
def test_alert_market_closes_dst_and_early_close(day,close):
    sec={**SEC,'exchange':'NYSE','calendar':'XNYS','timezone':'America/New_York'};t=stamp(day+'T00:00:00')
    assert candle_end(t,sec,'1d')==stamp(day+f'T{close}:00:00')
    assert market_open(sec,stamp(day+'T16:00:00'));assert not market_open(sec,stamp(day+f'T{close}:01:00'))

def test_crypto_24_7_and_partial_completed_candles(app):
    sec={**SEC,'kind':'crypto','timezone':'UTC','exchange':'CRYPTO'};t=stamp('2024-03-10T00:00:00')
    assert candle_end(t,sec,'1d')==t+86400 and market_open(sec,t)
    e,r,s,data=setup(app);data[-1]['partial']=True;v=e.assess(r,history(data,data[-1]['time']+36001),s,AlertSettings(),data[-1]['time']+36001)
    assert not v.get('trigger') and v['runtime']['last_evaluated_candle']==data[-2]['time']

def test_polling_cache_reuse_shared_alerts_and_provider_rate_limit(app):
    e=app.state.alerts;sec=app.state.registry.resolve('RELIANCE');now=time.time();e.clock=lambda:now
    a=e.store.save(definition(),now=now);b=e.store.save(definition('rsi_above'),now=now)
    h=history(rows(),now);e.history.get=AsyncMock(return_value=h)
    asyncio.run(e.round());assert e.history.get.await_count==1;assert e.store.history()==[]
    asyncio.run(e.round());assert e.history.get.await_count==1
    e.next_due.clear();e.history.get=AsyncMock(side_effect=ProviderError('Test throttle','rate',120))
    asyncio.run(e.round());assert all(r['runtime']['status']=='cooldown' for r in e.store.list());assert e.next_due[a['id']]>=now+300

def test_pause_resume_rebaseline_and_shutdown(app):
    e=app.state.alerts;e.store.save(definition());e.store.save_settings(AlertSettings(paused=True));e.history.get=AsyncMock()
    asyncio.run(e.round());assert e.history.get.await_count==0
    async def run():e.start();await asyncio.sleep(.01);await e.close();assert e.task.done() and e.closed
    asyncio.run(run())

def test_cancellation_during_history_starts_no_notification(app):
    e=app.state.alerts;e.store.save(definition())
    async def waiting(*a,**kw):await asyncio.sleep(100)
    e.history.get=waiting
    async def run():e.start();await asyncio.sleep(.01);await e.close()
    asyncio.run(run());assert e.store.history()==[]

def test_stale_daily_and_crypto_gaps_reported_without_signal():
    from app.alerts import data_behind
    crypto={**SEC,'kind':'crypto','exchange':'CRYPTO','timezone':'UTC'};now=stamp('2024-03-12T12:00:00')
    assert data_behind(stamp('2024-03-09T00:00:00'),crypto,'1d',now,60)
    us={**SEC,'calendar':'XNYS','exchange':'NYSE','timezone':'America/New_York'}
    assert data_behind(stamp('2024-03-08T00:00:00'),us,'1d',now,60)
    assert not data_behind(stamp('2024-03-11T00:00:00'),us,'1d',now,60)
