"""UTC session segments from provider metadata or exchange calendars (DST-aware)."""
from bisect import bisect_right
from datetime import datetime,timedelta,time,timezone
from zoneinfo import ZoneInfo
from collections import OrderedDict
import exchange_calendars as xcals
from .providers.base import ProviderError
UTC=timezone.utc

def provider_segments(periods):
    result=[]
    if hasattr(periods,'iterrows'):
        for label,r in periods.iterrows():
            a,b=r.get('start'),r.get('end')
            if a is not None and b is not None:result.append((int(a.timestamp()),int(b.timestamp()),str(label)[:10]))
    elif isinstance(periods,dict):
        for group in periods.get('regular',[]):
            for r in group:
                if isinstance(r,dict) and isinstance(r.get('start'),(int,float)) and isinstance(r.get('end'),(int,float)):
                    result.append((int(r['start']),int(r['end']),datetime.fromtimestamp(r['start'],UTC).date().isoformat()))
    return sorted(result)

def segments(rows,security,provided=None):
    if not rows:return [],'No bars supplied.'
    zone=ZoneInfo(security.get('timezone','UTC'));kind=security.get('kind','equity')
    first,last=rows[0]['time'],rows[-1]['time']
    start=datetime.fromtimestamp(first,zone).date()-timedelta(days=2)
    end=datetime.fromtimestamp(last,zone).date()+timedelta(days=2)
    if kind=='crypto':
        result=[];d=datetime.fromtimestamp(first,UTC).date()
        while d<=datetime.fromtimestamp(last,UTC).date():
            a=int(datetime.combine(d,time(),UTC).timestamp());result.append((a,a+86400,d.isoformat()));d+=timedelta(days=1)
        return result,'Crypto uses UTC days and continuous 24/7 trading.'
    # Prefer calendar segments for exchanges with published holiday/early-close/break
    # rules. This also splits Yahoo's single regular period around lunch breaks.
    if security.get('calendar'):
        try:
            cal=xcals.get_calendar(security['calendar'],start=str(start),end=str(end))
            result=[]
            for day,r in cal.schedule.iterrows():
                a,b=int(r['open'].timestamp()),int(r['close'].timestamp())
                import pandas as pd
                if pd.notna(r['break_start']) and pd.notna(r['break_end']):
                    result.extend([(a,int(r['break_start'].timestamp()),str(day)[:10]),(int(r['break_end'].timestamp()),b,str(day)[:10])])
                else:result.append((a,b,str(day)[:10]))
            return sorted(result),f"Sessions: {security['calendar']} exchange calendar; holidays, DST, early closes and breaks respected within calendar coverage."
        except (ValueError,KeyError,RuntimeError):pass
    supplied=provider_segments(provided)
    if supplied:
        # Require coverage of every supplied bar; never extend the latest period backwards.
        covered=lambda t:any(a<=t<b for a,b,_ in supplied)
        if all(covered(r['time']) for r in rows):return supplied,'Session bounds supplied by Yahoo; futures/FX sessions follow Yahoo regular trading periods. Futures symbols ending =F are continuous front-month references, not a tradable expiry.'
    if security.get('exchange') in ('NSE','BSE'):
        # Official regular hours, only on dates actually present in the response.
        # Irregular/special sessions outside these hours must have provider bounds.
        result=[]
        for d in sorted({datetime.fromtimestamp(r['time'],zone).date() for r in rows}):
            a=int(datetime.combine(d,time(9,15),zone).timestamp());b=int(datetime.combine(d,time(15,30),zone).timestamp())
            if any(not a<=r['time']<b for r in rows if datetime.fromtimestamp(r['time'],zone).date()==d):raise ProviderError('A special Indian session needs verified Yahoo session bounds. Choose 15m or 1h for these bars.','range')
            result.append((a,b,d.isoformat()))
        return result,'Indian regular sessions use 09:15–15:30 Asia/Kolkata on supplied trading dates. Missing/short sessions remain partial; special hours require Yahoo session bounds.'
    raise ProviderError('Verified session bounds are unavailable for this instrument. Choose 15m or 1h; 4h will not assume another market’s hours. FX/futures require Yahoo regular trading periods.','range')

def aggregate_market_four_hour(rows,security,provided=None):
    periods,notice=segments(rows,security,provided);groups=OrderedDict()
    starts=[p[0] for p in periods]
    for row in rows:
        n=bisect_right(starts,row['time'])-1
        if n<0:continue
        a,b,label=periods[n]
        if not a<=row['time']<b:continue
        anchor=a+((row['time']-a)//14400)*14400;expected_end=min(anchor+14400,b)
        key=(a,anchor)
        if key not in groups:groups[key]={**row,'time':anchor,'end':min(row['time']+900,b),'expected_end':expected_end,'sample_count':1,'session':label}
        else:
            c=groups[key];c.update(high=max(c['high'],row['high']),low=min(c['low'],row['low']),close=row['close'],adj_close=row.get('adj_close'),end=min(row['time']+900,b),sample_count=c['sample_count']+1)
            c['volume']=None if c['volume'] is None or row['volume'] is None else c['volume']+row['volume']
    for c in groups.values():c['partial']=c['sample_count']<(c['expected_end']-c['time'])/900 or c['end']<c['expected_end']
    if rows and not groups:raise ProviderError('No supplied bars fall inside verified trading sessions. Choose a native timeframe.','range')
    return list(groups.values()),notice
