"""Synthetic public-schema socket used only by tests, never production launcher."""
import asyncio,json,time,os
from hyperliquid_fixtures import raw_candles
class FixtureSocket:
 def __init__(self):
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
     row=raw_candles(sub['coin'],sub['interval'])[-1];price=201+min(.8,self.tick*.001);row.update(c=f'{price:.3f}',h=str(max(202,price)),v=str(1099+self.tick),n=10+self.tick);self.put({'channel':'candle','data':row})
    else:self.put({'channel':'trades','data':[dict(coin=sub['coin'],time=int(time.time()*1000),px=str(201+self.tick*.001),sz='0.1',tid=self.tick)]})
 async def close(self):
  if self.closed:return
  self.closed=True;self.producer.cancel();await asyncio.gather(self.producer,return_exceptions=True);self.put(None)
 def __aiter__(self):return self
 async def __anext__(self):
  value=await self.queue.get()
  if value is None:raise StopAsyncIteration
  return value
class FixtureConnector:
 def __init__(self):self.sockets=[]
 async def __call__(self):
  ws=FixtureSocket();self.sockets.append(ws);return ws
