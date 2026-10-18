import math,json
import numpy as np
import pytest
from app.models import IndicatorConfig,IndicatorRequest,Workspace
from app.indicators import IndicatorCalculator
from app.volume_indicators import KINDS,CUMULATIVE,calculate_volume,volume_studies,units
from e3a_reference import reference

def rows(mode='normal',n=180):
    out=[]
    for i in range(n):
        x=80+i*.17+math.sin(i*.7)*3 if mode!='falling' else 180-i*.3+math.sin(i)*2
        if mode=='negative':x=-100+i*.08+math.sin(i)*2
        if mode in ('flat','zero'):x=0 if mode=='zero' else 25
        v=100+(i*17)%51
        if mode=='zero_volume':v=0
        out.append(dict(time=1704067200+i*60+(i//17)*3600,open=x,high=x+2,low=x-2,close=x+.5,volume=v,session=str(i//20)))
    if mode=='gap':out[21]['volume']=None;out[72]['close']=float('nan')
    if mode=='short':out=out[:3]
    if mode=='empty':out=[]
    return out

def cfg(k,**kw):return IndicatorConfig(id=k,kind=k,**kw).model_dump()
def equal(a,b):np.testing.assert_allclose(np.asarray(a,dtype=float),np.asarray(b,dtype=float),equal_nan=True,rtol=2e-10,atol=1e-7)
@pytest.mark.parametrize('k',KINDS)
@pytest.mark.parametrize('mode',['normal','falling','negative','flat','zero','zero_volume','gap','short','empty'])
def test_independent_vectors(k,mode):
    c=cfg(k);r=rows(mode);equal(calculate_volume(r,c),reference(r,c))
@pytest.mark.parametrize('k',KINDS)
def test_custom_parameters_sources(k):
    c=cfg(k,length=5,fast=2,slow=7,volume_ma='sma',volume_osc_mode='absolute',volume_seed=250,eom_divisor=1,source='OHLC4');r=rows();equal(calculate_volume(r,c),reference(r,c))
@pytest.mark.parametrize('k',KINDS)
@pytest.mark.parametrize('field,value',[('volume',None),('volume',-1),('volume',float('nan')),('volume',float('inf')),('close',float('nan')),('high',-500),('open',float('inf'))])
def test_invalid_bars_not_zero(k,field,value):
    r=rows();r[60][field]=value;a=calculate_volume(r,cfg(k));assert a[60] is None
    if k in CUMULATIVE:assert all(v is None for v in a[60:])
    assert all(v is None or math.isfinite(v) for v in a)
@pytest.mark.parametrize('k',KINDS)
def test_replay_prefix_and_future_mutation(k):
    r=rows();c=cfg(k);a=calculate_volume(r,c);prefix=r[:85];equal(calculate_volume(prefix,c),a[:85]);r[100]['volume']=None;equal(calculate_volume(r,c)[:85],a[:85])
@pytest.mark.parametrize('k',KINDS)
def test_all_timeframes_units_and_styles(k):
    for interval in ['1m','5m','15m','30m','1h','4h','1d','1w','1M']:
        c=cfg(k,line_options={k:dict(color='#123456',style=2,width=3,opacity=.4)},reference_levels=[0]);a=IndicatorCalculator.calculate(rows(),[c],interval,volume_context=dict(volume_unit='BTC base units'));s=a['series'][0];assert s['pane']=='e3a:'+k and s['linear_scale'];assert s['color']=='#123456' and s['width']==3 and s['style']==2 and s['opacity']==.4;assert s['levels']==[0] and s['units']
        assert IndicatorConfig.model_validate(json.loads(json.dumps(c))).model_dump()==c
@pytest.mark.parametrize('k',KINDS)
def test_zeros_unknown_in_forex_context(k):
    c=cfg(k);r=rows('zero_volume');ctx=dict(volume_unit='FX volume (provider units unconfirmed)',zero_volume_is_missing=True);assert all(v is None for v in calculate_volume(r,c,ctx));equal(calculate_volume(r,c,ctx),reference(r,c,ctx))
@pytest.mark.parametrize('k',KINDS)
def test_first_warmup(k):
    first={'OBV':0,'ADL':0,'NVI':0,'PVI':0,'PVT':0,'CMF':19,'MFI':14,'VO':9,'EOM':14,'TMF':21,'VROC':12}[k];a=calculate_volume(rows(),cfg(k));assert next(i for i,x in enumerate(a) if x is not None)==first
@pytest.mark.parametrize('k',CUMULATIVE)
def test_no_session_reset_and_correction(k):
    r=rows();c=cfg(k);a=calculate_volume(r,c);r2=[{**r,'session':'another'} for r in r];equal(calculate_volume(r2,c),a);r2[40]['volume']=None;assert all(v is None for v in calculate_volume(r2,c)[40:]);r2[40]=r[40];equal(calculate_volume(r2,c),a)
@pytest.mark.parametrize('k',KINDS)
def test_reserved_id_visibility(k):
    c=cfg(k);c['id']='main';a=volume_studies(rows(),c);assert a[0]['pane']=='e3a:main';c['line_options']={k:dict(visible=False)};assert volume_studies(rows(),c)==[]
@pytest.mark.parametrize('params',[dict(kind='VO',fast=10,slow=5),dict(kind='VO',volume_ma='bad'),dict(kind='VO',volume_osc_mode='bad'),dict(kind='EOM',eom_divisor=0),dict(kind='NVI',volume_seed=-1),dict(kind='PVI',volume_seed=float('nan')),dict(kind='CMF',length=0)])
def test_invalid_settings(params):
    with pytest.raises(ValueError):IndicatorConfig(id='x',**params)
def test_hand_worked_obv_ad_nvi_pvi_pvt():
    r=[dict(time=i+1,open=x,high=x+1,low=x-1,close=x,volume=v) for i,(x,v) in enumerate([(10,100),(12,80),(9,120),(9,120)])]
    equal(calculate_volume(r,cfg('OBV')),[0,80,-40,-40]);equal(calculate_volume(r,cfg('ADL')),[0,0,0,0]);equal(calculate_volume(r,cfg('NVI')),[1000,1200,1200,1200]);equal(calculate_volume(r,cfg('PVI')),[1000,1000,750,750]);equal(calculate_volume(r,cfg('PVT')),[0,16,-14,-14])
def test_mfi_flat_denominator_and_negative():
    r=rows('flat');assert all(v is None for v in calculate_volume(r,cfg('MFI')));assert all(v is None for v in calculate_volume(rows('negative'),cfg('MFI')))
def test_invalid_api_volume_rejected():
    for v in [-1,float('nan'),float('inf'),True]:
        with pytest.raises(ValueError):IndicatorRequest(candles=[{**rows()[0],'volume':v}],indicators=[])
def test_units_do_not_claim_cross_market_equivalence():
    assert units(cfg('OBV'),dict(volume_unit='BTC base units'))=='BTC base units';assert units(cfg('OBV'),dict(volume_unit='shares'))=='shares';assert units(cfg('MFI'))=='%'
