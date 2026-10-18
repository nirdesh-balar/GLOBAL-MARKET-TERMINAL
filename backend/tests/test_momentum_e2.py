import copy,math
import numpy as np
import pytest
from pydantic import ValidationError
from app.models import IndicatorConfig,Workspace
from app.indicators import IndicatorCalculator
from app.momentum_indicators import KINDS,DEFAULTS,OVERLAYS,calculate_momentum,annual_factor,momentum_studies
from e2_reference import reference

def rows(count=180,mode='regular'):
 out=[]
 for i in range(count):
  v=100+.13*i+math.sin(i*.31)*3
  if mode=='falling':v=150-.2*i+math.sin(i*.31)
  if mode=='negative':v-=170
  if mode in ('flat','zero'):v=10 if mode=='flat' else 0
  r=dict(time=1700000000+60*i+(120 if i>70 else 0),open=v,high=v+(0 if mode in ('flat','zero') else 2),low=v-(0 if mode in ('flat','zero') else 2),close=v+(0 if mode in ('flat','zero') else .3),volume=None)
  if mode=='gap' and i==80:r['close']=None
  out.append(r)
 return out

def config(kind,**kw):return IndicatorConfig(id=kind,kind=kind,**kw).model_dump()
def arrays(r,c,interval='1d'):return {f['name']:f['values'] for f in calculate_momentum(r,c,interval)}
def equal(a,b):np.testing.assert_allclose(np.asarray(a,dtype=float),np.asarray(b,dtype=float),rtol=2e-9,atol=2e-8,equal_nan=True)

@pytest.mark.parametrize('kind',KINDS)
@pytest.mark.parametrize('mode',['regular','falling','negative','flat','zero','gap'])
def test_independent_references(kind,mode):
 c=config(kind);r=rows(mode=mode);expected=reference(r,c);actual=arrays(r,c)
 assert set(actual)==set(expected)
 for name,a in actual.items():equal(a,expected[name])

FIRST={'STOCH':15,'CCI':19,'ROC':9,'AO':33,'MOM':10,'WILLR':13,'ULTOSC':28,'TSI':37,'FISHER':8,'PPO':25,'KST':44,'COPPOCK':23,'CKS':17,'KC':19,'DC':19,'STDDEV':19,'HV':20,'CHAIKIN_VOL':19,'CHOP':13,'MASS':40}
@pytest.mark.parametrize('kind',KINDS)
def test_exact_warmup_and_short_history(kind):
 c=config(kind);a=next(iter(arrays(rows(),c).values()));first=next(i for i,v in enumerate(a) if v is not None);assert first==FIRST[kind]
 assert all(v is None for a in arrays(rows(first),c).values() for v in a)
 assert all(len(a)==0 for a in arrays([],c).values())

@pytest.mark.parametrize('kind',KINDS)
def test_prefix_causal_immutable_and_multiple_instances(kind):
 c=config(kind);r=rows();before=copy.deepcopy(r);a=arrays(r[:100],c);full=arrays(r,c)
 for k in a:equal(a[k],full[k][:100])
 r[130]['high']=1e5;r[130]['close']=1000
 for k,v in arrays(r[:100],c).items():equal(v,a[k])
 assert before[:100]==r[:100]
 out=IndicatorCalculator.calculate(r,[c,{**c,'id':'second'}]);assert {s['id'] for s in out['series']}=={kind,'second'}

@pytest.mark.parametrize('kind',KINDS)
@pytest.mark.parametrize('field,value',[('close',float('nan')),('high',float('inf')),('low',float('-inf')),('open',None)])
def test_invalid_bar_never_produces_nonfinite(kind,field,value):
 r=rows();r[80][field]=value;a=arrays(r,config(kind));assert all(v is None or math.isfinite(v) for line in a.values() for v in line)
 assert all(line[80] is None for line in a.values())

@pytest.mark.parametrize('kind',KINDS)
def test_styles_visibility_and_persistence(kind):
 c=config(kind);result=momentum_studies(rows(),c);assert result
 names=[s['name'] for s in result];c['line_options']={names[0]:dict(visible=False),names[-1]:dict(color='#abcdef',width=3,style=2,opacity=.4)} if len(names)>1 else {names[0]:dict(color='#abcdef',width=3,style=2,opacity=.4)}
 c['reference_levels']=[];result=momentum_studies(rows(),c);assert all(s['levels']==[] for s in result);assert result[-1]['color']=='#abcdef' and result[-1]['width']==3 and result[-1]['opacity']==.4
 assert all(s['pane']==('main' if kind in OVERLAYS else 'e2:'+kind) and s['linear_scale']==(kind not in OVERLAYS) for s in result)
 normalized=IndicatorConfig.model_validate(c).model_dump()
 assert IndicatorConfig.model_validate_json(IndicatorConfig.model_validate(c).model_dump_json()).model_dump()==normalized

@pytest.mark.parametrize('mode',['per_bar','sessions','crypto','custom'])
@pytest.mark.parametrize('interval',['1m','4h','1d','1w','1M'])
def test_hv_annualization_independent(mode,interval):
 c=config('HV',annualization=mode,annual_days=252,session_minutes=375,annual_bars=12345);r=rows()
 for k,v in arrays(r,c,interval).items():equal(v,reference(r,c,interval)[k])
 assert annual_factor(config('HV'),interval)==1

@pytest.mark.parametrize('kind,change',[(k,{'length':1}) for k in ['CCI','STDDEV','HV','CHOP']]+[(k,{'fast':30,'slow':20}) for k in ['PPO','TSI','AO','COPPOCK']]+[('ULTOSC',{'ultimate_periods':[7,7,28]}),('KST',{'roc_lengths':[1,2]}),('KST',{'kst_smoothing':[1,2,3,501]}),('HV',{'annual_bars':0}),('HV',{'annual_bars':float('inf')}),('HV',{'annualization':'magic'}),('CKS',{'stop_period':0})])
def test_parameter_validation(kind,change):
 with pytest.raises(ValidationError):config(kind,**change)

def test_channel_atr_reuse_and_missing_volume():
 c=config('KC',length=10,period=10,multiplier=2);r=rows();a=arrays(r,c);atr=IndicatorCalculator.calculate(r,[dict(id='atr',kind='ATR',period=10)])['series'][0]['points']
 for i,p in enumerate(atr):
  if a['Keltner upper'][i] is not None:assert a['Keltner upper'][i]-a['Keltner middle'][i]==pytest.approx(2*p['value'])
 assert all(v is not None for v in a['Keltner middle'][9:]) # E2 never needs volume.

def test_hv_negative_prices_arithmetic_and_zero_base():
 r=rows(mode='negative');a=arrays(r,config('HV',hv_returns='log'));assert all(v is None for v in a['Historical Volatility'])
 c=config('HV',hv_returns='arithmetic');a=arrays(r,c)['Historical Volatility'];assert a[-1] is not None;equal(a,reference(r,c)['Historical Volatility'])
 r[80].update(open=0,high=0,low=0,close=0);a=arrays(r,c)['Historical Volatility'];assert a[81] is None

@pytest.mark.parametrize('kind',KINDS)
def test_source_and_parameter_variants(kind):
 kw={'source':'OHLC4','length':7,'period':5,'fast':3,'slow':8,'signal':4,'stoch_period':7,'k':2,'d':2,'stop_period':3,'roc_lengths':[3,5,7,9],'kst_smoothing':[2,3,4,5],'ultimate_periods':[3,5,9],'sample':True,'hv_returns':'arithmetic'}
 c=config(kind,**kw);r=rows();a=arrays(r,c)
 for k,v in a.items():equal(v,reference(r,c)[k])


def test_oscillator_id_cannot_reset_main_price_scale():
 c=config('CCI');c['id']='main';s=momentum_studies(rows(),c)
 assert all(v['pane']!='main' and v['linear_scale'] for v in s)
