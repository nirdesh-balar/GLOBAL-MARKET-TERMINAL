"""On-demand E3B references. Uses the existing bounded, deduplicated RAM history service.
No additional provider, credentials, stream manager or persistent candle storage.
"""
import asyncio
import time
from datetime import datetime,timedelta,time as daytime,timezone
from zoneinfo import ZoneInfo
from bisect import bisect_left
import exchange_calendars as xcals
from .providers.base import ProviderError
from .market_router import MarketDataRouter

UTC=timezone.utc
def session_bounds(rows,security,provided=None):
    from .sessions import segments
    try:return segments(rows,security,provided)
    except ProviderError as e:return [],str(e)

def daily_references(rows,security):
    """Yahoo daily dates are UTC trading-date labels, not midnight exchange instants.
    Where an exchange calendar is unavailable, completion requires the next observed
    session. This deliberately does not certify a special/half-session close.
    """
    zone=ZoneInfo(security.get('timezone') or 'UTC');calendar=None
    if rows and security.get('calendar'):
        try:calendar=xcals.get_calendar(security['calendar'],start=datetime.fromtimestamp(rows[0]['time'],UTC).date()-timedelta(days=8),end=datetime.fromtimestamp(rows[-1]['time'],UTC).date()+timedelta(days=8))
        except (ValueError,KeyError,RuntimeError):pass
    indian=security.get('exchange') in ('NSE','BSE');us=security.get('calendar') in ('XNYS','ARCX','XASE','BATS') or security.get('exchange') in ('NYSE','NASDAQ','NYSE Arca','NYSE American','Cboe BZX')
    if calendar is None and not indian and not us:return [],'Verified reference-session opening bounds are unavailable for this instrument; another market’s hours are not assumed.'
    opening=daytime(9,15) if indian else daytime(9,30)
    result=[]
    for i,r in enumerate(rows):
        day=datetime.fromtimestamp(r['time'],UTC).date();start=int(datetime.combine(day,opening,zone).timestamp());end=None
        if calendar is not None:
            try:
                entry=calendar.schedule.loc[day.isoformat()];start=int(entry['open'].timestamp());end=int(entry['close'].timestamp())
            except KeyError:continue
        elif i+1<len(rows):
            nextday=datetime.fromtimestamp(rows[i+1]['time'],UTC).date();end=int(datetime.combine(nextday,opening,zone).timestamp())
        result.append({**r,'start':start,'end':end,'day':day.isoformat(),'complete':end is not None and not r.get('partial',False)})
    return result,('Published exchange calendar completion' if calendar is not None else 'Completion requires the next observed session; special closing hours are not inferred.')

def aggregate_references(daily,period):
    groups={}
    for r in daily:
        d=datetime.fromisoformat(r['day']).date();key=str(d-timedelta(days=d.weekday())) if period=='1w' else str(d.replace(day=1))
        if key not in groups:groups[key]={**r,'bucket':key}
        else:
            v=groups[key];v.update(high=max(v['high'],r['high']),low=min(v['low'],r['low']),close=r['close'],end=r['end'],complete=v['complete'] and r['complete'])
    values=list(groups.values())
    # A final weekly/monthly bucket is never promoted just because its last
    # available daily candle closed. A later bucket must actually be present.
    return [{**r,'end':values[i+1]['start'] if i+1<len(values) else None,'complete':r['complete'] and i>0 and i+1<len(values)} for i,r in enumerate(values)]

def yahoo_period_references(rows,daily,period):
    """Use supplied native weekly/monthly OHLC, not an incomplete daily rebuild.
    Date labels are aligned to observed exchange opens; completion requires a
    later observed reference period. Missing alignment stays unavailable.
    """
    result=[];days=[r['day'] for r in daily]
    for r in rows:
        d=datetime.fromtimestamp(r['time'],UTC).date()
        if period=='1w':bucket=d-timedelta(days=d.weekday());boundary=bucket+timedelta(days=7)
        else:
            bucket=d.replace(day=1);boundary=(bucket.replace(day=28)+timedelta(days=4)).replace(day=1)
        first=bisect_left(days,str(bucket));after=bisect_left(days,str(boundary));later=daily[after] if after<len(daily) else None
        if first>=after:continue
        result.append({**r,'bucket':str(bucket),'start':daily[first]['start'],'end':later['start'] if later else None,'complete':later is not None and not r.get('partial',False)})
    return result

async def build_context(service,registry,symbol,interval,periods,benchmark='',adjusted=False,include_sessions=True):
    if symbol.startswith('hyperliquid:') and getattr(registry,'hyperliquid',None):await registry.hyperliquid.ensure()
    primary=registry.resolve(symbol)
    if not primary:raise ProviderError('Primary instrument identity unavailable.','missing')
    route=MarketDataRouter.validate(primary);result=dict(primary=primary,references={},sessions=[],benchmarks={},warnings=[],retrieved_at=time.time())
    requested=sorted(set(periods)&{'1d','1w','1M'})
    if requested:
        if route=='hyperliquid':
            for period in requested:
                h,_=await service.daily(primary,interval=period)
                result['references'][period]=[{**r,'start':r['time'],'end':r.get('end_time',r['time']),'complete':r.get('complete',False)} for r in h.candles if r.get('end_time')]
            result['warnings'].append('Crypto reference periods use native provider boundaries: epoch-aligned weeks and provider 30-day months.')
        else:
            view=await service.get(primary,'1d',adjusted=adjusted);daily,notice=await asyncio.to_thread(daily_references,view['candles'],primary);result['warnings'].append(notice)
            for period in requested:
                if period=='1d':result['references'][period]=daily
                else:
                    native=await service.get(primary,period,adjusted=adjusted)
                    result['references'][period]=yahoo_period_references(native['candles'],daily,period)
            result['warnings'].append('Weekly/monthly OHLC comes from the existing native Yahoo interval adapter; incomplete daily coverage is not used to invent a reference range.')
    if include_sessions and interval not in ('1d','1w','1M'):
        h,_=await service.daily(primary,interval=interval)
        result['sessions'],notice=session_bounds(h.candles,{**primary,**h.metadata},h.trading_periods);result['warnings'].append(notice)
    if benchmark:
        if benchmark.startswith('hyperliquid:') and getattr(registry,'hyperliquid',None):await registry.hyperliquid.ensure()
        target=registry.resolve(benchmark)
        if not target:raise ProviderError('Benchmark unavailable. Search and select a verified canonical instrument.','missing')
        MarketDataRouter.validate(target)
        if route!=target['provider']:raise ProviderError('Benchmark provider must match the primary market; cross-provider comparison is disabled.','policy')
        h=await service.get(target,interval,adjusted=adjusted)
        result['benchmarks'][benchmark]=dict(instrument=registry.resolve(benchmark) or target,candles=h['candles'],fetched_at=h['fetched_at'],last_available=h['last_available'],notice='Historical reference, not guaranteed live.')
    return result
