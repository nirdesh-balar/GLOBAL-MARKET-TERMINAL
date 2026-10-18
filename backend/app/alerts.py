"""Local analysis alerts: Yahoo polling and shared public crypto; no historical catch-up or OS agent."""
import asyncio,time
from datetime import datetime,timedelta,time as daytime,timezone
from zoneinfo import ZoneInfo
from typing import Literal
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,Field,ConfigDict
from .alert_models import AlertDefinition,AlertSettings,quiet_now
from .alert_store import AlertStore
from .screener_conditions import ScreenConfig,evaluate,completed_rows
from .providers.base import ProviderError
from .markets import entry
UTC=timezone.utc
CROSS_KINDS={'price_cross_up','price_cross_down','rsi_cross_up','rsi_cross_down','ema_cross_up','ema_cross_down','sma_cross_up','sma_cross_down','macd_cross_up','macd_cross_down','bb_middle_cross_up','bb_middle_cross_down','supertrend_change','stoch_cross_up','stoch_cross_down','price_cross_ema_up','price_cross_ema_down','price_cross_sma_up','price_cross_sma_down'}
SECONDS={'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400}

def candle_end(stamp,security,interval):
    """Mirror shared completion boundaries for the latest eligible bar, in financial time."""
    if security.get('provider')=='hyperliquid':
        from .providers.hyperliquid import INTERVALS
        return stamp+INTERVALS[interval]
    zone=ZoneInfo(security.get('timezone') or 'UTC');day=datetime.fromtimestamp(stamp,UTC if interval not in SECONDS else zone).date()
    nextday=day+timedelta(days=1)
    boundary=nextday if interval=='1d' else day-timedelta(days=day.weekday())+timedelta(days=7) if interval=='1w' else (day.replace(day=28)+timedelta(days=4)).replace(day=1)
    close=None
    if security.get('calendar'):
        try:
            import exchange_calendars as xc
            cal=xc.get_calendar(security['calendar'],start=str(day-timedelta(days=7)),end=str(boundary+timedelta(days=7)))
            if interval in SECONDS or interval=='1d':close=int(cal.schedule.loc[str(day)]['close'].timestamp()) if str(day) in cal.schedule.index.astype(str).str[:10] else None
            else:close=max([int(r['close'].timestamp()) for d,r in cal.schedule.iterrows() if day<=d.date()<boundary],default=None)
        except (ValueError,KeyError,RuntimeError):pass
    if security.get('exchange') in ('NSE','BSE') and interval in (*SECONDS,'1d'):close=int(datetime.combine(day,daytime(15,30),zone).timestamp())
    if interval in SECONDS:return min(stamp+SECONDS[interval],close) if close and stamp<close else stamp+SECONDS[interval]
    return close or int(datetime.combine(boundary,daytime(),UTC if security.get('kind')=='crypto' else zone).timestamp())

def market_open(security,now):
    if security.get('kind')=='crypto':return True
    zone=ZoneInfo(security.get('timezone') or 'UTC');local=datetime.fromtimestamp(now,zone)
    if security.get('calendar'):
        try:
            import exchange_calendars as xc
            cal=xc.get_calendar(security['calendar']);day=local.date().isoformat()
            r=cal.schedule.loc[day];return r['open'].timestamp()<=now<r['close'].timestamp()
        except (ValueError,KeyError,RuntimeError):return False
    if security.get('exchange') in ('NSE','BSE'):return local.weekday()<5 and daytime(9,15)<=local.time().replace(tzinfo=None)<daytime(15,30)
    return local.weekday()<5 # Unknown FX/futures calendars cannot guarantee exact session bounds.

def data_behind(stamp,security,interval,now,poll):
    end=candle_end(stamp,security,interval);grace=max(120,poll*2)
    if interval in ('1w','1M'):return now-end>(14 if interval=='1w' else 62)*86400
    if security.get('kind')=='crypto':
        size=SECONDS.get(interval,86400);expected=int(now//size)*size
        return end<expected and now-expected>grace
    if security.get('calendar'):
        try:
            import exchange_calendars as xc
            zone=ZoneInfo(security.get('timezone') or 'UTC');day=datetime.fromtimestamp(now,zone).date()
            cal=xc.get_calendar(security['calendar'],start=str(day-timedelta(days=21)),end=str(day+timedelta(days=2)))
            expected=0
            for _,r in cal.schedule.iterrows():
                opening,closing=r['open'].timestamp(),r['close'].timestamp()
                if closing<=now:expected=max(expected,int(closing))
                elif interval in SECONDS and opening<=now:
                    expected=max(expected,int(opening+int((now-opening)//SECONDS[interval])*SECONDS[interval]))
            return expected>0 and end<expected and now-expected>grace
        except (ValueError,KeyError,RuntimeError):pass
    if interval=='1d':return now-end>7*86400 # Unverified holiday calendars: report age conservatively.
    return now-end>max(grace,SECONDS.get(interval,0)*2) and market_open(security,now)

class AlertEngine:
    def __init__(self,db,registry,history,clock=time.time):
        self.store=AlertStore(db);self.registry=registry;self.history=history;self.clock=clock;self.started=clock();self.primed=set();self.next_due={};self.task=None;self.closed=False;self.lock=asyncio.Lock();self.wake=asyncio.Event();self.last_round=None;self.running=0
        self.store.retire_pending()
        from .live_alerts import LiveAlerts
        self.live=LiveAlerts(self)
    def start(self):
        if not self.store.error and self.task is None:
            self.live.start();self.task=asyncio.create_task(self.loop())
    async def loop(self):
        try:
            while not self.closed:
                try:await self.round()
                except asyncio.CancelledError:raise
                except Exception:pass # Per-alert errors are recorded; scheduler survives transient storage/provider faults.
                if self.live.queue:
                    await asyncio.sleep(0);continue
                self.wake.clear()
                try:await asyncio.wait_for(self.wake.wait(),timeout=.25)
                except asyncio.TimeoutError:pass
        except asyncio.CancelledError:pass
    def notify_change(self,id=None):
        self.live.reset(id)
        if id:
            self.primed={k for k in self.primed if k[0]!=id};self.next_due.pop(id,None)
        else:self.primed.clear();self.next_due.clear()
        self.wake.set()
    def status(self):
        if self.store.error:return dict(error=self.store.error,active=0,running=False)
        rows=self.store.list();settings=self.store.settings();now=self.clock()
        return dict(active=sum(r['definition']['enabled'] and (r['definition']['expires_at'] is None or r['definition']['expires_at']>now) for r in rows),total=len(rows),paused=settings.paused,running=self.running>0,last_round=self.last_round,started_at=self.started,cooldown_seconds=self.history.status()['cooldown_seconds'],storage='definitions, scalar checkpoints and trigger history only; OHLCV stays in memory',error=None,monitoring={r['id']:self.live.monitoring(r) for r in rows},stream_error=self.live.error,live_metrics=self.live.metrics.copy())
    async def round(self):
        if self.closed or self.store.error or self.lock.locked():return
        async with self.lock:
            settings=self.store.settings();now=self.clock()
            if self.live.task is None:
                await self.live.sync(settings)
                await self.live.drain(settings)
            if settings.paused:return
            if self.last_round and now-self.last_round>max(120,settings.poll_seconds*2):self.primed.clear() # Wake from sleep: no catch-up notifications.
            self.last_round=now
            due=[]
            for row in self.store.list():
                d=row['definition'];r=row['runtime']
                if not d['enabled'] or d.get('evaluation')=='live_price':continue
                if d['expires_at'] is not None and d['expires_at']<=now:
                    if r.get('status')!='expired':self.store.update_runtime(row,{**r,'status':'expired','error':None})
                    continue
                if self.next_due.get(row['id'],0)<=now or self.live.due(row):due.append(row)
            due.sort(key=lambda r:self.next_due.get(r['id'],0))
            groups={}
            for row in due:groups.setdefault((row['definition']['instrument'],row['definition']['interval'],row['definition']['adjusted'],row['definition'].get('completed',True)),[]).append(row)
            queue=iter(list(groups.values())[:20])
            async def worker():
                for group in queue:
                    if self.closed:return
                    await self.group(group,settings)
            workers=[asyncio.create_task(worker()) for _ in range(min(2,len(groups)))]
            self.running=len(workers)
            try:await asyncio.gather(*workers)
            finally:
                for task in workers:
                    if not task.done():task.cancel()
                await asyncio.gather(*workers,return_exceptions=True);self.running=0
    async def group(self,rows,settings):
        now=self.clock();first=rows[0]['definition'];sec=self.registry.resolve(first['instrument'])
        for row in rows:self.next_due[row['id']]=now+settings.poll_seconds
        try:
            if not sec:raise ProviderError('Instrument no longer resolves. Edit this alert to select its current identity.','missing')
            cached=self.history.cache.get(self.history.key(sec,interval=first['interval']));force=cached is not None and now-cached.fetched_at>=settings.poll_seconds
            streams=getattr(self.history,'streams',None);live=bool(streams and streams.healthy(sec,first['interval']))
            if live:
                force=False
                for row in rows:self.next_due[row['id']]=now+1
                feed=streams.feeds[sec['canonical_id']+'|candle|'+first['interval']]
                generation=streams.generation
                if any(r['runtime'].get('stream_generation')!=generation for r in rows):
                    for r in rows:self.primed.discard((r['id'],r['revision']))
                if all(r['runtime'].get('stream_generation')==generation and (r['id'],r['revision']) in self.primed and (r['runtime'].get('last_candle_end') or 0)>=feed.candle['time'] for r in rows):return
            h=await asyncio.wait_for(self.history.get(sec,first['interval'],force=force,adjusted=first['adjusted'],priority=1),180)
            if self.closed:return
            from .live_analysis import safe_history
            h=safe_history(h,sec,first['interval'],streams,completed=first.get('completed',True))
            for row in rows:
                # Edits/pause/disable during a request must not commit or dispatch the old configuration.
                current=self.store.get(row['id'])
                if not current or current['revision']!=row['revision'] or self.store.settings().paused:continue
                value=await asyncio.to_thread(self.assess,row,h,sec,self.store.settings(),self.clock())
                if self.closed:break
                if sec.get('provider')=='hyperliquid':value['runtime'].update(stream_generation=streams.generation if live else None,monitoring=self.live.monitoring(row),connection=streams.state if streams else 'rest_only',received_at=feed.received_at if live else None,market_type=sec.get('market_type'))
                self.store.update_runtime(row,**value)
        except asyncio.CancelledError:raise
        except Exception as e:
            for row in rows:
                kind=e.kind if isinstance(e,ProviderError) else 'temporary';message=str(e) if isinstance(e,ProviderError) else 'Historical data or evaluation unavailable; monitoring will retry conservatively.'
                failures=row['runtime'].get('failures',0)+1;delay=max(settings.poll_seconds,min(3600,60*2**min(failures-1,6)),getattr(e,'retry_after',0));self.next_due[row['id']]=self.clock()+delay
                r={**row['runtime'],'last_attempt':self.clock(),'status':'cooldown' if kind=='rate' else 'missing' if kind=='missing' else 'error','error':message,'failures':failures};self.store.update_runtime(row,r)
    def assess(self,row,h,security,settings,now):
        d=AlertDefinition.model_validate(row['definition']);r={**row['runtime'],'last_attempt':now,'last_fetched_at':h['fetched_at'],'error':None,'failures':0}
        if d.expires_at is not None and d.expires_at<=now:
            return dict(runtime={**r,'status':'expired'})
        config=ScreenConfig(interval=d.interval,completed=d.completed,adjusted=d.adjusted,conditions=d.conditions)
        sec={**security,'timezone':h.get('timezone') or security.get('timezone','UTC')}
        result=evaluate(h,sec,config,now);stamp=result.get('candle_time');state={'matched':True,'no_match':False}.get(result['status'])
        if not stamp:
            r.update(status='unknown',error='No eligible completed candle or valid OHLC values');return dict(runtime=r)
        end=candle_end(stamp,sec,d.interval) if d.completed else stamp
        fetched_stale=now-max(h['fetched_at'],h.get('stream_received_at') or 0)>max(settings.poll_seconds*2,120)
        behind=data_behind(stamp,sec,d.interval,now,settings.poll_seconds)
        r.update(last_successful_data=stamp,last_candle_end=end,source=h['source'],timezone=sec['timezone'])
        key=(row['id'],row['revision']);old=row['runtime'].get('last_evaluated_candle')
        if key not in self.primed:
            self.primed.add(key);r.update(last_evaluated_candle=max(old or 0,stamp),last_state=state,status='stale' if fetched_stale or behind else 'armed',error='Provider data is stale; baseline retained without notifications.' if fetched_stale or behind else 'Baseline established; only newly observed fresh candles can trigger.')
            return dict(runtime=r)
        if fetched_stale or behind:
            r.update(status='stale',error='Provider data is stale; no notification generated.')
            # Consume the observation so a later retry cannot turn old data into a new signal.
            r.update(last_evaluated_candle=max(old or 0,stamp),last_state=state);return dict(runtime=r)
        if old is not None and stamp<=old:
            r.update(status='waiting_candle' if market_open(sec,now) else 'waiting_market');return dict(runtime=r)
        r.update(last_evaluated_candle=stamp,last_state=state,status='unknown' if state is None else 'watching')
        if state is None:r['error']='; '.join(x['reason'] for x in result['details'] if x.get('reason'));return dict(runtime=r)
        # No retrospective signals after creation/rearm, long provider gaps, sleep or restart.
        if end<max(row['runtime']['active_since'],self.started,now-max(120,settings.poll_seconds*2)):
            r.update(status='skipped_old_signal',error='Newly downloaded candle is outside the fresh-signal window; no retrospective notification.');return dict(runtime=r)
        qualifies=state
        if qualifies and d.repeat=='crossing':
            intrinsic=len(d.conditions.children)==1 and d.conditions.children[0].type=='condition' and d.conditions.children[0].kind in CROSS_KINDS
            if not intrinsic:
                prefix=completed_rows(h['candles'],sec,d.interval,now,d.completed)
                previous=evaluate({**h,'candles':prefix[:-1]},sec,config,now)
                qualifies=previous['status']=='no_match' # Unknown is never treated as false.
        if not qualifies:return dict(runtime=r)
        r.update(last_triggered=now,status='completed_once' if d.repeat=='once' else 'triggered')
        payload=dict(instrument=entry(sec),interval=d.interval,title=d.name,message=d.message or 'Historical condition matched.',candle_time=stamp,candle_end=end,timezone=sec['timezone'],source=h['source'],close=result.get('close'),details=result['details'],sound=settings.sound,completed=d.completed)
        trigger=dict(candle_time=stamp,created_at=now,payload=payload,delivery='quiet_hours' if quiet_now(settings,now) else 'pending')
        return dict(runtime=r,trigger=trigger,disable=d.repeat=='once')
    async def close(self):
        self.closed=True;self.wake.set()
        if self.task:self.task.cancel();await asyncio.gather(self.task,return_exceptions=True)
        await self.live.close()
        self.store.retire_pending()

class Confirmation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    confirm:Literal[True]
class Delivery(BaseModel):
    model_config=ConfigDict(extra='forbid')
    state:Literal['shown_by_api','failed','permission_denied','permission_required','unsupported','unconfirmed','quiet_hours','clicked','not_sent_stale']
    detail:str=Field(default='',max_length=300)
class TestNotification(BaseModel):
    model_config=ConfigDict(extra='forbid')
    instrument:str=Field(max_length=180)
    interval:Literal['1m','5m','15m','30m','1h','4h','1d','1w','1M']='1d'

def routes(engine):
    router=APIRouter(prefix='/api/alerts')
    def ready():
        if engine.store.error:raise HTTPException(409,engine.store.error)
    def get(id):
        ready();row=engine.store.get(id)
        if not row:raise HTTPException(404,'This alert no longer exists')
        return row
    def save(value,id=None):
        ready();sec=engine.registry.resolve(value.instrument)
        if not sec:raise HTTPException(422,'Select a known current instrument identity')
        if value.evaluation=='live_price' and sec.get('provider')!='hyperliquid':raise HTTPException(422,'Live-price mode requires verified Hyperliquid crypto')
        value=value.model_copy(update={'instrument':sec['canonical_id']})
        try:row=engine.store.save(value,id,engine.clock())
        except KeyError:raise HTTPException(404,'This alert no longer exists')
        except ValueError as e:raise HTTPException(422,str(e))
        engine.notify_change(row['id']);return row
    @router.get('')
    def listing():ready();return dict(alerts=[{**r,'monitoring':engine.live.monitoring(r),'data_connection':engine.live.connection(r),'data_error':engine.live.feed(r).error if engine.live.feed(r) else None,'instrument':entry(engine.registry.resolve(r['definition']['instrument'])) if engine.registry.resolve(r['definition']['instrument']) else None} for r in engine.store.list()],status=engine.status())
    @router.post('')
    def create(value:AlertDefinition):return save(value)
    @router.get('/status')
    def status():return engine.status()
    @router.get('/settings')
    def settings():ready();return engine.store.settings().model_dump()
    @router.put('/settings')
    def settings_save(value:AlertSettings):
        ready();old=engine.store.settings();engine.store.save_settings(value)
        if old.paused!=value.paused or old.poll_seconds!=value.poll_seconds:engine.notify_change()
        return value.model_dump()
    @router.get('/history')
    def history():ready();return engine.store.history()
    @router.post('/history/clear')
    def clear(value:Confirmation):ready();engine.store.clear_history();return dict(cleared=True)
    @router.post('/{id}/delete')
    def delete(id:str,value:Confirmation):get(id);engine.store.delete(id);engine.notify_change(id);return dict(deleted=True)
    @router.put('/{id}')
    def update(id:str,value:AlertDefinition):get(id);return save(value,id)
    # These dispatch endpoints are used by Electron main only, not exposed through generic renderer IPC.
    @router.post('/notifications/claim')
    def claim():ready();return engine.store.pending(engine.clock())
    @router.post('/notifications/{id}/delivery')
    def delivery(id:str,value:Delivery):ready();engine.store.delivery(id,value.state,value.detail);return dict(recorded=True)
    @router.post('/notifications/test')
    def test(value:TestNotification):
        ready();sec=engine.registry.resolve(value.instrument)
        if not sec:raise HTTPException(422,'Select a valid instrument for the test notification')
        settings=engine.store.settings();now=engine.clock();payload=dict(instrument=entry(sec),interval=value.interval,title='Historical alert test',message='Native notification test. This is not a market signal.',candle_time=None,timezone=sec.get('timezone','UTC'),source='TEST NOTIFICATION',sound=settings.sound)
        id=engine.store.test(payload,now)
        if quiet_now(settings,now):
            with engine.store.db.connect() as c:c.execute("UPDATE alert_history SET delivery='quiet_hours' WHERE id=?",(id,))
        return dict(id=id)
    return router
