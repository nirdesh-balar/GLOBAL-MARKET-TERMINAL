import asyncio,socket,ssl,time
from types import SimpleNamespace
from unittest.mock import patch
from email.utils import formatdate
import pytest
from functools import wraps
def run_async(fn):
 @wraps(fn)
 def run(*args,**kwargs):return asyncio.run(fn(*args,**kwargs))
 return run
from app.providers.base import ProviderError,History
from app.providers.yahoo_errors import classify,retry_after
from app.providers.yahoo import YahooFinanceProvider,observed_request,_TRANSPORT
from app.history import HistoryService,MemoryCache
from fixtures import FixtureProvider,candles
from test_direct_history import frame

SEC={'symbol':'AAPL','yahoo_symbol':'AAPL','kind':'equity','provider':'yahoo','canonical_id':'yahoo:AAPL:NASDAQ:equity','native_id':'AAPL','exchange':'NASDAQ','timezone':'America/New_York'}
@pytest.mark.parametrize('error,code,retry',[(socket.gaierror('private'),'dns',True),(ConnectionRefusedError('private'),'connection',True),(TimeoutError('private'),'timeout',True),(ssl.SSLError('private'),'tls',False),(KeyError('private'),'application',False)])
def test_precise_redacted_errors(error,code,retry):
 e=classify(error);assert e.code==code and e.retryable==retry and 'private'not in str(e)

@pytest.mark.parametrize('status,code,kind',[(429,'rate_limited','rate'),(403,'access_denied','access'),(404,'unavailable_symbol','missing'),(500,'provider_failure','temporary'),(503,'provider_failure','temporary'),(422,'unsupported_request','source')])
def test_http_classification(status,code,kind):
 e=RuntimeError('private');e.response=SimpleNamespace(status_code=status,headers={'Retry-After':'81'});result=classify(e)
 assert(result.code,result.kind,result.http_status)==(code,kind,status)
 if status in(429,500,503):assert result.retry_after==81

def test_retry_after_date_and_invalid():
 assert retry_after(formatdate(1_800_000_123,usegmt=True),now=1_800_000_000)==123
 assert retry_after('nonsense')==60 and retry_after('-2')==1

def test_transport_stops_first_429(monkeypatch):
 from app.providers import yahoo
 calls=[]
 def make(self,url,request_method,*args):
  # A second attempt here would mimic yfinance's cookie retry. It must not run.
  r=request_method(url=url,timeout=20);request_method(url=url,timeout=20);return r
 def request(**kw):calls.append(kw);return SimpleNamespace(status_code=429,headers={'Retry-After':'137'})
 monkeypatch.setattr(yahoo,'_MAKE_REQUEST',make);_TRANSPORT.context={'deadline':time.monotonic()+30,'events':[]}
 try:
  with pytest.raises(ProviderError)as e:observed_request(None,'https://query2.finance.yahoo.com/v8/finance/chart/AAPL',request)
  assert len(calls)==1 and e.value.retry_after==137 and e.value.code=='rate_limited'
 finally:del _TRANSPORT.context

def test_actual_screenshot_range_regression(monkeypatch):
 from app.providers import yahoo
 from yfinance.exceptions import YFInvalidPeriodError
 calls=[]
 class Ticker:
  def __init__(self,symbol):assert symbol=='^SPCMCFU';self._price_history=SimpleNamespace(_history_metadata={'validRanges':['1d','5d'],'currency':'USD','exchangeTimezoneName':'America/New_York'})
  def history(self,**kw):
   calls.append(kw)
   if kw['period']=='max':raise YFInvalidPeriodError('^SPCMCFU','max','1d, 5d')
   return frame()
 monkeypatch.setattr(yahoo.yf,'Ticker',Ticker);monkeypatch.setattr(yahoo.time,'sleep',lambda _:None)
 h=YahooFinanceProvider().fetch({**SEC,'symbol':'^SPCMCFU','yahoo_symbol':'^SPCMCFU','native_id':'^SPCMCFU','kind':'index','exchange':'SNP','canonical_id':'yahoo:%5ESPCMCFU:SNP:index'},'1w')
 assert [r['period']for r in calls]==['max','5d']and all(r['interval']=='1wk'for r in calls)
 assert h.candles and 'largest advertised range (5d)'in h.notice and h.metadata['actual_period']=='5d'

@pytest.mark.parametrize('symbol',['','%5EGSPC','AAPL\n','AAPL secret'])
def test_invalid_native_ticker_never_network(symbol):
 with patch('app.providers.yahoo.yf.Ticker')as t:
  with pytest.raises(ProviderError)as e:YahooFinanceProvider().fetch({**SEC,'yahoo_symbol':symbol},'1d')
  assert e.value.code=='invalid_symbol';t.assert_not_called()

def test_no_history_is_not_delisting(monkeypatch):
 from yfinance.exceptions import YFPricesMissingError
 with patch('app.providers.yahoo.yf.Ticker')as t:
  t.return_value.history.side_effect=YFPricesMissingError('AAPL','possibly delisted')
  with pytest.raises(ProviderError)as e:YahooFinanceProvider().fetch(SEC,'1d')
  assert e.value.code=='no_history'

def test_stale_retention_is_bounded_and_yahoo_only():
 clock=[0];c=MemoryCache(capacity=1,ttl=1,stale_ttl=5,clock=lambda:clock[0],stale_filter=lambda k:k[0]=='yahoo')
 h=History(candles(3),'YAHOO FINANCE');c.put(('yahoo','A'),h);clock[0]=2
 assert c.get(('yahoo','A'))is None and c.peek_stale(('yahoo','A'))is h
 c.put(('hyperliquid','BTC'),h);assert c.peek_stale(('yahoo','A'))is None
 clock[0]=4;assert c.get(('hyperliquid','BTC'))is None and not c.entries

@run_async
async def test_stale_validated_history_retained_with_original_time():
 class P(FixtureProvider):
  def fetch_daily(self,s):
   self.calls+=1
   if self.calls>1:raise ProviderError('Network interrupted','temporary',code='connection',retryable=False)
   return History(candles(20),'YAHOO FINANCE',fetched_at=100)
 p=P();s=HistoryService(p,{'min_interval':0});first=await s.get(SEC);failed=await s.get(SEC,force=True)
 assert failed['stale']and failed['cached']and failed['fetched_at']==100 and failed['candles']==first['candles']
 assert failed['provider_error']['code']=='connection';await s.close()

@run_async
async def test_missing_never_substitutes_cached_history():
 class P(FixtureProvider):
  def fetch_daily(self,s):
   self.calls+=1
   if self.calls>1:raise ProviderError('No candles','missing')
   return History(candles(4),'YAHOO FINANCE')
 s=HistoryService(P(),{'min_interval':0});await s.get(SEC)
 with pytest.raises(ProviderError):await s.get(SEC,force=True)
 await s.close()

@run_async
async def test_shared_deadline_keeps_worker_slot_until_finish():
 import threading
 event=threading.Event()
 class P(FixtureProvider):
  def fetch_daily(self,security):self.calls+=1;event.wait(.5);return History(candles(4),'YAHOO FINANCE')
 s=HistoryService(P(),{'concurrency':1,'min_interval':0,'request_timeout':.03})
 try:
  results=await asyncio.gather(*(s.get(SEC)for _ in range(8)),return_exceptions=True)
  assert all(isinstance(r,ProviderError)and r.code=='timeout'for r in results)
  assert s.provider.calls==1 and s.budget.active==1 and s.metrics['deduplicated']==7
  event.set();await asyncio.sleep(.04);assert s.budget.active==0
 finally:event.set();await s.close()

@run_async
async def test_cancelled_queued_request_never_downloads():
 import threading
 event=threading.Event()
 class P(FixtureProvider):
  def fetch_daily(self,security):self.calls+=1;event.wait(.5);return History(candles(4),'YAHOO FINANCE')
 s=HistoryService(P(),{'concurrency':1,'min_interval':0});one=asyncio.create_task(s.get(SEC));await asyncio.sleep(.03)
 two=asyncio.create_task(s.get({**SEC,'symbol':'MSFT','native_id':'MSFT','yahoo_symbol':'MSFT','canonical_id':'yahoo:MSFT:NASDAQ:equity'}));await asyncio.sleep(.01);two.cancel()
 with pytest.raises(asyncio.CancelledError):await two
 event.set();await one;await asyncio.sleep(.01);assert s.provider.calls==1;await s.close()

@pytest.mark.parametrize('priority',[0,1])
def test_chart_query_priority_is_parsed_as_integer(tmp_path,priority):
 from app.main import create_app
 from fastapi.testclient import TestClient
 token='g1-query-test-'+'x'*48
 app=create_app(tmp_path,token,FixtureProvider())
 r=TestClient(app,headers={'Authorization':'Bearer '+token}).get('/api/history',params={'symbol':'RELIANCE','priority':str(priority)})
 assert r.status_code==200 and r.json()['candles']
