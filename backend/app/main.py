from .profile_security import secure_profile
from .profile_paths import default_profile
import asyncio
import base64
import hmac
import os
import sys
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, Field
from .refresh import WatchlistRefresh, routes as refresh_routes
from .crypto_migration import MigrationService,routes as migration_routes
from .screener import Screener,routes as screener_routes
from .alerts import AlertEngine,routes as alert_routes
from .watchlists import Watchlists,routes as watchlist_routes,persist as persist_workspace,load as load_workspace
from .database import Database
from .instruments import bootstrap, refresh, refresh_startup, install_files
from .models import Workspace, Timeframe, CacheConfig, IndicatorRequest
from .registry import InstrumentRegistry
from .markets import MARKETS,entry
from .discovery import DiscoveryService
from .indicators import IndicatorCalculator
from .history import HistoryService
from .providers.base import ProviderError

DEFAULTS=['RELIANCE-EQ','TCS-EQ','INFY-EQ','HDFCBANK-EQ','ICICIBANK-EQ','SBIN-EQ','ITC-EQ','TMPV-EQ']

def default_workspace(db):
    fallback=db.search('',8)
    rows=[db.resolve(s) or (fallback[i%len(fallback)] if fallback else {'symbol':s,'token':'0'}) for i,s in enumerate(DEFAULTS)]
    return dict(layout=2,panes=[dict(id=str(i),symbol=r['symbol'],token=r['token'],timeframe='1d',chart_type='candles',indicators=['EMA20'],volume=True) for i,r in enumerate(rows)],watchlist=[dict(symbol=r['symbol'],token=r['token']) for r in rows])

def restore_workspace(db,registry=None):
    saved=db.get('workspace') or default_workspace(db)
    if not saved.get('watchlists'):
        indices=registry.indices() if registry else []
        saved['watchlists']=[dict(id='indices',name='Indian Indices',items=[entry(r) for r in indices]),dict(id='stocks',name='Indian Stocks',items=default_workspace(db)['watchlist']),dict(id='favourites',name='My Favourites',items=saved.get('watchlist',[]))]
        saved['active_watchlist']='stocks'
    # Append missing market lists, preserving all existing names, IDs and selections.
    if registry:
        for key,name in MARKETS:
            if any(w['id']==key or w.get('market')==key for w in saved['watchlists']):continue
            if len(saved['watchlists'])>=40:break
            from .market_router import selectable
            rows=[r for r in registry.globals() if r['category']==key and selectable(r)][:100] # Watchlist capacity; discovery still exposes the full catalogue.
            saved['watchlists'].append(dict(id=key,name=name,market=key,items=[entry(r) for r in rows]))
        for w in saved['watchlists']:
            if w['id'] in dict(MARKETS):w.setdefault('market',w['id'] if w['id']!='favourites' else None)
    all_rows=saved['panes']+saved.get('watchlist',[])+[r for w in saved['watchlists'] for r in w['items']]
    for row in all_rows:
        security=(registry.resolve(row.get('instrument_id') or row['symbol']) or registry.resolve(row['token'])) if registry else db.resolve(row['symbol']) or db.instrument(row['token'])
        if security:
            if not registry:security=InstrumentRegistry.equity(None,security)
            original=row['symbol']
            original_mapping=row.get('native_mapping')
            row.update(entry(security))
            if original_mapping and security.get('provider')=='hyperliquid':row['native_mapping']=original_mapping
            row['symbol']=security['symbol'] if security['id'].startswith('equity:') and not db.resolve(original.removesuffix('.NS')) else original # Preserve saved symbols unless the official directory records a rename.
        else:row['token']='0'
        if 'timeframe' in row and row['timeframe'] not in ('1m','5m','15m','30m','1h','4h','1d','1w','1M'):row['timeframe']='1d'
    result=Workspace.model_validate(saved).model_dump()
    for pane in result['panes']:
        for drawings in pane['drawing_sets'].values():
            for drawing in drawings:
                drawing['params']={k:v for k,v in drawing['params'].items() if v is not None}
                if 'levels' in drawing['params']:drawing['params']['levels']=[{k:v for k,v in level.items() if v is not None} for level in drawing['params']['levels']]
    return result

class FileData(BaseModel):
    name: str = Field(max_length=200)
    content: str = Field(max_length=86_000_000)
class ImportFiles(BaseModel):
    symbol: str | None = Field(default=None,max_length=60)
    files: list[FileData] = Field(min_length=1,max_length=40)

def decode_files(value):
    total=0;result=[]
    for file in value.files:
        try: content=base64.b64decode(file.content,validate=True)
        except ValueError: raise HTTPException(422,'Invalid file encoding') from None
        total+=len(content)
        if total>64_000_000: raise HTTPException(413,'Select up to 64 MB of official files at a time')
        result.append((file.name,content))
    return result

def create_app(data_dir=None,token=None,provider=None,hyperliquid_client=None,stream_connector=None):
    token=token or os.environ.get('IMT_TOKEN')
    if not token or len(token)<32: raise RuntimeError('A random local authentication token is required')
    directory=Path(data_dir or os.environ.get('IMT_DATA_DIR') or default_profile())
    secure_profile(directory)
    db=Database(directory/'terminal.sqlite3')
    resources=Path(getattr(sys,'_MEIPASS',Path(__file__).parent.parent))/'resources'
    bootstrap(db,resources)
    registry=InstrumentRegistry(db,resources)
    service=HistoryService(provider,db.get('history_preferences'))
    service.registry=registry
    if provider is None or hyperliquid_client is not None:
        from .providers.hyperliquid import HyperliquidClient,HyperliquidCatalogue,HyperliquidHistoricalProvider
        client=hyperliquid_client or HyperliquidClient(service.budget)
        catalogue=HyperliquidCatalogue(db,client)
        registry.hyperliquid=catalogue
        service.hyperliquid=HyperliquidHistoricalProvider(catalogue,client)
        service.router.hyperliquid=service.hyperliquid
    from .hyperliquid_stream import HyperliquidStreamManager,routes as stream_routes
    streams=HyperliquidStreamManager(service,registry,connector=stream_connector,enabled=provider is None or stream_connector is not None)
    service.streams=streams
    discovery=DiscoveryService(registry,service)
    screener=Screener(db,registry,service)
    alerts=AlertEngine(db,registry,service)
    quotes=WatchlistRefresh(db,registry,service,lambda:restore_workspace(db,registry))
    directory_lock=asyncio.Lock()
    @asynccontextmanager
    async def lifespan(app):
        task=asyncio.create_task(refresh_startup(db))
        alerts.start()
        try: yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError): await task
            await alerts.close()
            await streams.close()
            await quotes.close()
            await screener.close()
            await discovery.close()
            await service.close()
    app=FastAPI(title='GLOBAL MARKET TERMINAL local service',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    app.include_router(stream_routes(streams));app.state.streams=streams
    app.include_router(screener_routes(screener));app.state.screener=screener
    app.include_router(alert_routes(alerts));app.state.alerts=alerts
    app.include_router(watchlist_routes(Watchlists(db,registry,lambda:restore_workspace(db,registry))))
    app.include_router(refresh_routes(quotes));app.state.quotes=quotes
    migration=MigrationService(db,registry,service);app.include_router(migration_routes(migration));app.state.migration=migration
    app.state.db=db;app.state.history=service;app.state.registry=registry;app.state.discovery=discovery
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=['127.0.0.1','localhost','testserver'])
    @app.middleware('http')
    async def authorize(request:Request,call_next):
        if not hmac.compare_digest(request.headers.get('authorization',''),'Bearer '+token):
            return JSONResponse({'detail':'Local authentication required'},status_code=401)
        try: size=int(request.headers.get('content-length','0'))
        except ValueError: return JSONResponse({'detail':'Invalid content length'},status_code=400)
        if size>90_000_000: return JSONResponse({'detail':'Import is too large'},status_code=413)
        return await call_next(request)
    @app.exception_handler(ProviderError)
    async def provider_failure(request,error):
        code={'missing':404,'manual':409,'access':403,'range':422,'file':422,'busy':409,'rate':429,'pending':409,'policy':422}.get(error.kind,502)
        return JSONResponse({'detail':str(error),**error.structured()},status_code=code,
            headers={'Retry-After':str(error.retry_after)} if error.kind=='rate' else None)
    @app.get('/health')
    def health():
        return dict(status='ok',mode='DIRECT',database='preferences only',instruments=db.count(),
            catalogue=db.get('catalogue',dict(source='Official NSE directory pending',updated=0,count=0,mainboard=0,sme=0)),
            catalogue_error=db.get('catalogue_error'),directory_loading=db.get('directory_loading',False),
            timezone='Asia/Kolkata',market_status='HISTORICAL',version='1.0.0',provider=service.status())
    @app.get('/api/securities/search')
    @app.get('/instruments')
    def securities(q:str='',limit:int=60): return db.search(q,max(1,min(limit,200)))
    @app.get('/api/instruments/search')
    def search_instruments(q:str='',limit:int=60): return registry.search(q,max(1,min(limit,200)))
    @app.get('/api/instruments/discover')
    async def discover_instruments(q:str='',category:str='',exchange:str='',country:str='',limit:int=60,offset:int=0):
        return await discovery.search(q,category,exchange,country,max(1,min(limit,200)),max(0,min(offset,40000)))
    @app.get('/api/hyperliquid/catalogue')
    async def hyperliquid_catalogue(refresh:bool=False):
        catalogue=getattr(registry,'hyperliquid',None)
        if not catalogue:raise ProviderError('Hyperliquid metadata is unavailable in this offline profile.','pending')
        await catalogue.ensure(force=refresh)
        return catalogue.status()
    @app.get('/api/markets')
    def markets():return [dict(id=k,name=n) for k,n in MARKETS]
    @app.get('/api/indices')
    def indices(): return registry.indices()
    @app.post('/api/indicators/calculate')
    async def indicators(value:IndicatorRequest):
        return await asyncio.to_thread(IndicatorCalculator.calculate,[r.model_dump() for r in value.candles],[r.model_dump() for r in value.indicators],value.interval,value.timezone,dict(volume_unit=value.volume_unit,zero_volume_is_missing=value.zero_volume_is_missing),value.reference_context)
    @app.get('/api/studies/context')
    async def study_context(request:Request,symbol:str,interval:Timeframe='1d',periods:str='1d',benchmark:str='',adjusted:bool=False,sessions:bool=True):
        from .reference_context import build_context
        if len(symbol)>300 or len(benchmark)>300 or len(periods)>20:raise HTTPException(422,'Reference request exceeds limits.')
        if benchmark=='yahoo:%5EINDIAVIX:NSE:index' and not registry.resolve(benchmark):await discovery.search('India VIX',category='indices')
        if set(periods.split(',') if periods else [])-{'1d','1w','1M'}:raise HTTPException(422,'Use daily, weekly or monthly reference periods.')
        task=asyncio.create_task(build_context(service,registry,symbol,interval,periods.split(',') if periods else [],benchmark,adjusted,sessions))
        try:
            while not task.done():
                if await request.is_disconnected():task.cancel();raise HTTPException(499,'Outdated reference request cancelled')
                await asyncio.wait({task},timeout=.1)
            return await task
        finally:
            if not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError):await task
    @app.post('/api/securities/refresh')
    async def refresh_directory():
        if directory_lock.locked() or time.time()-db.get('refresh_attempt',0)<60:
            raise HTTPException(429,'Wait a minute before refreshing the NSE directory again.')
        db.put('refresh_attempt',time.time())
        async with directory_lock:
            db.put('directory_loading',True)
            try: result=await asyncio.to_thread(refresh,db)
            except Exception:
                db.put('catalogue_error','NSE directory download unavailable. Cached directory retained. Import both official CSV files in Settings.')
                raise HTTPException(503,db.get('catalogue_error')) from None
            finally: db.put('directory_loading',False)
        return result
    @app.post('/api/securities/import')
    async def import_directory(value:ImportFiles):
        files=decode_files(value)
        mapped={}
        for name,content in files:
            board='SME' if name.upper()=='SME_EQUITY_L.CSV' else 'MAINBOARD' if name.upper()=='EQUITY_L.CSV' else None
            if board is None: raise HTTPException(422,'Select official EQUITY_L.csv and SME_EQUITY_L.csv with their original filenames.')
            if board in mapped: raise HTTPException(422,'Select one mainboard and one SME directory file.')
            mapped[board]=content
        async with directory_lock:
            try: return await asyncio.to_thread(install_files,db,mapped)
            except (ValueError,UnicodeError) as e: raise HTTPException(422,str(e)) from None
    @app.get('/workspace')
    def workspace(): return restore_workspace(db,registry)
    @app.put('/workspace')
    def save_workspace(value:Workspace):
        for row in [p.model_dump() for p in value.panes]+[r.model_dump() for r in value.watchlist]+[r.model_dump() for w in value.watchlists for r in w.items]:
            security=registry.resolve(row.get('instrument_id') or row['token'])
            if row['token']=='0': continue # Preserve unavailable old selections, visibly unavailable in chart.
            if security:
                from .market_router import MarketDataRouter
                MarketDataRouter.validate(row,allow_legacy=True)
                if row.get('provider')!=security['provider'] or row.get('canonical_id') and row['canonical_id']!=security['canonical_id']:raise HTTPException(422,'Canonical provider identity cannot be changed by a preference save.')
            if not security or row['symbol'] not in (security['symbol'],security['yahoo_symbol'],security['base_symbol']) or security['token']!=row['token'] or security['kind']!=row['kind']: raise HTTPException(422,'Instrument metadata changed. Search and select the instrument again.')
        fallback=restore_workspace(db,registry)
        with db.connect() as c:
            c.execute('BEGIN IMMEDIATE');old=load_workspace(c,fallback)
            if value.watchlist_revision!=old.get('watchlist_revision',0):raise HTTPException(409,'Watchlists changed. Reload the workspace before saving.')
            saved=persist_workspace(c,old,value.model_dump())
        return {'saved':True,'watchlist_revision':saved['watchlist_revision']}
    @app.get('/api/provider/status')
    @app.get('/api/history/status')
    def status(): return service.status()
    @app.get('/api/history')
    async def history(request:Request,symbol:str,interval:Timeframe='1d',period:Literal['max']='max',start:str|None=None,end:str|None=None,
                      source:Literal['yahoo','nse','hyperliquid']='yahoo',refresh:bool=False,adjusted:bool=False,native_mapping:str='',priority:int=0):
        if priority not in (0,1):raise HTTPException(422,'Chart priority must be 0 or 1.')
        service.metrics['history_requests']+=1
        if symbol.startswith('hyperliquid:') and getattr(registry,'hyperliquid',None):await registry.hyperliquid.ensure()
        security=registry.resolve(symbol)
        if security and native_mapping and security.get('provider')=='hyperliquid':
            security={**security,'native_mapping':native_mapping}
        if not security: raise HTTPException(404,'Instrument unavailable. Search and select a current instrument; refresh the NSE directory if needed.')
        # Date validation is performed before creating any provider work.
        from datetime import datetime
        try:
            for d in (start,end):
                if d: datetime.strptime(d,'%Y-%m-%d')
        except ValueError: raise HTTPException(422,'Use dates in YYYY-MM-DD format.') from None
        work=asyncio.create_task(service.get(security,interval,start,end,source,refresh,adjusted,priority=priority))
        try:
            while not work.done():
                if await request.is_disconnected():
                    work.cancel()
                    raise HTTPException(499,'Outdated chart request cancelled')
                await asyncio.wait({work},timeout=0.1)
            return await work
        finally:
            if not work.done():
                work.cancel()
                with suppress(asyncio.CancelledError): await work
    @app.get('/api/history/refresh')
    async def incremental_history(request:Request,symbol:str,interval:Timeframe='1d',start:str|None=None,end:str|None=None,adjusted:bool=False,automatic:bool=False,native_mapping:str=''):
        if symbol.startswith('hyperliquid:') and getattr(registry,'hyperliquid',None):await registry.hyperliquid.ensure()
        security=registry.resolve(symbol)
        if security and native_mapping and security.get('provider')=='hyperliquid':
            security={**security,'native_mapping':native_mapping}
        if not security:raise HTTPException(404,'Instrument identity is unavailable.')
        try:
            from datetime import datetime
            for value in (start,end):
                if value:datetime.strptime(value,'%Y-%m-%d')
            if start and end and start>end:raise ValueError()
        except ValueError:raise HTTPException(422,'Use an ordered date range in YYYY-MM-DD format.') from None
        service.metrics['history_requests']+=1
        work=asyncio.create_task(service.incremental(security,interval,start,end,adjusted,automatic))
        try:
            while not work.done():
                if await request.is_disconnected():
                    work.cancel();raise HTTPException(499,'Outdated chart refresh cancelled.')
                await asyncio.wait({work},timeout=0.1)
            return await work
        finally:
            if not work.done():
                work.cancel()
                with suppress(asyncio.CancelledError):await work
    @app.post('/api/nse/import')
    async def import_archive(value:ImportFiles):
        security=registry.resolve(value.symbol or '')
        if security and (security['kind']!='equity' or security['exchange']!='NSE'): raise HTTPException(422,'NSE equity bhavcopies do not contain index history.')
        if not security: raise HTTPException(404,'Select a current NSE equity before importing history.')
        return await service.import_nse(security,decode_files(value))
    @app.post('/api/cache/clear')
    def clear():
        service.clear()
        return {'cleared':True,'storage':'memory only'}
    @app.put('/api/history/preferences')
    def configure(value:CacheConfig):
        service.configure(value.model_dump());db.put('history_preferences',value.model_dump())
        return service.status()
    return app
