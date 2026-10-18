import math
import pytest
from pydantic import ValidationError
from app.drawing_analytics import position,anchored_vwap,estimated_profile,parse_ghost
from app.models import Drawing,Workspace,DRAWING_ANCHORS


def bar(price,volume=1,time=1):return dict(time=time,open=price,high=price,low=price,close=price,volume=volume)

@pytest.mark.parametrize('short,entry,stop,target',[(False,100,90,130),(True,100,110,70),(False,-40,-50,-10),(True,-40,-30,-70),(False,0,-10,30),(True,0,10,-30)])
def test_position_financial_units(short,entry,stop,target):
    r=position(entry,stop,target,short,account_size=100000,risk_percent=1,multiplier=50,rate=2,lot_step=1,confirmed=True)
    assert r['conventional'] and r['risk']==10 and r['reward']==30 and r['ratio']==3
    assert r['quantity']==1 and r['riskCash']==1000 and r['stopPL']==-1000 and r['targetPL']==3000
    assert r['riskPercent']==(10/abs(entry)*100 if entry else None)

@pytest.mark.parametrize('entry,stop,target',[(100,110,120),(100,100,120),(100,90,80),(-40,-30,-10)])
def test_unconventional_explicit(entry,stop,target):
    r=position(entry,stop,target)
    assert not r['conventional'] and r['quantity'] is None and r['stopPL'] is None

def test_quantity_rounding_manual_and_no_fictional_contract():
    r=position(100,93,120,account_size=10000,risk_percent=1,lot_step=5,confirmed=True)
    assert r['quantity']==10 and r['riskCash']==70
    assert position(100,93,120,auto_size=False,quantity=12,lot_step=5,confirmed=True)['quantity']==10
    assert position(100,100,120,confirmed=True)['quantity'] is None
    assert position(100,90,120)['quantity'] is None

@pytest.mark.parametrize('source,expected',[('O',10),('H',20),('L',0),('C',15),('HL2',10),('HLC3',35/3),('OHLC4',45/4)])
def test_vwap_sources(source,expected):
    r=dict(time=1,open=10,high=20,low=0,close=15,volume=2)
    assert anchored_vwap([r],source)['points'][0]['value']==pytest.approx(expected)

@pytest.mark.parametrize('offset',[-100,0,1e9])
def test_weighted_vwap_independent_formula(offset):
    rows=[bar(offset+10,2,1),bar(offset+30,6,2),bar(offset+100,0,3)]
    result=anchored_vwap(rows)['points'];assert result[-1]['value']==pytest.approx(offset+25)
    assert result[-1]['deviation']==pytest.approx(math.sqrt(75)) and result[-1]['volume']==8
    assert result[-1]['value']==result[-2]['value']

@pytest.mark.parametrize('volume',[None,-1,float('nan'),float('inf'),0])
def test_volume_unavailable_not_invented(volume):
    rows=[bar(10,volume)]
    assert anchored_vwap(rows)['error'] and estimated_profile(rows)['error']

def test_initial_zero_volume_and_gaps():
    result=anchored_vwap([bar(100,0,1),bar(20,2,2)])['points']
    assert result[0]['value'] is None and result[1]['value']==20
    assert anchored_vwap([bar(20,1,1),bar(30,None,2)])['error']

@pytest.mark.parametrize('bins',[2,3,10,24,128])
@pytest.mark.parametrize('shift',[-200,0,500])
def test_profile_conservation_and_value_area(bins,shift):
    rows=[dict(time=1,open=shift+3,high=shift+10,low=shift,close=shift+8,volume=100),bar(shift+2,100,2)]
    r=estimated_profile(rows,bins,70)
    assert sum(b['volume'] for b in r['rows'])==pytest.approx(200)
    assert r['total']==200 and r['covered']>=140-1e-8 and r['val']<=r['poc']<=r['vah']
    included=[i for i,b in enumerate(r['rows']) if b['inArea']]
    assert included==list(range(min(included),max(included)+1))

def test_profile_known_allocation_tie_and_flat_prices():
    row=dict(time=1,open=0,high=10,low=0,close=10,volume=100)
    r=estimated_profile([row],2,70);assert [v['volume'] for v in r['rows']]==[50,50]
    assert (r['poc'],r['val'],r['vah'],r['covered'])==(2.5,0,10,100)
    r=estimated_profile([bar(-40,50),bar(-40,100,2)],24,70)
    assert len(r['rows'])==1 and r['poc']==r['vah']==r['val']==-40 and r['total']==150

@pytest.mark.parametrize('bins,va',[(1,70),(129,70),(2.5,70),(24,0),(24,101)])
def test_profile_rejects_configuration(bins,va):
    with pytest.raises(ValueError):estimated_profile([bar(1)],bins,va)

@pytest.mark.parametrize('text',['','0,0,0,1,0','0,0,1,-1,nan','0,0,1,-1,0\n0,0,1,-1,0','10001,0,1,-1,0','0,,1,-1,0','<script>','0,0,1,-1,0,0'])
def test_hypothetical_schema_rejections(text):
    with pytest.raises(ValueError):parse_ghost(text)
    with pytest.raises(ValidationError):Drawing(id='bad',kind='ghost_feed',version=2,anchors=[dict(time=1,price=-40)],params=dict(ghost_bars=text))

def test_hypothetical_negative_offsets_and_zero():
    assert parse_ghost('0,-40,0,-50,-20\n2,0,1,-1,0')[0]['open']==-40

@pytest.mark.parametrize('kind',['long_position','short_position','position_forecast','bars_pattern','ghost_feed','sector','anchored_vwap','fixed_volume_profile','anchored_volume_profile'])
def test_stage4_persistence_and_schema(kind):
    d=Drawing(id=kind,kind=kind,version=2,anchors=[dict(time=i+1,price=-40+i) for i in range(DRAWING_ANCHORS[kind])])
    assert Drawing.model_validate_json(d.model_dump_json())==d
    with pytest.raises(ValidationError):Drawing(**{**d.model_dump(),'params':{'script':'evil'}})

@pytest.mark.parametrize('params',[{'bins':1},{'price_source':'trade'},{'unit_multiplier':0},{'lot_step':0},{'money_rate':0},{'bull_color':'javascript:alert(1)'}])
def test_stage4_parameter_bounds(params):
    kind='anchored_vwap' if 'price_source' in params else 'fixed_volume_profile' if 'bins' in params else 'long_position'
    with pytest.raises(ValidationError):Drawing(id='bad',kind=kind,version=2,anchors=[dict(time=i+1,price=10) for i in range(DRAWING_ANCHORS[kind])],params=params)

def test_forecast_waypoints_and_version_preservation():
    anchors=[dict(time=i+1,price=0) for i in range(32)]
    assert len(Drawing(id='path',kind='position_forecast',version=2,anchors=anchors).anchors)==32
    with pytest.raises(ValidationError):Drawing(id='path',kind='position_forecast',version=2,anchors=anchors+[dict(time=33,price=0)])
    with pytest.raises(ValidationError):Drawing(id='legacy',kind='long_position',version=1,anchors=anchors[:3])

@pytest.mark.parametrize('precision',[-1,0,2,5,10])
def test_position_user_precision(precision):
    d=Drawing(id='precision',kind='long_position',version=2,anchors=[dict(time=i+1,price=100+i) for i in range(3)],params={'price_precision':precision})
    assert Drawing.model_validate_json(d.model_dump_json()).params.price_precision==precision

@pytest.mark.parametrize('precision',[-2,11,1.5])
def test_position_precision_rejects_invalid(precision):
    with pytest.raises(ValidationError):Drawing(id='precision',kind='long_position',version=2,anchors=[dict(time=i+1,price=100+i) for i in range(3)],params={'price_precision':precision})

@pytest.mark.parametrize('currency,rate',[('USD',1),('INR',80),('JPY',150),('EUR',.9),('BTC',.00001)])
def test_explicit_currency_unit_calibrations(currency,rate):
    r=position(100,90,140,confirmed=True,auto_size=False,quantity=2,multiplier=5,rate=rate)
    assert r['stopPL']==pytest.approx(-100*rate) and r['targetPL']==pytest.approx(400*rate)
    d=Drawing(id='currency',kind='long_position',version=2,anchors=[dict(time=i+1,price=100+i) for i in range(3)],params={'display_currency':currency,'money_rate':rate,'unit_multiplier':5,'sizing_confirmed':True})
    assert Drawing.model_validate_json(d.model_dump_json()).params.display_currency==currency
