"""Bounded public metadata discovery only; no candle database or user profiles."""
import sys,os,asyncio,tempfile,json,time
from pathlib import Path
sys.path.insert(0,str(Path.cwd()/'backend'));os.environ['IMT_OFFLINE']='1'
from app.main import create_app
from app.providers.base import ProviderError
PLAN=[('NIFTY 50','^NSEI'),('BANK NIFTY','^NSEBANK'),('NSE equity','RELIANCE.NS'),('NSE equity','TCS.NS'),('NSE equity','HDFCBANK.NS'),('BSE equity','TCS.BO'),('US equity','AAPL'),('US equity','MSFT'),('US equity','NVDA'),('US index','^GSPC'),('US index','^IXIC'),('Global equity','7203.T'),('Global index','^FTSE'),('Forex','EURUSD=X'),('Forex','GBPUSD=X'),('Commodity','GC=F'),('Commodity','CL=F'),('ETF','SPY'),('Crypto-related ETF','IBIT'),('India VIX','^INDIAVIX'),('Screenshot index','^SPCMCFU')]
async def main():
 profile=Path(tempfile.mkdtemp(prefix='imt67g1-market-'));app=create_app(profile,'g1-market-discovery-'+'x'*48);db=app.state.db;db.put('refresh_preferences',dict(startup_quotes=False,watchlist_interval=0,chart_interval=900));results=[]
 try:
  for category,symbol in PLAN:
   start=time.monotonic()
   try:
    rows=await app.state.discovery.download(symbol);row=next((r for r in rows if r['yahoo_symbol'].upper()==symbol.upper()),None)
    if not row:results.append(dict(category=category,query=symbol,search_resolved=False,reason='Current Yahoo search did not return this exact ticker'))
    else:results.append(dict(category=category,query=symbol,search_resolved=True,identity=row,metadata_seconds=time.monotonic()-start))
   except ProviderError as e:
    results.append(dict(category=category,query=symbol,search_resolved=False,error=e.structured()))
    if e.kind=='rate':break # Do not drive into a provider limit.
   print(category,symbol,results[-1]['search_resolved'],flush=True)
  catalog=app.state.history.hyperliquid.catalogue;await catalog.ensure();rows=catalog.candidates()
  for category,kind,bases in [('BTC perpetual','perpetual',['BTC']),('ETH perpetual','perpetual',['ETH']),('BTC-related spot','spot',['UBTC','BTC','WBTC']),('ETH-related spot','spot',['UETH','ETH','WETH'])]:
   row=next((r for r in rows if r['market_type']==kind and r.get('base_asset')in bases and (kind=='perpetual'or r.get('quote_asset')=='USDC')),None)
   results.append(dict(category=category,query='/'.join(bases),search_resolved=row is not None,identity=row,reason=None if row else'No matching active market in current official Hyperliquid metadata'))
  value=dict(profile=str(profile),metadata_only=True,real_current_discovery=True,results=results,catalogue=catalog.status(),history_provider_requests=app.state.history.metrics['provider_requests'],created_utc=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat())
  Path('test-results/stage7-market-discovery.json').write_text(json.dumps(value,indent=2));assert value['history_provider_requests']==0;print('Discovery complete:',len(results),'entries; histories not requested',flush=True)
 finally:
  await app.state.discovery.close();await app.state.streams.close();await app.state.history.close()
asyncio.run(main())
