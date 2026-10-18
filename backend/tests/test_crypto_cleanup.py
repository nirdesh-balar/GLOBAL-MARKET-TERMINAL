"""Ordinary discovery excludes legacy metadata; saved recovery remains lossless."""
import asyncio,copy
import pytest
from fastapi import HTTPException
from app.market_router import selectable
from app.markets import instrument,entry
from app.watchlists import CSVInput,Commit,Mutation
from app.main import restore_workspace
from app.crypto_migration import MigrationCommit
from test_hyperliquid import application,client,transport,market
from test_provider_routing import btc,seed

@pytest.mark.parametrize('query',['BTC','ETH','SOL','XRP','BTC-USD','ETH-USD','crypto',''])
def test_ordinary_search_hides_every_legacy(query,client,application,monkeypatch):
 monkeypatch.setattr(application.state.discovery,'remote',lambda q:[])
 client.get('/api/hyperliquid/catalogue')
 for url in ['/api/instruments/search','/api/instruments/discover']:
  value=client.get(url,params={'q':query}).json();rows=value['results'] if isinstance(value,dict) else value
  assert all(not (r['provider']=='yahoo' and r['kind']=='crypto') for r in rows)
 assert application.state.registry.resolve('BTC-USD')['legacy_unresolved']

@pytest.mark.parametrize('category',['crypto','crypto_spot','crypto_perpetual'])
def test_categories_only_available_verified(category,client,application,monkeypatch):
 monkeypatch.setattr(application.state.discovery,'remote',lambda q:pytest.fail('No Yahoo search in crypto category'))
 v=client.get('/api/instruments/discover',params={'category':category}).json();assert v['results']
 assert all(selectable(r) and r['provider']=='hyperliquid' for r in v['results'])
 assert not any(r['native_id']=='OLD' for r in v['results'])
 assert any(r['id']=='crypto' for r in client.get('/api/markets').json())

@pytest.mark.parametrize('native,kind',[('BTC','perpetual'),('@1','spot'),('flx:BTC','perpetual')])
def test_native_markets_remain_selectable(native,kind,client):
 rows=client.get('/api/instruments/discover',params={'q':native,'category':'crypto_'+kind}).json()['results']
 assert any(r['canonical_id']==market(native,kind)['canonical_id'] for r in rows)

@pytest.mark.parametrize('symbol,exchange,kind',[('BTC','PCX','ETF'),('BTC-USD','NMS','EQUITY'),('ETH','NMS','MUTUALFUND'),('RELIANCE.BO','BOM','EQUITY'),('AAPL','NMS','EQUITY')])
def test_provider_and_kind_not_ticker_substrings(symbol,exchange,kind,client,application,monkeypatch):
 monkeypatch.setattr(application.state.discovery,'remote',lambda q:[dict(symbol=symbol,exchange=exchange,quoteType=kind),dict(symbol='BTC-USD',exchange='CCC',quoteType='CRYPTOCURRENCY')])
 rows=client.get('/api/instruments/discover',params={'q':symbol}).json()['results']
 assert any(r['symbol']==symbol and r['provider']=='yahoo' and r['kind']!='crypto' for r in rows)
 assert all(not (r['provider']=='yahoo' and r['kind']=='crypto') for r in rows)

@pytest.mark.parametrize('change',[{'status':'delisted'},{'trading_availability':'delisted'},{'verified_at':0},{'native_mapping':''}])
def test_unverified_or_unavailable_not_selectable(change):assert not selectable(dict(market(),**change))

def test_legacy_search_and_postpone_never_delete_saved_data(client,application,monkeypatch):
 before=seed(application,True);application.state.db.put('favourites',[entry(btc())]);application.state.db.put('screener_presets',[{'name':'Saved','symbols':[btc()['canonical_id']]}])
 monkeypatch.setattr(application.state.discovery,'remote',lambda q:[])
 client.get('/api/instruments/discover?q=BTC');client.post('/api/crypto-migration/postpone')
 assert application.state.db.get('workspace')==before
 restored=restore_workspace(application.state.db,application.state.registry)
 assert restored['panes'][0]['canonical_id']==btc()['canonical_id']
 from app.models import Workspace
 expected=Workspace.model_validate(before).model_dump()['panes'][0]['drawing_sets']
 for drawings in expected.values():
  for drawing in drawings:drawing['params']={k:v for k,v in drawing['params'].items() if v is not None}
 assert restored['panes'][0]['drawing_sets']==expected
 assert restored['panes'][0]['indicators']==before['panes'][0]['indicators']
 assert application.state.db.get('favourites')[0]['canonical_id']==btc()['canonical_id']
 assert application.state.db.get('screener_presets')[0]['symbols']==[btc()['canonical_id']]
 preview=client.get('/api/crypto-migration/preview').json();assert preview['postponed'];assert any(r['identity']==btc()['canonical_id'] for r in preview['entries'])
 targets={r['canonical_id'] for r in application.state.registry.hyperliquid_candidates()};assert targets
 assert all(r['canonical_id'] in targets for row in preview['entries'] for r in row['candidates'])
 body={'preview_hash':preview['preview_hash'],'selections':{btc()['canonical_id']:market()['canonical_id']},'confirm':False}
 assert client.post('/api/crypto-migration/commit',json=body).status_code==422
 assert application.state.db.get('workspace')==before

@pytest.mark.parametrize('path',['/api/history?symbol=BTC-USD','/api/history/refresh?symbol=BTC-USD'])
def test_legacy_history_no_yahoo(client,application,path):
 before=application.state.history.provider.calls
 assert client.get(path).status_code==409
 assert application.state.history.provider.calls==before

def test_csv_legacy_requires_explicit_alternative_and_preserves_transaction(client,application):
 content='symbol,provider,asset_type\nBTC-USD,yahoo,crypto\nAAPL,yahoo,equity\n'
 preview=client.post('/api/watchlists/import/preview',json={'content':content}).json();row=preview['rows'][0]
 assert row['status']=='failed' and 'not equivalent' in row['error'];assert row['identity'] is None
 assert {r['market_type'] for r in row['candidates']}=={'spot','perpetual'}
 before=client.get('/workspace').json();body={'content':content,'preview_hash':preview['preview_hash'],'revision':before['watchlist_revision'],'name':'Cleanup import'}
 assert client.post('/api/watchlists/import/commit',json=body).status_code==422
 assert client.get('/workspace').json()==before
 selected={'2':market('@1','spot')['canonical_id']};p=client.post('/api/watchlists/import/preview',json={'content':content,'resolutions':selected}).json();assert p['counts']['valid']==2
 body.update(resolutions=selected,preview_hash=p['preview_hash']);result=client.post('/api/watchlists/import/commit',json=body);assert result.status_code==200,result.text
 restored=restore_workspace(application.state.db,application.state.registry);items=next(r['items'] for r in restored['watchlists'] if r['name']=='Cleanup import');assert items[0]['canonical_id']==selected['2'] and items[1]['symbol']=='AAPL'
 assert not (application.state.db.path.parent/'migration-backups').exists() # CSV does not migrate saved identities.

@pytest.mark.parametrize('chosen',['yahoo:BTC-USD:CRYPTO:crypto','hyperliquid:spot:FAKE:BTC:USDC'])
def test_csv_forged_or_legacy_selection_rejected(chosen,client):
 v=client.post('/api/watchlists/import/preview',json={'content':'symbol\nBTC-USD\n','resolutions':{'2':chosen}}).json();assert v['counts']['failed']==1

def test_add_legacy_rejected_saved_row_retained(client,application):
 seed(application)
 w=client.get('/workspace').json();old=next(r for r in w['watchlists'] if r['id']=='crypto')['items'];assert old
 result=client.post('/api/watchlists/mutate',json={'action':'add','id':'favourites','instrument':btc()['canonical_id'],'revision':w['watchlist_revision']});assert result.status_code==422
 assert next(r for r in client.get('/workspace').json()['watchlists'] if r['id']=='crypto')['items']==old


def test_fresh_profile_does_not_create_legacy_crypto_watchlist(client,application):
 w=client.get('/workspace').json();items=next(r for r in w['watchlists'] if r['id']=='crypto')['items'];assert items==[]
 client.get('/api/hyperliquid/catalogue')
 w=restore_workspace(application.state.db,application.state.registry);items=next(r for r in w['watchlists'] if r['id']=='crypto')['items'];assert items
 assert all(selectable(application.state.registry.resolve(r['canonical_id'])) and r['provider']=='hyperliquid' for r in items)


def test_full_catalogue_cannot_overflow_new_watchlist(client,application):
 from app.market_router import hyperliquid_id
 client.get('/api/hyperliquid/catalogue')
 cat=application.state.registry.hyperliquid
 for n in range(120):
  r=dict(market(),symbol=f'COIN{n}',native_id=f'COIN{n}',base_asset=f'COIN{n}')
  r['canonical_id']=r['id']=r['token']=hyperliquid_id('perpetual',r['native_id'],r['base_asset'],'USDC');cat.rows[r['canonical_id']]=r
 w=restore_workspace(application.state.db,application.state.registry)
 assert len(next(r for r in w['watchlists'] if r['id']=='crypto')['items'])==100
 assert len(application.state.registry.search('',40000,'crypto'))==125
