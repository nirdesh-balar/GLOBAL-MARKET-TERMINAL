"""Atomic watchlist metadata operations and bounded, directory-only CSV resolution."""
import csv,hashlib,io,json,re,uuid
from typing import Literal
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,ConfigDict,Field,model_validator
from .models import Workspace,Watchlist
from .market_router import MarketDataRouter,selectable
from .providers.base import ProviderError
from .markets import MARKETS,entry,EXCHANGES,SUFFIX
SYSTEM_IDS={k for k,_ in MARKETS}
HEADERS={'symbol':{'symbol','ticker','trading_symbol','tradingsymbol','yahoo_symbol'},'exchange':{'exchange','exchange_code','market'},'asset_type':{'asset_type','kind','type','quote_type'},'provider':{'provider','data_provider'},'name':{'name','company','company_name'},'canonical_id':{'canonical_id'},'instrument_id':{'instrument_id'}}
class CSVInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    content:str=Field(max_length=1_000_000)
    mapping:dict[str,int|None]=Field(default_factory=dict,max_length=7)
    resolutions:dict[str,str]=Field(default_factory=dict,max_length=1000)
    @model_validator(mode='after')
    def safe(self):
        if len(self.content.encode('utf8'))>1_000_000 or '\0' in self.content:raise ValueError('Select a UTF-8 CSV of up to 1 MB without NUL bytes')
        if any(k not in HEADERS or v is not None and (isinstance(v,bool) or v<0 or v>=20) for k,v in self.mapping.items()):raise ValueError('Invalid column mapping')
        if any(not k.isdigit() or len(v)>180 for k,v in self.resolutions.items()):raise ValueError('Invalid row resolution')
        return self
class Mutation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    action:Literal['create','rename','delete','duplicate','add','remove','reorder','transfer']
    revision:int=Field(ge=0)
    id:str=Field(default='',max_length=80)
    name:str=Field(default='',max_length=64)
    instrument:str=Field(default='',max_length=180)
    destination:str=Field(default='',max_length=80)
    move:bool=False
    order:list[str]=Field(default_factory=list,max_length=100)
    confirm:bool=False
class Commit(CSVInput):
    revision:int=Field(ge=0)
    target:str|None=Field(default=None,max_length=80)
    name:str=Field(default='',max_length=64)
    mode:Literal['append','replace']='append'
    confirm_replace:bool=False
    skip_failed:bool=False
    preview_hash:str=Field(min_length=64,max_length=64)

def key(row):return row.get('canonical_id') or row.get('instrument_id') or row.get('symbol')
def protected(row):return row['id'] in SYSTEM_IDS or row.get('market') in SYSTEM_IDS
def validate_changes(old,new):
    old_lists=old.get('watchlists',[]);new_lists={w['id']:w for w in new.get('watchlists',[])}
    for w in old_lists:
        if protected(w) and (w['id'] not in new_lists or new_lists[w['id']]['name']!=w['name'] or new_lists[w['id']].get('market')!=w.get('market')):raise HTTPException(422,'Default market watchlists cannot be deleted or renamed')
    for w in new_lists.values():
        if w['id'] not in {r['id'] for r in old_lists} and protected(w):raise HTTPException(422,'Reserved watchlist identifier')

def persist(c,old,new):
    value=Workspace.model_validate(new).model_dump();validate_changes(old,value)
    changed=old.get('watchlists',[])!=value['watchlists']
    value['watchlist_revision']=old.get('watchlist_revision',0)+int(changed)
    c.execute('INSERT OR REPLACE INTO settings VALUES(?,?)',('workspace',json.dumps(value)))
    c.execute('INSERT OR REPLACE INTO watchlists VALUES(?,?)',('Favourites',json.dumps(value['watchlist'])))
    return value

def load(c,fallback):
    r=c.execute("SELECT value FROM settings WHERE key='workspace'").fetchone();return json.loads(r['value']) if r else fallback

class Watchlists:
    def __init__(self,db,registry,restore):self.db=db;self.registry=registry;self.restore=restore
    def catalogue(self):
        values={}
        for r in self.registry.indices()+self.registry.globals()+[self.registry.equity(r) for r in self.db.search('',20000)]:
            # Prefer the official NSE identity over duplicate discovery metadata.
            if r['canonical_id'] not in values or r['id'].startswith(('equity:','index:')):values[r['canonical_id']]=r
        return list(values.values())
    def preview(self,value):
        try:rows=list(csv.reader(io.StringIO(value.content.lstrip('\ufeff'),newline=''),strict=True))
        except (csv.Error,UnicodeError):raise HTTPException(422,'Malformed CSV quoting') from None
        if not rows or not rows[0]:raise HTTPException(422,'CSV is empty')
        if len(rows)>1001:raise HTTPException(422,'CSV supports at most 1,000 data rows')
        if any(len(r)>20 or any(len(v)>4000 for v in r) for r in rows):raise HTTPException(422,'CSV supports at most 20 columns and 4,000 characters per field')
        headers=rows[0];normalized=[re.sub(r'[\s-]+','_',v.strip().casefold()) for v in headers]
        mapping={}
        for field,variants in HEADERS.items():
            hits=[i for i,h in enumerate(normalized) if h in variants]
            if len(hits)==1:mapping[field]=hits[0]
        mapping.update(value.mapping)
        used=[i for i in mapping.values() if i is not None]
        if len(set(used))!=len(used) or any(i>=len(headers) for i in used):raise HTTPException(422,'Map each field to a distinct existing column')
        if mapping.get('symbol') is None:return dict(headers=headers,mapping=mapping,rows=[],needs_mapping=True,total=len(rows)-1,preview=rows[1:6])
        catalogue=self.catalogue();index={};result=[];seen=set()
        for r in catalogue:
            aliases={str(r.get(k,'')).upper() for k in ('symbol','base_symbol','yahoo_symbol','id','canonical_id','native_id')}
            ticker=r['yahoo_symbol'].upper();aliases.update(ticker[:-len(suffix)] for suffix in SUFFIX if ticker.endswith(suffix))
            for alias in aliases:index.setdefault(alias,[]).append(r)
        for number,raw in enumerate(rows[1:],2):
            fields={k:(raw[i].strip() if i is not None and i<len(raw) else '') for k,i in mapping.items()}
            symbol=fields.get('symbol','');out=dict(row=number,values=raw,symbol=symbol,status='failed',error='',candidates=[],identity=None)
            if len(raw)!=len(headers):out['error']='Column count differs from header'
            elif not symbol:out['error']='Symbol is empty'
            elif len(symbol)>180 or not re.fullmatch(r'[A-Za-z0-9.@&^=+_/%:\-]+',symbol):out['error']='Invalid symbol characters'
            else:
                exact=fields.get('canonical_id') or fields.get('instrument_id')
                exch=fields.get('exchange','').upper();exch=EXCHANGES.get(exch,{}).get('exchange',exch).upper()
                kind=fields.get('asset_type','').casefold();kind={'stock':'equity','stocks':'equity','cryptocurrency':'crypto','currency':'forex','futures':'future','mutualfund':'fund'}.get(kind,kind)
                matches=[]
                for r in index.get(symbol.upper(),[]):
                    if exact and exact not in (r['id'],r['canonical_id']):continue
                    if exch and r['exchange'].upper()!=exch:continue
                    if kind and r['kind']!=kind:continue
                    if fields.get('provider') and r['provider'].casefold()!=fields['provider'].casefold():continue
                    matches.append(r)
                chosen=value.resolutions.get(str(number))
                legacy_matches=[r for r in matches if r.get('provider','yahoo')=='yahoo' and r.get('kind')=='crypto']
                if legacy_matches:
                    # Candidate hints are metadata, never an automatic ticker conversion.
                    base=symbol.upper().split('-')[0]
                    alternatives=[r for r in catalogue if selectable(r) and r.get('provider')=='hyperliquid' and (r.get('base_asset','').upper() in (base,'U'+base) or r.get('native_id','').upper().split(':')[-1]==base)]
                    out['candidates']=[entry(r) for r in alternatives]
                    if chosen:
                        matches=[r for r in alternatives if r['canonical_id']==chosen]
                    else:
                        out['error']='Legacy crypto migration required. Yahoo crypto CSV identities are unsupported. Explicitly select a verified Hyperliquid spot or perpetual alternative; these markets are not equivalent.'
                        result.append(out);continue
                else:matches=[r for r in matches if selectable(r)]
                if chosen and chosen not in {r['canonical_id'] for r in matches}:out['error']='Selected identity no longer matches this row'
                elif not matches:out['error']='Unknown symbol or metadata mismatch; search and add it to the local directory first'
                elif len(matches)>1 and not chosen:out.update(status='ambiguous',error='Select the exchange/asset identity',candidates=[entry(r) for r in matches])
                else:
                    r=next((r for r in matches if r['canonical_id']==chosen),matches[0])
                    if r.get('legacy_unresolved'):
                        out['error']='Legacy crypto migration required; Hyperliquid metadata pending. Yahoo crypto CSV imports are disabled.';result.append(out);continue
                    MarketDataRouter.validate(r)
                    out['identity']=entry(r)
                    if r['canonical_id'] in seen:out.update(status='duplicate',error='Duplicate identity in CSV')
                    else:out['status']='valid';seen.add(r['canonical_id'])
            result.append(out)
        fingerprint=hashlib.sha256(json.dumps([(r['row'],r['status'],r['identity'],r['candidates']) for r in result],sort_keys=True).encode()).hexdigest()
        return dict(headers=headers,mapping=mapping,rows=result,needs_mapping=False,total=len(result),preview=rows[1:6],preview_hash=fingerprint,counts={s:sum(r['status']==s for r in result) for s in ('valid','duplicate','failed','ambiguous')})
    def transact(self,revision,fn):
        fallback=self.restore()
        with self.db.connect() as c:
            c.execute('BEGIN IMMEDIATE');old=load(c,fallback)
            if revision!=old.get('watchlist_revision',0):raise HTTPException(409,'Watchlists changed. Reload and review the operation again.')
            value=json.loads(json.dumps(old));summary=fn(value);new=persist(c,old,value)
        return dict(watchlists=new['watchlists'],active_watchlist=new['active_watchlist'],watchlist_revision=new['watchlist_revision'],summary=summary)
    def mutate(self,op):
        def apply(w):
            lists=w['watchlists'];current=next((r for r in lists if r['id']==op.id),None)
            if op.action not in ('create',) and current is None:raise HTTPException(404,'Watchlist no longer exists')
            if op.action in ('create','rename','duplicate'):
                name=op.name.strip()
                if not name or any(ord(c)<32 for c in name):raise HTTPException(422,'Enter a watchlist name of 1–64 characters without control characters')
                if op.action=='rename':
                    if protected(current):raise HTTPException(422,'Default watchlists cannot be renamed')
                    current['name']=name
                else:
                    if len(lists)>=40:raise HTTPException(422,'Maximum 40 watchlists')
                    id=uuid.uuid4().hex;lists.append(dict(id=id,name=name,items=current['items'].copy() if op.action=='duplicate' else []));w['active_watchlist']=id
            elif op.action=='delete':
                if protected(current):raise HTTPException(422,'Default watchlists cannot be deleted')
                if not op.confirm:raise HTTPException(422,'Confirm deletion of the watchlist and its item memberships')
                lists.remove(current)
                if w['active_watchlist']==current['id']:w['active_watchlist']=next((r['id'] for r in lists if r['id']=='stocks'),lists[0]['id'])
            elif op.action=='reorder':
                items={key(r):r for r in current['items']}
                if len(op.order)!=len(items) or set(op.order)!=set(items):raise HTTPException(422,'Provide every current instrument exactly once')
                current['items']=[items[k] for k in op.order]
            elif op.action=='remove':current['items']=[r for r in current['items'] if key(r)!=op.instrument]
            elif op.action in ('add','transfer'):
                source=next((r for r in current['items'] if key(r)==op.instrument),None)
                security=self.registry.resolve(op.instrument)
                if not security or security['canonical_id']!=op.instrument:raise HTTPException(422,'Search and select a valid canonical instrument')
                if op.action=='add' and not selectable(security):raise HTTPException(422,'Legacy crypto migration required or market unavailable. Select a verified available market; saved rows are retained.')
                dest=current if op.action=='add' else next((r for r in lists if r['id']==op.destination),None)
                if not dest:raise HTTPException(404,'Destination watchlist no longer exists')
                if op.action=='transfer' and not source:raise HTTPException(422,'Instrument is no longer in the source list')
                if not any(key(r)==op.instrument for r in dest['items']):
                    if len(dest['items'])>=100:raise HTTPException(422,'Maximum 100 items per watchlist')
                    dest['items'].append(entry(security))
                if op.move and dest is not current:current['items']=[r for r in current['items'] if key(r)!=op.instrument]
            return {'action':op.action}
        return self.transact(op.revision,apply)
    def commit(self,op):
        preview=self.preview(op)
        if preview.get('needs_mapping') or preview['preview_hash']!=op.preview_hash:raise HTTPException(409,'CSV resolution changed. Preview the import again.')
        failed=preview['counts']['failed']+preview['counts']['ambiguous']
        if failed and not op.skip_failed:raise HTTPException(422,'Resolve all failed/ambiguous rows or explicitly choose to skip them')
        incoming=[r['identity'] for r in preview['rows'] if r['status']=='valid']
        if not incoming:raise HTTPException(422,'No valid instruments to import; the existing list was not changed')
        def apply(w):
            current=next((r for r in w['watchlists'] if r['id']==op.target),None)
            if op.target and not current:raise HTTPException(404,'Target watchlist no longer exists')
            if current is None:
                name=op.name.strip()
                if not name or any(ord(c)<32 for c in name):raise HTTPException(422,'Enter a valid new watchlist name')
                if len(w['watchlists'])>=40:raise HTTPException(422,'Maximum 40 watchlists')
                current=dict(id=uuid.uuid4().hex,name=name,items=[]);w['watchlists'].append(current)
            if op.mode=='replace' and op.target and not op.confirm_replace:raise HTTPException(422,'Confirm replacement before removing existing memberships')
            items=current['items'].copy() if op.mode=='append' else [];seen={key(r) for r in items};duplicates=preview['counts']['duplicate'];imported=0
            for row in incoming:
                if key(row) in seen:duplicates+=1;continue
                items.append(row);seen.add(key(row));imported+=1
            if len(items)>100:raise HTTPException(422,'Import would exceed 100 items; no changes were saved')
            current['items']=items;w['active_watchlist']=current['id']
            return dict(imported=imported,duplicates=duplicates,failed=failed,skipped=failed+duplicates,total=preview['total'])
        return self.transact(op.revision,apply)

def routes(service):
    router=APIRouter()
    @router.post('/api/watchlists/mutate')
    async def mutate(op:Mutation):
        if op.action=='add' and op.instrument.startswith('hyperliquid:') and getattr(service.registry,'hyperliquid',None):
            await service.registry.hyperliquid.ensure()
            security=service.registry.resolve(op.instrument)
            if not security:raise HTTPException(422,'Select a verified crypto market')
            await service.registry.hyperliquid.validate(security)
        return service.mutate(op)
    async def prepare_csv(op):
        preview=service.preview(op)
        catalogue=getattr(service.registry,'hyperliquid',None)
        # Known non-crypto CSV rows need no crypto API at all. Unknown or
        # ambiguous rows may need catalogue verification, without making a
        # crypto outage prevent otherwise valid Yahoo rows from importing.
        if catalogue and any(r['status'] not in ('valid','duplicate') for r in preview.get('rows',[])):
            try:await catalogue.ensure()
            except ProviderError as e:
                preview['warning']='Crypto metadata unavailable: '+str(e)
                for row in preview.get('rows',[]):
                    if row['status']=='failed' and row['error'].startswith('Unknown symbol'):
                        row['error']='No verified identity is available; crypto metadata revalidation failed. '+str(e)
                return preview
            return service.preview(op)
        return preview
    @router.post('/api/watchlists/import/preview')
    async def preview(op:CSVInput):return await prepare_csv(op)
    @router.post('/api/watchlists/import/commit')
    async def commit(op:Commit):
        await prepare_csv(op)
        return service.commit(op)
    return router
