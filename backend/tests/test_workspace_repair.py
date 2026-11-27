import pytest
from pathlib import Path
from app.models import Workspace, Pane
from app.database import Database
from app.registry import InstrumentRegistry
from app.main import default_workspace, restore_workspace

def test_workspace_pads_single_pane():
    data = {
        'layout': 1,
        'panes': [{'id': '0', 'symbol': '^BSESN', 'token': '0', 'timeframe': '1d', 'chart_type': 'candles', 'indicators': ['EMA20'], 'volume': True}],
        'watchlists': [{'id': 'stocks', 'name': 'Stocks', 'items': [{'symbol': '^BSESN', 'token': '0'}]}],
        'active_watchlist': 'stocks'
    }
    ws = Workspace.model_validate(data)
    assert len(ws.panes) == 8
    assert ws.panes[0].symbol == '^BSESN'
    assert [p.id for p in ws.panes] == [str(i) for i in range(8)]
    assert ws.layout == 1

def test_workspace_pads_empty_panes():
    data = {
        'layout': 2,
        'panes': [],
        'watchlists': [{'id': 'stocks', 'name': 'Stocks', 'items': [{'symbol': 'TCS-EQ', 'token': '0'}]}],
        'active_watchlist': 'stocks'
    }
    ws = Workspace.model_validate(data)
    assert len(ws.panes) == 8
    assert [p.id for p in ws.panes] == [str(i) for i in range(8)]

def test_workspace_fixes_duplicate_ids():
    data = {
        'layout': 2,
        'panes': [{'id': '0', 'symbol': 'RELIANCE-EQ', 'token': '0'}, {'id': '0', 'symbol': 'TCS-EQ', 'token': '0'}],
        'watchlists': [{'id': 'stocks', 'name': 'Stocks', 'items': []}],
        'active_watchlist': 'stocks'
    }
    ws = Workspace.model_validate(data)
    assert len(ws.panes) == 8
    pane_ids = [p.id for p in ws.panes]
    assert len(set(pane_ids)) == 8
    assert pane_ids == [str(i) for i in range(8)]

def test_restore_workspace_pads_to_eight_panes(tmp_path):
    db_file = tmp_path / 'terminal.sqlite3'
    db = Database(db_file)
    resources = Path(__file__).resolve().parent.parent / 'resources'
    registry = InstrumentRegistry(db, resources)
    single_pane_ws = {
        'layout': 1,
        'panes': [{'id': '0', 'symbol': '^BSESN', 'token': '0', 'timeframe': '1d', 'chart_type': 'candles',
                   'indicators': [{'kind': 'EMA', 'period': 20, 'visible': True, 'id': 'legacy-0-EMA20'}], 'volume': True}],
        'watchlists': [{'id': 'stocks', 'name': 'Stocks', 'items': [{'symbol': '^BSESN', 'token': '0'}]}],
        'active_watchlist': 'stocks'
    }
    db.put('workspace', single_pane_ws)
    ws = restore_workspace(db, registry)
    assert len(ws['panes']) == 8
    assert ws['layout'] == 1
    assert ws['panes'][0]['symbol'] == '^BSESN'
    assert len(ws['panes'][0]['indicators']) == 1
    assert [p['id'] for p in ws['panes']] == [str(i) for i in range(8)]

def test_restore_workspace_with_user_db_copy(tmp_path):
    user_db_path = Path('/tmp/gmt-test-user-copy/terminal.sqlite3')
    if not user_db_path.exists():
        pytest.skip('User database test copy not found')
    db = Database(user_db_path)
    registry = InstrumentRegistry(db, None)
    ws = restore_workspace(db, registry)
    assert len(ws['panes']) == 8
    assert ws['panes'][0]['symbol'] == '^BSESN'
    assert len(ws['panes'][0]['indicators']) == 5
    assert len(ws['watchlists']) == 15
    assert ws['layout'] == 1


@pytest.mark.parametrize('grid', [
    {'version': 2},
    {'columns': 5},
    {'cards': [{'canonical_id': 'BTC-USD'}]},
    {'cards': [{'canonical_id': 'yahoo:BTC-USD:CCC:crypto', 'candles': [1]}]},
    {'cards': [{'canonical_id': 'yahoo:AAPL:NMS:equity'}] * 2},
    {'cards': [{'canonical_id': f'yahoo:ITEM{i}:NMS:equity'} for i in range(129)]},
])
def test_workspace_rejects_invalid_chart_grid(grid):
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Workspace.model_validate({'panes': [], 'chart_grid': grid})


def test_chart_grid_hydrates_exact_identity_and_repairs_legacy(tmp_path):
    db = Database(tmp_path / 'terminal.sqlite3')
    registry = InstrumentRegistry(db, Path(__file__).resolve().parents[1] / 'resources')
    saved = default_workspace(db)
    saved['layout'] = 1
    db.put('workspace', saved)
    legacy = restore_workspace(db, registry)
    assert legacy['chart_grid']['cards'] == []
    assert legacy['layout'] == 1

    index = registry.indices()[0]
    saved['chart_grid'] = {'columns': 3, 'cards': [
        {'canonical_id': index['canonical_id'], 'timeframe': '1w', 'ema': True},
        {'canonical_id': 'hyperliquid:perpetual:unknown', 'timeframe': '1d'},
    ]}
    db.put('workspace', saved)
    prefs = restore_workspace(db, registry, hydrate_grid=True)['chart_grid']
    assert prefs['columns'] == 3
    assert prefs['cards'][0]['instrument']['canonical_id'] == index['canonical_id']
    assert prefs['cards'][0]['timeframe'] == '1w' and prefs['cards'][0]['ema']
    assert 'instrument' not in prefs['cards'][1]
    assert all('instrument' not in card for card in restore_workspace(db, registry)['chart_grid']['cards'])
    assert db.get('workspace') == saved

    saved['chart_grid'] = {'version': 99, 'cards': []}
    db.put('workspace', saved)
    repaired = restore_workspace(db, registry)
    assert repaired['chart_grid'] == legacy['chart_grid']
    assert repaired['panes'] == legacy['panes']
    assert repaired['watchlists'] == legacy['watchlists']


def test_volume_placement_migrates_without_adding_to_new_or_removed_panes():
    base = {'id': '0', 'symbol': 'TCS-EQ', 'token': '0'}
    assert Pane.model_validate(base).volume_settings is None
    assert Pane.model_validate(base).volume is False
    assert Pane.model_validate({**base, 'volume': False}).volume_settings is None

    legacy = Pane.model_validate({**base, 'volume': True, 'study_layout': {
        'volume': {'height': 124, 'collapsed': False},
    }})
    assert legacy.volume is True
    assert legacy.volume_settings.placement == 'pane'
    assert legacy.study_layout['volume'].height == 124

    hidden = Pane.model_validate({**base, 'volume': False, 'volume_settings': {
        'position': 'last', 'up_color': '#12ab34',
    }})
    assert hidden.volume is False
    assert hidden.volume_settings.model_dump() == {
        'version': 2, 'placement': 'pane', 'position': 'last',
        'up_color': '#12ab34', 'down_color': None,
    }
    assert Pane.model_validate(hidden.model_dump()) == hidden


@pytest.mark.parametrize('position', [-1, 24, True, 'middle'])
def test_volume_rejects_invalid_pane_positions(position):
    from pydantic import ValidationError
    with pytest.raises(ValidationError, match='Volume pane position'):
        Pane.model_validate({'id': '0', 'symbol': 'TCS-EQ', 'token': '0',
                             'volume_settings': {'version': 2, 'position': position}})
