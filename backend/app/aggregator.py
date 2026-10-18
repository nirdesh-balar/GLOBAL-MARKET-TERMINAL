from collections import OrderedDict
from datetime import datetime,time,timedelta
from zoneinfo import ZoneInfo
IST=ZoneInfo('Asia/Kolkata')
INTRADAY={'1m','5m','15m','30m','1h','4h'}
YAHOO_INTERVALS={'1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'60m','4h':'15m','1d':'1d','1w':'1wk','1M':'1mo'}
LOOKBACK_DAYS={'1m':7,'5m':60,'15m':60,'30m':60,'1h':730,'4h':60}

def aggregate_four_hour(rows,session_closes=None):
    """09:15–13:15 and 13:15–15:30 IST, with no cross-session mixing.
    Short sessions/gaps end at the last supplied 15m candle, never filled.
    Optional official short-session closes can further bound the input.
    """
    groups=OrderedDict();session_closes=session_closes or {}
    for row in sorted(rows,key=lambda r:r['time']):
        stamp=datetime.fromtimestamp(row['time'],IST);day=stamp.date()
        opening=datetime.combine(day,time(9,15),IST)
        closing=datetime.combine(day,time.fromisoformat(session_closes.get(day.isoformat(),'15:30')),IST)
        if not opening<=stamp<closing:continue
        bucket=int((stamp-opening).total_seconds()//14400)
        anchor=opening+timedelta(hours=4*bucket)
        key=(day,bucket)
        bar_end=min(stamp+timedelta(minutes=15),closing)
        expected_end=min(anchor+timedelta(hours=4),closing)
        if key not in groups:
            groups[key]=dict(row,time=int(anchor.timestamp()),end=int(bar_end.timestamp()),expected_end=int(expected_end.timestamp()),sample_count=1)
        else:
            c=groups[key];c['high']=max(c['high'],row['high']);c['low']=min(c['low'],row['low']);c['close']=row['close'];c['adj_close']=row.get('adj_close')
            c['volume']=None if c['volume'] is None or row['volume'] is None else c['volume']+row['volume']
            c['end']=int(bar_end.timestamp());c['sample_count']+=1
    for c in groups.values():
        expected=(c['expected_end']-c['time'])//900
        c['partial']=c['end']<c['expected_end'] or c['sample_count']<expected
    return list(groups.values())

class CandleAggregator:
    four_hour=staticmethod(aggregate_four_hour)
