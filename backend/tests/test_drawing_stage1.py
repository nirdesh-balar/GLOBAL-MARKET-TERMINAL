import math
import pytest
from pydantic import ValidationError
from app.models import Drawing,DRAWING_ANCHORS,DrawingToolbarPreferences,Workspace
from test_direct_history import app,client

def drawing(kind,**changes):
 value=dict(id='stage1-'+kind,kind=kind,version=2,anchors=[dict(time=1704067200+i*86400,price=100+i*10) for i in range(DRAWING_ANCHORS[kind])],color='#123abc',width=2);value.update(changes);return value

@pytest.mark.parametrize('kind',list(DRAWING_ANCHORS))
def test_every_stage1_tool_schema_roundtrip(kind):
 value=drawing(kind);d=Drawing.model_validate(value)
 assert d.kind==kind and len(d.anchors)==DRAWING_ANCHORS[kind]
 assert Drawing.model_validate_json(d.model_dump_json())==d
 assert d.visible and not d.locked

@pytest.mark.parametrize('kind',list(DRAWING_ANCHORS))
def test_every_tool_rejects_wrong_anchor_count(kind):
 value=drawing(kind);value['anchors']=[dict(time=1,price=1)]* (DRAWING_ANCHORS[kind]+1)
 with pytest.raises(ValidationError):Drawing.model_validate(value)

@pytest.mark.parametrize('changes',[dict(opacity=math.nan),dict(opacity=1.1),dict(fill_opacity=-.1),dict(dash='html'),dict(version=3),dict(params={'text':'x'*2001}),dict(params={'price_unit':0}),dict(params={'text':'test'}),dict(params={'html':'<script>'})])
def test_invalid_drawing_style_parameters(changes):
 with pytest.raises(ValidationError):Drawing.model_validate(drawing('trend',**changes))

def test_plain_text_not_interpreted():
 text='<script>globalThis.pwned=1</script><img onerror=alert(1)>'
 d=Drawing.model_validate(drawing('note',params=dict(text=text,font_size=14,offset_x=8,offset_y=-12)))
 assert d.params.text==text

def test_regression_width_and_angle_units():
 assert Drawing.model_validate(drawing('regression_channel',params=dict(channel_width=0,deviation=2))).params.deviation==2
 assert Drawing.model_validate(drawing('trend_angle',params=dict(price_unit=.001,bar_unit=10))).params.price_unit==.001

def test_degenerate_new_geometry_rejected_legacy_preserved():
 value=drawing('ray');value['anchors'][1]=value['anchors'][0]
 with pytest.raises(ValidationError):Drawing.model_validate(value)
 value['kind']='trend';value['version']=1
 assert Drawing.model_validate(value).version==1
 value=drawing('parallel_channel');value['anchors'][1]['time']=value['anchors'][0]['time']
 with pytest.raises(ValidationError):Drawing.model_validate(value)

def test_legacy_drawings_restore_unmodified_anchors(client,app):
 w=client.get('/workspace').json();pane=w['panes'][0];key=pane['instrument_id']+'/1d'
 old=dict(id='old-trend',kind='trend',anchors=[dict(time=1704067200,price=10),dict(time=1704153600,price=11)],color='#abcdef',width=3)
 pane['drawing_sets']={key:[old]};app.state.db.put('workspace',w)
 restored=client.get('/workspace').json()['panes'][0]['drawing_sets'][key][0]
 for field,value in old.items():assert restored[field]==value
 assert restored['version']==1

def test_drawing_workspace_persistence_independence_no_history(client,app):
 w=client.get('/workspace').json();p=w['panes'][0]
 p['drawing_sets']={p['canonical_id']+'/1d':[drawing('parallel_channel',locked=True,visible=False)]};p['indicators_hidden']=True
 w['drawing_tools']=dict(favourites=['ray','text'],recent=['text','ray'],last_used={'lines':'ray','text':'text'})
 assert client.put('/workspace',json=w).status_code==200
 restored=client.get('/workspace').json()
 assert restored['panes'][0]['drawing_sets'][p['canonical_id']+'/1d'][0]['locked']
 assert restored['panes'][1]['drawing_sets']=={} and not restored['panes'][1]['indicators_hidden']
 assert restored['drawing_tools']==w['drawing_tools']
 assert app.state.history.metrics['provider_requests']==0

@pytest.mark.parametrize('value',[dict(favourites=['unknown']),dict(recent=['ray']*13),dict(favourites=['ray','ray']),dict(last_used={'orders':'ray'})])
def test_toolbar_preference_validation(value):
 with pytest.raises(ValidationError):DrawingToolbarPreferences(**value)


@pytest.mark.parametrize('price',[-40,0])
def test_version_two_supports_finite_futures_prices(price):
 value=drawing('horizontal');value['anchors'][0]['price']=price
 assert Drawing.model_validate(value).anchors[0].price==price
