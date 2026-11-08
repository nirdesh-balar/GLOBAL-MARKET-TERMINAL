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
