import asyncio,sys,time,json,resource,tempfile,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from app.main import create_app
from app.alert_models import AlertDefinition
from app.screener_conditions import ConditionGroup,Condition,ScreenConfig
from app.indicators import IndicatorCalculator
async def main():
 app=create_app(tempfile.mkdtemp(prefix='imt67d-real-'),'analysis-token-'+'x'*48);h=app.state.history;m=app.state.streams;e=app.state.alerts;reg=app.state.registry;await reg.hyperliquid.ensure(force=True)
 rows=reg.hyperliquid.candidates();btc=next(r for r in rows if r['native_id']=='BTC' and r['market_type']=='perpetual');spot=next(r for r in rows if r['base_asset']=='UBTC' and r['market_type']=='spot');start=time.monotonic();cpu=resource.getrusage(resource.RUSAGE_SELF);definitions=[]
 for sec in [btc,spot]:
  await h.get(sec,'1m');definitions.append(e.store.save(AlertDefinition(instrument=sec['canonical_id'],interval='1m',evaluation='live_price',repeat='once',name='Real public price verification',conditions=ConditionGroup(children=[Condition(kind='close_above',params={'value':0.01,'currency':sec['currency']})]))))
  definitions.append(e.store.save(AlertDefinition(instrument=sec['canonical_id'],interval='1m',repeat='candle',name='Real completed-candle RSI verification',conditions=ConditionGroup(children=[Condition(kind='rsi_above',params={'value':0})]))))
 await m.plan([dict(owner='chart:0',identity=btc['canonical_id'],feed='candle',interval='1m'),dict(owner='chart:1',identity=spot['canonical_id'],feed='candle',interval='1m')]);e.start();cursor=0;samples=[];timings=[];closed=False
 configs=[dict(id=k,kind=k,visible=True) for k in ['SMA','EMA','WMA','VWMA','RSI','MACD','STOCHRSI','BB','ATR','SUPERTREND','VWAP']]
 while time.monotonic()-start<180:
  events=await m.events(cursor,2);cursor=events['cursor'];elapsed=time.monotonic()-start
  if not samples or elapsed-samples[-1]['elapsed']>15:
   rss=int(subprocess.check_output(['ps','-o','rss=','-p',str(os.getpid())],text=True).strip())*1024;samples.append(dict(elapsed=elapsed,rss=rss,cache_bytes=h.cache.bytes,subscriptions=len(m.feeds),queue=len(e.live.queue)))
   for sec in [btc,spot]:
    data=await h.get(sec,'1m');t=time.perf_counter();result=await asyncio.to_thread(IndicatorCalculator.calculate,data['candles'],configs,'1m','UTC');timings.append(dict(instrument=sec['canonical_id'],milliseconds=(time.perf_counter()-t)*1000,valid_series=sum(any(p['value'] is not None for p in s['points']) for s in result['series']),series=len(result['series'])))
  if not closed and elapsed>85 and m.socket:await m.socket.close();closed=True
 final=m.status();signals=e.store.history();runtime=e.store.list();settings=e.status();await e.close();await m.plan([]);await asyncio.sleep(.5);await m.close();await h.close();end=resource.getrusage(resource.RUSAGE_SELF)
 report=dict(real_public=True,elapsed=time.monotonic()-start,identities=[{k:r[k] for k in ['canonical_id','native_id','market_type']} for r in [btc,spot]],signals=signals,runtime=runtime,streams=final,alerts=settings,memory_samples=samples,indicator_samples=timings,cpu_seconds=end.ru_utime+end.ru_stime-cpu.ru_utime-cpu.ru_stime,max_rss=end.ru_maxrss,yahoo_operations=h.metrics['provider_requests'],controlled_reconnect=closed,closed_status=m.status(),native_notifications_attempted=False)
 (root/'test-results/stage67d-real-analysis-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['signals','runtime','memory_samples','indicator_samples']},indent=2));assert any(s['payload'].get('event_type')=='live_price' for s in signals);assert any(s['payload'].get('completed') for s in signals);assert report['yahoo_operations']==0
asyncio.run(main())
