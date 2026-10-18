"""Application-scoped, bounded, ephemeral jobs using the existing history single-flight service."""
import asyncio,time,uuid
from collections import OrderedDict
from fastapi import APIRouter,HTTPException
from .screener_conditions import CATALOG,ScreenConfig,Presets,evaluate
from .providers.base import ProviderError
from .markets import entry

class Screener:
    def __init__(self,db,registry,history):self.db=db;self.registry=registry;self.history=history;self.jobs=OrderedDict();self.tasks={}
    def universes(self):
        rows=self.registry.search('',20000);official=[self.registry.equity(r) for r in self.db.search('',20000)];definitions=[('nse_mainboard','NSE Mainboard',lambda r:r.get('exchange')=='NSE' and r.get('board')=='MAINBOARD',True),('nse_sme','NSE SME',lambda r:r.get('board')=='SME',True),('bse','BSE Equities',lambda r:r['exchange']=='BSE' and r['kind']=='equity',False)]
        definitions += [(k,label,lambda r,k=k:r.get('category')==k,False) for k,label in [('us','US Stocks'),('global','International Stocks'),('indices','Indian Indices'),('global_indices','Global Indices'),('crypto','Crypto'),('forex','Forex'),('commodities','Commodities'),('funds','ETFs & Funds')]]
        result=[]
        for id,label,test,complete in definitions:
            matches=[r for r in (official if complete else rows) if test(r)];result.append(dict(id=id,name=label,count=len(matches),complete=complete,scope='Complete cached official NSE trading directory; listing status follows its update timestamp.' if complete else 'Provider-limited known instruments, discovery hints and cached metadata; not a complete global directory.',directory=self.db.get('catalogue',{}),symbols=matches))
        return result
    def selection(self,config):
        if config.mode=='symbols':
            rows=[]
            for value in config.symbols:
                r=self.registry.resolve(value)
                if not r:raise HTTPException(422,'Unknown instrument identity; discover/select it before scanning: '+value[:60])
                rows.append(r)
        elif config.mode=='watchlist':
            watch=next((w for w in self.db.get('workspace',{}).get('watchlists',[]) if w['id']==config.watchlist),None)
            if watch is None:
                from .main import restore_workspace
                watch=next((w for w in restore_workspace(self.db,self.registry)['watchlists'] if w['id']==config.watchlist),None)
            if not watch:raise HTTPException(422,'Unknown watchlist')
            rows=[self.registry.resolve(r.get('canonical_id') or r.get('instrument_id') or r['symbol']) for r in watch['items']]
            if any(r is None for r in rows):raise HTTPException(422,'Some watchlist instruments no longer resolve; update their identities before scanning')
        else:
            universe=next((u for u in self.universes() if u['id']==config.universe),None)
            if not universe:raise HTTPException(422,'Unknown market universe')
            rows=universe['symbols']
        unique={r['canonical_id']:r for r in rows};return list(unique.values())
    def submit(self,config):
        if self.tasks:raise HTTPException(409,'One scan can run at a time. Cancel or finish it before starting another.')
        rows=self.selection(config);chosen=rows[config.offset:config.offset+config.batch_size]
        if not chosen:raise HTTPException(422,'The selected batch has no instruments')
        while len(self.jobs)>=5:self.jobs.popitem(last=False)
        id=uuid.uuid4().hex;job=dict(id=id,state='running',config=config.model_dump(),universe_total=len(rows),batch_total=len(chosen),offset=config.offset,next_offset=config.offset+len(chosen),results=[],created_at=time.time(),finished_at=None,cancelled=False,warning='',stop=asyncio.Event())
        self.jobs[id]=job;task=asyncio.create_task(self.run(job,chosen,config));self.tasks[id]=task;task.add_done_callback(lambda t:self.tasks.pop(id,None));return self.status(job)
    async def run(self,job,rows,config):
        queue=iter(rows)
        async def worker():
            for security in queue:
                if job['cancelled']:return
                base={**entry(security),'timeframe':config.interval,'market':security.get('category'),'precision':security.get('precision',2)}
                for attempt in range(3):
                    try:
                        if time.time()-job['created_at']>1800:job['cancelled']=True;job['warning']='Thirty-minute scan limit reached; partial results retained.';return
                        history=await asyncio.wait_for(self.history.get(security,config.interval,adjusted=config.adjusted,priority=2),timeout=min(180,max(1,1800-(time.time()-job['created_at']))))
                        from .live_analysis import context,safe_history
                        streams=getattr(self.history,'streams',None);info=context(history,security,config.interval,streams)
                        history=safe_history(history,security,config.interval,streams,config.completed)
                        value=await asyncio.to_thread(evaluate,history,security,config,job['created_at'] if config.completed else time.time())
                        job['results'].append({**base,**value,**info});break
                    except ProviderError as e:
                        if e.kind=='rate' and attempt<2 and not job['cancelled']:
                            job['state']='cooldown';job['warning']=str(e)
                            try:await asyncio.wait_for(job['stop'].wait(),timeout=min(max(1,e.retry_after),max(1,1800-(time.time()-job['created_at']))))
                            except asyncio.TimeoutError:pass
                            if job['cancelled']:return
                            job['state']='running';continue
                        job['results'].append({**base,'status':'missing' if e.kind in ('missing','manual') else 'failed','error':str(e),'error_kind':e.kind});break
                    except asyncio.CancelledError:raise
                    except Exception:
                        job['results'].append({**base,'status':'failed','error':'The provider or calculation could not complete this symbol. Retry a smaller batch.','error_kind':'calculation'});break
        workers=[asyncio.create_task(worker()) for _ in range(min(2,len(rows)))]
        try:await asyncio.gather(*workers)
        except asyncio.CancelledError:
            for t in workers:t.cancel()
            await asyncio.gather(*workers,return_exceptions=True)
        finally:job['state']='cancelled' if job['cancelled'] else 'completed';job['finished_at']=time.time()
    def status(self,job):
        result={k:v for k,v in job.items() if k not in ('stop','results')};counts={k:sum(r['status']==k for r in job['results']) for k in ('matched','no_match','unknown','missing','failed')};pending=job['batch_total']-len(job['results'])
        return {**result,'counts':{**counts,'successful':counts['matched']+counts['no_match']+counts['unknown'],'processed':len(job['results']),'pending':0 if job['cancelled'] else pending,'cancelled':pending if job['cancelled'] else 0},'cooldown_seconds':self.history.status()['cooldown_seconds'],'storage':'memory only'}
    def cancel(self,id):
        job=self.get(id)
        if id in self.tasks:job['cancelled']=True;job['state']='cancelled';job['finished_at']=time.time();job['stop'].set();self.tasks[id].cancel()
        return self.status(job)
    def get(self,id):
        job=self.jobs.get(id)
        if not job:raise HTTPException(404,'This local job expired or belongs to another application session')
        return job
    async def close(self):
        for id in list(self.tasks):self.cancel(id)
        await asyncio.gather(*list(self.tasks.values()),return_exceptions=True);self.jobs.clear()

def routes(engine):
    router=APIRouter(prefix='/api/screener')
    @router.get('/universes')
    def universes():return engine.universes()
    @router.get('/conditions')
    def conditions():return list(CATALOG.values())
    @router.post('/jobs')
    async def jobs(value:ScreenConfig):return engine.submit(value)
    @router.get('/jobs/{id}')
    def status(id:str):return engine.status(engine.get(id))
    @router.post('/jobs/{id}/cancel')
    async def cancel(id:str):return engine.cancel(id)
    @router.get('/jobs/{id}/results')
    def results(id:str):return {'job':engine.status(engine.get(id)),'results':engine.get(id)['results']}
    @router.get('/presets')
    def presets():
        raw=engine.db.get('screener_presets',{'version':1,'presets':[]})
        if isinstance(raw,list):raw={'version':1,'presets':raw}
        try:return Presets.model_validate(raw).model_dump()
        except ValueError:raise HTTPException(409,'Saved screener configuration needs migration; it has been preserved unchanged.')
    @router.put('/presets')
    def save(value:Presets):
        old=engine.db.get('screener_presets')
        if isinstance(old,dict) and old.get('version',1)!=1:raise HTTPException(409,'A newer preset format is preserved; it cannot be overwritten by this version.')
        engine.db.put('screener_presets',value.model_dump());return {'saved':True}
    return router
