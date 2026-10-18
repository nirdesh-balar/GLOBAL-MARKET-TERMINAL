"""Synthetic official-schema fixtures; never used by production launcher."""
import time
from datetime import datetime,timezone
from app.providers.hyperliquid import INTERVALS,month_end
SPOT={'tokens':[{'index':0,'name':'USDC','szDecimals':8,'tokenId':'usdc'},{'index':1,'name':'PURR','szDecimals':0,'tokenId':'purr'},{'index':2,'name':'UBTC','szDecimals':5,'tokenId':'ubtc'}],'universe':[{'index':0,'name':'PURR/USDC','tokens':[1,0],'isCanonical':True},{'index':1,'name':'@1','tokens':[2,0],'isCanonical':True}]}
PERPS=[{'collateralToken':0,'universe':[{'name':'BTC','szDecimals':5},{'name':'PURR','szDecimals':0},{'name':'OLD','szDecimals':2,'isDelisted':True}]},{'collateralToken':0,'universe':[{'name':'flx:BTC','szDecimals':5},{'name':'flx:COIN','szDecimals':2},{'name':'flx:UNKNOWN','szDecimals':2}]}]
CATEGORIES=[['flx:BTC','crypto'],['flx:COIN','stocks']]
ANNOTATIONS=[[name,{'category':category}] for name,category in CATEGORIES]
def raw_candles(coin,interval,now=None,count=100):
 now=now or time.time();duration=INTERVALS[interval];rows=[]
 last=int(now//duration)*duration;times=[last-(count-1-i)*duration for i in range(count)]
 for i,t in enumerate(times):
  end=t+duration
  rows.append(dict(t=t*1000,T=end*1000-1,s=coin,i=interval,o=str(100+i),h=str(103+i),l=str(99+i),c=str(102+i),v=str(1000+i),n=10))
 return rows
class PublicFixture:
 def __init__(self):self.calls=[];self.fail=None
 def __call__(self,body):
  import copy
  self.calls.append(copy.deepcopy(body))
  if self.fail:raise self.fail
  kind=body['type'];metadata={'spotMeta':SPOT,'allPerpMetas':PERPS,'perpCategories':CATEGORIES,'perpConciseAnnotations':ANNOTATIONS}
  if kind in metadata:return copy.deepcopy(metadata[kind])
  req=body['req'];return [r for r in raw_candles(req['coin'],req['interval']) if r['t']<=req['endTime'] and r['T']>=req['startTime']]
