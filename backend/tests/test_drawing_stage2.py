import math
import pytest
from pydantic import ValidationError
from app.models import Drawing
from test_drawing_stage1 import drawing
from test_direct_history import app,client

@pytest.mark.parametrize('kind',['fib_retracement','fib_extension'])
@pytest.mark.parametrize('price',[-40,0,100])
def test_fib_financial_values(kind,price):
    v=drawing(kind,params=dict(levels=[dict(ratio=r,color='#ff0000',dash='dot',width=4,visible=True) for r in [0,.236,.382,.5,.618,.786,1]],reverse=True,extend_left=True,extend_right=False,labels=True))
    v['anchors'][0]['price']=price
    d=Drawing.model_validate(v)
    assert d.anchors[0].price==price and len(d.params.levels)==7
    assert Drawing.model_validate_json(d.model_dump_json())==d

@pytest.mark.parametrize('levels',[[],[{'ratio':math.inf}],[{'ratio':1},{'ratio':1}],[{'ratio':1001}],[{'ratio':1,'color':'javascript:'}],[{'ratio':1,'width':8}],[{'ratio':n} for n in range(33)]])
def test_fib_invalid_levels_rejected(levels):
    with pytest.raises(ValidationError):Drawing.model_validate(drawing('fib_retracement',params=dict(levels=levels)))

@pytest.mark.parametrize('count',[2,3,8,32])
def test_polyline_variable_vertices(count):
    v=drawing('polyline');v['anchors']=[dict(time=1704067200+i*86400,price=i-10) for i in range(count)]
    assert len(Drawing.model_validate(v).anchors)==count

@pytest.mark.parametrize('count',[1,33])
def test_polyline_invalid_counts(count):
    v=drawing('polyline');v['anchors']=[dict(time=1704067200+i*86400,price=i) for i in range(count)]
    with pytest.raises(ValidationError):Drawing.model_validate(v)

@pytest.mark.parametrize('kind',['price_range','date_range','date_price_range','ruler','arrow','arrow_marker','arrow_up','arrow_down','circle','ellipse','triangle','polyline'])
def test_stage2_negative_price_roundtrip(kind):
    v=drawing(kind)
    for i,a in enumerate(v['anchors']):a['price']=-40+i*10
    assert Drawing.model_validate_json(Drawing.model_validate(v).model_dump_json()).kind==kind

@pytest.mark.parametrize('size',[0,81,math.nan])
def test_marker_size_limits(size):
    with pytest.raises(ValidationError):Drawing.model_validate(drawing('arrow_up',params={'marker_size':size}))

def test_stage2_workspace_survives_restoration_without_null_level_styles(client,app):
    w=client.get('/workspace').json();p=w['panes'][0];key=p['canonical_id']+'/1d'
    p['drawing_sets'][key]=[drawing('fib_retracement',params={'levels':[{'ratio':.618}],'reverse':True}),drawing('fib_extension'),drawing('triangle')]
    w['drawing_tools']['favourites']=['fib_retracement','ruler']
    assert client.put('/workspace',json=w).status_code==200
    out=client.get('/workspace').json()
    assert out['panes'][0]['drawing_sets'][key][0]['params']['levels']==[{'ratio':.618}]
    assert out['panes'][1]['drawing_sets']=={} and app.state.history.metrics['provider_requests']==0
    assert out['watchlists']==w['watchlists'] and out['drawing_tools']==w['drawing_tools']
