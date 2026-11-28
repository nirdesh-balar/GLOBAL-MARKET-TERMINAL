from pydantic import ValidationError
import pytest

from app.alert_models import AlertDefinition, AlertSettings
from app.alerts import AlertEngine
from app.models import Workspace
from app.study_recipes import StudyRecipe, StudyRule, evaluate_study_rule


def rows(closes, origin=0):
    return [
        dict(time=origin+i*86400, open=close, high=close, low=close, close=close, volume=0)
        for i, close in enumerate(closes)
    ]


def test_typed_study_has_bounded_inputs_and_no_code():
    with pytest.raises(ValidationError):
        StudyRecipe(rsi=201)
    with pytest.raises(ValidationError):
        StudyRecipe(ema=True)
    with pytest.raises(ValidationError):
        StudyRecipe.model_validate({'code': 'print(1)'})
    with pytest.raises(ValidationError):
        StudyRecipe(source='eval')
    with pytest.raises(ValidationError):
        StudyRule(recipe=StudyRecipe(), level=float('nan'))


def test_rsi_ema_and_wma_cross_reference_values():
    recipe = StudyRecipe(rsi=2, ema=2, wma=2)
    candles = rows([1, 2, 3, 2, 4])
    for output, threshold in (('rsi', 70), ('ema', 77), ('wma', 70)):
        rule = StudyRule(recipe=recipe, output=output, direction='above', level=threshold)
        matched, value = evaluate_study_rule(rule, candles)
        assert matched is True and value > threshold
    rule = StudyRule(recipe=recipe, level=70, direction='below')
    assert evaluate_study_rule(rule, candles[:3]) == (None, 100)
    assert evaluate_study_rule(rule, candles[:4]) == (True, 50)


def test_study_alert_requires_completed_candles_and_uses_local_runtime():
    rule = StudyRule(recipe=StudyRecipe(rsi=2), level=70)
    with pytest.raises(ValidationError):
        AlertDefinition(instrument='yahoo:AAPL:NASDAQ:equity', study_rule=rule, completed=False)
    with pytest.raises(ValidationError):
        AlertDefinition(instrument='hyperliquid:perpetual:BTC:BTC:USDC', study_rule=rule, evaluation='live_price')
    alert = AlertDefinition(instrument='yahoo:AAPL:NASDAQ:equity', study_rule=rule, name='Local momentum rule')
    now = 1767657600
    candles = rows([1,2,3,2,4], now-5*86400)
    security=dict(id=alert.instrument, symbol='AAPL', token='fixture', canonical_id=alert.instrument, provider='yahoo',
                  name='Apple', kind='equity', exchange='NASDAQ', timezone='UTC', currency='USD')
    engine = object.__new__(AlertEngine)
    engine.primed={('test',1)}
    engine.started=now-100
    record=dict(id='test',revision=1,definition=alert.model_dump(),
                runtime=dict(last_evaluated_candle=candles[-2]['time'],active_since=now-100))
    data=dict(candles=candles,source='YAHOO FINANCE',fetched_at=now,timezone='UTC')
    result=engine.assess(record,data,security,AlertSettings(),now)
    assert result['trigger']['payload']['title']=='Local momentum rule'
    assert result['trigger']['payload']['details'][0]['kind']=='local_study'
    stale=engine.assess(record,{**data,'fetched_at':now-3600},security,AlertSettings(),now)
    assert stale['runtime']['status']=='stale' and 'trigger' not in stale


def test_workspace_round_trip_preserves_study_and_style_and_legacy_defaults():
    panes=[dict(id=str(i),symbol='AAPL',token='0') for i in range(8)]
    legacy=Workspace.model_validate({'panes':panes})
    assert legacy.panes[0].chart_type=='candles' and legacy.local_studies==[]
    assert legacy.study_library.favorites==[] and 'comparisons' not in legacy.panes[0].model_dump()
    data=legacy.model_dump()
    study_id='72e935aa-32ae-4ff1-9233-d84686db857e'
    data['study_library']={'favorites':['EMA'],'recent':['EMA','RSI']}
    data['local_studies']=[dict(id=study_id,name='Wilder test',category='indicator',
                              revisions=[dict(number=1,recipe=StudyRecipe().model_dump())])]
    data['panes'][0].update(chart_type='line-break',local_studies=[dict(id=study_id,name='Wilder test',recipe=StudyRecipe().model_dump())])
    result=Workspace.model_validate_json(Workspace.model_validate(data).model_dump_json())
    assert result.study_library.recent==['EMA','RSI']
    assert result.panes[0].chart_type=='line-break'
    assert result.panes[0].local_studies[0].recipe==result.local_studies[0].revisions[0].recipe
