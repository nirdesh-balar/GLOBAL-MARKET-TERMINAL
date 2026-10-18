import json,socket,sys,time,os
from pathlib import Path
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
import uvicorn
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.main import create_app
from app.parent_lifetime import watch_parent
from app.history import aggregate_daily
from app.providers.base import History,ProviderError
from fixtures import FixtureProvider
class UIFixture(FixtureProvider):
 def fetch_quote(self,security):
  result=self.fetch(security,'1d');result.candles=result.candles[-5:];return result
 def fetch_recent(self,security,interval):
  result=self.fetch(security,interval);result.candles=result.candles[-10:]
  if os.environ.get('IMT_REFRESH_UI')=='1' and result.candles:
   last=result.candles[-1];step={'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'1w':7*86400,'1M':32*86400}.get(interval,86400)
   result.candles[-1]=dict(last,close=last['close']+.1)
   next_time=last['time']+step
   if interval in ('1m','5m','15m','30m','1h') and security.get('exchange') in ('NSE','BSE'):
    zone=ZoneInfo(security.get('timezone','Asia/Kolkata'));stamp=datetime.fromtimestamp(next_time,zone)
    if stamp.hour*60+stamp.minute>=930:
     day=stamp.date()+timedelta(days=1)
     while day.weekday()>4:day+=timedelta(days=1)
     next_time=int((datetime.combine(day,datetime.min.time(),zone)+timedelta(hours=9,minutes=15)).timestamp())
   result.candles.append(dict(last,time=next_time))
  return result
 def fetch(self,security,interval):
  self.calls+=1;time.sleep(.12)
  if security['base_symbol']=='RKFAL':raise ProviderError('Yahoo has no available history. TEST FIXTURE error for manual NSE fallback.','missing')
  rows=self.rows;periods=[]
  if os.environ.get('IMT_E3B_UI')=='1':
   from custom_ui_fixtures import daily_rows
   rows=daily_rows(security)
  if interval in ('1w','1M'):rows=aggregate_daily(rows,interval)
  if interval in ('1m','5m','15m','30m','1h'):
   rows=[];minutes={'1m':1,'5m':5,'15m':15,'30m':30,'1h':60}[interval]
   zone=ZoneInfo(security.get('timezone','Asia/Kolkata'));now=datetime.now(zone)
   kind=security.get('kind','equity');start=(0,0) if kind=='crypto' else (9,30) if security.get('country')=='United States' and kind not in ('future','forex') else (9,15)
   length=1440 if kind in ('crypto','forex','future') else 390 if start==(9,30) else 375
   for ago in range(6,0,-1):
    day=(now-timedelta(days=ago)).date()
    if day.weekday()>4 and kind!='crypto':continue
    opening=datetime.combine(day,datetime.min.time(),zone)+timedelta(hours=start[0],minutes=start[1])
    if kind in ('future','forex'):periods.append(dict(start=int(opening.timestamp()),end=int((opening+timedelta(minutes=length)).timestamp())))
    for minute in range(0,length,minutes):
     value=100+minute*.01;rows.append(dict(time=int((opening+timedelta(minutes=minute)).timestamp()),open=value,high=value+2,low=value-1,close=value+1,volume=100.,adj_close=value+1))
  if security.get('kind') in ('index','forex'):rows=[dict(r,volume=None) for r in rows]
  periods={'regular':[periods]} if periods else None
  return History(rows,self.name,notice='Synthetic fixture for offline UI tests only.',interval=interval,metadata=dict(timezone=security.get('timezone','Asia/Kolkata'),currency=security.get('currency','INR'),precision=security.get('precision',2)),trading_periods=periods)

class AlertUIFixture(UIFixture):
 def __init__(self,clock):super().__init__(count=8000);self.clock=clock
 def fetch(self,security,interval):
  if interval!='1m':return super().fetch(security,interval)
  self.calls+=1;now=self.clock();last=int(now//60)*60-60
  data=[]
  for i in range(400):
   t=last-(399-i)*60;price=100+(t//60)%2*10
   data.append(dict(time=t,open=price,high=price+2,low=price-1,close=price+1,volume=100+i,adj_close=price+1))
  return History(data,self.name,notice='Controlled accelerated synthetic alert test candles. Never packaged.',interval='1m',fetched_at=now,metadata=dict(timezone=security.get('timezone','UTC'),currency=security.get('currency','USD')))

if __name__=='__main__':
 sock=socket.socket(socket.AF_INET,socket.SOCK_STREAM);sock.bind(('127.0.0.1',0));sock.listen(128)
 print(json.dumps({'ready':True,'port':sock.getsockname()[1]}),flush=True)
 start=time.monotonic();base=time.time();clock=lambda:base+(time.monotonic()-start)*30
 hyper_client=None
 if os.environ.get('IMT_HYPERLIQUID_UI')=='1':
  from app.providers.hyperliquid import HyperliquidClient
  from app.request_budget import RequestBudget
  from hyperliquid_fixtures import PublicFixture
  hyper_client=HyperliquidClient(RequestBudget(2),PublicFixture(),min_interval=0,weight_limit=100000)
 stream_connector=None
 if os.environ.get('IMT_STREAM_UI')=='1':
  from stream_fixtures import FixtureConnector
  stream_connector=FixtureConnector()
 app=create_app(stream_connector=stream_connector,hyperliquid_client=hyper_client,provider=AlertUIFixture(clock) if os.environ.get('IMT_ALERT_UI')=='1' else UIFixture(count=8000))
 if os.environ.get('IMT_ALERT_UI')=='1':
  app.state.alerts.clock=clock;app.state.alerts.started=clock();app.state.history.config['min_interval']=0
 if os.environ.get('IMT_FAST_SCREENER_UI')=='1' or os.environ.get('IMT_REFRESH_UI')=='1':app.state.history.config['min_interval']=0 # Synthetic provider only; packaged launcher never imports this file.
 # Older regression scenarios explicitly simulate a pre-cleanup saved profile.
 if app.state.db.get('workspace') is None:
  from app.main import restore_workspace
  from app.markets import samples,entry
  saved=restore_workspace(app.state.db,app.state.registry)
  next(w for w in saved['watchlists'] if w['id']=='crypto')['items']=[entry(r) for r in samples() if r['kind']=='crypto']
  app.state.db.put('workspace',saved)
 if os.environ.get('IMT_E3B_UI')=='1':
  app.state.discovery.remote=lambda q:[dict(symbol='^INDIAVIX',longname='INDIA VIX · controlled fixture',exchange='NSI',quoteType='INDEX',currency='INR')] if 'vix' in q.casefold() else []
 else:app.state.discovery.remote=lambda q:[dict(symbol='BTC',longname='Synthetic Bitcoin ETF',exchange='PCX',quoteType='ETF',currency='USD'),dict(symbol='BTC-USD',exchange='CCC',quoteType='CRYPTOCURRENCY')] if os.environ.get('IMT_CLEANUP_UI')=='1' and q.casefold()=='btc' else [] # Explicit synthetic metadata; never packaged.
 server=uvicorn.Server(uvicorn.Config(app,log_level='warning',access_log=False,timeout_graceful_shutdown=5));watch_parent(server);server.run(sockets=[sock])
