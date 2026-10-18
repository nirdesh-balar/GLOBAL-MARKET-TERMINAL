"""Bounded real-provider E1 verification. Only isolated profile metadata persists."""
import asyncio,json,sys,tempfile,time,math,resource
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from app.main import create_app
from app.indicators import IndicatorCalculator
from app.trend_indicators import KINDS
from app.markets import instrument
from app.providers.base import ProviderError

async def main():
    app=create_app(tempfile.mkdtemp(prefix='imt67e1-real-'),'e1-reference-'+'x'*48);h=app.state.history;m=app.state.streams;reg=app.state.registry;report={'real_data':True,'histories':[],'live_samples':[],'errors':[]};configs=[dict(id=k,kind=k,reversal=.1) for k in KINDS]
    # Instrumented adapter boundaries detect cross-provider requests during this run.
    yahoo_calls=[];hl_calls=[];yf=h.provider.fetch;hf=h.hyperliquid.fetch
    def yahoo(sec,*args,**kw):
        assert sec['kind']!='crypto';yahoo_calls.append(sec['canonical_id']);return yf(sec,*args,**kw)
    async def hyper(sec,*args,**kw):
        assert sec['kind']=='crypto' and sec['provider']=='hyperliquid';hl_calls.append(sec['canonical_id']);return await hf(sec,*args,**kw)
    h.provider.fetch=yahoo;h.hyperliquid.fetch=hyper
    def check(data,sec,interval):
        r=data['candles'][-5000:];start=time.perf_counter();out=IndicatorCalculator.calculate(r,configs,interval,sec['timezone']);elapsed=(time.perf_counter()-start)*1000
        valid={k:sum(p['value'] is not None for s in out['series'] if s['id']==k for p in s['points']) for k in KINDS}
        assert all(p['value'] is None or math.isfinite(p['value']) for s in out['series'] for p in s['points'])
        assert all([p['time'] for p in s['points']]==[v['time'] for v in r] for s in out['series'])
        return dict(canonical_id=sec['canonical_id'],native_id=sec.get('native_id'),interval=interval,source=data['source'],bars=len(r),first=r[0]['time'],last=r[-1]['time'],valid_points=valid,insufficient_studies=[k for k,v in valid.items() if not v],calculation_ms=elapsed)
    try:
        await reg.hyperliquid.ensure(force=True);catalogue=reg.hyperliquid.candidates();btc=next(r for r in catalogue if r['native_id']=='BTC' and r['market_type']=='perpetual');spot=next(r for r in catalogue if r['base_asset']=='UBTC' and r['market_type']=='spot');report['official_catalogue']=reg.hyperliquid.status();report['verified_crypto']=[{k:s.get(k) for k in ['canonical_id','native_id','market_type','verified_at']} for s in [btc,spot]]
        for sec in [btc,spot]:
            for interval in ['1m','5m','15m','30m','1h','4h','1d','1w','1M']:
                try:
                    report['histories'].append(check(await h.get(sec,interval),sec,interval))
                    await asyncio.sleep(13)
                except (ProviderError,AssertionError) as e:report['errors'].append(dict(instrument=sec['canonical_id'],interval=interval,error=str(e)))
        for symbol in ['RELIANCE','AAPL','^GSPC','EURUSD=X','GC=F','500325.BO']:
            sec=reg.resolve(symbol)
            if not sec:
                found=await app.state.discovery.search(symbol)
                sec=next((s for s in found['results'] if s.get('yahoo_symbol')==symbol),None)
            if not sec:report['errors'].append(dict(instrument=symbol,error='No verified/resolved Yahoo instrument'));continue
            try:report['histories'].append(check(await h.get(sec,'1d'),sec,'1d'))
            except (ProviderError,AssertionError) as e:report['errors'].append(dict(instrument=symbol,error=str(e)))
        baseline=len(yahoo_calls);await m.plan([dict(owner='chart:0',identity=btc['canonical_id'],feed='candle',interval='1m'),dict(owner='chart:1',identity=spot['canonical_id'],feed='candle',interval='1m')]);cursor=0;start=time.monotonic();cpu=time.process_time();last={};revisions={btc['canonical_id']:0,spot['canonical_id']:0}
        while time.monotonic()-start<90:
            events=await m.events(cursor,2);cursor=events['cursor']
            for frame in events['feeds']:
                if not frame.get('candle'):continue
                key=frame['identity'];candle=frame['candle'];prior=last.get(key)
                if prior and prior!=candle:revisions[key]+=1
                last[key]=candle
            if len(report['live_samples'])<6 and time.monotonic()-start>15*(len(report['live_samples'])//2):
                for sec in [btc,spot]:
                    d=await h.get(sec,'1m');sample=check(d,sec,'1m');sample['elapsed']=time.monotonic()-start;report['live_samples'].append(sample)
        assert len(yahoo_calls)==baseline,'Live crypto must not touch Yahoo'
        report.update(live_seconds=time.monotonic()-start,live_revisions=revisions,streams=m.status(),live_cpu_seconds=time.process_time()-cpu,peak_rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,yahoo_calls=yahoo_calls,hyperliquid_calls=hl_calls,provider_isolation=True)
    finally:
        await m.close();await h.close();(root/'test-results/stage67e1-real.json').write_text(json.dumps(report,indent=2))
    assert all(any(r['canonical_id']==s['canonical_id'] and r['interval']=='1m' for r in report['histories']) for s in [btc,spot])
    assert any('RELIANCE.NS' in r['canonical_id'] for r in report['histories']);assert any('AAPL' in r['canonical_id'] for r in report['histories'])
    assert all(v>0 for v in report['live_revisions'].values()),report['live_revisions']
    print(json.dumps(dict(histories=len(report['histories']),live_samples=len(report['live_samples']),errors=report['errors'],live_revisions=report['live_revisions'],provider_isolation=True),indent=2))
asyncio.run(main())
