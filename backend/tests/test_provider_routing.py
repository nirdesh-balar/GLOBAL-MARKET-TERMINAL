import asyncio,copy,json,sqlite3
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.market_router import MarketDataRouter,hyperliquid_id,enrich
from app.markets import instrument,entry,samples
from app.models import SymbolEntry
from app.history import HistoryService
from app.providers.base import ProviderError,History
from app.providers.yahoo import YahooFinanceProvider
from app.main import create_app,restore_workspace
from app.crypto_migration import MigrationCommit,Restore,fingerprint
from app.alert_models import AlertDefinition
from fixtures import FixtureProvider,candles
from test_direct_history import TOKEN

NONCRYPTO=[('RELIANCE.NS','NSI','EQUITY'),('RELIANCE.BO','BOM','EQUITY'),('AAPL','NMS','EQUITY'),('^GSPC','NYQ','INDEX'),('EURUSD=X','CCY','CURRENCY'),('GC=F','CMX','FUTURE'),('SPY','PCX','ETF'),('FUND','NMS','MUTUALFUND')]
def hl(market='perpetual',native='BTC',base='BTC',quote='USDC'):
 id=hyperliquid_id(market,native,base,quote)
 return dict(id=id,canonical_id=id,token=id,instrument_id=id,provider='hyperliquid',kind='crypto',category='crypto',exchange='HYPERLIQUID',market_type=market,native_id=native,base_asset=base,quote_asset=quote,symbol='BTC',yahoo_symbol='',name='Bitcoin '+market,timezone='UTC',currency=quote,country='Global',precision=6,identity_version=1,legacy_unresolved=False)
def btc():return instrument(dict(symbol='BTC-USD',exchange='CCC',quoteType='CRYPTOCURRENCY'))
@pytest.fixture
def application(tmp_path):
 app=create_app(tmp_path,TOKEN,FixtureProvider(count=900));app.state.history.config['min_interval']=0
 return app
@pytest.fixture
def client(application):
 with TestClient(application,headers={'Authorization':'Bearer '+TOKEN}) as c:yield c
@pytest.mark.parametrize('symbol,exchange,kind',NONCRYPTO)
def test_noncrypto_only_yahoo(symbol,exchange,kind):
 row=instrument(dict(symbol=symbol,exchange=exchange,quoteType=kind));assert MarketDataRouter().require(row)=='yahoo'
 with pytest.raises(ProviderError,match='Non-crypto|mismatch'):MarketDataRouter().require(dict(row,provider='hyperliquid'))
@pytest.mark.parametrize('market,native',[('spot','@1'),('perpetual','BTC')])
def test_crypto_only_hyperliquid_pending(market,native):
 row=hl(market,native);assert MarketDataRouter.validate(row)=='hyperliquid'
 with pytest.raises(ProviderError) as exc:MarketDataRouter().require(row)
 assert exc.value.kind=='pending'
 with pytest.raises(ProviderError):MarketDataRouter().require(dict(row,provider='yahoo'))
@pytest.mark.parametrize('method',['get','quote','incremental','daily'])
@pytest.mark.parametrize('security',[btc(),hl('spot','@1'),hl()])
def test_no_crypto_provider_call_or_cache_fallback(method,security):
 async def run():
  service=HistoryService(FixtureProvider());service.config['min_interval']=0
  service.cache.put(service.key(security),History(candles(3),'CACHED YAHOO'))
  calls=service.provider.calls
  with pytest.raises(ProviderError) as exc:await getattr(service,method)(security)
  assert exc.value.kind=='pending' and service.provider.calls==calls
  assert service.metrics['provider_requests']==0 and service.metrics['quote_provider_requests']==0
  await service.close()
 asyncio.run(run())
@pytest.mark.parametrize('method,args',[('fetch',('1d',)),('fetch_daily',()),('fetch_quote',()),('fetch_recent',('1d',))])
def test_adapter_defense_in_depth(method,args):
 with patch('app.providers.yahoo.yf.Ticker') as ticker:
  with pytest.raises(ProviderError):getattr(YahooFinanceProvider(),method)(btc(),*args)
  ticker.assert_not_called()
def test_suffix_does_not_determine_category():
 row=instrument(dict(symbol='FAKE-USD',exchange='NMS',quoteType='EQUITY'))
 assert row['kind']=='equity' and MarketDataRouter().require(row)=='yahoo'
def test_provider_market_native_identity_separation():
 a=hl('spot','@1');b=hl('perpetual','BTC');c=hl('spot','@2');y=instrument(dict(symbol='BTC',exchange='NMS',quoteType='EQUITY'))
 assert a['symbol']==b['symbol']==c['symbol']==y['symbol']
 assert len({r['canonical_id'] for r in [a,b,c,y]})==4
 assert hyperliquid_id('spot','@1:USDC','BTC','USDC')!=hyperliquid_id('spot','@1','BTC:USDC','')
@pytest.mark.parametrize('change',[{'kind':'equity'},{'category':'stocks'},{'provider':'hyperliquid'},{'exchange':'NSE'},{'native_id':'ETH-USD'}])
def test_mismatched_legacy_metadata_rejected(change):
 with pytest.raises(ProviderError):MarketDataRouter.validate(dict(btc(),**change))
def test_unknown_provider_and_canonical_rejected():
 for row in [dict(btc(),provider='other'),dict(hl(),canonical_id='hyperliquid:perpetual:ETH::'),dict(hl(),market_type='future')]:
  with pytest.raises((ProviderError,ValueError)):MarketDataRouter.validate(row)
def test_legacy_models_are_recoverable():
 row=entry(btc());row.pop('legacy_unresolved',None);restored=SymbolEntry.model_validate(row)
 assert restored.legacy_unresolved and restored.provider=='yahoo' and restored.canonical_id==btc()['canonical_id']
def test_crypto_discovery_never_calls_yahoo(application,monkeypatch):
 called=[];monkeypatch.setattr(application.state.discovery,'remote',lambda q:called.append(q))
 result=asyncio.run(application.state.discovery.search('BTC','crypto'))
 assert not called and 'pending' in result['warning']
def test_broad_discovery_discards_crypto(application):
 r=application.state.registry.discover([dict(symbol='BTC-USD',exchange='CCC',quoteType='CRYPTOCURRENCY'),dict(symbol='AAPL',exchange='NMS',quoteType='EQUITY')])
 assert len(r)==1 and r[0]['kind']=='equity'
 assert btc()['canonical_id'] not in application.state.db.get('global_instruments',{})
def test_csv_crypto_rejected_noncrypto_kept(client):
 r=client.post('/api/watchlists/import/preview',json={'content':'symbol,provider,asset_type\nBTC-USD,yahoo,crypto\nAAPL,yahoo,equity\n'}).json()
 assert r['counts']['failed']==1 and r['counts']['valid']==1
 assert 'migration required' in r['rows'][0]['error']
def test_csv_cannot_claim_hyperliquid_identity(client):
 r=client.post('/api/watchlists/import/preview',json={'content':'symbol,provider,asset_type\nBTC-USD,hyperliquid,crypto\nAAPL,hyperliquid,equity\n'}).json()
 assert r['counts']['failed']==2
def test_local_crypto_apis_pending_and_no_calls(client,application):
 before=application.state.history.provider.calls
 for path in ['/api/history?symbol=BTC-USD','/api/history/refresh?symbol=BTC-USD']:
  r=client.get(path);assert r.status_code==409 and r.json()['kind']=='pending'
 assert application.state.history.provider.calls==before

def seed(application,with_alert=False):
 db=application.state.db;w=restore_workspace(db,application.state.registry)
 next(r for r in w['watchlists'] if r['id']=='crypto')['items']=[entry(r) for r in samples() if r['kind']=='crypto'] # Explicit pre-cleanup saved profile fixture.
 row=entry(btc());w['panes'][0].update(row)
 w['panes'][0]['drawing_sets']={btc()['canonical_id']+'/1d':[dict(id='legacy-line',kind='horizontal',version=2,anchors=[dict(time=1700000000,price=30000)],color='#86aaf9',width=2,params={})]}
 w['watchlist'].append(row);db.put('workspace',w)
 db.put('replay_preferences',dict(replay_instrument=btc()['canonical_id'],cursor=1700000000));db.put('favourites',[row])
 if with_alert:
  application.state.alerts.store.save(AlertDefinition.model_validate(dict(name='Legacy BTC',instrument=btc()['canonical_id'],interval='1d',conditions=dict(type='group',op='and',children=[dict(type='condition',kind='close_above',params=dict(value=1,currency='USD'))]))))
 return copy.deepcopy(w)
def confirmed(application,**kwargs):
 p=application.state.migration.preview();return MigrationCommit(preview_hash=p['preview_hash'],selections={btc()['canonical_id']:hl()['canonical_id']},confirm=True,**kwargs)
def verified(application,monkeypatch):
 # This isolated test injects a verified fixture catalogue; production returns [].
 monkeypatch.setattr(application.state.registry,'hyperliquid_candidates',lambda:[hl()])

def test_preview_no_invented_candidates(application):
 before=seed(application);p=application.state.migration.preview()
 assert len(p['entries'])==4 and not p['metadata_available'] and p['requires_confirmation']
 assert all(not r['candidates'] and r['candidate_state']=='unavailable' for r in p['entries'])
 assert application.state.db.get('workspace')==before
 assert not (application.state.db.path.parent/'migration-backups').exists()
def test_postpone_preserves_references(application):
 before=seed(application);application.state.migration.postpone()
 assert application.state.db.get('workspace')==before and application.state.migration.preview()['postponed']
def test_commit_requires_confirmation(application,monkeypatch):
 seed(application);verified(application,monkeypatch);op=confirmed(application);op.confirm=False
 with pytest.raises(HTTPException):application.state.migration.commit(op)
 assert not (application.state.db.path.parent/'migration-backups').exists()
def test_unverified_candidate_rejected(application):
 before=seed(application)
 with pytest.raises(HTTPException) as exc:application.state.migration.commit(confirmed(application))
 assert exc.value.status_code==422 and application.state.db.get('workspace')==before
 assert not (application.state.db.path.parent/'migration-backups').exists()
def test_stale_preview_rejected(application,monkeypatch):
 seed(application);verified(application,monkeypatch);op=confirmed(application);application.state.db.put('theme_test','changed')
 with pytest.raises(HTTPException) as exc:application.state.migration.commit(op)
 assert exc.value.status_code==409
def test_commit_backup_archive_and_references(application,monkeypatch):
 from contextlib import closing
 before=seed(application);verified(application,monkeypatch);service=application.state.migration
 result=service.commit(confirmed(application));after=application.state.db.get('workspace');p=after['panes'][0]
 assert p['provider']=='hyperliquid' and p['market_type']=='perpetual', 'MIGRATION_TARGET'
 for key in ['indicators','appearance','scale','timeframe','auto_refresh','auto_follow','drawing_sets']:assert p[key]==before['panes'][0][key], 'MIGRATION_SETTINGS_PRESERVED'
 assert application.state.db.get('replay_preferences')['replay_instrument']==hl()['canonical_id'], 'MIGRATION_REPLAY_REFERENCE'
 assert application.state.db.get('favourites')[0]['canonical_id']==hl()['canonical_id'], 'MIGRATION_FAVOURITE_REFERENCE'
 assert after['watchlist_revision']==before['watchlist_revision']+1, 'MIGRATION_WATCHLIST_REVISION'
 assert application.state.registry.resolve(hl()['canonical_id'])['market_type']=='perpetual', 'MIGRATION_REGISTRY_REFERENCE'
 assert restore_workspace(application.state.db,application.state.registry)['panes'][0]['token']==hl()['canonical_id'], 'MIGRATION_WORKSPACE_REFERENCE'
 with closing(sqlite3.connect(result['backup'])) as c:assert json.loads(c.execute("select value from settings where key='workspace'").fetchone()[0])==before, 'MIGRATION_BACKUP_SOURCE'
 assert Path(result['backup']).stat().st_mode&0o777==0o600, 'MIGRATION_POSIX_MODE'
 service.restore(Restore(backup_id=result['backup_id'],confirm=True));assert application.state.db.get('workspace')==before, 'MIGRATION_RESTORE_SOURCE'
 assert Path(result['backup']).exists(), 'MIGRATION_BACKUP_RETAINED'
def test_drawing_coordinate_transfer_explicit(application,monkeypatch):
 before=seed(application);verified(application,monkeypatch)
 result=application.state.migration.commit(confirmed(application,transfer_drawings=True,retain_legacy_drawings=False));p=application.state.db.get('workspace')['panes'][0]
 assert btc()['canonical_id']+'/1d' not in p['drawing_sets']
 assert p['drawing_sets'][hl()['canonical_id']+'/1d']==before['panes'][0]['drawing_sets'][btc()['canonical_id']+'/1d']
def test_drawing_archive_cannot_be_silently_dropped(application,monkeypatch):
 before=seed(application);verified(application,monkeypatch)
 with pytest.raises(HTTPException):application.state.migration.commit(confirmed(application,retain_legacy_drawings=False))
 assert application.state.db.get('workspace')==before
def test_target_drawing_collision_rolls_back(application,monkeypatch):
 w=seed(application);w['panes'][0]['drawing_sets'][hl()['canonical_id']+'/1d']=[];application.state.db.put('workspace',w);verified(application,monkeypatch)
 with pytest.raises(HTTPException):application.state.migration.commit(confirmed(application,transfer_drawings=True))
 assert application.state.db.get('workspace')==w
def test_alert_migration_requires_price_approval_and_rearm(application,monkeypatch):
 before=seed(application,True);verified(application,monkeypatch)
 with pytest.raises(HTTPException):application.state.migration.commit(confirmed(application))
 assert application.state.db.get('workspace')==before
 result=application.state.migration.commit(confirmed(application,approve_price_references=True));alert=application.state.alerts.store.list()[0]
 assert alert['definition']['instrument']==hl()['canonical_id'] and not alert['definition']['enabled'] and alert['runtime']['last_evaluated_candle'] is None
 application.state.migration.restore(Restore(backup_id=result['backup_id'],confirm=True));assert application.state.alerts.store.list()[0]['definition']['instrument']==btc()['canonical_id']
def test_screener_reference_migration_preserved(application,monkeypatch):
 seed(application);application.state.db.put('screener_presets',dict(version=1,presets=[dict(id='legacy',config=dict(symbols=[btc()['canonical_id']],interval='1d',conditions={'threshold':10}))]));verified(application,monkeypatch)
 with pytest.raises(HTTPException):application.state.migration.commit(confirmed(application))
 application.state.migration.commit(confirmed(application,approve_price_references=True));p=application.state.db.get('screener_presets')['presets'][0]
 assert p['config']['symbols']==[hl()['canonical_id']] and p['config']['conditions']=={'threshold':10}
def test_restore_requires_confirmation_and_refuses_later_edits(application,monkeypatch):
 seed(application);verified(application,monkeypatch);r=application.state.migration.commit(confirmed(application))
 with pytest.raises(HTTPException):application.state.migration.restore(Restore(backup_id=r['backup_id']))
 application.state.db.put('later-preference','preserve me')
 with pytest.raises(HTTPException) as exc:application.state.migration.restore(Restore(backup_id=r['backup_id'],confirm=True))
 assert exc.value.status_code==409 and application.state.db.get('later-preference')=='preserve me'
def test_failed_storage_rolls_back_and_retains_backup(application,monkeypatch):
 before=seed(application);verified(application,monkeypatch)
 with application.state.db.connect() as c:c.execute("CREATE TRIGGER test_abort BEFORE UPDATE ON settings WHEN NEW.key='workspace' BEGIN SELECT RAISE(ABORT,'controlled failure'); END")
 with pytest.raises(sqlite3.DatabaseError):application.state.migration.commit(confirmed(application))
 assert application.state.db.get('workspace')==before
 assert list((application.state.db.path.parent/'migration-backups').glob('*.sqlite3'))
def test_status_and_migration_routes_auth(application,client):
 assert client.get('/api/providers/status').json()['hyperliquid']['state']=='pending'
 assert client.post('/api/crypto-migration/commit',json=dict(preview_hash='0'*64,selections={btc()['canonical_id']:hl()['canonical_id']},confirm=False)).status_code==422
 unauth=TestClient(application)
 for route in ['/api/providers/status','/api/crypto-migration/preview']:assert unauth.get(route).status_code==401

def test_analysis_only_endpoint_and_dependency_audit(application):
 paths=[r.path for r in application.routes]
 forbidden=('order','wallet','signtransaction','deposit','withdraw','/exchange','trade','leverage')
 assert not any(token in path.casefold() for path in paths for token in forbidden)
 root=Path(__file__).parents[2]
 for folder in ['backend/app','desktop/src','desktop/electron']:
  for p in (root/folder).rglob('*'):
   if p.suffix not in ('.py','.ts','.tsx'):continue
   content=p.read_text().casefold()
   for token in ['eth_sendtransaction','eth_signtransaction','personal_sign','walletconnect','placeorder(','place_order(','api.hyperliquid.xyz/exchange']:
    assert token not in content,(p,token)

def test_target_watchlist_collision_never_merges(application,monkeypatch):
 w=seed(application);verified(application,monkeypatch);next(r for r in w['watchlists'] if r['id']=='crypto')['items'].append(entry(hl()));application.state.db.put('workspace',w)
 with pytest.raises(HTTPException) as exc:application.state.migration.commit(confirmed(application))
 assert exc.value.status_code==422 and application.state.db.get('workspace')==w

def test_known_legacy_hidden_from_ordinary_discovery_but_recoverable(application,monkeypatch):
 called=[];monkeypatch.setattr(application.state.discovery,'remote',lambda q:called.append(q) or [])
 result=asyncio.run(application.state.discovery.search('BTC-USD'))
 assert result['results']==[] and application.state.registry.resolve('BTC-USD')['legacy_unresolved']
 assert application.state.history.provider.calls==0 # Metadata search may find valid non-crypto; history stays blocked.

@pytest.mark.parametrize('change',[{'base_asset':''},{'quote_asset':''},{'identity_version':2}])
def test_incomplete_or_future_crypto_identity_rejected(change):
 with pytest.raises((ProviderError,ValueError)):MarketDataRouter.validate(dict(hl(),**change))

def test_legacy_noncrypto_workspace_save_without_canonical(client):
 w=client.get('/workspace').json();r=w['panes'][0];r.pop('canonical_id',None);r.pop('native_id',None)
 assert client.put('/workspace',json=w).status_code==200

def test_canonical_provider_cannot_be_forged_in_preferences(client):
 w=client.get('/workspace').json();w['panes'][0]['canonical_id']='yahoo:FAKE:NSE:equity'
 assert client.put('/workspace',json=w).status_code==422

def test_minimal_legacy_identity_coalesces_without_dropping_references(application,monkeypatch):
 w=seed(application);row=next(r for r in w['watchlists'] if r['id']=='crypto')['items'][0];row.pop('canonical_id');row.pop('instrument_id');row['token']='0';application.state.db.put('workspace',w)
 assert len(application.state.migration.preview()['entries'])==4
 verified(application,monkeypatch);application.state.migration.commit(confirmed(application));r=next(r for r in application.state.db.get('workspace')['watchlists'] if r['id']=='crypto')['items'][0]
 assert r['canonical_id']==hl()['canonical_id']

def test_reversal_record_failure_rolls_back(application,monkeypatch):
 before=seed(application);verified(application,monkeypatch);original=Path.write_text
 def fail_record(path,*args,**kwargs):
  if path.parent.name=='migration-backups' and path.suffix=='.json':raise OSError('controlled record write failure')
  return original(path,*args,**kwargs)
 monkeypatch.setattr(Path,'write_text',fail_record)
 with pytest.raises(OSError):application.state.migration.commit(confirmed(application))
 assert application.state.db.get('workspace')==before
