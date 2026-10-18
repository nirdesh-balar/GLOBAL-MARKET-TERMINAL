import asyncio,copy,math,json
from datetime import datetime,timezone
from decimal import Decimal
from types import SimpleNamespace
import numpy as np
import pytest
from pydantic import ValidationError
from app.models import IndicatorConfig,Drawing
from app.custom_indicators import KINDS,custom_calculate,custom_studies,pivot_levels,cpr,chart_references
from app.reference_context import daily_references,aggregate_references,session_bounds,build_context,yahoo_period_references
from app.providers.base import ProviderError
from app.drawing_analytics import estimated_profile,anchored_vwap
from e3b_reference import alpha,half
def cfg(kind,**kw):return IndicatorConfig(id=kind,kind=kind,**kw).model_dump()
def stamp(s):return int(datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp())
def rows(n=300,negative=False):
    out=[]
    for i in range(n):
        x=(100 if not negative else -100)+math.sin(i/7)*15+math.cos(i/19)*8+i*.01
        out.append(dict(time=1704067200+i*300,open=x,high=x+2,low=x-2,close=x+.3,volume=100+(i*13)%91,complete=True))
    return out
def equal(a,b):np.testing.assert_allclose(np.asarray(a,dtype=float),np.asarray(b,dtype=float),equal_nan=True,rtol=1e-10,atol=1e-8)
def reference_context(r):
    references={}
    for p,span in [('1d',86400),('1w',604800),('1M',2592000)]:
        grid=r[0]['time']//span*span if r else 1704067200//span*span
        references[p]=[dict(time=grid+(i-20)*span,start=grid+(i-20)*span,end=grid+(i-19)*span,open=100+i,high=110+i,low=90+i,close=105+i,volume=1000,complete=True) for i in range(40)]
    return dict(primary=dict(provider='hyperliquid',kind='crypto',currency='USDC',timezone='UTC'),references=references,sessions=[(r[0]['time'],r[0]['time']+86400,'2024-01-01')] if r else [],benchmarks={'hyperliquid:perpetual:ETH:ETH:USDC':dict(instrument=dict(provider='hyperliquid',kind='crypto',currency='USDC',symbol='ETH'),candles=copy.deepcopy(r),fetched_at=1)})

@pytest.mark.parametrize('variant',['traditional','classic','camarilla','woodie'])
@pytest.mark.parametrize('h,l,c,o',[(120,90,110,100),(-10,-40,-25,-30),(0,0,0,0),(15,5,5,8)])
def test_pivots_decimal(variant,h,l,c,o):
    result=pivot_levels(dict(high=h,low=l,close=c),variant,o);H,L,C,O=map(Decimal,map(str,(h,l,c,o)));p=(H+L+2*O)/4 if variant=='woodie' else (H+L+C)/3
    assert result['P']==pytest.approx(float(p));d=H-L
    if variant=='camarilla':
        for i,f in enumerate((12,6,4,2),1):assert result['R'+str(i)]==pytest.approx(float(C+Decimal('1.1')*d/f));assert result['S'+str(i)]==pytest.approx(float(C-Decimal('1.1')*d/f))
    else:
        assert result['R1']==pytest.approx(float(2*p-L));assert result['S2']==pytest.approx(float(p-d));assert result['R3']==pytest.approx(float(p+2*d if variant=='classic' else H+2*(p-L)))
@pytest.mark.parametrize('close',[-20,-15,-10,0,20,30])
def test_cpr_order_and_midpoint(close):
    low=min(-20,close);high=max(30,close);a=cpr(dict(high=high,low=low,close=close));assert a['BC']<=a['P']<=a['TC'];assert (a['BC']+a['TC'])/2==pytest.approx(a['P'])
@pytest.mark.parametrize('kind',KINDS)
@pytest.mark.parametrize('interval',['1m','5m','15m','30m','1h','4h','1d','1w','1M'])
def test_all_timeframes_finite_causal(kind,interval):
    r=rows();ctx=reference_context(r);c=cfg(kind,benchmark='hyperliquid:perpetual:ETH:ETH:USDC',session_template='utc');out,_=custom_calculate(r,c,interval,ctx);prefix,_=custom_calculate(r[:170],c,interval,ctx)
    for name,a in out.items():assert all(v is None or math.isfinite(v) for v in a);equal(a[:170],prefix[name])
    future=copy.deepcopy(ctx)
    for a in future['references'].values():
        for v in a:
            if v['start']>r[169]['time']:v.update(high=10000,close=9999)
    result,_=custom_calculate(r[:170],c,interval,future)
    for name in prefix:equal(prefix[name],result[name])
@pytest.mark.parametrize('momentum',['mfi','rsi'])
@pytest.mark.parametrize('period',[2,7,14,31])
@pytest.mark.parametrize('multiplier',[.5,1,3])
def test_alpha_independent(momentum,period,multiplier):
    r=rows();out,_=custom_calculate(r,cfg('ALPHATREND',period=period,multiplier=multiplier,alpha_momentum=momentum));equal(out['AlphaTrend'],alpha(r,period,multiplier,momentum))
@pytest.mark.parametrize('amplitude',[1,2,5,13])
@pytest.mark.parametrize('period',[2,14,100])
@pytest.mark.parametrize('negative',[False,True])
def test_half_independent(amplitude,period,negative):
    r=rows(300,negative);out,_=custom_calculate(r,cfg('HALFTREND',length=amplitude,period=period));equal(out['HalfTrend'],half(r,amplitude,period))
def test_swing_confirmation_no_backpaint_or_forming_confirmation():
    r=rows(8);prices=[1,2,5,3,2,1,2,3]
    for v,x in zip(r,prices):v.update(open=x,close=x,high=x+.1,low=x-.1)
    r[4]['complete']=False;out,_=custom_calculate(r[:5],cfg('SWING_PIVOT',swing_left=2,swing_right=2));assert out['Swing high']==[None]*5
    r[4]['complete']=True;out,_=custom_calculate(r[:5],cfg('SWING_PIVOT',swing_left=2,swing_right=2));assert out['Swing high'][:4]==[None]*4;assert out['Swing high'][4]==5.1
    r[1]['high']=5.1;out,_=custom_calculate(r[:5],cfg('SWING_PIVOT',swing_left=2,swing_right=2));assert out['Swing high'][4] is None
def test_woodie_uses_known_period_open_not_intraday_open():
    r=rows(20);ctx=reference_context(r);ctx['references']['1d']=[dict(time=r[0]['time']-86400,start=r[0]['time']-86400,end=r[0]['time'],open=90,high=110,low=80,close=100,complete=True),dict(time=r[0]['time'],start=r[0]['time'],end=None,open=105,high=10000,low=0,close=9999,complete=False)]
    out,_=custom_calculate(r,cfg('PIVOT',pivot_variant='woodie'),'5m',ctx);assert out['P']==[100]*20
def test_higher_reference_never_current_period():
    r=rows(20);ctx=reference_context(r);ctx['primary']['provider']='yahoo';ctx['references']['1w'][0]['end']=r[10]['time'];ctx['references']['1w']=ctx['references']['1w'][:1];out,_=custom_calculate(r,cfg('CPR',pivot_reference='1w'),'5m',ctx);assert all(v is None for v in out['P'][:10]);assert out['P'][10] is not None
def test_orb_full_window_first_cross_reset_and_missing():
    r=rows(20);start=r[0]['time'];ctx=dict(sessions=[(start,start+3600,'x')]);r[3].update(open=120,high=131,low=119,close=130)
    out,_=custom_calculate(r,cfg('ORB'),'5m',ctx);assert out['Range high'][:3]==[None]*3;assert out['Break above'][3]==130
    missing,_=custom_calculate(r[1:],cfg('ORB'),'5m',ctx);assert all(v is None for v in missing['Range high'])
    bad,warning=custom_calculate(r,cfg('ORB'),'1d',ctx);assert all(v is None for v in bad['Range high']);assert 'daily OHLC' in warning[0]
def test_orb_half_session_and_market_templates():
    r=rows(30);start=r[0]['time'];ctx=dict(sessions=[(start,start+3600,'x')]);out,_=custom_calculate(r,cfg('ORB'),'5m',ctx);assert out['Range high'][11] is not None;assert out['Range high'][12] is None
@pytest.mark.parametrize('source',['provider','chart'])
def test_daily_pivots_reference_source(source):
    r=rows(36);start=r[0]['time'];r=[{**v,'time':start+(i//12)*86400+(i%12)*300} for i,v in enumerate(r)];ctx=reference_context(r);ctx['primary']['provider']='yahoo';ctx['sessions']=[(start+i*86400,start+i*86400+3600,'2024-01-0'+str(i+1)) for i in range(3)];out,_=custom_calculate(r,cfg('CPR',reference_source=source),'5m',ctx);assert any(v is not None for v in out['P'])
def test_chart_reference_missing_bar_not_certified():
    r=rows(36);start=r[0]['time'];ctx=dict(sessions=[(start,start+3600,'2024-01-01')]);ref=chart_references(r[1:],'5m',ctx);assert ref['1d'][0]['complete'] is False
def test_yahoo_daily_timezone_next_observed_completion():
    r=[{**rows(1)[0],"time":stamp(d)} for d in ['2026-10-09','2026-10-12','2026-10-13']];ref,notice=daily_references(r,dict(exchange='NSE',timezone='Asia/Kolkata'));assert ref[0]['start']==stamp('2026-10-09T03:45:00');assert ref[0]['end']==stamp('2026-10-12T03:45:00');assert not ref[-1]['complete'];assert 'next observed' in notice
def test_us_calendar_early_close_and_dst():
    r=[{**rows(1)[0],"time":stamp(d)} for d in ['2025-11-26','2025-11-28','2025-12-01']];ref,notice=daily_references(r,dict(calendar='XNYS',timezone='America/New_York'));assert ref[1]['end']==stamp('2025-11-28T18:00:00');assert ref[1]['start']==stamp('2025-11-28T14:30:00');assert 'calendar' in notice
def test_last_week_month_not_declared_complete_from_last_day():
    r=[{**rows(1)[0],"time":stamp(d)} for d in ['2026-09-30','2026-10-01','2026-10-02']];daily,_=daily_references(r,dict(exchange='NSE',timezone='Asia/Kolkata'));monthly=aggregate_references(daily,'1M');assert len(monthly)==2;assert monthly[-1]['complete'] is False;assert monthly[0]['end']==stamp('2026-10-01T03:45:00');assert not any(r['complete'] for r in aggregate_references(daily,'1w'))
def test_relative_exact_timestamp_and_currency_policy():
    r=rows(30);key='hyperliquid:perpetual:ETH:ETH:USDC';ctx=reference_context(r);ctx['benchmarks'][key]['candles']=[{**v,'open':v['open']/2,'high':v['high']/2,'low':v['low']/2,'close':v['close']/2} for v in r];out,_=custom_calculate(r,cfg('RELATIVE_STRENGTH',benchmark=key,relative_mode='ratio'),'5m',ctx);equal(out['Relative strength'],[2]*30)
    ctx['benchmarks'][key]['instrument']['currency']='USD';out,warning=custom_calculate(r,cfg('RELATIVE_STRENGTH',benchmark=key,relative_mode='ratio'),'5m',ctx);assert all(v is None for v in out['Relative strength']);assert 'currencies' in warning[0]
    out,_=custom_calculate(r,cfg('RELATIVE_STRENGTH',benchmark=key,length=5),'5m',ctx);equal(out['Relative strength'][5:],[0]*25)
    del ctx['benchmarks'][key]['candles'][12];out,_=custom_calculate(r,cfg('RELATIVE_STRENGTH',benchmark=key,length=5),'5m',ctx);assert all(v is None for v in out['Relative strength'][12:18])
def test_vix_no_substitute_and_provider_isolation():
    r=rows(30);ctx=reference_context(r);key='hyperliquid:perpetual:ETH:ETH:USDC';out,w=custom_calculate(r,cfg('INDIA_VIX',benchmark=key),'5m',ctx);assert all(v is None for v in out['India VIX']);assert 'verified Yahoo' in w[0]
    ctx['benchmarks'][key]['instrument']['provider']='yahoo';out,w=custom_calculate(r,cfg('RELATIVE_STRENGTH',benchmark=key),'5m',ctx);assert 'Cross-provider' in w[0]
@pytest.mark.parametrize('k',KINDS)
def test_styles_visibility_empty_and_persistence(k):
    c=cfg(k);fields,_=custom_calculate([],c);name=next(iter(fields));c['line_options']={name:dict(visible=False)};c=IndicatorConfig.model_validate(c).model_dump();series,_=custom_studies(rows(),c);assert all(s['name']!=name for s in series);assert IndicatorConfig.model_validate_json(json.dumps(c)).model_dump()==c
@pytest.mark.parametrize('key,value',[('pivot_variant','fake'),('pivot_reference','4h'),('swing_left',0),('swing_right',101),('orb_minutes',0),('session_zone','Atlantis/Sea'),('session_open',1440),('profile_bins',129),('profile_width',81),('profile_value_area',0),('reference_source','fake')])
def test_invalid_settings(key,value):
    with pytest.raises(ValidationError):cfg('PIVOT',**{key:value})
def test_anchored_vwap_preserved_identity_and_bands_codec():
    drawing=Drawing(id='old',kind='anchored_vwap',version=2,anchors=[dict(time=1704067200,price=-10)],params=dict(bands=2,levels=[dict(ratio=0),dict(ratio=1,color='#ff0000',dash='dash',width=3,visible=True),dict(ratio=-1)],fill_bands=True));assert drawing.kind=='anchored_vwap';assert drawing.params.fill_bands
    r=rows(2);v=anchored_vwap(r);p=[(x['high']+x['low']+x['close'])/3 for x in r];vol=[x['volume'] for x in r];mean=sum(a*b for a,b in zip(p,vol))/sum(vol);variance=sum(b*(a-mean)**2 for a,b in zip(p,vol))/sum(vol);assert v['points'][-1]['deviation']==pytest.approx(math.sqrt(variance))
def test_profile_independent_volume_conservation_and_visible_slices():
    r=[dict(time=i,open=10,high=20,low=0,close=10,volume=100) for i in range(10)];profile=estimated_profile(r,4,70);equal([v['volume'] for v in profile['rows']],[250]*4);assert profile['poc']==2.5;assert profile['covered']==750;assert estimated_profile(r[2:5],4)['total']==300
    r[4]['volume']=None;assert estimated_profile(r)['error'];assert estimated_profile(r[:4])['total']==400

def test_woodie_missing_open_never_substituted():
    with pytest.raises(ValueError):pivot_levels(dict(high=3,low=1,close=2),'woodie')
def test_reference_context_shared_ram_cache_and_cancellation():
    from app.history import HistoryService
    from app.providers.base import History
    from app.markets import instrument
    import time
    primary=instrument(dict(symbol='AAPL',exchange='NASDAQ',quoteType='EQUITY'));daily=[{**r,'time':1704153600+i*86400} for i,r in enumerate(rows(20))]
    class Provider:
        name='CONTROLLED FIXTURE'
        calls=0
        def fetch(self,security,interval):self.calls+=1;time.sleep(.03);return History(daily,self.name)
    async def run():
        provider=Provider();service=HistoryService(provider,dict(min_interval=0));registry=SimpleNamespace(resolve=lambda s:primary if s=='AAPL' else None)
        tasks=[asyncio.create_task(build_context(service,registry,'AAPL','1d',['1d','1w','1M'])) for _ in range(3)];await asyncio.sleep(.005);tasks[0].cancel();a,b=await asyncio.gather(*tasks[1:]);assert provider.calls==3;assert service.metrics['deduplicated']>=2;assert a['references']==b['references'];assert not hasattr(registry,'db')
        with pytest.raises(asyncio.CancelledError):await tasks[0]
    asyncio.run(run())
@pytest.mark.parametrize('market,native,base',[('perpetual','BTC','BTC'),('spot','@142','UBTC')])
def test_native_crypto_reference_boundaries_and_benchmark_route(market,native,base):
    from app.market_router import hyperliquid_id
    identity=hyperliquid_id(market,native,base,'USDC');primary=dict(provider='hyperliquid',kind='crypto',category='crypto',canonical_id=identity,native_id=native,base_asset=base,quote_asset='USDC',market_type=market,exchange='HYPERLIQUID',timezone='UTC',currency='USDC');calls=[]
    class Service:
        async def daily(self,sec,interval):
            calls.append((sec['provider'],sec['native_id'],interval));step={'1d':86400,'1w':604800,'1M':2592000}[interval];return SimpleNamespace(candles=[{**rows(1)[0],'time':1700000000,'end_time':1700000000+step,'complete':True}]),False
    async def ensure():pass
    registry=SimpleNamespace(resolve=lambda s:primary if s==identity else None,hyperliquid=SimpleNamespace(ensure=ensure))
    result=asyncio.run(build_context(Service(),registry,identity,'1d',['1d','1w','1M'],include_sessions=False));assert {c[2] for c in calls}=={'1d','1w','1M'};assert all(c[0]=='hyperliquid' and c[1]==native for c in calls);assert result['references']['1M'][0]['end']-result['references']['1M'][0]['start']==2592000
def test_benchmark_policy_before_benchmark_network():
    from app.markets import instrument
    from app.market_router import hyperliquid_id
    primary=instrument(dict(symbol='AAPL',exchange='NASDAQ',quoteType='EQUITY'));identity=hyperliquid_id('perpetual','BTC','BTC','USDC');crypto=dict(provider='hyperliquid',kind='crypto',category='crypto',canonical_id=identity,native_id='BTC',base_asset='BTC',quote_asset='USDC',market_type='perpetual',exchange='HYPERLIQUID');registry=SimpleNamespace(resolve=lambda s:primary if s=='AAPL' else crypto if s==identity else None);service=SimpleNamespace()
    with pytest.raises(ProviderError,match='provider must match'):asyncio.run(build_context(service,registry,'AAPL','1d',[],identity,include_sessions=False))
    with pytest.raises(ProviderError,match='Benchmark unavailable'):asyncio.run(build_context(service,registry,'AAPL','1d',[],'unknown',include_sessions=False))
def test_reference_network_error_is_not_a_fallback():
    from app.markets import instrument
    primary=instrument(dict(symbol='AAPL',exchange='NASDAQ',quoteType='EQUITY'));registry=SimpleNamespace(resolve=lambda _:primary);calls=[]
    class Service:
        async def get(self,*args,**kw):calls.append(args[0]['provider']);raise ProviderError('Controlled provider throttling','rate',60)
    with pytest.raises(ProviderError,match='throttling'):asyncio.run(build_context(Service(),registry,'AAPL','1d',['1d'],include_sessions=False))
    assert calls==['yahoo']
@pytest.mark.parametrize('kind',['ALPHATREND','HALFTREND','CPR_MTF','PIVOT','ORB','RELATIVE_STRENGTH'])
def test_historical_corrections_invalidate_output(kind):
    r=rows();ctx=reference_context(r);c=cfg(kind,benchmark='hyperliquid:perpetual:ETH:ETH:USDC');old,_=custom_calculate(r,c,'5m',ctx);r[120].update(high=r[120]['high']+50,volume=None);new,_=custom_calculate(r,c,'5m',ctx);prefix,_=custom_calculate(r[:100],c,'5m',ctx)
    for name in old:equal(old[name][:100],prefix[name]);assert all(v is None or math.isfinite(v) for v in new[name])
def test_mtf_line_options_support_all_nine_without_relaxing_legacy_limit():
    from app.custom_indicators import fields
    c=cfg('CPR_MTF');c['line_options']={name:dict(visible=True,color='#112233',width=3,style=2) for name in fields(c)};assert len(IndicatorConfig.model_validate(c).line_options)==9
    with pytest.raises(ValidationError):cfg('EMA',line_options={str(i):{} for i in range(9)})

@pytest.mark.parametrize('context',[{'references':{'1m':[]}}, {'references':{'1d':[{}]}}, {'sessions':[[1,0,'x']]}, {'benchmarks':{'x':{'instrument':{},'candles':[{}]}}}, {'warnings':['x'*2001]}, {'primary':[]}, {'script':'alert(1)'}, {'references':{'1d':[{**rows(1)[0],'start':1,'end':0,'complete':True}]}}])
def test_reference_payload_validation(context):
    from app.models import IndicatorRequest
    with pytest.raises(ValidationError):IndicatorRequest(candles=[],indicators=[],reference_context=context)

def test_incomplete_previous_reference_does_not_reuse_older_levels():
    r=rows(10);ctx=reference_context(r);start=r[0]['time'];ctx['references']['1d']=[dict(time=start-172800,start=start-172800,end=start-86400,open=100,high=110,low=90,close=100,complete=True),dict(time=start-86400,start=start-86400,end=start,open=100,high=110,low=90,close=100,complete=False)]
    out,_=custom_calculate(r,cfg('CPR'),'5m',ctx);assert all(v is None for v in out['P'])
def test_missing_native_previous_bucket_does_not_reuse_older_levels():
    r=rows(10);ctx=reference_context(r);ctx['references']['1d']=[v for v in ctx['references']['1d'] if v['end']!=r[0]['time']];out,_=custom_calculate(r,cfg('CPR'),'5m',ctx);assert all(v is None for v in out['P'])
def test_weekly_holiday_label_uses_actual_first_session_open():
    daily=[{**rows(1)[0],'time':stamp(d)} for d in ['2026-05-22','2026-05-26','2026-05-27']];security=dict(provider='yahoo',calendar='XNYS',timezone='America/New_York');refs,_=daily_references(daily,security);weekly=yahoo_period_references([{**daily[0],'time':stamp('2026-05-18')},{**daily[1],'time':stamp('2026-05-25')}],refs,'1w');r=[{**rows(1)[0],'time':stamp('2026-05-25')}];ctx=dict(primary=security,references={'1d':refs,'1w':weekly});out,_=custom_calculate(r,cfg('CPR',pivot_reference='1w'),'1w',ctx);assert out['P'][0] is not None;assert weekly[0]['end']==stamp('2026-05-26T13:30:00')
def test_missing_calendar_week_is_not_reused_as_previous_week():
    daily=[{**rows(1)[0],'time':stamp(d)} for d in ['2026-05-08','2026-05-25','2026-05-26']];refs,_=daily_references(daily,dict(exchange='NSE',timezone='Asia/Kolkata'));ctx=dict(primary=dict(provider='yahoo',timezone='Asia/Kolkata'),references={'1d':refs,'1w':aggregate_references(refs,'1w')});out,_=custom_calculate([daily[-1]],cfg('CPR',pivot_reference='1w'),'1d',ctx);assert out['P'][0] is None

def test_yahoo_weekly_uses_native_ohlc_not_missing_daily_rebuild():
    daily=[{**rows(1)[0],'time':stamp(d)} for d in ['2026-05-18','2026-05-22','2026-05-26']];refs,_=daily_references(daily,dict(calendar='XNYS',timezone='America/New_York'));native=[{**rows(1)[0],'time':stamp('2026-05-18'),'high':500,'low':-100}];out=yahoo_period_references(native,refs,'1w');assert out[0]['high']==500;assert out[0]['low']==-100;assert out[0]['end']==stamp('2026-05-26T13:30:00')
def test_yahoo_native_reference_requires_session_alignment():
    assert yahoo_period_references(rows(1),[],'1w')==[]
def test_incomplete_native_month_keeps_open_but_not_current_hlc_reference():
    daily=[{**rows(1)[0],'time':stamp(d)} for d in ['2026-10-01','2026-10-02']];refs,_=daily_references(daily,dict(exchange='NSE',timezone='Asia/Kolkata'));out=yahoo_period_references([daily[0]],refs,'1M');assert out[0]['start']==stamp('2026-10-01T03:45:00');assert out[0]['complete'] is False;assert out[0]['end'] is None

@pytest.mark.parametrize('kind,momentum',[('ALPHATREND','mfi'),('ALPHATREND','rsi'),('HALFTREND','mfi')])
@pytest.mark.parametrize('field,value',[('close',float('nan')),('high',-1000),('open',None)])
def test_invalid_prices_reset_public_variant_warmup(kind,momentum,field,value):
    r=rows(300);r[120][field]=value;out,_=custom_calculate(r,cfg(kind,period=14,alpha_momentum=momentum));name='AlphaTrend' if kind=='ALPHATREND' else 'HalfTrend';assert out[name][120] is None;assert out[name][-1] is not None;assert all(v is None or math.isfinite(v) for v in out[name])

def test_initial_partial_loaded_week_is_not_certified():
    daily=[{**rows(1)[0],'time':stamp(d)} for d in ['2026-05-20','2026-05-21','2026-05-22','2026-05-26']];refs,_=daily_references(daily,dict(exchange='NSE',timezone='Asia/Kolkata'));weekly=aggregate_references(refs,'1w');assert weekly[0]['complete'] is False

def test_stale_daily_reference_does_not_project_old_levels_into_new_sessions():
    r=rows(20);daily=[{**rows(1)[0],'time':stamp(d)} for d in ['2020-01-01','2020-01-02']];refs,_=daily_references(daily,dict(exchange='NSE',timezone='Asia/Kolkata'));out,_=custom_calculate(r,cfg('CPR'),'5m',dict(primary=dict(provider='yahoo',timezone='Asia/Kolkata'),references={'1d':refs}));assert all(v is None for v in out['P'])

@pytest.mark.parametrize('kind',KINDS)
def test_extreme_finite_prices_never_emit_nonfinite(kind):
    r=[dict(time=1704067200+i*60,open=0,high=1e308,low=-1e308,close=1e308,volume=1e308,complete=True) for i in range(120)];out,_=custom_calculate(r,cfg(kind),'1m',{});assert all(v is None or math.isfinite(v) for values in out.values() for v in values)
