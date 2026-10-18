"""Explicitly synthetic test data; never imported by the production launcher."""
import time
from datetime import date, timedelta
from app.providers.base import History, ProviderError
from app.providers.yahoo import trading_time

def candles(count=8000):
    return [dict(time=trading_time(date(1995,1,1)+timedelta(days=i)),open=100+i*.03,high=103+i*.03,
        low=99+i*.03,close=102+i*.03,volume=float(1000+i),adj_close=(102+i*.03)*.98) for i in range(count)]
class FixtureProvider:
    name='TEST FIXTURE · SYNTHETIC'
    def __init__(self,delay=0,count=8000): self.calls=0;self.delay=delay;self.rows=candles(count);self.closed=False
    def fetch_daily(self,security):
        self.calls+=1
        if self.delay:time.sleep(self.delay)
        if security['base_symbol']=='RKFAL': raise ProviderError('Yahoo has no available history. TEST FIXTURE error for manual NSE fallback.', 'missing')
        return History([dict(r) for r in self.rows],self.name,[dict(time=self.rows[20]['time'],date='1995-01-21',dividend=1.,split=0.)],notice='Synthetic fixture for offline tests only.')
    def close(self):self.closed=True
