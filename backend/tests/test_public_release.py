import copy
import pytest
from app.models import Workspace

@pytest.mark.parametrize('kind',['OI_PROFILE','Open Interest Profile','OPTION_CHAIN','Option Chain Indicators','DHAN_ALPHATREND','DHAN_HALFTREND','Dhan Proprietary AlphaTrend / HalfTrend'])
def test_unsupported_legacy_record_is_preserved_without_substitution(kind):
    from app.main import default_workspace
    class DB:
        def search(self,*args):return []
        def resolve(self,*args):return None
    value=default_workspace(DB())
    record=dict(id='unsupported',kind=kind,private_style={'color':'#112233'})
    value['panes'][0]['indicators']=[dict(id='alpha',kind='ALPHATREND'),record,dict(id='half',kind='HALFTREND')]
    value['presets']=[dict(id='preset',name='Preserved preset',indicators=[record,dict(id='ema',kind='EMA')])]
    before=copy.deepcopy(value)
    restored=Workspace.model_validate(value).model_dump()
    assert value==before
    assert [i['kind'] for i in restored['panes'][0]['indicators']]==['ALPHATREND','HALFTREND']
    assert restored['presets'][0]['name']=='Preserved preset'
    assert [i['kind'] for i in restored['presets'][0]['indicators']]==['EMA']
    assert restored['unsupported_indicator_archive']==[dict(location='panes',owner='0',record=record),dict(location='presets',owner='preset',record=record)]
    assert Workspace.model_validate(restored).model_dump()==restored

def test_unknown_study_is_not_silently_substituted():
    from pydantic import ValidationError
    from app.models import IndicatorConfig
    with pytest.raises(ValidationError):IndicatorConfig(id='bad',kind='UNIMPLEMENTED_RANDOM_STUDY')


def test_archive_holds_all_existing_pane_and_preset_limits():
    from app.main import default_workspace
    class DB:
        def search(self,*args):return []
        def resolve(self,*args):return None
    value=default_workspace(DB())
    for pane in value['panes']:pane['indicators']=[dict(id=f"old-{i}",kind='OI_PROFILE') for i in range(20)]
    value['presets']=[dict(id=f"preset-{j}",name=f"Preset {j}",indicators=[dict(id=f"old-{i}",kind='OPTION_CHAIN') for i in range(20)]) for j in range(30)]
    restored=Workspace.model_validate(value).model_dump()
    assert len(restored['unsupported_indicator_archive'])==760
    assert all(p['indicators']==[] for p in restored['panes'])
    assert len(restored['presets'])==30
    assert Workspace.model_validate(restored).model_dump()==restored
