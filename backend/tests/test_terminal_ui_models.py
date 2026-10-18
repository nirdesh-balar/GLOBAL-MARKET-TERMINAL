import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.models import ChartAppearance, Drawing, Pane, SidebarPreferences
from app.main import create_app
from fixtures import FixtureProvider


def line(**changes):
    return dict(id='drawing-one',kind='horizontal',anchors=[dict(time=1704067200,price=123.45)],**changes)


def test_legacy_pane_migration_preserves_studies_and_scale():
    pane=Pane.model_validate(dict(id='0',symbol='RELIANCE-EQ',token='1',indicators=['EMA9','RSI14'],scale=dict(logarithmic=True,auto=False)))
    assert pane.indicators[0].length==9 and pane.indicators[1].period==14
    assert pane.scale.logarithmic and not pane.scale.auto
    assert pane.appearance.price_line and pane.appearance.last_value
    assert pane.drawing_sets=={} and not pane.drawings_locked


@pytest.mark.parametrize('changes',[dict(grid_opacity=-.01),dict(grid_opacity=1.01),dict(margin_top=.5),dict(bar_spacing=0),dict(up_color='red'),dict(margin_bottom=float('nan'))])
def test_appearance_rejects_invalid_values(changes):
    with pytest.raises(ValidationError):ChartAppearance(**changes)


@pytest.mark.parametrize('value',[dict(id='bad',kind='rectangle',anchors=[dict(time=1,price=2)]),dict(id='bad',kind='horizontal',anchors=[dict(time=1,price=float('inf'))]),dict(id='bad',kind='vertical',anchors=[dict(time=-1,price=2)]),dict(id='bad',kind='trend',anchors=[dict(time=1,price=0),dict(time=2,price=1)])])
def test_invalid_drawings_rejected(value):
    with pytest.raises(ValidationError):Drawing(**value)


def test_drawing_limits_and_unique_ids():
    base=dict(id='0',symbol='RELIANCE-EQ',token='1')
    with pytest.raises(ValidationError):Pane(**base,drawing_sets={'symbol/1d':[line(),line()]})
    with pytest.raises(ValidationError):Pane(**base,drawing_sets={'symbol/1d':[dict(line(),id=str(i)) for i in range(101)]})
    with pytest.raises(ValidationError):Pane(**base,drawing_sets={str(k):[dict(line(),id=str(i)) for i in range(100)] for k in range(3)})
    with pytest.raises(ValidationError):SidebarPreferences(width=800)


def test_metadata_persistence_never_stores_history(tmp_path):
    token='phase4-local-test-token-'+'x'*40
    app=create_app(tmp_path,token,FixtureProvider(count=50))
    with TestClient(app,headers={'Authorization':'Bearer '+token}) as c:
        w=c.get('/workspace').json()
        key=w['panes'][0]['instrument_id']+'/1d'
        w['panes'][0].update(drawing_sets={key:[line()]},drawings_locked=True)
        w['panes'][0]['appearance'].update(up_color='#abcdef',watermark=True)
        w['sidebar'].update(width=280,visible=False)
        w['sync_time']=True
        assert c.put('/workspace',json=w).status_code==200
        restored=c.get('/workspace').json()
        assert restored['panes'][0]['drawing_sets'][key][0]['anchors'][0]['price']==123.45
        assert restored['panes'][0]['appearance']['up_color']=='#abcdef'
        assert restored['sidebar']['width']==280 and not restored['sidebar']['visible']
        assert restored['sync_time']
        assert app.state.history.metrics['provider_requests']==0
        with app.state.db.connect() as db:tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        assert not tables.intersection({'candles','ohlcv','history'})
