import pytest
from pydantic import ValidationError

from app.models import AppliedPineScript
from app.registry import matches_category
from app.study_recipes import PineScript, StudyRecipe

SCRIPT_ID = '0aa83f5c-3280-453e-8a85-be688a548067'
INSTANCE_ID = '0bdbb252-82ef-4180-94b5-b060bb1f2968'
REVISION = {
    'number': 1, 'version': 6, 'source': 'indicator("EMA")\nplot(ta.ema(close, 20))',
    'title': 'EMA', 'overlay': True, 'plot_count': 1,
}


def test_stores_bounded_source_and_instance_separately():
    model = PineScript(id=SCRIPT_ID, name='Example', revisions=[REVISION])
    instance = AppliedPineScript(id=INSTANCE_ID, name=model.name, script_id=model.id)
    assert model.model_dump()['revisions'][0]['source'] == REVISION['source']
    assert instance.model_dump() == dict(id=INSTANCE_ID, name='Example', script_id=SCRIPT_ID, visible=True)
    assert StudyRecipe().model_dump() == dict(version=1, source='close', rsi=9, ema=3, wma=21)


@pytest.mark.parametrize('revisions', [
    [{**REVISION, 'source': 'x'*8193}],
    [{**REVISION, 'version': 3}],
    [{**REVISION, 'plot_count': 9}],
    [REVISION, REVISION],
    [REVISION]*6,
    [{**REVISION, 'executable': True}],
])
def test_rejects_invalid_storage_metadata(revisions):
    with pytest.raises(ValidationError):
        PineScript(id=SCRIPT_ID, name='Example', revisions=revisions)


@pytest.mark.parametrize('category,kind,country,original,expected', [
    ('india', 'index', 'India', 'indices', True),
    ('india', 'equity', 'United States', 'us', False),
    ('indices_funds', 'etf', 'United States', 'funds', True),
    ('indices_funds', 'index', 'India', 'indices', True),
    ('indices_funds', 'index', 'United States', 'global_indices', True),
    ('indices_funds', 'equity', 'India', 'stocks', False),
    ('all_equities', 'equity', 'United States', 'us', True),
    ('all_equities', 'equity', 'India', 'stocks', True),
    ('all_equities', 'etf', 'India', 'funds', False),
])
def test_market_tab_filters(category, kind, country, original, expected):
    assert matches_category(dict(kind=kind, country=country, category=original), category) == expected
