"""Bounded real public streaming soak of the actual packaged G backend.
No UI, no credentials, no earlier profile, no permanent candle files.
"""
import os,sys,json,time,tempfile,secrets,subprocess,urllib.request,urllib.error,math
from pathlib import Path
from datetime import datetime,timezone
repo=Path.cwd();result=repo/'test-results/stage67g-soak.json';progress=repo/'test-results/stage67g-soak-progress.json';duration=int(os.environ.get('IMT_G_SOAK_SECONDS','1800'));assert 1800<=duration<=3600
profile=Path(tempfile.mkdtemp(prefix='imt67g-soak-'));binary=repo/'release-stage67g/mac-arm64/Indian Market Terminal.app/Contents/Resources/backend/imt-backend';token=secrets.token_hex(32)
env={k:v for k,v in os.environ.items() if not k.startswith('IMT_')};env.update(IMT_DATA_DIR=str(profile),IMT_TOKEN=token,IMT_OFFLINE='1',PYTHONUNBUFFERED='1')
log=(profile/'backend-stderr.log').open('w');p=subprocess.Popen([str(binary)],cwd=profile,env=env,stdout=subprocess.PIPE,stderr=log,text=True,start_new_session=True);samples=[];observations=[];candles={};errors=[];reconnect_verified=False;port=None;started=None;ended=None
stamp=lambda:datetime.now(timezone.utc).isoformat()
def request(path,method='GET',body=None):
 r=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
 try:
  with urllib.request.urlopen(r,timeout=90)as response:return json.load(response)
 except urllib.error.HTTPError as e:raise RuntimeError(str(e.code)+' '+e.read().decode()[:1000])from None
def save(state):
 value=json.dumps(dict(state=state,profile=str(profile),pid=p.pid,started_utc=started,elapsed_seconds=round(time.monotonic()-begin,1)if started else 0,samples=len(samples),last=samples[-1]if samples else None),indent=2)
 try:
  temp=progress.with_suffix('.pending');temp.write_text(value);temp.replace(progress)
 except OSError as e:
  print('Progress persistence unavailable; continuing bounded in-memory observation: '+str(e),flush=True)

def resource():
 text=subprocess.check_output(['ps','-p',str(p.pid),'-o','%cpu=,rss='],text=True).strip().split();return dict(cpu_percent=float(text[0]),rss_mib=int(text[1])/1024)
def validate(feed):
 c=feed.get('candle')
 if not c:return
 values=[c[k]for k in ['open','high','low','close']];assert all(math.isfinite(v)for v in values);assert c['high']>=max(values)and c['low']<=min(values);assert c['volume']is None or math.isfinite(c['volume'])and c['volume']>=0
 assert c['time']<=time.time()+1 and c.get('end_time',c['time'])>c['time'];old=candles.get(feed['key']);assert old is None or c['time']>=old,'Candle time must not regress'
 candles[feed['key']]=c['time']
try:
 ready=json.loads(p.stdout.readline());port=ready['port']
 for _ in range(100):
  try:request('/health');break
  except Exception:time.sleep(.2)
 catalogue=request('/api/hyperliquid/catalogue');rows=request('/api/instruments/discover?category=crypto&q=BTC&limit=200')['results'];btc=next(r for r in rows if r['native_id']=='BTC'and r['market_type']=='perpetual');spot=next(r for r in rows if r['base_asset']=='UBTC'and r['market_type']=='spot');markets=[btc,spot]
 request('/api/refresh/preferences','PUT',dict(startup_quotes=False,watchlist_interval=0,chart_interval=900))
 plan=[]
 for owner,row,feed,interval in [('chart:g0',btc,'candle','1m'),('chart:g1',btc,'candle','1m'),('chart:g2',spot,'candle','1m'),('watchlist:g-soak',btc,'trades',''),('watchlist:g-soak',spot,'trades','')]:plan.append(dict(owner=owner,identity=row['canonical_id'],native_mapping=row['native_mapping'],feed=feed,interval=interval))
 request('/api/streams/consumers','PUT',dict(consumers=plan))
 for mode in ['live_price','candles']:request('/api/alerts','POST',dict(name='G isolated soak '+mode,instrument=btc['canonical_id'],interval='1m',evaluation=mode,repeat='once',conditions=dict(type='group',op='and',children=[dict(type='condition',kind='close_below',params=dict(value=.00000001,currency=btc['quote_asset']))])))
 deadline=time.monotonic()+180
 while True:
  event=request('/api/streams/events?cursor=0&wait=0');status=event['status']
  if len(event['feeds'])==4 and all(f['state']=='live'for f in event['feeds'])and status['consumers']==7:break
  assert time.monotonic()<deadline,'Initial verified feeds did not become live';time.sleep(2)
 assert status['connection_count']==1 and status['subscriptions']==4
 begin=time.monotonic();started=stamp();initial=status;save('running');print('G SOAK START '+started,flush=True)
 while time.monotonic()-begin<duration:
  event=request('/api/streams/events?cursor=0&wait=0');status=event['status'];elapsed=time.monotonic()-begin
  assert status['connection_count']<=1 and status['subscriptions']==4 and status['consumers']==7
  for f in event['feeds']:validate(f)
  sample=dict(utc=stamp(),elapsed_seconds=round(elapsed,2),resources=resource(),streams=status,feeds=[{k:f.get(k)for k in ['key','state','received_at','market_time','refs','error']}for f in event['feeds']]);samples.append(sample);save('running')
  if elapsed>=duration/2 and not reconnect_verified:
   before=status['generation'];request('/api/streams/lifecycle','POST',dict(suspended=True));off=request('/api/streams/status');assert off['paused'];observations.append(dict(utc=stamp(),kind='controlled_backend_suspend',status=off));time.sleep(3);request('/api/streams/lifecycle','POST',dict(suspended=False));limit=time.monotonic()+120
   while True:
    resumed=request('/api/streams/events?cursor=0&wait=0')
    if resumed['status']['generation']>before and all(f['state']=='live'for f in resumed['feeds']):break
    assert time.monotonic()<limit,'Controlled reconnect did not recover';time.sleep(2)
   assert resumed['status']['connection_count']==1;observations.append(dict(utc=stamp(),kind='real_socket_reconnect_after_simulated_suspend',status=resumed['status']));reconnect_verified=True
  time.sleep(min(10,max(.01,duration-(time.monotonic()-begin))))
 ended=stamp();final=request('/api/streams/status');assert final['metrics']['received']>initial['metrics']['received']and final['metrics']['candle_appends']>initial['metrics']['candle_appends'];assert reconnect_verified
 alerts=request('/api/alerts');assert len(alerts['alerts'])==2;assert all(r['monitoring']=='shared_public_stream'for r in alerts['alerts']);assert not request('/api/alerts/history'),'False threshold must not create a notification'
 request('/api/streams/consumers','PUT',dict(consumers=[]));settings=request('/api/alerts/settings');request('/api/alerts/settings','PUT',{**settings,'paused':True});time.sleep(.5);released=request('/api/streams/status');assert released['subscriptions']==0
 request('/api/streams/lifecycle','POST',dict(suspended=True));assert request('/api/streams/status')['connection_count']==0
 print('G SOAK END '+ended,flush=True)
except Exception as e:errors.append(repr(e));raise
finally:
 if started:
  try:save('failed'if errors else'complete')
  except Exception as e:print('Progress recording failed: '+repr(e),flush=True)
 import signal
 os.killpg(p.pid,signal.SIGTERM)
 try:p.wait(timeout=30)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait();errors.append('Packaged test backend needed forced cleanup')
 log.close();value=dict(profile=str(profile),packaged_backend=str(binary),started_utc=started,ended_utc=ended,target_seconds=duration,actual_seconds=round((datetime.fromisoformat(ended)-datetime.fromisoformat(started)).total_seconds(),2)if started and ended else 0,backend_only=True,physical_sleep_wake=False,simulated_suspend_real_socket_reconnect=reconnect_verified,identities=[{k:r[k]for k in ['canonical_id','native_id','market_type','provider']}for r in locals().get('markets',[])],catalogue=locals().get('catalogue'),samples=samples,observations=observations,initial=locals().get('initial'),final=locals().get('final'),released=locals().get('released'),stderr=(profile/'backend-stderr.log').read_text()[-3000:],shutdown_returncode=p.returncode,errors=errors,child_process_exited=p.poll()is not None)
 result.write_text(json.dumps(value,indent=2));assert not errors,errors
