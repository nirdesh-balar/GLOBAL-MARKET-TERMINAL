"""Explicit, backup-first metadata migration. Production metadata is pending in A."""
import hashlib,json,sqlite3,time,uuid
from pathlib import Path
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,ConfigDict,Field
from .market_router import MarketDataRouter
from .markets import entry

def fingerprint(values):
    values={**values,'settings':[r for r in values.get('settings',[]) if r['key']!='hyperliquid_catalogue_v1']}
    return hashlib.sha256(json.dumps(values,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def legacy(row):return isinstance(row,dict) and row.get('provider','yahoo')=='yahoo' and (row.get('kind')=='crypto' or row.get('category')=='crypto')
def walk(value,path=''):
    if isinstance(value,dict):
        if legacy(value):yield path,value
        for k,v in value.items():yield from walk(v,path+'/'+str(k))
    elif isinstance(value,list):
        for i,v in enumerate(value):yield from walk(v,path+'/'+str(i))

class MigrationCommit(BaseModel):
    model_config=ConfigDict(extra='forbid')
    preview_hash:str=Field(min_length=64,max_length=64)
    selections:dict[str,str]=Field(min_length=1,max_length=100)
    confirm:bool=False
    transfer_drawings:bool=False
    approve_price_references:bool=False
    retain_legacy_drawings:bool=True
class Restore(BaseModel):
    model_config=ConfigDict(extra='forbid')
    backup_id:str=Field(pattern=r'^[a-f0-9]{32}$')
    confirm:bool=False
class MigrationService:
    def __init__(self,db,registry,history):self.db=db;self.registry=registry;self.history=history
    def snapshot(self,c):
        # Read-only scope: definitions and metadata, not persistent price series.
        tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        return {name:[dict(r) for r in c.execute('SELECT * FROM '+name+' ORDER BY 1')] for name in ('settings','watchlists','alerts','alert_history') if name in tables}
    def candidates(self):
        # Only a future official-metadata discovery provider may populate this.
        # No client-submitted identities, hardcoded BTC aliases or Yahoo mappings.
        return self.registry.hyperliquid_candidates()
    def preview(self):
        with self.db.connect() as c:snapshot=self.snapshot(c)
        found={}
        settings={r['key']:json.loads(r['value']) for r in snapshot['settings'] if r['key'] not in ('global_instruments','index_metadata','hyperliquid_catalogue_v1')}
        for path,row in walk(settings):
            sec=self.registry.resolve(row.get('canonical_id') or row.get('instrument_id') or row.get('token') or '') or self.registry.resolve(row['symbol'])
            id=sec['canonical_id'] if sec and legacy(sec) else row.get('canonical_id') or row.get('instrument_id') or row['symbol']
            item=found.setdefault(id,dict(identity=id,symbol=row['symbol'],source='Yahoo Finance',status='unresolved',references=[],candidates=[],candidate_state='unavailable'))
            item['references'].append(path)
        for row in snapshot.get('alerts',[]):
            value=json.loads(row['definition']);id=value['instrument'];sec=self.registry.resolve(id)
            if sec and legacy(sec):
                item=found.setdefault(sec['canonical_id'],dict(identity=sec['canonical_id'],symbol=sec['symbol'],source='Yahoo Finance',status='unresolved',references=[],candidates=[],candidate_state='unavailable'))
                item['references'].append('alerts/'+row['id'])
        # Scalar identity references in presets, favourites and replay settings.
        legacy_rows=[r for r in self.registry.globals() if legacy(r)]
        alias_rows={str(r.get(k,'')):r for r in legacy_rows for k in ('canonical_id','id','token','symbol') if r.get(k)}
        def references(value,path='',key=''):
            if isinstance(value,dict):
                for k,v in value.items():yield from references(v,path+'/'+k,k)
            elif isinstance(value,list):
                for i,v in enumerate(value):yield from references(v,path+'/'+str(i),key)
            elif isinstance(value,str) and key in ('instrument','symbols','favourites','favorite_symbols','replay_instrument') and value in alias_rows:yield path,alias_rows[value]
        for path,row in references(settings):
            id=row['canonical_id'];item=found.setdefault(id,dict(identity=id,symbol=row['symbol'],source='Yahoo Finance',status='unresolved',references=[],candidates=[],candidate_state='unavailable'))
            if path not in item['references']:item['references'].append(path)
        available=self.candidates()
        for item in found.values():
            # Deliberately list explicit verified alternatives, never claim equivalence.
            item['candidates']=[entry(r) for r in available[:60]];item['candidate_total']=len(available);item['candidate_state']='verified_selection_required' if available else 'unavailable'
        return dict(preview_hash=fingerprint(snapshot),entries=list(found.values()),metadata_available=bool(available),provider_state='available' if available else 'pending',requires_confirmation=True,postponed=self.db.get('crypto_migration_postponed',False),notice='Yahoo crypto is blocked. Spot and perpetual markets are distinct. No candidates are inferred from a ticker; postpone until official metadata is available.')
    def postpone(self):
        self.db.put('crypto_migration_postponed',True)
        return dict(postponed=True,entries_retained=True,fetching_enabled=False)
    def commit(self,op):
        if not op.confirm:raise HTTPException(422,'Explicit migration confirmation is required')
        preview=self.preview()
        if preview['preview_hash']!=op.preview_hash:raise HTTPException(409,'Saved data changed. Review a new migration preview.')
        known={r['identity']:r for r in preview['entries']};available={r['canonical_id']:r for r in self.candidates()}
        mapping={};aliases={}
        for old,new in op.selections.items():
            if old not in known or new not in available:raise HTTPException(422,'Select an identity from verified official Hyperliquid metadata; metadata is pending in Milestone A')
            target=available[new];MarketDataRouter.validate(target)
            if target['provider']!='hyperliquid' or target['kind']!='crypto':raise HTTPException(422,'Migration target must be verified Hyperliquid crypto')
            mapping[old]=target
            sec=self.registry.resolve(old)
            if not sec or not legacy(sec):raise HTTPException(422,'Legacy source identity is unresolved; retain it until its references can be reviewed safely')
            if sec:
                for key in ('canonical_id','id','token','symbol'):aliases[sec[key]]=old
        if len({r['canonical_id'] for r in mapping.values()})!=len(mapping):raise HTTPException(422,'Distinct legacy instruments cannot merge into one target')
        if not op.retain_legacy_drawings and not op.transfer_drawings:raise HTTPException(422,'Retain archived drawings or explicitly approve transferring their coordinates')
        backup_id=uuid.uuid4().hex;directory=self.db.path.parent/'migration-backups';directory.mkdir(mode=0o700,exist_ok=True);backup=directory/(backup_id+'.sqlite3')
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE');current=self.snapshot(c)
            if fingerprint(current)!=op.preview_hash:raise HTTPException(409,'Saved references changed; no migration applied')
            source=sqlite3.connect(self.db.path.resolve().as_uri()+'?mode=ro',uri=True);dest=sqlite3.connect(backup)
            try:source.backup(dest)
            finally:dest.close();source.close()
            backup.chmod(0o600)
            def replacement(value,key=''):
                if isinstance(value,dict):
                    if legacy(value):
                        old=next((aliases.get(value.get(k,'')) for k in ('canonical_id','instrument_id','token','symbol') if aliases.get(value.get(k,''))),None)
                        if old in mapping:
                            # Preserve pane settings and the original archived drawing keys.
                            updated={**value,**entry(mapping[old])}
                            if 'drawing_sets' in value:
                                updated['drawing_sets']=dict(value['drawing_sets'])
                                for name,drawings in value['drawing_sets'].items():
                                    prefix,sep,interval=name.rpartition('/')
                                    if prefix not in aliases or aliases[prefix]!=old:continue
                                    if op.transfer_drawings:
                                        target=mapping[old]['canonical_id']+'/'+interval
                                        if target in updated['drawing_sets']:raise HTTPException(409,'Target drawing set already exists; no sets were merged')
                                        updated['drawing_sets'][target]=drawings
                                        if not op.retain_legacy_drawings:updated['drawing_sets'].pop(name)
                            return updated
                    return {k:replacement(v,k) for k,v in value.items()}
                if isinstance(value,list):return [replacement(v,key) for v in value]
                if isinstance(value,str) and key in ('instrument','canonical_id','instrument_id','symbols','favourites','favorite_symbols','replay_instrument') and value in aliases:return mapping[aliases[value]]['canonical_id']
                return value
            for row in current['settings']:
                if row['key'] in ('global_instruments','index_metadata','hyperliquid_catalogue_v1'):continue
                value=json.loads(row['value'])
                if row['key']=='screener_presets' and any(a in json.dumps(value) for a in aliases) and not op.approve_price_references:raise HTTPException(422,'Explicitly approve screener price references before changing markets')
                value=replacement(value)
                if row['key']=='workspace':
                    from .models import Workspace
                    try:Workspace.model_validate(value)
                    except ValueError:raise HTTPException(422,'Migration would create invalid or duplicate references; no changes applied.') from None
                    value['watchlist_revision']=value.get('watchlist_revision',0)+1
                c.execute('UPDATE settings SET value=? WHERE key=?',(json.dumps(value),row['key']))
            for row in current.get('watchlists',[]):c.execute('UPDATE watchlists SET items=? WHERE name=?',(json.dumps(replacement(json.loads(row['items']))),row['name']))
            for row in current.get('alerts',[]):
                definition=json.loads(row['definition']);old=aliases.get(definition['instrument'])
                if old not in mapping:continue
                if not op.approve_price_references:raise HTTPException(422,'Explicitly approve alert price references before changing markets')
                definition['instrument']=mapping[old]['canonical_id'];definition['enabled']=False
                runtime=json.loads(row['runtime']);runtime.update(status='disabled',last_attempt=None,last_evaluated_candle=None,last_state=None,last_successful_data=None,last_fetched_at=None,error='Migrated market; review thresholds and explicitly rearm.',failures=0)
                c.execute('UPDATE alerts SET definition=?,runtime=?,revision=revision+1 WHERE id=?',(json.dumps(definition),json.dumps(runtime),row['id']))
                c.execute("UPDATE alert_history SET delivery='superseded' WHERE alert_id=? AND delivery='pending'",(row['id'],))
            # A backup is the reversible full source; history payloads remain historical.
            after=fingerprint(self.snapshot(c))
            record=directory/(backup_id+'.json')
            record.write_text(json.dumps(dict(after=after,created_at=time.time(),selections=op.selections)));record.chmod(0o600)
        self.history.clear()
        return dict(migrated=len(mapping),backup_id=backup_id,backup=str(backup),legacy_drawings_retained=op.retain_legacy_drawings,alerts_require_rearm=True)
    def restore(self,op):
        if not op.confirm:raise HTTPException(422,'Explicit confirmation is required to reverse a migration')
        directory=self.db.path.parent/'migration-backups';backup=directory/(op.backup_id+'.sqlite3');record=directory/(op.backup_id+'.json')
        if not backup.is_file() or not record.is_file():raise HTTPException(404,'Migration backup is unavailable')
        audit=json.loads(record.read_text())
        source=sqlite3.connect(backup.resolve().as_uri()+'?mode=ro',uri=True);source.row_factory=sqlite3.Row
        try:old=self.snapshot(source)
        finally:source.close()
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if fingerprint(self.snapshot(c))!=audit['after']:raise HTTPException(409,'Preferences changed after migration. Automatic reversal would lose changes; backup retained for manual review.')
            for name,rows in old.items():
                c.execute('DELETE FROM '+name)
                for row in rows:
                    cols=list(row);c.execute('INSERT INTO '+name+'('+','.join(cols)+') VALUES('+','.join('?' for _ in cols)+')',tuple(row.values()))
        self.history.clear();return dict(restored=True,backup_retained=True)

def routes(service):
    router=APIRouter()
    @router.get('/api/providers/status')
    def status():
        value=service.history.router.status()
        streams=getattr(service.history,'streams',None)
        if streams and streams.enabled:value['streaming']=True;value['hyperliquid']['stream']=streams.status()
        return value
    @router.get('/api/crypto-migration/preview')
    async def preview():
        catalogue=getattr(service.registry,'hyperliquid',None)
        if catalogue:
            try:await catalogue.ensure()
            except Exception as e:
                from .providers.base import ProviderError
                if not isinstance(e,ProviderError):raise
        return service.preview()
    @router.get('/api/crypto-migration/candidates')
    async def candidates(q:str='',market_type:str='',offset:int=0):
        catalogue=getattr(service.registry,'hyperliquid',None)
        if catalogue:await catalogue.ensure()
        rows=[r for r in service.candidates() if (not market_type or r['market_type']==market_type) and q.casefold() in (r['name']+' '+r['native_id']).casefold()]
        offset=max(0,min(offset,40000))
        return dict(results=[entry(r) for r in rows[offset:offset+60]],total=len(rows),next_offset=offset+60 if offset+60<len(rows) else None)
    @router.post('/api/crypto-migration/postpone')
    def postpone():return service.postpone()
    @router.post('/api/crypto-migration/commit')
    async def commit(op:MigrationCommit):
        if getattr(service.registry,'hyperliquid',None):await service.registry.hyperliquid.ensure()
        return service.commit(op)
    @router.post('/api/crypto-migration/restore')
    def restore(op:Restore):return service.restore(op)
    return router
