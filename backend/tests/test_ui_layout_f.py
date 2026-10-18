import pytest
from pydantic import ValidationError
from app.models import Pane, Workspace, StudyLayout

def test_old_pane_has_independent_default_layout():
    a,b=Pane(id='0',symbol='AAPL',token='test'),Pane(id='1',symbol='AAPL',token='test')
    a.study_layout['default-ema']=StudyLayout(height=144,collapsed=True)
    assert b.study_layout=={}
    assert Pane.model_validate_json(a.model_dump_json()).study_layout['default-ema'].height==144

@pytest.mark.parametrize('value',[0,47,601,999999,float('nan'),float('inf'),104.5,True])
def test_layout_height_rejects_invalid_inputs(value):
    with pytest.raises(ValidationError):StudyLayout(height=value)

@pytest.mark.parametrize('key',['','x'*101])
def test_layout_identity_is_bounded(key):
    with pytest.raises(ValidationError):Pane(id='0',symbol='AAPL',token='test',study_layout={key:{'height':104}})

def test_layout_budget():
    with pytest.raises(ValidationError):Pane(id='0',symbol='AAPL',token='test',study_layout={str(i):{'height':104} for i in range(22)})

def test_layout_does_not_change_indicator_configuration():
    p=Pane(id='0',symbol='AAPL',token='test');before=[i.model_dump() for i in p.indicators]
    p.study_layout['default-ema']=StudyLayout(height=192,collapsed=True)
    assert [i.model_dump() for i in p.indicators]==before
    assert Pane.model_validate_json(p.model_dump_json()).study_layout['default-ema'].collapsed

def test_legacy_workspace_panes_keep_identity_and_indicators():
    p=Pane(id='0',symbol='AAPL',token='test');old=p.model_dump();old.pop('study_layout')
    restored=Pane.model_validate(old)
    assert restored.study_layout=={}
    assert restored.model_dump(exclude={'study_layout'})==old
