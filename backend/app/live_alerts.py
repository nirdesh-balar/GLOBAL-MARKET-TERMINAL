"""Bounded backend alert demand on the existing public manager; scalar checkpoints only."""
import time,asyncio
from collections import deque
from .alert_models import AlertDefinition,quiet_now
from .markets import entry
from .live_analysis import evaluate_price
class LiveAlerts:
 def __init__(self,engine):
  self.engine=engine;self.manager=getattr(engine.history,'streams',None);self.signature=None;self.rows={};self.queue=deque();self.primed=set();self.error=None;self.next_sync=0;self.task=None;self.sync_task=None
  self.metrics=dict(evaluations=0,triggers=0,overflows=0,max_latency_ms=0.)
  if self.manager and self.manager.enabled:self.manager.listeners.add(self.receive)
 def start(self):
  if self.manager and self.manager.enabled and self.task is None:self.task=asyncio.create_task(self.loop())
 async def loop(self):
  while not self.engine.closed:
   try:
    settings=self.engine.store.settings()
    if self.sync_task is None or self.sync_task.done():self.sync_task=asyncio.create_task(self.sync(settings))
    await self.drain(settings)
    await asyncio.sleep(.05 if self.queue else .1)
   except asyncio.CancelledError:raise
   except Exception:
    self.error='Live alert evaluation unavailable; rebaselining before conservative retry.';self.primed.clear();self.queue.clear();await asyncio.sleep(2)
 def receive(self,key,kind,value):
  if kind!='trades' or not any(r['definition'].get('evaluation')=='live_price' and key==r['definition']['instrument']+'|trades|' for r in self.rows.values()):return
  if len(self.queue)>=512:self.queue.clear();self.primed.clear();self.metrics['overflows']+=1;self.error='Live observation queue overflow; alerts rebaseline without catch-up.'
  self.queue.append((key,value,self.manager.generation));self.engine.wake.set()
 def reset(self,id=None):
  self.signature=None;self.primed={k for k in self.primed if id and k[0]!=id}
  if id is None:self.queue.clear()
 def monitoring(self,row):
  d=row['definition'];price=d.get('evaluation')=='live_price'
  if not d['enabled']:return 'disabled'
  if self.engine.store.settings().paused:return 'paused'
  if d.get('expires_at') is not None and d['expires_at']<=self.engine.clock():return 'expired'
  sec=self.engine.registry.resolve(d['instrument'])
  if not sec or sec.get('kind')=='crypto' and sec.get('provider')!='hyperliquid':return 'unresolved_crypto' if sec else 'missing'
  if sec['provider']!='hyperliquid':return 'unsupported_live_price' if price else 'yahoo_historical_poll'
  if not self.manager or not self.manager.enabled:return 'unmonitored_live_price' if price else 'hyperliquid_rest_poll'
  f=self.feed(row)
  if f and f.blocked:return 'unmonitored_invalid_market'
  return 'shared_public_stream' if self.manager.alert_allocation.get('alert:'+row['id'])=='stream' else 'unmonitored_subscription_limit' if price else 'bounded_rest_fallback'
 def feed(self,row):
  d=row['definition'];return self.manager.feeds.get(d['instrument']+('|trades|' if d.get('evaluation')=='live_price' else '|candle|'+d['interval'])) if self.manager else None
 def connection(self,row):
  f=self.feed(row);return f.state if f else 'unsubscribed' if row['definition']['instrument'].startswith('hyperliquid:') else 'historical_poll'
 async def sync(self,settings):
  if not self.manager or not self.manager.enabled:return
  now=self.engine.clock();rows=self.engine.store.list();signature=tuple((r['id'],r['revision'],r['definition']['enabled'],r['definition']['expires_at'] is not None and r['definition']['expires_at']<=now) for r in rows)+(settings.paused,)
  if signature==self.signature or now<self.next_sync and not settings.paused:return
  items=[];selected={}
  for r in sorted(rows,key=lambda r:(r['definition'].get('evaluation')!='live_price',r['created_at'],r['id'])):
   d=r['definition'];sec=self.engine.registry.resolve(d['instrument'])
   if settings.paused or not d['enabled'] or d['expires_at'] is not None and d['expires_at']<=now or not sec or sec.get('provider')!='hyperliquid' or not sec.get('available',True):continue
   selected[r['id']]=r;price=d.get('evaluation')=='live_price';items.append(dict(owner='alert:'+r['id'],identity=sec['canonical_id'],native_mapping=sec.get('native_mapping',''),feed='trades' if price else 'candle',interval='' if price else d['interval']))
  try:await self.manager.set_alerts(items);self.rows=selected;self.signature=signature;self.error=None
  except Exception as e:self.error=str(e)[:300];self.next_sync=now+60
 async def drain(self,settings):
  if settings.paused:self.queue.clear();self.primed.clear();return
  start=time.perf_counter();current={r['id']:r for r in self.engine.store.list()};dirty={}
  for _ in range(min(128,len(self.queue))):
   key,q,generation=self.queue.popleft()
   f=self.manager.feeds.get(key)
   if generation!=self.manager.generation or self.manager.state!='connected' or not f or f.blocked or f.state!='live':
    self.primed.clear();continue
   for id in list(self.rows):
    row=current.get(id)
    if not row or not row['definition']['enabled'] or row['definition'].get('evaluation')!='live_price' or key!=row['definition']['instrument']+'|trades|' or self.manager.alert_allocation.get('alert:'+id)!='stream':continue
    sec=self.engine.registry.resolve(row['definition']['instrument']);value=self.assess(row,q,sec,settings,self.engine.clock(),generation)
    if value:
     if value.get('trigger'):self.engine.store.update_runtime(row,**value)
     row={**row,'runtime':value['runtime'],'definition':{**row['definition'],'enabled':False} if value.get('disable') else row['definition']};current[id]=row;dirty[id]=row
   if time.perf_counter()-start>.05:break
  for row in dirty.values():self.engine.store.update_runtime(row,row['runtime'])
  self.metrics['max_latency_ms']=max(self.metrics['max_latency_ms'],(time.perf_counter()-start)*1000)
  if self.queue:self.engine.wake.set()
 def due(self,row):
  if not self.manager or not self.manager.enabled:return False
  d=row['definition'];sec=self.engine.registry.resolve(d['instrument'])
  if not sec or not self.manager.healthy(sec,d['interval']):return False
  f=self.manager.feeds[d['instrument']+'|candle|'+d['interval']]
  return row['runtime'].get('stream_generation')!=self.manager.generation or (row['runtime'].get('last_candle_end') or 0)<f.candle['time']
 def assess(self,row,q,sec,settings,now,generation):
  d=AlertDefinition.model_validate(row['definition']);old=row['runtime'];r={**old,'last_attempt':now,'source':'HYPERLIQUID','connection':self.manager.state,'monitoring':'shared_public_stream','market_type':sec['market_type'],'received_at':q['received_at'],'last_fetched_at':q['received_at'],'error':None,'failures':0}
  t=q['data_time'];tid=q['trade_id'];p=q['price'];last=old.get('last_price_time');previous=old.get('last_price');identity=(row['id'],row['revision'])
  if last is not None and (t<last or t==last and tid==old.get('last_trade_id')):return None
  state,details=evaluate_price(p,previous,sec,d.conditions);self.metrics['evaluations']+=1;r.update(last_price=p,last_price_time=t,last_trade_id=tid,stream_generation=generation,last_successful_data=int(t),last_state=state,status='watching' if state is not None else 'unknown')
  if d.expires_at is not None and d.expires_at<=now:return dict(runtime={**r,'status':'expired'})
  if now-t>15 or now-q['received_at']>15:
   self.primed.discard(identity);return dict(runtime={**r,'status':'stale','error':'Stale trade; no live signal.'})
  if identity not in self.primed or old.get('stream_generation')!=generation:
   self.primed.add(identity);return dict(runtime={**r,'status':'armed','error':'Live baseline established; no retrospective signal.'})
  if now-t>15 or now-q['received_at']>15 or t<max(old['active_since'],self.engine.started):
   self.primed.discard(identity);return dict(runtime={**r,'status':'stale','error':'Stale trade; no live signal.'})
  if state is None:return dict(runtime={**r,'error':'; '.join(v['reason'] for v in details if v['reason'])})
  intrinsic=len(d.conditions.children)==1 and d.conditions.children[0].type=='condition' and d.conditions.children[0].kind.startswith('price_cross_')
  if not state or not (d.repeat=='once' or intrinsic or old.get('last_state') is False):return dict(runtime=r)
  self.metrics['triggers']+=1;r.update(last_triggered=now,status='completed_once' if d.repeat=='once' else 'triggered');payload=dict(instrument=entry(sec),interval=d.interval,title=d.name,message=d.message or 'Validated public price condition matched.',candle_time=None,market_time=t,event_type='live_price',timezone='UTC',source='HYPERLIQUID',close=p,details=details,sound=settings.sound,completed=False)
  return dict(runtime=r,trigger=dict(candle_time=round(t*1000),created_at=now,payload=payload,delivery='quiet_hours' if quiet_now(settings,now) else 'pending'),disable=d.repeat=='once')
 async def close(self):
  tasks=[t for t in (self.task,self.sync_task) if t]
  for t in tasks:t.cancel()
  await asyncio.gather(*tasks,return_exceptions=True)
  if self.manager:
   self.manager.listeners.discard(self.receive)
   if not self.manager.closed:
    try:await self.manager.set_alerts([])
    except Exception:await self.manager.close() # Invalid remaining mappings cannot prevent socket shutdown.
  self.queue.clear();self.rows.clear()
