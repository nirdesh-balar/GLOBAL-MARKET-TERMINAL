"""Bar-derived drawing calculations. No I/O and no historical data persistence."""
import math

def valid_ohlc(r):
    return all(isinstance(r[k],(float,int)) and math.isfinite(r[k]) for k in ('open','high','low','close')) and r['high']>=max(r['open'],r['close'],r['low']) and r['low']<=min(r['open'],r['close'])

def parse_ghost(text):
    if len(text)>2000 or not text.strip() or len(text.strip().splitlines())>128:raise ValueError('Use 1–128 bounded hypothetical candles')
    result=[]
    for line in text.strip().split('\n'):
        tokens=line.split(',')
        if len(tokens)!=5 or any(not t.strip() for t in tokens):raise ValueError('Each hypothetical candle needs five numbers')
        bar,o,h,l,c=map(float,tokens);r=dict(bar=bar,open=o,high=h,low=l,close=c)
        if not math.isfinite(bar) or abs(bar)>10000 or not valid_ohlc(r) or result and bar<=result[-1]['bar']:raise ValueError('Invalid hypothetical OHLC or bar offset')
        result.append(r)
    return result

def position(entry,stop,target,short=False,account_size=0,risk_percent=0,multiplier=1,rate=1,lot_step=1,confirmed=False,auto_size=True,quantity=1):
    direction=-1 if short else 1;risk=(entry-stop)*direction;reward=(target-entry)*direction;unit_risk=abs(entry-stop);cash_risk=unit_risk*multiplier*rate
    raw=account_size*risk_percent/100/cash_risk if cash_risk else None
    qty=None if not confirmed else (None if auto_size and raw is None else math.floor((raw if auto_size else quantity)/lot_step+1e-12)*lot_step)
    return dict(conventional=risk>0 and reward>0,risk=unit_risk,reward=reward,ratio=reward/risk if risk>0 else None,riskPercent=unit_risk/abs(entry)*100 if entry else None,rewardPercent=reward/abs(entry)*100 if entry else None,quantity=qty,riskCash=qty*cash_risk if qty is not None else None,stopPL=(stop-entry)*direction*multiplier*rate*qty if qty is not None else None,targetPL=reward*multiplier*rate*qty if qty is not None else None)

def volume_error(rows):
    if not rows:return 'Select supplied historical candles.'
    if any(not valid_ohlc(r) or r.get('volume') is None or not math.isfinite(r['volume']) or r['volume']<0 for r in rows):return 'Missing or invalid OHLCV'
    if not any(r['volume']>0 for r in rows):return 'No positive volume'
    return None

def source_price(r,source):
    if source in ('O','H','L','C'):return r[dict(O='open',H='high',L='low',C='close')[source]]
    if source=='HL2':return (r['high']+r['low'])/2
    if source=='HLC3':return (r['high']+r['low']+r['close'])/3
    if source=='OHLC4':return sum(r[k] for k in ('open','high','low','close'))/4
    raise ValueError('Unknown VWAP price source')

def anchored_vwap(rows,source='HLC3'):
    error=volume_error(rows)
    if error:return dict(error=error,points=[])
    weight=mean=m2=0;points=[]
    for r in rows:
        v=r['volume'];price=source_price(r,source)
        if v>0:
            nxt=weight+v;delta=price-mean;mean+=v/nxt*delta;m2+=v*delta*(price-mean);weight=nxt
        points.append(dict(time=r['time'],value=mean if weight else None,deviation=math.sqrt(max(0,m2/weight)) if weight else None,volume=weight))
    return dict(error=None,points=points)

def estimated_profile(rows,bins=24,value_area=70):
    error=volume_error(rows)
    if error:return dict(error=error,rows=[],poc=None,vah=None,val=None,total=0,covered=0)
    if not isinstance(bins,int) or not 2<=bins<=128 or not 1<=value_area<=100:raise ValueError('Invalid profile configuration')
    contributing=[r for r in rows if r['volume']>0];low=min(r['low'] for r in contributing);high=max(r['high'] for r in contributing);flat=high==low;step=0 if flat else (high-low)/bins
    profile=[dict(low=low+i*step,high=low+(i+1)*step,volume=0,inArea=False) for i in range(1 if flat else bins)];total=0
    for r in contributing:
        total+=r['volume']
        if flat or r['high']==r['low']:
            profile[0 if flat else min(bins-1,math.floor((r['low']-low)/step))]['volume']+=r['volume'];continue
        for i in range(max(0,math.floor((r['low']-low)/step)),min(bins-1,math.floor((r['high']-low)/step))+1):
            overlap=max(0,min(r['high'],profile[i]['high'])-max(r['low'],profile[i]['low']));profile[i]['volume']+=r['volume']*overlap/(r['high']-r['low'])
    poc=max(range(len(profile)),key=lambda i:profile[i]['volume']);left=right=poc;covered=profile[poc]['volume'];target=total*value_area/100
    while covered+total*1e-12<target and (left>0 or right<len(profile)-1):
        below=profile[left-1]['volume'] if left else -1;above=profile[right+1]['volume'] if right<len(profile)-1 else -1
        if below>above or below==above and poc-left<=right-poc:left-=1;covered+=profile[left]['volume']
        else:right+=1;covered+=profile[right]['volume']
    for i,r in enumerate(profile):r['inArea']=left<=i<=right
    return dict(error=None,rows=profile,poc=(profile[poc]['low']+profile[poc]['high'])/2,vah=profile[right]['high'],val=profile[left]['low'],total=total,covered=covered)
