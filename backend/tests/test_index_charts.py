import pytest
from fastapi.testclient import TestClient

from app.database import Database
from app.main import create_app
from fixtures import FixtureProvider


TOKEN = 'index-chart-fixture-' + 'x' * 40


@pytest.fixture
def chart_client(tmp_path):
    provider = FixtureProvider(count=23)
    app = create_app(tmp_path, TOKEN, provider)
    with TestClient(app, headers={'Authorization': 'Bearer ' + TOKEN}) as client:
        yield client, provider


@pytest.mark.parametrize(('name', 'identity'), [
    ('NIFTY 50', 'yahoo:%5ENSEI:NSE:index'),
    ('NIFTY BANK', 'yahoo:%5ENSEBANK:NSE:index'),
    ('NIFTY 500', 'yahoo:%5ECRSLDX:NSE:index'),
    ('SENSEX', 'yahoo:%5EBSESN:BSE:index'),
])
def test_index_search_to_cached_yahoo_chart(chart_client, name, identity):
    client, provider = chart_client
    search = client.get('/api/instruments/discover', params={'q': name, 'category': 'indices'})
    assert search.status_code == 200
    result = next(row for row in search.json()['results'] if row['name'] == name)
    assert result['canonical_id'] == identity
    assert result['provider'] == 'yahoo'
    assert provider.calls == 0

    params = {'symbol': result['canonical_id'], 'source': 'yahoo'}
    response = client.get('/api/history', params=params)
    assert response.status_code == 200
    history = response.json()
    assert history['canonical_id'] == identity
    assert history['source'] == provider.name
    assert len(history['candles']) == len(provider.rows)
    assert client.get('/api/history', params=params).json()['candles'] == history['candles']
    assert provider.calls == 1


@pytest.mark.parametrize(('method', 'path'), [
    ('GET', '/api/indices/membership'),
    ('POST', '/api/indices/membership/import'),
])
def test_withdrawn_membership_routes_are_absent(chart_client, method, path):
    client, provider = chart_client
    assert client.request(method, path).status_code == 404
    assert provider.calls == 0


def test_existing_profile_settings_survive_index_workspace_save(tmp_path):
    db = Database(tmp_path / 'terminal.sqlite3')
    legacy_key = 'index_membership:yahoo:%5ENSEI:NSE:index'
    legacy_value = {'filename': 'prior-local-import.csv', 'members': []}
    db.put(legacy_key, legacy_value)
    app = create_app(tmp_path, TOKEN, FixtureProvider(count=23))
    with TestClient(app, headers={'Authorization': 'Bearer ' + TOKEN}) as client:
        workspace = client.get('/workspace').json()
        index = next(row for row in client.get('/api/indices').json() if row['name'] == 'NIFTY 50')
        pane = workspace['panes'][0]
        pane.update({key: index[key] for key in pane.keys() & index.keys() - {'id'}})
        pane['instrument_id'] = index['id']
        saved = client.put('/workspace', json=workspace)
        assert saved.status_code == 200, saved.json()
        restored = client.get('/workspace').json()
        assert restored['panes'][0]['canonical_id'] == index['canonical_id']
        for key in ('watchlists', 'chart_grid', 'pine_scripts'):
            assert restored[key] == workspace[key]
    assert db.get(legacy_key) == legacy_value
