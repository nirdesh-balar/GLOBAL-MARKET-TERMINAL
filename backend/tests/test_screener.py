import asyncio,copy,math,time
from datetime import datetime,timezone
import pytest
from pydantic import ValidationError
from app.screener_conditions import CATALOG,Condition,ConditionGroup,ScreenConfig,Presets,Evaluation,completed_rows,evaluate,combine
from app.screener import Screener
from app.providers.base import ProviderError
from test_direct_history import app,client
UTC=timezone.utc
SEC={'kind':'equity','exchange':'NSE','currency':'INR','timezone':'Asia/Kolkata'}
def rows(n=900):
    return [dict(time=1577836800+i*86400,open=100+i*.03+math.sin(i/8)*5,high=108+i*.03+math.sin(i/8)*5,low=95+i*.03+math.sin(i/8)*5,close=102+i*.03+math.sin(i/8)*5,volume=1000+i) for i in range(n)]
def cfg(kind,**params):return ScreenConfig(conditions=ConditionGroup(children=[Condition(kind=kind,params=params)]))
def hist(data):return dict(candles=data,source='TEST FIXTURE',fetched_at=1700000000,first_available='2020-01-01',last_available='2023-01-01',currency='INR',timezone='Asia/Kolkata')
@pytest.mark.parametrize('kind',list(CATALOG))
def test_every_condition_calculates_and_preserves_inputs(kind):
    data=rows();before=copy.deepcopy(data);r=evaluate(hist(data),SEC,cfg(kind),now=1900000000)
    assert r['status'] in ('matched','no_match'),(kind,r['details'])
    assert data==before and len(r['details'])==1
@pytest.mark.parametrize('kind',list(CATALOG))
def test_every_condition_insufficient_history_unknown(kind):
    r=evaluate(hist([]),SEC,cfg(kind),now=1900000000)
    assert r['status']=='unknown' and r['details'][0]['reason']
@pytest.mark.parametrize('op,values,expected',[('and',[True,None],None),('and',[False,None],False),('or',[False,None],None),('or',[True,None],True),('and',[True,True],True),('or',[False,False],False)])
def test_three_valued_logic(op,values,expected):assert combine(op,values) is expected

def test_currency_units_and_negative_prices():
    data=rows(300)
    for r in data:
        for k in ('open','high','low','close'):r[k]-=200
    r=evaluate(hist(data),SEC,cfg('close_below',value=0,currency='INR'),now=1900000000)
    assert r['status']=='matched' and r['close']<0
    assert evaluate(hist(data),SEC,cfg('close_above',value=1,currency='USD'),now=1900000000)['status']=='unknown'
    h={**hist(data),'currency':'GBp'}
    assert evaluate(h,{**SEC,'currency':'GBp'},cfg('close_above',value=1,currency='GBP'),now=1900000000)['status']=='unknown'
    assert evaluate(h,{**SEC,'currency':'GBp'},cfg('close_below',value=0,currency='GBp'),now=1900000000)['currency']=='GBp'
@pytest.mark.parametrize('kind',['price_cross_up','price_cross_down','ema_cross_up','ema_cross_down','sma_cross_up','sma_cross_down','price_cross_ema_up','price_cross_ema_down','rsi_cross_up','rsi_cross_down','macd_cross_up','macd_cross_down'])
def test_crosses_require_consecutive_change(kind):
    params={'value':100,'currency':'INR'} if kind.startswith('price_cross_') and kind in ('price_cross_up','price_cross_down') else {}
    c=Condition(kind=kind,params=params);e=Evaluation(rows(),SEC,'1d');actual,_=e.condition(c);assert isinstance(actual,bool)
    if kind in ('price_cross_up','price_cross_down'):
        data=rows(4)
        for r in data:r.update(close=110,high=max(111,r['high']))
        assert Evaluation(data,SEC,'1d').condition(c)[0] is False
    if kind.startswith(('ema_','sma_')):
        e.indicator=lambda *a,**kw:[([1,2] if kw['length']==9 else [3,3])]
        assert e.condition(c)[0] is False # Persistent below is not a down-cross.

def test_independent_sma_ema_macd_references():
    data=rows(300);close=[r['close'] for r in data];e=Evaluation(data,SEC,'1d')
    def ema(values,n):
        valid=[v for v in values if v is not None];offset=len(values)-len(valid);seed=sum(valid[:n])/n;result=[None]*(offset+n-1)+[seed]
        for value in valid[n:]:seed=(2*value+(n-1)*seed)/(n+1);result.append(seed)
        return result
    for n in [9,21,20,50,200]:
        assert e.indicator('SMA',length=n)[0][-1]==pytest.approx(sum(close[-n:])/n)
        assert e.indicator('EMA',length=n)[0][-1]==pytest.approx(ema(close,n)[-1])
    fast,slow=ema(close,12),ema(close,26);macd=[a-b if a is not None and b is not None else None for a,b in zip(fast,slow)];signal=ema(macd,9)
    result=e.indicator('MACD',fast=12,slow=26,signal=9)
    assert result[0][-1]==pytest.approx(macd[-1]);assert result[1][-1]==pytest.approx(signal[-1]);assert result[2][-1]==pytest.approx(macd[-1]-signal[-1])
@pytest.mark.parametrize('delta,expected',[(1,100),(-1,0),(0,50)])
def test_independent_wilder_rsi_limits(delta,expected):
    data=rows(80)
    for i,r in enumerate(data):r['close']=200+i*delta
    assert Evaluation(data,SEC,'1d').indicator('RSI',period=14)[0][-1]==expected

def test_bb_atr_independent_population_formula():
    data=rows(100);e=Evaluation(data,SEC,'1d');values=[r['close'] for r in data[-20:]];mean=sum(values)/20;std=(sum((v-mean)**2 for v in values)/20)**.5
    upper,middle,lower=e.indicator('BB',length=20,deviation=2)
    assert upper[-1]==pytest.approx(mean+2*std);assert lower[-1]==pytest.approx(mean-2*std)
    tr=[max(r['high']-r['low'],abs(r['high']-data[i-1]['close']),abs(r['low']-data[i-1]['close'])) if i else r['high']-r['low'] for i,r in enumerate(data)];expected=sum(tr[:14])/14
    for v in tr[14:]:expected=(expected*13+v)/14
    assert e.indicator('ATR',period=14)[0][-1]==pytest.approx(expected)
@pytest.mark.parametrize('volume',[None,-1,float('nan')])
def test_missing_volume_unknown(volume):
    data=rows(50);data[-1]['volume']=volume
    for kind in ['volume_above','volume_average','relative_volume','volume_breakout']:assert Evaluation(data,SEC,'1d').condition(Condition(kind=kind))[0] is None

def test_relative_volume_uses_preceding_window_not_current():
    data=rows(50)
    for r in data:r['volume']=100
    data[-1]['volume']=201;e=Evaluation(data,SEC,'1d')
    assert e.condition(Condition(kind='relative_volume',params={'value':2}))[0] is True
    assert e.snapshot()['relative_volume']==2.01
    for r in data:r['volume']=0
    assert Evaluation(data,SEC,'1d').condition(Condition(kind='relative_volume'))[0] is None
@pytest.mark.parametrize('kind',['index','forex'])
def test_unavailable_market_volume(kind):assert Evaluation(rows(),{**SEC,'kind':kind},'1d').condition(Condition(kind='volume_above'))[0] is None

def test_crypto_units_not_assumed():
    e=Evaluation(rows(),{**SEC,'kind':'crypto'},'1d')
    assert e.condition(Condition(kind='volume_above'))[0] is None
    assert e.condition(Condition(kind='volume_above',params={'volume_unit':'provider','value':1}))[0] is True
    assert 'unconfirmed' in e.snapshot()['volume_unit']

def stamp(s):return int(datetime.fromisoformat(s).replace(tzinfo=UTC).timestamp())
def test_asof_excludes_future_and_unfinished_candles():
    data=rows(400);cutoff=data[250]['time']+3600;config=cfg('rsi_below');config.as_of=cutoff
    before=evaluate(hist(data),SEC,config,now=1900000000)
    changed=copy.deepcopy(data)
    for r in changed[251:]:r.update(close=1e8,high=2e8,volume=1e8)
    after=evaluate(hist(changed),SEC,config,now=1900000000)
    assert before==after and before['candle_time']==data[249]['time']
    config.completed=False;assert evaluate(hist(data),SEC,config,now=1900000000)['candle_time']==data[249]['time']
@pytest.mark.parametrize('day,close',[('2024-03-08',21),('2024-03-11',20),('2024-07-03',17)])
def test_us_dst_and_early_closes(day,close):
    row={**rows(1)[0],'time':stamp(day+'T00:00:00')};sec={**SEC,'exchange':'NYSE','calendar':'XNYS','timezone':'America/New_York'}
    assert completed_rows([row],sec,'1d',stamp(day+f'T{close-1}:59:00'))==[]
    assert completed_rows([row],sec,'1d',stamp(day+f'T{close}:01:00'))==[row]

def test_india_crypto_and_unknown_calendar_completion():
    row={**rows(1)[0],'time':stamp('2024-03-11T00:00:00')}
    assert completed_rows([row],SEC,'1d',stamp('2024-03-11T09:59:00'))==[]
    assert completed_rows([row],SEC,'1d',stamp('2024-03-11T10:01:00'))==[row]
    crypto={**SEC,'kind':'crypto','exchange':'CRYPTO','timezone':'UTC'}
    assert completed_rows([row],crypto,'1d',stamp('2024-03-11T23:59:00'))==[]
    assert completed_rows([row],crypto,'1d',stamp('2024-03-12T00:00:00'))==[row]
@pytest.mark.parametrize('interval',['1m','5m','15m','30m','1h','4h','1d','1w','1M'])
def test_all_timeframe_configs(interval):assert ScreenConfig(interval=interval).interval==interval
@pytest.mark.parametrize('kind,params',[('evil',{}),('rsi_below',{'value':101}),('ema_cross_up',{'fast':50,'slow':20}),('close_above',{'script':'evil'}),('relative_volume',{'value':-1}),('multi_ema_above',{'periods':'1,200'}),('rsi_below',{'value':float('nan')})])
def test_submitted_conditions_rejected(kind,params):
    with pytest.raises(ValidationError):Condition(kind=kind,params=params)

def test_unknown_and_nested_group(client):
    tree={'type':'group','op':'or','children':[{'type':'condition','kind':'close_above','params':{'value':1,'currency':'USD'}},{'type':'group','op':'and','children':[{'type':'condition','kind':'rsi_below','params':{'value':100}},{'type':'condition','kind':'close_above','params':{'value':1,'currency':'INR'}}]}]}
    c=ScreenConfig(conditions=tree);r=evaluate(hist(rows(2)),SEC,c,now=1900000000);assert r['status']=='unknown'
    for _ in range(6):tree={'type':'group','op':'and','children':[tree]}
    with pytest.raises(ValidationError):ScreenConfig(conditions=tree)

def wait_job(client,id):
    for _ in range(200):
        r=client.get('/api/screener/jobs/'+id+'/results').json()
        if r['job']['state'] in ('completed','cancelled'):return r
        time.sleep(.02)
    raise AssertionError('Job did not finish')
def test_full_nse_and_provider_limited_universes(client,app):
    u=client.get('/api/screener/universes').json();m={v['id']:v for v in u}
    assert m['nse_mainboard']['count']==2605 and m['nse_sme']['count']==580
    assert m['nse_mainboard']['complete'] and not m['us']['complete'] and len(u)==11
    assert app.state.history.metrics['provider_requests']==0

def test_jobs_cache_reuse_no_chart_preference_mutation(client,app):
    app.state.history.config['min_interval']=0;before=client.get('/workspace').json();payload=cfg('close_above',value=0,currency='INR').model_dump();payload.update(mode='symbols',symbols=['RELIANCE','TCS'],batch_size=2)
    first=client.post('/api/screener/jobs',json=payload);assert first.status_code==200,first.text;result=wait_job(client,first.json()['id']);assert result['job']['counts']['matched']==2
    requests=app.state.history.metrics['provider_requests'];second=client.post('/api/screener/jobs',json=payload);assert second.status_code==200;wait_job(client,second.json()['id']);assert app.state.history.metrics['provider_requests']==requests
    assert client.get('/workspace').json()==before
    assert client.get('/api/screener/jobs/'+'f'*32).status_code==404

def test_presets_persist_separately_and_migrate(client,app):
    before=client.get('/workspace').json();p={'id':'saved','name':'My RSI','config':cfg('rsi_below').model_dump()};assert client.put('/api/screener/presets',json={'version':1,'presets':[p]}).status_code==200
    assert client.get('/api/screener/presets').json()['presets'][0]['name']=='My RSI'
    app.state.db.put('screener_presets',[p]);assert client.get('/api/screener/presets').json()['version']==1
    bad={'version':99,'presets':[p]};app.state.db.put('screener_presets',bad);assert client.get('/api/screener/presets').status_code==409;assert app.state.db.get('screener_presets')==bad
    assert client.put('/api/screener/presets',json={'version':1,'presets':[p]}).status_code==409
    assert app.state.db.get('screener_presets')==bad
    assert client.get('/workspace').json()==before

def test_job_cancel_and_bounded_capacity(client,app):
    app.state.history.config['min_interval']=0;payload=cfg('close_above',value=0,currency='INR').model_dump();payload.update(batch_size=100)
    j=client.post('/api/screener/jobs',json=payload).json();assert j['batch_total']==100 and j['universe_total']==2605
    assert client.post('/api/screener/jobs',json=payload).status_code==409
    cancelled=client.post('/api/screener/jobs/'+j['id']+'/cancel').json();assert cancelled['cancelled'] and cancelled['state']=='cancelled'
    final=wait_job(client,j['id']);assert final['job']['counts']['processed']<100;assert final['job']['counts']['cancelled']>0
    assert client.post('/api/screener/jobs',json={**payload,'batch_size':101}).status_code==422

def test_adjustments_and_52week_unknown():
    config=cfg('year_high');assert evaluate(hist(rows(100)),SEC,config,now=1900000000)['status']=='unknown'
    config.adjusted=True;assert 'not point-in-time' in evaluate(hist(rows()),SEC,config,now=1900000000)['notice']

def test_provider_errors_missing_partial_and_cooldown(app):
    async def scenario():
        engine=app.state.screener;attempts={}
        async def get(sec,*a,**kw):
            s=sec['symbol'];attempts[s]=attempts.get(s,0)+1
            if 'RELIANCE' in s and attempts[s]==1:raise ProviderError('Test cooldown','rate',.01)
            if 'TCS' in s:raise ProviderError('No history','missing')
            return hist(rows())
        engine.history.get=get
        c=cfg('close_above',value=0,currency='INR');c.mode='symbols';c.symbols=['RELIANCE','TCS']
        j=engine.submit(c);await list(engine.tasks.values())[0];r=engine.status(engine.get(j['id']))
        assert r['counts']['matched']==1 and r['counts']['missing']==1 and attempts['RELIANCE-EQ']==2
        await engine.close()
    asyncio.run(scenario())


def test_volume_average_zero_base_valid_but_ratio_undefined():
    data=rows(30)
    for r in data:r['volume']=0
    data[-1]['volume']=1;e=Evaluation(data,SEC,'1d')
    assert e.condition(Condition(kind='volume_average'))[0] is True
    assert e.condition(Condition(kind='relative_volume'))[0] is None

@pytest.mark.parametrize('bad',[float('nan'),float('inf'),None])
def test_invalid_ohlc_explicit_unknown(bad):
    data=rows();data[-1]['close']=bad;r=evaluate(hist(data),SEC,cfg('close_above'),now=1900000000)
    assert r['status']=='unknown' and 'close' not in r

def test_adjusted_prices_are_not_double_adjusted_and_volume_unchanged():
    from app.history import response
    from app.providers.base import History
    data=rows(300)
    for r in data:r.update(open=100,high=102,low=98,close=100,adj_close=50)
    raw=History(data,'TEST FIXTURE',metadata={'currency':'INR','timezone':'Asia/Kolkata'})
    c=cfg('close_above',value=60,currency='INR');a=evaluate(response(raw,'1d',security=SEC),SEC,c,now=1900000000)
    c.adjusted=True;b=evaluate(response(raw,'1d',adjusted=True,security=SEC),SEC,c,now=1900000000)
    assert a['status']=='matched' and b['status']=='no_match' and b['close']==50
    assert a['volume']==b['volume'] and 'not point-in-time' in b['notice']

@pytest.mark.parametrize('value',['100',True,float('inf')])
def test_threshold_strict_numeric(value):
    with pytest.raises(ValidationError):Condition(kind='close_above',params={'value':value})


def test_screener_routes_require_local_authentication(app):
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        for path in ('universes','conditions','presets'):
            assert c.get('/api/screener/'+path).status_code==401
        assert c.post('/api/screener/jobs',json={}).status_code==401
    assert app.state.history.metrics['provider_requests']==0


def test_official_universes_do_not_include_stale_provider_directory_entries(client,app):
    old=app.state.registry.equity(app.state.db.resolve('RELIANCE'))
    old.update(symbol='OLD-DELISTED',yahoo_symbol='OLD-DELISTED.NS',canonical_id='yahoo:OLD-DELISTED.NS:NSE:equity')
    app.state.db.put('global_instruments',{old['canonical_id']:old})
    known=client.get('/api/screener/universes').json()
    assert next(u for u in known if u['id']=='nse_mainboard')['count']==2605
    assert all(r['symbol']!='OLD-DELISTED' for u in known if u['complete'] for r in u['symbols'])


def test_current_sma_volume_and_previous_relative_window_are_explicit():
    data=rows(21)
    for r in data:r['volume']=100
    data[-1]['volume']=160;e=Evaluation(data,SEC,'1d')
    assert e.condition(Condition(kind='relative_volume',params={'value':1.59,'volume_basis':'previous'}))[0] is True
    assert e.condition(Condition(kind='relative_volume',params={'value':1.59,'volume_basis':'including_current'}))[0] is False
    assert Condition(kind='volume_average').params['volume_basis']=='including_current'
