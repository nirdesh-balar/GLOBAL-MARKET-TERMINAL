"""Explicit E3B synthetic histories. Imported only by the test launcher/flag.
Production launcher and packaged resources never load this module.
"""
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
import math
def daily_rows(security):
    zone=ZoneInfo(security.get('timezone') or 'UTC');today=datetime.now(zone).date();rows=[]
    for ago in range(430,-1,-1):
        day=today-timedelta(days=ago)
        if day.weekday()>4:continue
        price=(15 if security.get('yahoo_symbol')=='^INDIAVIX' else 100)+math.sin(ago/13)*5+ago*.01
        rows.append(dict(time=int(datetime.combine(day,datetime.min.time(),timezone.utc).timestamp()),open=price,high=price+3,low=price-2,close=price+1,volume=None if security.get('kind') in ('index','forex') else 1000+ago,adj_close=price+1))
    return rows
