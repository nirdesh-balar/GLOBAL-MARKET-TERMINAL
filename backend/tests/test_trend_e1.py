"""Independent E1 numerical references: numpy/pandas and hand-worked vectors.

These are chart studies only. Do not extend screener/alert registries here.
"""
import math
import json
import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError
from app.indicators import IndicatorCalculator
from app.models import IndicatorConfig,Workspace
from app.trend_indicators import KINDS,calculate_trend


def rows(values=None,count=180):
    values=values if values is not None else [100+math.sin(i*.61)*7+i*.09 for i in range(count)]
    return [dict(time=1700000000+i*60+(86400 if i>40 else 0),open=v-.2,high=v+1.3+(i%3)*.1,low=v-1.1,close=v,volume=None if i%17==0 else 1000+i) for i,v in enumerate(values)]

def cfg(kind,**kwargs):return IndicatorConfig(id=kind,kind=kind,length=6,period=4,**kwargs).model_dump()
def fields(kind,r=None,**kwargs):return {f['name']:f for f in calculate_trend(rows() if r is None else r,cfg(kind,**kwargs))}
def values(kind,r=None,**kwargs):return next(iter(fields(kind,r,**kwargs).values()))['values']
def equal(actual,expected):np.testing.assert_allclose(np.array([np.nan if v is None else v for v in actual]),np.array(expected,dtype=float),rtol=1e-10,atol=1e-9,equal_nan=True)


def ref_ema(series,n,alpha=None):
    # Seed the series once at its first complete rolling mean; pandas owns recursion.
    a=pd.Series(series,dtype=float);first=a.first_valid_index()
    if first is None or len(a)<first+n:return pd.Series(np.nan,index=a.index)
    a.iloc[:first+n-1]=np.nan;a.iloc[first+n-1]=pd.Series(series).iloc[first:first+n].mean()
    return a.ewm(alpha=alpha or 2/(n+1),adjust=False,ignore_na=False).mean()

@pytest.mark.parametrize('kind',['HMA','SMMA','DEMA','TEMA','LSMA','LINREG','CMO','DPO','ICHIMOKU','ADX','AROON','VORTEX','KAMA','MCGINLEY'])
def test_independent_reference(kind):
    r=rows();c=cfg(kind);x=pd.Series([v['close'] for v in r]);high=pd.Series([v['high'] for v in r]);low=pd.Series([v['low'] for v in r]);n=c['length'];p=c['period'];out=fields(kind,r)
    if kind=='HMA':
        wma=lambda a,l:a.rolling(l).apply(lambda z:np.dot(z,np.arange(1,l+1))/np.arange(1,l+1).sum(),raw=True)
        equal(out['HMA']['values'],wma(2*wma(x,n//2)-wma(x,n),math.isqrt(n)))
    elif kind in ('SMMA','DEMA','TEMA'):
        a=ref_ema(x,n,1/n if kind=='SMMA' else None)
        if kind=='SMMA':expected=a
        else:
            b=ref_ema(a,n);expected=2*a-b if kind=='DEMA' else 3*a-3*b+ref_ema(b,n)
        equal(out[kind]['values'],expected)
    elif kind in ('LSMA','LINREG'):
        fit=lambda z:np.linalg.lstsq(np.column_stack([np.ones(n),np.arange(n)]),z,rcond=None)[0]
        if kind=='LSMA':equal(out[kind]['values'],x.rolling(n).apply(lambda z:np.dot(fit(z),[1,n-1]),raw=True))
        else:
            a,b=fit(x.iloc[-n:]);equal(out['Regression fit']['values'],[np.nan]*(len(x)-n)+list(a+b*np.arange(n)))
    elif kind=='CMO':
        delta=x.diff();g=delta.clip(lower=0).rolling(p).sum();l=-delta.clip(upper=0).rolling(p).sum();equal(out[kind]['values'],100*(g-l)/(g+l))
    elif kind=='DPO':equal(out[kind]['values'],x.shift(n//2+1)-x.rolling(n).mean())
    elif kind=='ICHIMOKU':
        middle=lambda l:(high.rolling(l).max()+low.rolling(l).min())/2
        a=middle(9);b=middle(26)
        for name,expected in [('Tenkan',a),('Kijun',b),('Senkou A',(a+b)/2),('Senkou B',middle(52)),('Chikou',x)]:equal(out[name]['values'],expected)
        assert out['Senkou A']['offset']==26 and out['Chikou']['offset']==-26
    elif kind=='ADX':
        tr=pd.concat([high-low,(high-x.shift()).abs(),(low-x.shift()).abs()],axis=1).max(axis=1);tr.iloc[0]=np.nan
        u=high.diff();d=-low.diff();pos=u.where((u>d)&(u>0),0.);neg=d.where((d>u)&(d>0),0.);pos.iloc[0]=neg.iloc[0]=np.nan
        t=ref_ema(tr,p,1/p);a=100*ref_ema(pos,p,1/p)/t;b=100*ref_ema(neg,p,1/p)/t
        equal(out['+DI']['values'],a);equal(out['-DI']['values'],b);equal(out['ADX']['values'],ref_ema(100*(a-b).abs()/(a+b),p,1/p))
    elif kind=='AROON':
        recent_max=lambda z:p-int(np.argmax(z[::-1]));recent_min=lambda z:p-int(np.argmin(z[::-1]))
        up=100*high.rolling(p+1).apply(recent_max,raw=True)/p;dn=100*low.rolling(p+1).apply(recent_min,raw=True)/p
        equal(out['Aroon up']['values'],up);equal(out['Aroon down']['values'],dn);equal(out['Aroon oscillator']['values'],up-dn)
    elif kind=='VORTEX':
        tr=pd.concat([high-low,(high-x.shift()).abs(),(low-x.shift()).abs()],axis=1).max(axis=1);tr.iloc[0]=np.nan;den=tr.rolling(p).sum()
        equal(out['+VI']['values'],(high-low.shift()).abs().rolling(p).sum()/den);equal(out['-VI']['values'],(low-high.shift()).abs().rolling(p).sum()/den)
    elif kind=='KAMA':
        er=(x-x.shift(n)).abs()/x.diff().abs().rolling(n).sum();coeff=(er*(2/3-2/31)+2/31)**2
        # Closed weighted sum of input contributions, independent of recursive implementation.
        expected=[np.nan]*n
        for t in range(n,len(x)):
            weights=np.array([np.prod(1-coeff.iloc[j+1:t+1]) for j in range(n,t+1)])
            expected.append(x.iloc[n-1]*np.prod(1-coeff.iloc[n:t+1])+np.dot(coeff.iloc[n:t+1]*x.iloc[n:t+1],weights))
        equal(out['KAMA']['values'],expected)
    else:
        # Decimal reference prevents sharing floating update implementation.
        from decimal import Decimal,localcontext
        with localcontext() as ctx:
            ctx.prec=45;data=list(map(lambda v:Decimal(str(v)),x));a=sum(data[:n])/n;expected=[np.nan]*(n-1)+[float(a)]
            for v in data[n:]:a=a+(v-a)/(Decimal('.6')*n*(v/a)**4);expected.append(float(a))
        equal(out['McGinley']['values'],expected)


def test_sar_hand_worked_clipping_and_reversal():
    r=[dict(time=i+1,open=v,close=v,high=v+1,low=v-1,volume=1) for i,v in enumerate([10,11,12,13,14,5,4])]
    equal(values('SAR',r),[np.nan,9,9,9.16,9.4504,15,15])


def test_zigzag_known_at_and_provisional():
    r=rows([100,110,120,118,113,114,121]);f=fields('ZIGZAG',r)
    equal(f['Confirmed pivots']['values'],[100,np.nan,120,np.nan,113,np.nan,np.nan]);equal(f['Provisional leg']['values'],[np.nan,np.nan,np.nan,np.nan,113,np.nan,121])
    assert f['Confirmed pivots']['known_at'][2]==r[4]['time'];assert f['Confirmed pivots']['known_at'][4]==r[6]['time']
    assert fields('ZIGZAG',r[:4])['Confirmed pivots']['values'][2] is None

@pytest.mark.parametrize('kind',KINDS)
def test_insufficient_history_and_nullable_warmup(kind):
    assert all(v is None for f in calculate_trend([],cfg(kind)) for v in f['values'])
    r=rows(count=180);result=IndicatorCalculator.calculate(r,[cfg(kind)])
    assert result['series'];assert all(p['value'] is None or math.isfinite(p['value']) for s in result['series'] for p in s['points'])
    # Stored bar times always represent the input/availability time; no guessed future session.
    assert all([p['time'] for p in s['points']]==[x['time'] for x in r] for s in result['series'])

@pytest.mark.parametrize('kind',KINDS)
@pytest.mark.parametrize('mode',['flat','negative','zero','gap'])
def test_numerical_edges(kind,mode):
    r=rows([0. if mode=='zero' else -25. if mode=='negative' else 10.]*100)
    if mode=='gap':r[60]['close']=float('nan')
    result=IndicatorCalculator.calculate(r,[cfg(kind)])
    for s in result['series']:
        for p in s['points']:assert p['value'] is None or math.isfinite(p['value'])
    if mode=='gap':assert all(s['points'][60]['value'] is None for s in result['series'])

@pytest.mark.parametrize('kind',KINDS)
def test_replay_isolation(kind):
    r=rows();prefix=r[:75];before=IndicatorCalculator.calculate(prefix,[cfg(kind)])
    for row in r[75:]:row.update(open=1e6,close=1e6,high=2e6,low=0)
    assert IndicatorCalculator.calculate(r[:75],[cfg(kind)])==before

@pytest.mark.parametrize('kind,first',[('HMA',6),('SMMA',5),('DEMA',10),('TEMA',15),('KAMA',6),('LSMA',5),('CMO',4),('DPO',5),('VORTEX',4),('ADX',4)])
def test_exact_first_valid(kind,first):
    f=values(kind);assert next(i for i,v in enumerate(f) if v is not None)==first

@pytest.mark.parametrize('changes',[{'length':0},{'kind':'HMA','length':1},{'kind':'KAMA','kama_fast':31},{'kind':'SAR','acceleration':.5,'acceleration_max':.2},{'displacement':-1},{'span_b':0},{'reversal':0},{'acceleration_step':float('inf')},{'opacity':float('nan')},{'reference_levels':[float('inf')]},{'line_options':{'a':{'opacity':2}}}])
def test_invalid_parameters(changes):
    with pytest.raises(ValidationError):IndicatorConfig.model_validate(dict(id='bad',kind='HMA')|changes)

@pytest.mark.parametrize('kind',KINDS)
def test_settings_roundtrip(kind):
    c=IndicatorConfig.model_validate(cfg(kind,opacity=.6,line_options={'Tenkan':{'visible':False,'color':'#112233','opacity':.3}},reference_levels=[-25,0,25]))
    assert IndicatorConfig.model_validate_json(c.model_dump_json())==c

@pytest.mark.parametrize('times',[[1,1],[2,1],[1,float('inf')],[1,float('nan')]])
def test_invalid_timestamp_rejected(times):
    r=rows([1,2]);[v.update(time=t) for v,t in zip(r,times)];result=IndicatorCalculator.calculate(r,[cfg('HMA')]);assert result['series']==[] and result['warnings']


def test_adx_wilder_flat_and_trending_vectors():
    r=rows(list(range(1,100)));f=fields('ADX',r);assert f['ADX']['values'][6] is None;assert f['ADX']['values'][7]==pytest.approx(100);assert f['-DI']['values'][-1]==0
    for row in r:row.update(open=0,close=0,high=0,low=0)
    f=fields('ADX',r);assert all(f[k]['values'][-1]==0 for k in ['ADX','+DI','-DI'])


def test_dpo_center_is_only_visual():
    r=rows();a=fields('DPO',r)['DPO'];b=fields('DPO',r,centered=True)['DPO'];assert a['values']==b['values'];assert a['offset']==0 and b['offset']==-4


def test_vortex_zero_range_undefined():
    r=[dict(time=i+1,open=0,high=0,low=0,close=0,volume=0) for i in range(50)];assert all(v is None for f in fields('VORTEX',r).values() for v in f['values'])


def test_sar_penetration_checked_before_prior_range_clip():
    r=[dict(time=i+1,open=v,close=v,high=v+1,low=v-1,volume=1) for i,v in enumerate([10,11,10.04])]
    equal(values('SAR',r),[np.nan,9,12])


@pytest.mark.parametrize('kind',KINDS)
@pytest.mark.parametrize('bad',[float('inf'),float('-inf'),None])
def test_nonfinite_or_missing_ohlc_gap(kind,bad):
    r=rows();r[80]['high']=bad
    result=IndicatorCalculator.calculate(r,[cfg(kind)])
    for s in result['series']:
        assert s['points'][80]['value'] is None
        assert all(p['value'] is None or math.isfinite(p['value']) for p in s['points'])


def test_zigzag_forming_reversal_stays_provisional():
    r=rows([100,110,120,118,113]);r[-1]['end_time']=4102444800
    f=fields('ZIGZAG',r);assert f['Confirmed pivots']['values'][2] is None
    assert f['Provisional leg']['values'][2]==120 and f['Provisional leg']['values'][4]==113
    r[-1]['end_time']=r[-1]['time']+60
    assert fields('ZIGZAG',r)['Confirmed pivots']['values'][2]==120


def test_indicator_input_retains_native_end_time():
    from app.models import InputCandle
    r=rows([100,110,120,118,113]);r[-1]['end_time']=4102444800
    decoded=[InputCandle.model_validate(v).model_dump() for v in r]
    f=fields('ZIGZAG',decoded)
    assert f['Confirmed pivots']['values'][2] is None
