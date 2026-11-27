import csv
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.index_constituents import parse_members
from app.main import create_app
from app.providers.hyperliquid import parse_catalogue
from fixtures import FixtureProvider

HEADER = 'Company Name,Industry,Symbol,Series,ISIN Code'
NIFTY = 'yahoo:%5ENSEI:NSE:index'
BANK = 'yahoo:%5ENSEBANK:NSE:index'
ENDPOINT = '/api/indices/membership'


def membership_csv(count=50):
    rows = ['"Example, Industries",Example,RELIANCE,EQ,INE002A01018']
    rows += [f'Fixture Company {i},Example,FIXTURE{i},EQ,INZ{i:09d}' for i in range(1, count)]
    return '\n'.join([HEADER, *rows])


@pytest.mark.parametrize('content', [
    membership_csv(49),
    membership_csv(51),
    membership_csv().replace('ISIN Code', 'Weight'),
    membership_csv().replace('FIXTURE2,EQ,INZ000000002', 'FIXTURE1,EQ,INZ000000002'),
    membership_csv().replace('FIXTURE2,EQ,INZ000000002', 'FIXTURE2,EQ,INZ000000001'),
    membership_csv().replace('INZ000000002', 'unresolved'),
    membership_csv().replace('Fixture Company 1,Example', '"Fixture Company 1,Example'),
])
def test_rejects_bad_csv(content):
    with pytest.raises((ValueError, csv.Error)):
        parse_members(content, 50)


def test_persisted_membership_separates_identity_and_quotes(tmp_path):
    token = 'index-test-local-token-' + 'x'*40
    headers = {'Authorization':'Bearer '+token}
    fixture = FixtureProvider(count=23)
    app = create_app(tmp_path, token, fixture)
    with TestClient(app, headers=headers) as client:
        query = {'index':NIFTY}
        assert client.get(ENDPOINT,params=query).json()['snapshot'] is None
        assert client.get(ENDPOINT,params={'index':BANK}).json() == {'source_url':None,'snapshot':None}
        payload = dict(index=NIFTY,name='ind_nifty50list.csv',content=membership_csv(),as_of='2026-11-01')
        assert client.post(ENDPOINT+'/import',json=payload).json() == {'count':50}
        snapshot = client.get(ENDPOINT,params=query).json()['snapshot']
        assert snapshot['as_of'] == '2026-11-01' and len(snapshot['members']) == 50
        real, unresolved = snapshot['members'][:2]
        assert real['name'] == 'Example, Industries'
        assert real['instrument']['canonical_id'] == 'yahoo:RELIANCE.NS:NSE:equity'
        assert real['weight'] is None and real['quote'] is None
        assert unresolved['instrument'] is None and unresolved['quote'] is None
        assert client.post(ENDPOINT+'/import',json={**payload,'index':BANK}).status_code == 422
        assert client.post(ENDPOINT+'/import',json={**payload,'content':'bad'}).status_code == 422
        assert client.post(ENDPOINT+'/import',json={**payload,'as_of':(date.today()+timedelta(days=3)).isoformat()}).status_code == 422
        assert client.get(ENDPOINT,params=query).json()['snapshot']['sha256'] == snapshot['sha256']
        assert app.state.history.metrics['provider_requests'] == 0
        quote = dict(source='YAHOO FINANCE',price=100.25,fetched_at=1,latest_bar_time=1)
        app.state.quotes.values[(real['instrument']['canonical_id'],'1d')] = {'value':quote}
        assert client.get(ENDPOINT,params=query).json()['snapshot']['members'][0]['quote'] == {'stale':True,'value':quote}
        assert fixture.calls == 0
    restarted = create_app(tmp_path, token, FixtureProvider(count=23))
    with TestClient(restarted, headers=headers) as client:
        snapshot = client.get(ENDPOINT,params={'index':NIFTY}).json()['snapshot']
        assert len(snapshot['members']) == 50
        assert snapshot['members'][0]['quote'] is None


def test_legacy_comparison_is_ignored_and_index_history_uses_exact_identity(tmp_path):
    token = 'index-test-local-token-' + 'y'*40
    with TestClient(create_app(tmp_path,token,FixtureProvider(count=23)),headers={'Authorization':'Bearer '+token}) as client:
        workspace = client.get('/workspace').json()
        panel = workspace['panes'][0]
        preserved = {key:panel[key] for key in ('indicators','drawing_sets','study_layout','scale','timeframe')}
        panel['comparisons'] = [{'canonical_id':BANK}]
        saved = client.put('/workspace',json=workspace)
        assert saved.status_code == 200
        current = client.get('/workspace').json()['panes'][0]
        assert 'comparisons' not in current
        assert {key:current[key] for key in preserved} == preserved
        history = client.get('/api/history',params=dict(symbol=NIFTY,interval='1d',period='max')).json()
        assert history['canonical_id'] == NIFTY and history['currency'] == 'INR'
        assert history['precision'] == 2 and len(history['candles']) == 23
        assert all(c['low'] <= min(c['open'],c['close']) <= max(c['open'],c['close']) <= c['high'] for c in history['candles'])


def test_asset_matches_rank_ahead_of_provider_substrings(tmp_path):
    provider = FixtureProvider(count=23)
    app = create_app(tmp_path, 'index-test-local-token-'+'z'*40, provider)
    tokens = [dict(name='USDC',index=0,szDecimals=6)]
    tokens += [dict(name=f'COIN{i}',index=i,szDecimals=2) for i in range(1, 66)]
    tokens += [dict(name='HYPE',index=66,szDecimals=2)]
    pairs = [dict(name=f'@{i}',index=i,tokens=[i,0]) for i in range(1, 67)]
    rows, _ = parse_catalogue(dict(tokens=tokens,universe=pairs),[],[],[],fetched_at=1)
    registry = app.state.registry
    registry.hyperliquid = SimpleNamespace(candidates=lambda:rows)
    match = registry.search('HYPE',limit=1,category='crypto_spot')
    assert [row['canonical_id'] for row in match] == ['hyperliquid:spot:%4066:HYPE:USDC']
    assert provider.calls == 0
