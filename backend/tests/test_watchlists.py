import copy,json,sqlite3
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.watchlists import Watchlists,Mutation,CSVInput,Commit
from app.models import Workspace
from app.main import restore_workspace
from app.markets import instrument
from test_direct_history import app,client

def workspace(client):return client.get('/workspace').json()
def op(client,action,**kwargs):return client.post('/api/watchlists/mutate',json={'action':action,'revision':workspace(client)['watchlist_revision'],**kwargs})
def preview(client,content,**kwargs):return client.post('/api/watchlists/import/preview',json={'content':content,**kwargs})
def commit(client,content,**kwargs):
 p=preview(client,content,mapping=kwargs.get('mapping',{}),resolutions=kwargs.get('resolutions',{}));assert p.status_code==200,p.text
 return client.post('/api/watchlists/import/commit',json={'content':content,'revision':workspace(client)['watchlist_revision'],'preview_hash':p.json()['preview_hash'],'name':'Imported',**kwargs})
def test_crud_defaults_ids_and_fallback(client):
 initial=workspace(client);assert len(initial['watchlists'])==10
 created=op(client,'create',name='  Research  ').json();id=created['active_watchlist'];assert id not in {r['id'] for r in initial['watchlists']};assert created['watchlists'][-1]['name']=='Research';assert created['watchlists'][-1]['items']==[]
 assert op(client,'rename',id=id,name='Renamed').status_code==200
 duplicated=op(client,'duplicate',id='stocks',name='Copied').json();copy_id=duplicated['active_watchlist'];assert duplicated['watchlists'][-1]['items']==next(r for r in initial['watchlists'] if r['id']=='stocks')['items']
 assert op(client,'delete',id=copy_id).status_code==422
 assert op(client,'delete',id=copy_id,confirm=True).json()['active_watchlist']=='stocks'
 assert op(client,'delete',id=id,confirm=True).status_code==200
 assert len(workspace(client)['watchlists'])==10
@pytest.mark.parametrize('id',['stocks','us','global','indices','global_indices','crypto','forex','commodities','funds','favourites'])
@pytest.mark.parametrize('action',['rename','delete'])
def test_default_protection(client,id,action):
 before=workspace(client);assert op(client,action,id=id,name='Bad',confirm=True).status_code==422;assert workspace(client)==before
@pytest.mark.parametrize('name',['',' ','a'*65,'bad\nname','\0'])
def test_invalid_names(client,name):assert op(client,'create',name=name).status_code==422

def test_add_copy_move_remove_reorder(client):
 a=op(client,'create',name='A').json()['active_watchlist'];b=op(client,'create',name='B').json()['active_watchlist']
 apple=client.get('/api/instruments/search?q=AAPL').json()[0]['canonical_id'];etf=client.get('/api/instruments/search?q=SPY').json()[0]['canonical_id']
 for id in [apple,etf]:assert op(client,'add',id=a,instrument=id).status_code==200
 assert op(client,'add',id=a,instrument=apple).status_code==200
 assert op(client,'reorder',id=a,order=[etf,apple]).status_code==200
 assert op(client,'reorder',id=a,order=[etf,etf]).status_code==422
 assert op(client,'transfer',id=a,instrument=apple,destination=b).status_code==200
 assert op(client,'transfer',id=a,instrument=etf,destination=b,move=True).status_code==200
 lists={r['id']:r for r in workspace(client)['watchlists']};assert [r['canonical_id'] for r in lists[a]['items']]==[apple];assert len(lists[b]['items'])==2
 assert op(client,'remove',id=a,instrument=apple).status_code==200
 assert op(client,'add',id=a,instrument='FAKE-NO-SUCH').status_code==422
 assert op(client,'transfer',id=a,instrument=apple,destination=b,move=True).status_code==422

@pytest.mark.parametrize('content',[
 'symbol\nAAPL\n','ticker,exchange\nAAPL,NASDAQ\n','trading_symbol,exchange,asset_type,provider,name\nAAPL,NASDAQ,equity,yahoo,Apple\n',
 '\ufeffsymbol,exchange\r\nRELIANCE.NS,NSE\r\n',
 'symbol,exchange,asset_type,provider,name\nAAPL,NASDAQ,equity,yahoo,"Apple, Inc.\nA quoted name"\n',
 'symbol\nBTC-USD\nEURUSD=X\nGC=F\n^GSPC\nRELIANCE.BO\n'])
def test_csv_schemas_and_no_history(client,app,content):
 before=app.state.history.metrics.copy();v=preview(client,content);assert v.status_code==200,v.text;assert v.json()['counts']['valid']>0;assert app.state.history.metrics==before
 result=commit(client,content,skip_failed='BTC-USD' in content);assert result.status_code==200,result.text;assert result.json()['summary']['imported']>0

def test_nse_bse_ambiguity_and_explicit_resolution(client):
 p=preview(client,'symbol\nRELIANCE\n').json();row=p['rows'][0];assert row['status']=='ambiguous';assert {r['exchange'] for r in row['candidates']}=={'NSE','BSE'}
 for exchange in ['NSE','BSE']:
  p=preview(client,'symbol,exchange\nRELIANCE,'+exchange+'\n').json();assert p['rows'][0]['identity']['exchange']==exchange
 chosen=row['candidates'][0]['canonical_id'];p=preview(client,'symbol\nRELIANCE\n',resolutions={'2':chosen}).json();assert p['rows'][0]['status']=='valid'
 assert commit(client,'symbol\nRELIANCE\n',resolutions={'2':chosen}).status_code==200

def test_global_duplicate_tickers_and_canonical_roundtrip(client,app):
 app.state.registry.discover([{'symbol':'DUP','exchange':'NMS','quoteType':'EQUITY'},{'symbol':'DUP','exchange':'NYQ','quoteType':'EQUITY'}])
 v=preview(client,'symbol\nDUP\n').json();assert v['counts']['ambiguous']==1
 for row in v['rows'][0]['candidates']:
  content=f"symbol,exchange,asset_type,provider,name,canonical_id,instrument_id\nDUP,{row['exchange']},equity,yahoo,Duplicate,{row['canonical_id']},{row['instrument_id']}\n"
  assert preview(client,content).json()['rows'][0]['identity']['canonical_id']==row['canonical_id']
 assert preview(client,'symbol,exchange,canonical_id\nDUP,NASDAQ,yahoo:DUP:NYSE:equity\n').json()['counts']['failed']==1

def test_mapping_preview_and_invalid_columns(client):
 p=preview(client,'Code,Venue,Description\nAAPL,NASDAQ,Apple\n').json();assert p['needs_mapping'];assert p['preview'][0][0]=='AAPL'
 p=preview(client,'Code,Venue,Description\nAAPL,NASDAQ,Apple\n',mapping={'symbol':0,'exchange':1,'name':2}).json();assert p['counts']['valid']==1
 for mapping in [{'symbol':99},{'symbol':0,'exchange':0},{'path':0}]:assert preview(client,'symbol\nAAPL\n',mapping=mapping).status_code==422

@pytest.mark.parametrize('content',['','symbol\n"unterminated','symbol\nAAPL\0','symbol\n'+'A'*4001,'symbol\n'+'AAPL\n'*1001,'symbol\n'+'a'*1_000_001],ids=['empty','unterminated-quote','nul-byte','oversized-field','too-many-rows','oversized-file'])
def test_bounded_csv_parser(client,content):assert preview(client,content).status_code==422

def test_row_errors_duplicate_counts_and_explicit_skips(client):
 content='symbol,exchange\nAAPL,NASDAQ\nAAPL,NASDAQ\nNO-SUCH-THING,NYSE\n,NSE\nAAPL,NASDAQ,extra\n'
 p=preview(client,content).json();assert p['counts']==dict(valid=1,duplicate=1,failed=3,ambiguous=0)
 before=workspace(client);assert commit(client,content).status_code==422;assert workspace(client)==before
 result=commit(client,content,skip_failed=True);assert result.status_code==200;assert result.json()['summary']==dict(imported=1,duplicates=1,failed=3,skipped=4,total=5)

def test_append_replace_confirmation_and_failure_rollback(client):
 id=op(client,'create',name='Safe').json()['active_watchlist'];assert commit(client,'symbol\nAAPL\n',target=id).status_code==200
 before=workspace(client);assert commit(client,'symbol\nBTC-USD\n',target=id,mode='replace').status_code==422;assert workspace(client)==before
 assert commit(client,'symbol\nFAKE!\n',target=id,mode='replace',confirm_replace=True,skip_failed=True).status_code==422;assert workspace(client)==before
 assert commit(client,'symbol\nBTC-USD\n',target=id,mode='replace',confirm_replace=True).status_code==422;assert workspace(client)==before
 result=commit(client,'symbol\nMSFT\n',target=id,mode='replace',confirm_replace=True);assert result.status_code==200
 assert [r for r in result.json()['watchlists'] if r['id']==id][0]['items'][0]['symbol']=='MSFT'
 result=commit(client,'symbol\nMSFT\nAAPL\n',target=id);assert result.json()['summary']['duplicates']==1;assert result.json()['summary']['imported']==1

def test_transaction_rolls_back_on_storage_error(client,app,monkeypatch):
 before=workspace(client);service=Watchlists(app.state.db,app.state.registry,lambda:restore_workspace(app.state.db,app.state.registry))
 def crash(c,old,new):
  c.execute('INSERT OR REPLACE INTO settings VALUES(?,?)',('workspace',json.dumps(new)));raise sqlite3.OperationalError('controlled storage failure')
 monkeypatch.setattr('app.watchlists.persist',crash)
 with pytest.raises(sqlite3.OperationalError):service.mutate(Mutation(action='create',revision=before['watchlist_revision'],name='Must roll back'))
 assert workspace(client)==before

def test_revision_prevents_stale_workspace_overwriting_import(client):
 before=workspace(client);assert commit(client,'symbol\nAAPL\n').status_code==200
 after=workspace(client);assert after['watchlist_revision']>before['watchlist_revision'];assert client.put('/workspace',json=before).status_code==409;assert workspace(client)==after
 assert client.post('/api/watchlists/mutate',json={'action':'create','revision':before['watchlist_revision'],'name':'Stale'}).status_code==409

def test_preview_changed_rejects_commit(client):
 value=preview(client,'symbol\nAAPL\n').json();before=workspace(client)
 response=client.post('/api/watchlists/import/commit',json={'content':'symbol\nBTC-USD\n','revision':before['watchlist_revision'],'name':'Changed','preview_hash':value['preview_hash']});assert response.status_code==409;assert workspace(client)==before

def test_protected_workspace_save_and_versioned_migration(client):
 w=workspace(client);legacy=copy.deepcopy(w);legacy.pop('watchlist_version');legacy.pop('watchlist_revision');assert Workspace.model_validate(legacy).watchlist_version==1
 future={**legacy,'watchlist_version':999}
 with pytest.raises(ValidationError):Workspace.model_validate(future)
 w['watchlists']=[r for r in w['watchlists'] if r['id']!='stocks'];w['active_watchlist']='favourites';assert client.put('/workspace',json=w).status_code==422

def test_list_limit_error_no_partial_creation(client):
 for i in range(30):assert op(client,'create',name=f'List {i}').status_code==200
 before=workspace(client);assert op(client,'create',name='Too many').status_code==422;assert commit(client,'symbol\nAAPL\n').status_code==422;assert workspace(client)==before

def test_item_limit_atomic_import(client,app):
 id=op(client,'create',name='Limit').json()['active_watchlist']
 quotes=[{'symbol':f'FAKE{i}','exchange':'NMS','quoteType':'EQUITY'} for i in range(101)];app.state.registry.discover(quotes)
 before=workspace(client);content='symbol,exchange\n'+''.join(f'FAKE{i},NASDAQ\n' for i in range(101));assert commit(client,content,target=id).status_code==422;assert workspace(client)==before

def test_auth_and_schema_boundary(app):
 from fastapi.testclient import TestClient
 c=TestClient(app);assert c.post('/api/watchlists/mutate',json={}).status_code==401
@pytest.mark.parametrize('payload',[{'action':'create','name':'X','revision':0,'path':'/etc/passwd'},{'action':'eval','revision':0},{'action':'delete','revision':-1}])
def test_strict_mutation_schema(client,payload):assert client.post('/api/watchlists/mutate',json=payload).status_code==422
