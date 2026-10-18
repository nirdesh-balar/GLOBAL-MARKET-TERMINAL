"""One public, read-only Hyperliquid socket per local application process."""
import asyncio,json,math,random,ssl,time
from collections import deque
from dataclasses import dataclass,field
import certifi
from websockets.asyncio.client import connect
from fastapi import APIRouter
from pydantic import BaseModel,ConfigDict,Field
from .market_router import MarketDataRouter
from .providers.base import ProviderError
from .providers.hyperliquid import INTERVALS,normalize_candles
from .history import response
WS_URL='wss://api.hyperliquid.xyz/ws'

def subscription(feed,security,interval=''):
    if MarketDataRouter.validate(security)!='hyperliquid':raise ProviderError('Live feeds require verified Hyperliquid crypto.','policy')
    if feed=='candle' and interval in INTERVALS:return dict(type='candle',coin=security['native_id'],interval=interval)
    if feed=='trades' and not interval:return dict(type='trades',coin=security['native_id'])
    raise ProviderError('Only public candle/trades subscriptions are supported.','policy')
def wire(method,sub=None):
    if method=='ping' and sub is None:return {'method':'ping'}
    if method not in ('subscribe','unsubscribe') or not isinstance(sub,dict):raise ProviderError('Public subscription operation required.','policy')
    allowed={'type','coin','interval'} if sub.get('type')=='candle' else {'type','coin'} if sub.get('type')=='trades' else set()
    if not allowed or set(sub)!=allowed or not isinstance(sub.get('coin'),str) or not 0<len(sub['coin'])<=60 or sub.get('type')=='candle' and sub.get('interval') not in INTERVALS:raise ProviderError('Private or malformed subscription rejected.','policy')
    return dict(method=method,subscription=sub)
def feed_key(security,feed,interval=''):return security['canonical_id']+'|'+feed+'|'+interval

def trade_price(values,security,now):
    if not isinstance(values,list) or not 0<len(values)<=5000:raise ProviderError('Invalid public trades payload.','schema')
    clean=[]
    for r in values:
        if not isinstance(r,dict) or r.get('coin')!=security['native_id'] or type(r.get('time')) is not int or not 0<r['time']<=int(now*1000)+1000 or type(r.get('tid')) is not int or r['tid']<0:raise ProviderError('Trade identity/timestamp rejected.','schema')
        try:
            if isinstance(r.get('px'),bool) or isinstance(r.get('sz'),bool):raise ValueError()
            price,size=float(r['px']),float(r['sz'])
            if not math.isfinite(price) or price<=0 or not math.isfinite(size) or size<0:raise ValueError()
        except (KeyError,ValueError,TypeError):raise ProviderError('Invalid public trade price/size.','schema') from None
        from decimal import Decimal
        clean.append(dict(precision=min(10,max(0,-Decimal(str(r['px'])).as_tuple().exponent)),price=price,time=r['time']/1000,tid=r['tid']))
    return sorted(clean,key=lambda r:r['time'])

@dataclass
class Feed:
    security:dict
    feed:str
    interval:str=''
    owners:set=field(default_factory=set)
    state:str='connecting'
    error:str|None=None
    received_at:float=0
    market_time:float|None=None
    candle:dict|None=None
    trades_count:int|None=None
    quote:dict|None=None
    version:int=0
    reset:dict|None=None
    reset_version:int=0
    reconciling:bool=False
    reconcile_at:float=0
    reconcile_task:object=None
    precision:int=0
    blocked:bool=False
    pending:dict|None=None
    last_commit:float=0
    seen:deque=field(default_factory=lambda:deque(maxlen=256))
    def sub(self):return subscription(self.feed,self.security,self.interval)

class HyperliquidStreamManager:
    LIMIT=108
    def __init__(self,history,registry,connector=None,enabled=True,clock=time.time,jitter=random.random):
        self.history=history;self.registry=registry;self.enabled=enabled and hasattr(history,'hyperliquid');self.connector=connector or self.open_socket;self.clock=clock;self.jitter=jitter
        self.feeds={};self.task=None;self.socket=None;self.sent={};self.state='idle' if self.enabled else 'disabled';self.error=None;self.paused=False;self.closed=False;self.wake=asyncio.Event();self.changed=asyncio.Event();self.version=0;self.last_client=clock();self.last_message=0.;self.last_pong=0.;self.last_metadata_check=0.;self.plan_lock=asyncio.Lock();self.outgoing=deque();self.last_send=0.;self.generation=0;self.reconnect_floor=0
        self.client_consumers=[];self.alert_consumers=[];self.alert_allocation={};self.consumer_lock=asyncio.Lock();self.listeners=set()
        self.metrics=dict(connections=0,reconnections=0,sent_subscribe=0,sent_unsubscribe=0,received=0,rejected=0,duplicates=0,out_of_order=0,candle_updates=0,candle_appends=0,trade_updates=0,reconciliations=0,coalesced=0)
    async def open_socket(self):
        return await connect(WS_URL,ssl=ssl.create_default_context(cafile=certifi.where()),open_timeout=20,close_timeout=5,ping_interval=None,max_size=2_000_000,max_queue=16,proxy=None)
    def publish(self,f=None):
        self.version+=1
        if f:f.version=self.version
        old=self.changed;self.changed=asyncio.Event();old.set()
    def status(self):
        return dict(enabled=self.enabled,state=self.state,error=self.error,connection_count=1 if self.socket else 0,subscriptions=len(self.feeds),limit=self.LIMIT,consumers=sum(len(f.owners) for f in self.feeds.values()),paused=self.paused,generation=self.generation,version=self.version,metrics=self.metrics.copy(),storage='bounded memory only',public_feeds=['candle','trades'],streaming=self.enabled,alert_feed_limit=32,alert_allocation=self.alert_allocation.copy())
    def healthy(self,security,interval):
        f=self.feeds.get(feed_key(security,'candle',interval));return bool(f and f.state=='live' and self.state=='connected' and not f.reconciling and self.clock()-f.received_at<75)
    def observe(self,key,kind,value):
        for fn in tuple(self.listeners):fn(key,kind,value)
    def allocate(self,clients,alerts):
        keys={(i['identity'],i['feed'],i.get('interval','')) for i in clients};extra=set();chosen=[];allocation={}
        for item in alerts:
            key=(item['identity'],item['feed'],item.get('interval',''))
            permitted=key in keys or key in extra or len(extra-keys)<32 and len(keys|extra)<self.LIMIT
            allocation[item['owner']]='stream' if permitted else 'bounded_rest'
            if permitted:chosen.append(item);extra.add(key)
        return clients+chosen,allocation
    async def plan(self,items):
        if len(items)>108 or any(i['owner'].startswith('alert:') for i in items):raise ProviderError('Interactive consumers cannot claim backend alert ownership.','limit')
        if len({(i['identity'],i.get('interval','')) for i in items if i['feed']=='candle'})>8:raise ProviderError('At most eight interactive chart feeds.','limit')
        async with self.consumer_lock:
            combined,allocation=self.allocate(items,self.alert_consumers)
            result=await self._apply_plan(combined)
            self.client_consumers=list(items);self.alert_allocation=allocation
            return self.status()
    async def set_alerts(self,items):
        if self.closed:return
        async with self.consumer_lock:
            combined,allocation=self.allocate(self.client_consumers,items)
            await self._apply_plan(combined);self.alert_consumers=list(items);self.alert_allocation=allocation
            return allocation.copy()
    async def _apply_plan(self,items):
        if not self.enabled:return self.status()
        async with self.plan_lock:
            if items:await self.registry.hyperliquid.ensure()
            proposed={};chart_owners=set();trade_owners=set()
            for item in items:
                sec=self.registry.resolve(item['identity'])
                if not sec:raise ProviderError('Select an officially verified crypto identity for streaming.','missing')
                sec=await self.registry.hyperliquid.validate({**sec,'native_mapping':item.get('native_mapping') or sec.get('native_mapping','')})
                sub=subscription(item['feed'],sec,item.get('interval',''));key=feed_key(sec,item['feed'],item.get('interval',''))
                if not item['owner'].startswith('alert:'):(chart_owners if item['feed']=='candle' else trade_owners).add(item['owner'])
                if key not in proposed:proposed[key]=Feed(sec,item['feed'],item.get('interval',''))
                proposed[key].owners.add(item['owner'])
            if len(chart_owners)>8 or len(trade_owners)>1  or len(proposed)>self.LIMIT:raise ProviderError('Live limit: eight chart owners and one selected watchlist, up to 100 rows.','limit')
            native_feeds={}
            for key,f in proposed.items():
                native=json.dumps(f.sub(),sort_keys=True)
                if native in native_feeds and native_feeds[native]!=key:raise ProviderError('Official native feed identifier is ambiguous across canonical markets.','identity')
                native_feeds[native]=key
            for key,f in proposed.items():
                old=self.feeds.get(key)
                if old and old.security['native_mapping']==f.security['native_mapping']:
                    added=f.owners-old.owners;old.owners=f.owners;proposed[key]=old
                    if added and old.feed=='candle':self.queue_reconcile(key,old,force=False)
            for key,f in self.feeds.items():
                if key not in proposed and f.reconcile_task:f.reconcile_task.cancel()
            self.feeds=proposed
            for key,f in self.feeds.items():
                if not f.version:
                    self.publish(f)
                    if f.feed=='candle':self.queue_reconcile(key,f,force=False)
            self.last_client=self.clock();self.publish();self.wake.set()
            if self.feeds and (self.task is None or self.task.done()):self.task=asyncio.create_task(self.run())
            return self.status()
    async def lifecycle(self,suspended):
        self.paused=suspended;self.publish();self.wake.set()
        if suspended and self.socket:await self.socket.close()
    async def events(self,cursor=0,wait=20):
        self.last_client=self.clock()
        if cursor>=self.version:
            event=self.changed
            try:await asyncio.wait_for(event.wait(),min(20,max(0,wait)))
            except TimeoutError:pass
        if wait>0:await asyncio.sleep(.2)
        for key,f in list(self.feeds.items()):
            if f.pending:
                raw=f.pending;f.pending=None;self.apply_candle(key,f,raw,flush=True)
        now=self.clock();feeds=[]
        for key,f in self.feeds.items():
            if f.version<=cursor and cursor>0:continue
            state=f.state
            if state=='live' and now-f.received_at>=75:state='stale'
            row=dict(key=key,identity=f.security['canonical_id'],feed=f.feed,interval=f.interval,state=state,error=f.error,received_at=f.received_at,market_time=f.market_time,precision=f.precision,refs=len(f.owners),version=f.version)
            if f.quote:row['quote']=dict(f.quote)
            if f.reset and f.reset_version>cursor:row['history']=f.reset
            if f.candle:row['candle']=f.candle
            feeds.append(row)
        return dict(cursor=self.version,status=self.status(),feeds=feeds)
    async def send(self,method,sub=None):
        body=wire(method,sub)
        now=self.clock()
        while self.outgoing and now-self.outgoing[0]>=60:self.outgoing.popleft()
        if len(self.outgoing)>=240:
            self.state='limited';self.error='Conservative WebSocket message allowance reached; waiting.';self.publish();await asyncio.sleep(max(.1,60-(now-self.outgoing[0])));self.state='connected';self.error=None;self.publish()
        delay=max(0,.05-(self.clock()-self.last_send))
        if delay:await asyncio.sleep(delay)
        if not self.socket:raise ConnectionError('Socket closed')
        await self.socket.send(json.dumps(body));self.last_send=self.clock();self.outgoing.append(self.last_send)
        if method in ('subscribe','unsubscribe'):self.metrics['sent_'+method]+=1
    def queue_reconcile(self,key,f,force=True):
        if f.feed!='candle' or f.reconciling or force and self.clock()<f.reconcile_at:return
        f.reconciling=True;f.state='reconciling';self.publish(f)
        async def work():
            try:
                old=self.history.cache.get(self.history.key(f.security,interval=f.interval))
                if old and old.metadata.get('native_mapping')!=f.security['native_mapping']:old=None
                if old is None or force or self.clock()-max(old.fetched_at,old.metadata.get('stream_received_at') or 0)>2:
                    size=INTERVALS[f.interval];recent=bool(old and self.clock()-old.candles[-1]['time']<=size*3)
                    async def load():
                        data=await self.history.hyperliquid.fetch(f.security,f.interval,recent=recent)
                        if old and recent:
                            merged={r['time']:r for r in old.candles};merged.update({r['time']:r for r in data.candles});data.candles=[merged[t] for t in sorted(merged)][-5000:]
                        return data
                    old,_=await self.history.daily(f.security,force=True,interval=f.interval,loader=load)
                    self.metrics['reconciliations']+=1
                if key not in self.feeds or self.feeds[key] is not f:return
                f.candle=dict(old.candles[-1]);f.trades_count=None
                f.reset=response(old,f.interval,security=f.security,cached=True);f.reconcile_at=self.clock();f.error=None
                f.state='connecting' # A REST success alone is not proof of a live feed.
                self.publish(f);f.reset_version=f.version
            except ProviderError as e:
                f.error=str(e);f.state='unavailable' if e.kind in ('access','missing','policy','identity') else 'stale';f.reconcile_at=self.clock()+max(60,e.retry_after);self.publish(f)
            finally:f.reconciling=False
        f.reconcile_task=asyncio.create_task(work());f.reconcile_task.add_done_callback(lambda t:t.exception() if not t.cancelled() else None)
    def apply_candle(self,key,f,raw,flush=False):
        rows,precision=normalize_candles(raw if isinstance(raw,list) else [raw],f.security,f.interval,self.clock())
        for candle in rows:
            supplied=next(r for r in (raw if isinstance(raw,list) else [raw]) if r['t']//1000==candle['time']);n=supplied.get('n')
            if type(n) is not int or n<0:raise ProviderError('Invalid candle trade counter.','schema')
            if f.reconciling:return # REST baseline will be followed by another provider revision.
            old=f.candle
            if f.pending and candle['time']>f.pending['t']//1000:
                pending=f.pending;f.pending=None;self.apply_candle(key,f,pending,flush=True);old=f.candle
            if f.pending and candle['time']==f.pending['t']//1000 and n<f.pending['n']:
                self.metrics['out_of_order']+=1;continue
            if old and candle['time']<old['time']:self.metrics['out_of_order']+=1;continue
            if old and candle==old:
                self.metrics['duplicates']+=1;f.received_at=self.clock()
                state='live' if candle['end_time']>=self.clock()-90 else 'stale'
                if f.state!=state:f.state=state;self.publish(f)
                continue
            if old and candle['time']==old['time']:
                if f.trades_count is not None and n<f.trades_count or candle['volume']<old['volume'] or candle['high']<old['high'] or candle['low']>old['low']:
                    self.metrics['out_of_order']+=1
                    if self.clock()>=f.reconcile_at+60:self.queue_reconcile(key,f)
                    continue
            if old and candle['time']>old['time']+INTERVALS[f.interval]:
                self.metrics['out_of_order']+=1
                if self.clock()>=f.reconcile_at+5:self.queue_reconcile(key,f)
                elif f.state!='stale':f.state='stale';self.publish(f)
                continue
            if not flush and self.clock()-f.last_commit<.25:
                f.pending=supplied;self.metrics['coalesced']+=1;continue
            f.last_commit=self.clock()
            cache_key=self.history.key(f.security,interval=f.interval);data=self.history.cache.get(cache_key)
            if data is None:self.queue_reconcile(key,f);return
            if candle['time']<data.candles[-1]['time']:self.metrics['out_of_order']+=1;continue
            data.candles=(data.candles[:-1]+[candle]) if candle['time']==data.candles[-1]['time'] else (data.candles+[candle])[-5000:]
            f.precision=max(f.precision,precision);data.metadata['precision']=max(data.metadata.get('precision',0),f.precision)
            data.metadata['stream_received_at']=self.clock();self.history.cache.put(cache_key,data)
            self.metrics['candle_appends' if old and candle['time']>old['time'] else 'candle_updates']+=1
            f.candle=candle;f.trades_count=n;f.received_at=self.clock();f.market_time=None;f.state='live' if candle['end_time']>=self.clock()-90 else 'stale';f.error=None;self.publish(f);self.observe(key,'candle',candle)
    def receive(self,message):
        if not isinstance(message,dict) or not isinstance(message.get('channel'),str):raise ProviderError('Malformed public stream envelope.','schema')
        channel=message['channel'];data=message.get('data');self.metrics['received']+=1;self.last_message=self.clock()
        if channel=='pong':self.last_pong=self.clock();return
        if channel=='subscriptionResponse':
            if not isinstance(data,dict):raise ProviderError('Invalid subscription acknowledgement.','schema')
            wire(data.get('method'),data.get('subscription'));return
        if channel=='error':self.reconnect_floor=60;raise ConnectionError('Public WebSocket rejected a subscription; retry is delayed.')
        if channel not in ('candle','trades'):raise ProviderError('Unrequested stream channel rejected.','policy')
        first=data[0] if isinstance(data,list) and data else data
        if not isinstance(first,dict):raise ProviderError('Invalid public stream data.','schema')
        native=first.get('s') if channel=='candle' else first.get('coin');interval=first.get('i','') if channel=='candle' else ''
        matches=[(key,f) for key,f in self.feeds.items() if f.feed==channel and f.security['native_id']==native and f.interval==interval]
        if len(matches)!=1:return # Unsubscribed/stale socket messages cannot create instruments.
        key,f=matches[0]
        if channel=='candle':self.apply_candle(key,f,data);return
        values=trade_price(data,f.security,self.clock())
        for q in values:
            identity=(q['time'],q['tid'])
            if identity in f.seen:self.metrics['duplicates']+=1;continue
            if f.market_time is not None and q['time']<f.market_time:self.metrics['out_of_order']+=1;continue
            f.seen.append(identity);f.market_time=q['time'];f.received_at=self.clock();f.state='live' if self.clock()-q['time']<90 else 'stale';f.error=None
            f.quote=dict(price=q['price'],previous_close=None,absolute_change=None,change=None,volume=None,currency=f.security['quote_asset'],timezone='UTC',precision=q['precision'],data_time=q['time'],timestamp_kind='provider_trade_time',latest_bar_time=q['time'],last_completed_bar_time=None,fetched_at=f.received_at,received_at=f.received_at,source='HYPERLIQUID',trade_id=q['tid'],session=dict(state='open',reliable=True,basis='Public crypto trades'),notice='Actual public trade price; no previous-close/24-hour reference supplied by this feed.')
            self.metrics['trade_updates']+=1;self.publish(f);self.observe(key,'trades',dict(f.quote))
    async def run(self):
        failures=0;last_connection=0.
        while not self.closed:
            if not self.feeds or self.paused:
                self.state='suspended' if self.paused else 'idle';self.publish()
                if not self.feeds:return
                self.wake.clear();await self.wake.wait();continue
            delay=max(0,2-(self.clock()-last_connection))
            if delay:await asyncio.sleep(delay)
            w=r=None
            try:
                self.state='connecting';self.error=None;self.publish();last_connection=self.clock()
                self.socket=await self.connector();self.metrics['connections']+=1
                if self.generation:self.metrics['reconnections']+=1
                self.generation+=1;self.sent={};self.state='connected';self.last_message=self.clock();self.publish()
                for key,f in self.feeds.items():
                    f.state='connecting';self.publish(f)
                    if f.feed=='candle':self.queue_reconcile(key,f,force=self.generation>1)
                async def writer():
                    while not self.closed and self.feeds and not self.paused:
                        for key,sub in list(self.sent.items()):
                            if key not in self.feeds:await self.send('unsubscribe',sub);self.sent.pop(key,None)
                        for key,f in list(self.feeds.items()):
                            if key not in self.sent and key in self.feeds and not f.blocked:await self.send('subscribe',f.sub());self.sent[key]=f.sub()
                        if self.clock()-self.last_message>25:await self.send('ping')
                        if self.clock()-self.last_message>55:raise ConnectionError('Public heartbeat timed out')
                        if self.clock()-self.last_client>65:
                            await self.plan([])
                            if not self.feeds:return
                        if not self.registry.hyperliquid.fresh() and self.clock()-self.last_metadata_check>60:
                            self.last_metadata_check=self.clock();await self.registry.hyperliquid.ensure()
                            for key,f in list(self.feeds.items()):
                                try:await self.registry.hyperliquid.validate(f.security)
                                except ProviderError as e:f.blocked=True;f.state='unavailable';f.error=str(e);self.publish(f);await self.send('unsubscribe',f.sub());self.sent.pop(key,None)
                        for key,f in self.feeds.items():
                            if not f.received_at and self.clock()-last_connection>75 and f.state=='connecting':f.state='stale';self.publish(f)
                            if f.received_at and self.clock()-f.received_at>75 and f.state=='live':f.state='stale';self.publish(f)
                            if f.feed=='candle' and not f.blocked and f.state in ('stale','unavailable') and not f.reconciling and self.clock()>f.reconcile_at+60:self.queue_reconcile(key,f)
                        self.wake.clear()
                        try:await asyncio.wait_for(self.wake.wait(),1)
                        except TimeoutError:pass
                    for sub in list(self.sent.values()):
                        if self.closed and len(self.outgoing)>=240:break
                        await self.send('unsubscribe',sub)
                async def reader():
                    bad=0
                    async for raw in self.socket:
                        try:
                            message=json.loads(raw,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
                            self.receive(message);bad=0
                        except (ProviderError,ValueError,TypeError,OverflowError):
                            self.metrics['rejected']+=1;bad+=1
                            if bad>=10:self.reconnect_floor=60;raise ConnectionError('Repeated malformed public payloads')
                    raise ConnectionError('Public WebSocket disconnected')
                w=asyncio.create_task(writer());r=asyncio.create_task(reader())
                done,_=await asyncio.wait({w,r},return_when=asyncio.FIRST_COMPLETED)
                for t in (w,r):
                    if t not in done:t.cancel()
                await asyncio.gather(w,r,return_exceptions=True)
                for t in done:
                    if not t.cancelled() and t.exception():raise t.exception()
                failures=0
            except asyncio.CancelledError:break
            except Exception as e:
                if self.clock()-last_connection>30:failures=0
                self.state='disconnected';self.error=str(e)[:220];failures=min(failures+1,8)
                if isinstance(e,ProviderError) and e.kind in ('rate','access','identity','policy'):self.reconnect_floor=max(self.reconnect_floor,e.retry_after,300 if e.kind=='access' else 60)
                status=getattr(getattr(e,'response',None),'status_code',None)
                if status in (401,403,429):
                    retry=getattr(getattr(e,'response',None),'headers',{}).get('Retry-After','60')
                    try:retry=max(60,math.ceil(float(retry)))
                    except (ValueError,TypeError,OverflowError):
                        try:
                            from email.utils import parsedate_to_datetime
                            retry=max(60,math.ceil(parsedate_to_datetime(retry).timestamp()-self.clock()))
                        except (ValueError,TypeError):retry=60
                    self.reconnect_floor=max(self.reconnect_floor,retry,300 if status!=429 else 60)
                if self.reconnect_floor>=60:self.state='limited'
                for f in self.feeds.values():f.state='disconnected';self.publish(f)
                self.publish()
            finally:
                for t in (w,r):
                    if t and not t.done():t.cancel()
                await asyncio.gather(*[t for t in (w,r) if t],return_exceptions=True)
                if self.socket:
                    await self.socket.close();self.socket=None
                self.sent={}
            if self.closed or not self.feeds:break
            delay=max(self.reconnect_floor,min(120,2**max(1,failures)))+self.jitter()*2
            self.reconnect_floor=0
            # Sleep/wake and unsubscribe may stop a retry, never accelerate a failed retry.
            await asyncio.sleep(delay)
        self.state='closed' if self.closed else 'idle';self.publish()
    async def close(self):
        self.closed=True;self.wake.set()
        # The writer alone sends unsubscriptions. Closing a socket also removes
        # every server subscription when a rate limit prevents a graceful drain.
        if self.task and not self.task.done():
            if self.socket:
                try:await asyncio.wait_for(asyncio.shield(self.task),6)
                except TimeoutError:self.task.cancel()
            else:self.task.cancel()
            await asyncio.gather(self.task,return_exceptions=True)
        if self.socket:await self.socket.close();self.socket=None
        tasks=[f.reconcile_task for f in self.feeds.values() if f.reconcile_task]
        for t in tasks:t.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        self.feeds.clear();self.client_consumers.clear();self.alert_consumers.clear();self.listeners.clear();self.sent.clear();self.state='closed';self.publish()

class Consumer(BaseModel):
    model_config=ConfigDict(extra='forbid')
    owner:str=Field(min_length=1,max_length=100)
    identity:str=Field(min_length=1,max_length=180)
    native_mapping:str=Field(default='',max_length=64)
    feed:str
    interval:str=''
class Plan(BaseModel):
    model_config=ConfigDict(extra='forbid')
    consumers:list[Consumer]=Field(max_length=108)
class Lifecycle(BaseModel):
    suspended:bool

def routes(manager):
    router=APIRouter()
    @router.get('/api/streams/status')
    async def status():return manager.status()
    @router.put('/api/streams/consumers')
    async def plan(value:Plan):return await manager.plan([r.model_dump() for r in value.consumers])
    @router.get('/api/streams/events')
    async def events(cursor:int=0,wait:float=20):return await manager.events(cursor,wait)
    @router.post('/api/streams/lifecycle')
    async def lifecycle(value:Lifecycle):await manager.lifecycle(value.suspended);return manager.status()
    return router
