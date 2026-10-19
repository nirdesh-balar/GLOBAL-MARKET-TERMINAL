import base64
import json
import math
import sqlite3
import struct
from pathlib import Path
import pytest
from pydantic import ValidationError
from app.models import Drawing
from app.preview_seed import seed_preview
from test_drawing_stage1 import drawing
from test_direct_history import app,client

@pytest.mark.parametrize('kind',['pitchfork','schiff_pitchfork','modified_schiff','inside_pitchfork','fib_channel','fib_time_zone','fib_trend_time','fib_speed_fan','pitchfan','fib_circles','fib_arcs','fib_wedge'])
def test_advanced_level_styles_persist(kind):
    value=drawing(kind,params={'levels':[{'ratio':-1,'color':'#aabbcc','width':4,'dash':'dot','visible':False},{'ratio':.618}],'labels':True})
    d=Drawing.model_validate(value)
    assert Drawing.model_validate_json(d.model_dump_json())==d

@pytest.mark.parametrize('kind',['gann_fan','gann_square','gann_square_fixed'])
@pytest.mark.parametrize('price_per_bar',[0,-1,math.inf,math.nan])
def test_gann_requires_finite_positive_calibration(kind,price_per_bar):
    with pytest.raises(ValidationError):Drawing.model_validate(drawing(kind,params={'price_per_bar':price_per_bar,'calibrated':True}))

@pytest.mark.parametrize('kind',['path','brush','highlighter'])
@pytest.mark.parametrize('count',[2,3,32])
def test_variable_paths_preserve_financial_vertices(kind,count):
    value=drawing(kind);value['anchors']=[{'time':1704067200+i*86400,'price':-50+i} for i in range(count)]
    assert len(Drawing.model_validate(value).anchors)==count

@pytest.mark.parametrize('kind',['brush','highlighter'])
def test_freehand_limit_512(kind):
    value=drawing(kind);value['anchors']=[{'time':1704067200+i*60,'price':i-50} for i in range(512)]
    assert len(Drawing.model_validate(value).anchors)==512
    value['anchors'].append({'time':1800000000,'price':0})
    with pytest.raises(ValidationError):Drawing.model_validate(value)

@pytest.mark.parametrize('kind',['callout','comment','pin','price_label','signpost','flag_mark','table'])
def test_plain_canvas_annotation_text(kind):
    text='Safe|<svg onload=alert(1)>\n<script>window.pwned=1</script>'
    assert Drawing.model_validate(drawing(kind,params={'text':text,'font_size':14})).params.text==text

PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
def test_embedded_png_schema_roundtrip():
    value=drawing('image',params={'image_data':'data:image/png;base64,'+PNG})
    d=Drawing.model_validate(value)
    assert Drawing.model_validate_json(d.model_dump_json())==d

@pytest.mark.parametrize('image',['file:///tmp/private.png','https://example.com/image.png','data:image/svg+xml,<svg onload=alert(1)>','data:image/png;base64,aGVsbG8=','data:image/png;base64,'+'A'*175001],ids=['local-file','remote-url','executable-svg','invalid-png','oversized-png'])
def test_image_rejects_remote_executable_or_oversized_data(image):
    with pytest.raises(ValidationError):Drawing.model_validate(drawing('image',params={'image_data':image}))

def test_png_dimension_bomb_rejected():
    data=bytearray(base64.b64decode(PNG));data[16:20]=struct.pack('>I',100000)
    with pytest.raises(ValidationError):Drawing.model_validate(drawing('image',params={'image_data':'data:image/png;base64,'+base64.b64encode(data).decode()}))

def test_stage3_seed_readonly_preserves_both_profiles(tmp_path):
    source=tmp_path/'stage2.sqlite3';destination=tmp_path/'stage3'/'terminal.sqlite3'
    with sqlite3.connect(source) as db:
        db.execute('create table settings(key text primary key,value text)');db.execute('insert into settings values (?,?)',('workspace',json.dumps({'drawings':'stage2','watchlists':['retained']})))
    before=source.read_bytes()
    assert seed_preview(source,destination)
    assert source.read_bytes()==before
    with sqlite3.connect(destination) as db:assert json.loads(db.execute('select value from settings').fetchone()[0])['watchlists']==['retained']
    copied=destination.read_bytes();assert not seed_preview(source,destination);assert destination.read_bytes()==copied
    assert not seed_preview(tmp_path/'missing',tmp_path/'other.sqlite3')
    assert not list(tmp_path.rglob('*.seed-tmp'))

def test_new_workspace_restores_tools_images_and_settings(client,app):
    w=client.get('/workspace').json();p=w['panes'][0];key=p['canonical_id']+'/1d'
    p['drawing_sets'][key]=[drawing('pitchfork',params={'levels':[{'ratio':-1},{'ratio':1}]}),drawing('gann_fan',params={'price_per_bar':5,'calibrated':True}),drawing('head_shoulders'),drawing('elliott_impulse'),drawing('image',params={'image_data':'data:image/png;base64,'+PNG})]
    w['drawing_tools']['favourites']=['pitchfork','image']
    assert client.put('/workspace',json=w).status_code==200
    restored=client.get('/workspace').json()
    assert len(restored['panes'][0]['drawing_sets'][key])==5
    assert restored['panes'][1]['drawing_sets']=={}
    assert restored['watchlists']==w['watchlists'] and restored['drawing_tools']==w['drawing_tools']
    assert restored['panes'][0]['drawing_sets'][key][-1]['params']['image_data']=='data:image/png;base64,'+PNG
    assert app.state.history.metrics['provider_requests']==0
