"""Synthetic public-schema socket used only by tests, never production launcher."""
import asyncio,json,time,os
from hyperliquid_fixtures import raw_candles
class FixtureSocket:
 def __init__(self,candle_count=100):
  self.candle_count=candle_count
  self.queue=asyncio.Queue(maxsize=128);self.subscriptions={};self.sent=[];self.closed=False;self.tick=0;self.producer=asyncio.create_task(self.produce())
 async def send(self,raw):
  body=json.loads(raw);self.sent.append(body)
  if body['method']=='ping':self.put({'channel':'pong'});return
  sub=body['subscription'];key=json.dumps(sub,sort_keys=True)
  if body['method']=='subscribe':self.subscriptions[key]=sub
  else:self.subscriptions.pop(key,None)
  self.put({'channel':'subscriptionResponse','data':body})
 def put(self,value):
  if self.queue.full():self.queue.get_nowait()
  self.queue.put_nowait(json.dumps(value) if value is not None else None)
 async def produce(self):
  while not self.closed:
   await asyncio.sleep(.2);self.tick+=1
   for sub in list(self.subscriptions.values()):
    if sub['type']=='candle':
     row=raw_candles(sub['coin'],sub['interval'],count=self.candle_count)[-1]
     price=float(row['c'])+min(.8,self.tick*.001)
     row.update(c=f'{price:.3f}',h=str(price) if price>float(row['h']) else row['h'],v=str(int(row['v'])+self.tick),n=10+self.tick)
     self.put({'channel':'candle','data':row})
    elif sub['type']=='l2Book':
     data=dict(coin=sub['coin'],time=int(time.time()*1000),levels=[
      [dict(px=str(200-index),sz='2.5',n=2) for index in range(20)],
      [dict(px=str(202+index),sz='1.25',n=1) for index in range(20)],
     ])
     self.put({'channel':'l2Book','data':data})
    else:self.put({'channel':'trades','data':[dict(coin=sub['coin'],time=int(time.time()*1000),px=str(201+self.tick*.001),sz='0.1',tid=self.tick,side='B')]})
 async def close(self):
  if self.closed:return
  self.closed=True;self.producer.cancel();await asyncio.gather(self.producer,return_exceptions=True);self.put(None)
 def __aiter__(self):return self
 async def __anext__(self):
  value=await self.queue.get()
  if value is None:raise StopAsyncIteration
  return value
class FixtureConnector:
 def __init__(self,candle_count=100):self.sockets=[];self.candle_count=candle_count
 async def __call__(self):
  ws=FixtureSocket(self.candle_count);self.sockets.append(ws);return ws
