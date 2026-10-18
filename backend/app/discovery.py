"""Bounded, single-flight Yahoo search sharing history's rate/concurrency gate."""
import asyncio
import time
from collections import OrderedDict
import yfinance as yf
from yfinance.exceptions import YFRateLimitError
from .providers.base import ProviderError
from .market_router import selectable
class DiscoveryService:
    def __init__(self,registry,history):
        self.registry,self.history=registry,history;self.cache=OrderedDict();self.inflight={}
    def remote(self,q):
        return yf.Search(q,max_results=40,news_count=0,lists_count=0,recommended=0,include_cb=False,timeout=15).quotes
    async def download(self,q):
        try:
            async with self.history.budget.slot(0):
                await self.history.throttle()
                self.history.metrics['search_requests']+=1
                try:quotes=await asyncio.to_thread(self.remote,q)
                except YFRateLimitError:
                    self.history.cooldown=time.monotonic()+60
                    raise ProviderError('Yahoo search is throttled. Wait 60 seconds before retrying.','rate',60) from None
                except Exception:raise ProviderError('Yahoo search is unavailable. Cached instruments and the official NSE directory remain searchable.','temporary') from None
                rows=self.registry.discover(quotes)
                self.cache[q]=(time.monotonic(),rows);self.cache.move_to_end(q)
                while len(self.cache)>64:self.cache.popitem(last=False)
                return rows
        finally:self.inflight.pop(q,None)
    async def search(self,q,category='',exchange='',country='',limit=60,offset=0):
        q=q.strip()[:160];warning='';remote=[]
        catalogue=getattr(self.registry,'hyperliquid',None)
        crypto_filter=category in ('crypto','crypto_spot','crypto_perpetual')
        if catalogue and (crypto_filter or not category):
            try:await catalogue.ensure()
            except ProviderError as e:warning=str(e)
            if crypto_filter:
                rows=[r for r in self.registry.search(q,40000,category,exchange,country) if r.get('provider')=='hyperliquid']
                return dict(results=rows[offset:offset+limit],total=len(rows),next_offset=offset+limit if offset+limit<len(rows) else None,warning=warning,scope='Official Hyperliquid metadata; spot and perpetual markets are distinct',catalogue=catalogue.status())
        if crypto_filter:
            if catalogue:return dict(results=self.registry.search(q,limit,category,exchange,country),warning=warning,scope='Official Hyperliquid catalogue',catalogue=catalogue.status())
            return dict(results=self.registry.search(q,limit,category,exchange,country),warning='Hyperliquid discovery pending; legacy crypto requires migration. Yahoo crypto discovery is disabled.',scope='Hyperliquid metadata unavailable')
        if q:
            cached=self.cache.get(q.casefold())
            try:
                if cached and time.monotonic()-cached[0]<300:remote=cached[1]
                else:
                    key=q.casefold()
                    if key not in self.inflight:
                        task=asyncio.create_task(self.download(key));self.inflight[key]=task
                        task.add_done_callback(lambda t:t.exception() if not t.cancelled() else None)
                    remote=await asyncio.shield(self.inflight[key])
            except ProviderError as e:warning=str(e)
        local=self.registry.search(q,200,category,exchange,country)
        # Yahoo may match a name synonym absent in quote text. Apply filters, not query again.
        rows={r['canonical_id']:r for r in local}
        for r in remote:
            if selectable(r) and (not category or r['category']==category) and (not exchange or exchange.casefold() in r['exchange'].casefold()) and (not country or country.casefold() in r['country'].casefold()):rows.setdefault(r['canonical_id'],r)
        return dict(results=list(rows.values())[:limit],warning=warning,scope='Official NSE directory + cached metadata + Yahoo search; no complete global universe claim')
    async def close(self):
        for t in list(self.inflight.values()):t.cancel()
        await asyncio.gather(*list(self.inflight.values()),return_exceptions=True)
        self.cache.clear()
