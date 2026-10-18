"""Yahoo Finance via yfinance, using process memory for every library cache."""
import logging
import math
import threading
import time
import re
from urllib.parse import urlsplit
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import pandas as pd
import yfinance as yf
from yfinance import cache as yf_cache
from yfinance.data import YfData
from yfinance.exceptions import YFRateLimitError, YFPricesMissingError, YFTzMissingError, YFTickerMissingError,YFInvalidPeriodError
from .base import History, ProviderError
from .yahoo_errors import classify,retry_after
from ..aggregator import INTRADAY, YAHOO_INTERVALS, LOOKBACK_DAYS

IST = ZoneInfo('Asia/Kolkata')

class RuntimeMetadataCache:
    def __init__(self, cookie=False):
        self.values = {}
        self.cookie = cookie
        self.lock = threading.Lock()
    def lookup(self, key):
        with self.lock:
            item = self.values.get(key)
            if item is None: return None
            if self.cookie: return {'cookie': item[0], 'age': datetime.now()-item[1]}
            return item
    def store(self, key, value):
        with self.lock:
            if value is None: self.values.pop(key, None)
            else: self.values[key] = (value, datetime.now()) if self.cookie else value
    def clear(self):
        with self.lock: self.values.clear()

# Pinned yfinance 1.7.0 normally opens SQLite for these caches. Replace the
# accessors before constructing any Ticker; this changes local storage only.
TZ_CACHE = RuntimeMetadataCache()
COOKIE_CACHE = RuntimeMetadataCache(cookie=True)
ISIN_CACHE = RuntimeMetadataCache()
yf_cache.get_tz_cache = lambda: TZ_CACHE
yf_cache.get_cookie_cache = lambda: COOKIE_CACHE
yf_cache.get_isin_cache = lambda: ISIN_CACHE
yf.config.debug.hide_exceptions = False
# The application's shared gate owns retries; avoid nested library retry loops.
yf.config.network.retries = 0
logging.getLogger('yfinance').disabled = True
# Avoid a second, opaque 64-response cache outside our expiring LRU.
_LIBRARY_HTTP_CACHE = YfData.cache_get
def runtime_http_get(self, url, params=None, timeout=30):
    return self.get(url, params=params, timeout=timeout)
YfData.cache_get = runtime_http_get

_TRANSPORT=threading.local()
_MAKE_REQUEST=YfData._make_request
def observed_request(self,url,request_method,body=None,params=None,timeout=30,data=None):
    context=getattr(_TRANSPORT,'context',None)
    if context is None:return _MAKE_REQUEST(self,url,request_method,body,params,timeout,data)
    def request(**kwargs):
        remaining=context['deadline']-time.monotonic()
        if remaining<=0:raise ProviderError('Yahoo Finance timed out. Retry this chart.','temporary',code='timeout')
        kwargs['timeout']=min(float(kwargs.get('timeout')or 20),20,remaining)
        r=request_method(**kwargs)
        u=urlsplit(url);context['events'].append(dict(host=u.hostname,path=u.path,status=r.status_code));context['events']=context['events'][-8:]
        if r.status_code==429:raise ProviderError('Yahoo Finance is rate limited. Wait before retrying.','rate',retry_after(r.headers.get('Retry-After')),code='rate_limited',http_status=429)
        if r.status_code in (401,403)or r.status_code>=500:
            error=RuntimeError();error.response=r;raise classify(error)
        return r
    return _MAKE_REQUEST(self,url,request,body,params,min(timeout,20),data)
YfData._make_request=observed_request

def trading_time(day):
    return int(datetime.combine(day, datetime.min.time(), timezone.utc).timestamp())

def optional_number(value):
    try:return float(value)
    except (ValueError,TypeError):return math.nan

def normalize_ohlcv(frame, ticker=None, interval="1d", kind="equity", market_timezone="Asia/Kolkata"):
    if frame is None or frame.empty:
        raise ProviderError('Yahoo has no history for this instrument. Try official NSE archive files; coverage is limited to the dates selected.', 'missing')
    frame = frame.copy()
    if isinstance(frame.columns, pd.MultiIndex):
        if ticker:
            for level in range(frame.columns.nlevels):
                if ticker in frame.columns.get_level_values(level):
                    frame = frame.xs(ticker, axis=1, level=level)
                    break
        if isinstance(frame.columns, pd.MultiIndex):
            raise ProviderError('Yahoo returned an unexpected multi-symbol response.', 'source')
    required = ['Open', 'High', 'Low', 'Close']
    if any(k not in frame for k in required):
        raise ProviderError('Yahoo response is missing OHLC columns.', 'source')
    rows, actions, skipped = {}, {}, 0
    zone=ZoneInfo(market_timezone)
    today = datetime.now(zone).date()
    for index, row in frame.iterrows():
        try:
            stamp = pd.Timestamp(index)
            day = stamp.tz_convert(zone).date() if stamp.tzinfo else stamp.date()
            if day > today: skipped += 1; continue
            if interval in INTRADAY:
                if stamp.tzinfo is None: stamp=stamp.tz_localize(zone)
                t=int(stamp.timestamp())
            else: t = trading_time(day)
            dividend = float(row.get('Dividends', 0) or 0)
            split = float(row.get('Stock Splits', 0) or 0)
            if (math.isfinite(dividend) and dividend != 0) or (math.isfinite(split) and split != 0):
                actions[t] = dict(time=t, date=day.isoformat(), dividend=dividend if math.isfinite(dividend) else 0, split=split if math.isfinite(split) else 0)
            values = [float(row[k]) for k in required]
            o,h,l,c = values
            if not all(math.isfinite(v) and (kind=="future" or v > 0) for v in values) or h < max(o,l,c) or l > min(o,h,c):
                skipped += 1; continue
            v = optional_number(row.get('Volume', math.nan))
            v = v if math.isfinite(v) and v >= 0 and kind!="forex" and not (kind=="index" and v==0) else None
            adjusted = optional_number(row.get('Adj Close', math.nan))
            rows[t] = dict(time=t, open=o, high=h, low=l, close=c, volume=v,
                adj_close=adjusted if math.isfinite(adjusted) and adjusted > 0 else None)
        except (ValueError, TypeError, OverflowError): skipped += 1
    if not rows: raise ProviderError('Yahoo returned no valid OHLCV rows. No prices were fabricated.', 'missing')
    notice = 'Yahoo OHLC uses auto_adjust=False; Yahoo may already reflect splits. Adjusted mode uses Adj Close / Close for OHLC; volume is unchanged. Coverage is not guaranteed back to listing.'
    if kind=='forex':notice+=' Forex has no centralized exchange volume; no volume is displayed.'
    if kind=='future':notice+=' Continuous references are not directly tradable expiries; negative futures prices, when supplied, are retained.'
    if skipped: notice += f' {skipped} invalid or non-trading rows omitted.'
    return History([rows[t] for t in sorted(rows)], 'YAHOO FINANCE', [actions[t] for t in sorted(actions)], notice, interval=interval)

class YahooFinanceProvider:
    name = 'YAHOO FINANCE'
    def fetch_daily(self, security):
        return self.fetch(security,"1d")
    def fetch(self, security, interval, period=None):
        from ..market_router import MarketDataRouter
        if MarketDataRouter.validate(security)!='yahoo':raise ProviderError('Yahoo cannot service this identity.','policy')
        native=security.get('yahoo_symbol')
        if not isinstance(native,str)or not native or len(native)>80 or re.search(r'[\s%\x00-\x1f]',native):
            raise ProviderError('Unsupported Yahoo ticker. Change Symbol and select a verified instrument.','missing',code='invalid_symbol')
        context=dict(deadline=time.monotonic()+60,events=[]);_TRANSPORT.context=context
        began=time.monotonic();limited=None
        try:
            # One ticker, maximum daily history. Ticker.history exposes errors
            # that download() may hide as an empty frame. No mass downloader.
            yahoo_interval=YAHOO_INTERVALS[interval]
            period=period or (f'{LOOKBACK_DAYS[interval]}d' if interval in INTRADAY else 'max')
            ticker=yf.Ticker(security['yahoo_symbol'])
            try:
                frame = ticker.history(period=period, interval=yahoo_interval, auto_adjust=False,actions=True, repair=False, timeout=20)
            except YFInvalidPeriodError as e:
                # Some real Yahoo indices advertise only short ranges. Keep the
                # exact symbol/interval, and disclose the largest advertised range.
                ranges=(getattr(getattr(ticker,'_price_history',None),'_history_metadata',{})or{}).get('validRanges')or e.valid_ranges
                if isinstance(ranges,str):ranges=[r.strip()for r in ranges.split(',')]
                order=['1d','5d','1mo','3mo','6mo','ytd','1y','2y','5y','10y']
                available=[r for r in order if r in ranges]
                if period!='max'or not available:raise ProviderError('Yahoo does not support this history range for the selected ticker/timeframe. Change Symbol or choose another timeframe.','range',code='unsupported_range')from None
                limited=available[-1];time.sleep(1.5)
                frame=ticker.history(period=limited,interval=yahoo_interval,auto_adjust=False,actions=True,repair=False,timeout=20)
            # Pinned yfinance adapter: read chart metadata already returned by history,
            # avoiding history_metadata's lazy extra request for tradingPeriods.
            meta=getattr(getattr(ticker,'_price_history',None),'_history_metadata',{}) or {}
            zone=meta.get('exchangeTimezoneName') or security.get('timezone','UTC')
            result=normalize_ohlcv(frame,security['yahoo_symbol'],'15m' if interval=='4h' else interval,security.get('kind','equity'),zone)
            result.metadata=dict(timezone=zone,currency=meta.get('currency') or security.get('currency',''),precision=security.get('precision',2),contract=security.get('contract',''))
            result.metadata['quote_currency']=meta.get('currency') or ''
            result.metadata['quote_metadata']={k:meta[k] for k in ('regularMarketTime','regularMarketPrice','previousClose','currentTradingPeriod') if k in meta}
            result.metadata.update(provider='yahoo',canonical_id=security.get('canonical_id'),native_id=native,requested_period=period,actual_period=limited or period,provider_http_events=context['events'],retrieval_seconds=time.monotonic()-began)
            if limited:result.notice+=f' Yahoo does not support max for this instrument; only its largest advertised range ({limited}) is shown. No earlier candles were invented.'
            result.trading_periods=meta.get('tradingPeriods')
            return result
        except ProviderError: raise
        except YFRateLimitError:
            raise ProviderError('Yahoo is throttling requests. Pause for 60 seconds before retrying; no access limits are bypassed.', 'rate', 60) from None
        except YFInvalidPeriodError:
            raise ProviderError('Yahoo does not support this history range for the selected ticker/timeframe. Change Symbol or choose another timeframe.','range',code='unsupported_range')from None
        except (YFPricesMissingError, YFTzMissingError, YFTickerMissingError) as e:
            reason=getattr(e,'yahoo_reason','')or''
            code='delisted_symbol'if 'is delisted'in reason.lower()else'no_history'
            raise ProviderError(f'No available historical candles for {native} at this timeframe. Change Symbol or choose another timeframe.','missing',code=code)from None
        except Exception as e:
            raise classify(e) from None
        finally:
            del _TRANSPORT.context
    def fetch_quote(self, security):
        # Five daily bars, never maximum history or an opaque Ticker.info fanout.
        result=self.fetch(security,'1d',period='5d')
        result.metadata['currency']=result.metadata.get('quote_currency','')
        return result
    def fetch_recent(self, security, interval):
        period='5d' if interval=='1m' else '3mo' if interval=='1w' else '1y' if interval=='1M' else '1mo'
        return self.fetch(security,interval,period=period)
    def clear_http_cache(self):
        _LIBRARY_HTTP_CACHE.cache_clear()
    def close(self):
        self.clear_http_cache()
        for cache in (TZ_CACHE, COOKIE_CACHE, ISIN_CACHE): cache.clear()
