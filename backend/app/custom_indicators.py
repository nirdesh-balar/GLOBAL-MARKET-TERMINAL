"""Causal E3B studies. Financial definitions and chosen variants: PHASE67E3B_FORMULAS.md."""
import math
from bisect import bisect_right
from datetime import datetime,time,timedelta,timezone
from zoneinfo import ZoneInfo
NAMES={'PIVOT':'Pivot Points Standard','SWING_PIVOT':'Pivot Points High/Low (confirmed swings)','CPR':'Central Pivot Range','CPR_MTF':'Advanced CPR — Multi-Timeframe','ORB':'Opening Range Breakout (analysis)','PREV_OHLC':'Previous Session OHLC','ALPHATREND':'AlphaTrend — public variant','HALFTREND':'HalfTrend — public variant','RELATIVE_STRENGTH':'Comparative Relative Strength','VRVP':'Estimated Visible Range Volume Profile (OHLCV-based)','INDIA_VIX':'India VIX — Yahoo reference'}
KINDS=tuple(NAMES)
DEFAULTS={'INDIA_VIX':dict(benchmark='yahoo:%5EINDIAVIX:NSE:index'),'ALPHATREND':dict(period=14,multiplier=1,source='HLC3'),'HALFTREND':dict(length=2,period=100,multiplier=2),'RELATIVE_STRENGTH':dict(length=20)}
SECONDS={'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800,'1M':2592000}
def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def valid(r):return all(finite(r.get(k)) for k in ('open','high','low','close')) and r['high']>=max(r['open'],r['close'],r['low']) and r['low']<=min(r['open'],r['close'])
def pivot_levels(r,variant,current_open=None):
    if variant=='woodie' and current_open is None:raise ValueError('Woodie requires the current reference-period open')
    h,l,c=r['high'],r['low'],r['close'];d=h-l;p=(h+l+2*current_open)/4 if variant=='woodie' and current_open is not None else (h+l+c)/3
    if variant=='camarilla':return {'P':p,**{f'{s}{i}':c+sign*1.1*d/factor for i,factor in enumerate((12,6,4,2),1) for s,sign in [('R',1),('S',-1)]}}
    result={'P':p,'R1':2*p-l,'S1':2*p-h,'R2':p+d,'S2':p-d}
    result.update(R3=p+2*d if variant=='classic' else h+2*(p-l),S3=p-2*d if variant=='classic' else l-2*(h-p))
    return result
def cpr(r):
    p=(r['high']+r['low']+r['close'])/3;b=(r['high']+r['low'])/2;t=2*p-b
    return {'P':p,'BC':min(b,t),'TC':max(b,t)}
def fields(c):
    k=c['kind']
    if k=='PIVOT':return list(pivot_levels(dict(high=2,low=1,close=1),c['pivot_variant'],1))
    if k=='SWING_PIVOT':return ['Swing high','Swing low']
    if k=='CPR':return ['P','BC','TC']
    if k=='CPR_MTF':return [f'{p} {line}' for p in ('1d','1w','1M') for line in ('P','BC','TC')]
    if k=='PREV_OHLC':return ['Previous open','Previous high','Previous low','Previous close']
    if k=='ORB':return ['Range high','Range low','Range midpoint','Break above','Break below']
    if k=='ALPHATREND':return ['AlphaTrend','AlphaTrend lag 2']
    if k=='HALFTREND':return ['HalfTrend','HalfTrend upper','HalfTrend lower']
    return ['Relative strength' if k=='RELATIVE_STRENGTH' else 'India VIX' if k=='INDIA_VIX' else 'Visible profile']
def chart_references(rows,interval,context):
    """Full loaded regular sessions only; no daily-to-intraday reconstruction."""
    if SECONDS[interval]>=86400:return {}
    step=SECONDS[interval];daily=[]
    for start,end,day in context.get('sessions',[]):
        selected=[r for r in rows if start<=r['time']<end];expected=math.ceil((end-start)/step)
        complete=bool(selected) and len(selected)==expected and all(r['time']==start+i*step and valid(r) and not r.get('partial') for i,r in enumerate(selected)) and bool(rows) and rows[-1]['time']>=end
        if selected:daily.append(dict(time=start,start=start,end=end,day=day,open=selected[0]['open'],high=max(r['high'] for r in selected),low=min(r['low'] for r in selected),close=selected[-1]['close'],volume=None,complete=complete))
        else:daily.append(dict(time=start,start=start,end=end,day=day,open=0,high=0,low=0,close=0,volume=None,complete=False))
    from .reference_context import aggregate_references
    def aggregate(period):
        if context.get('primary',{}).get('provider')!='hyperliquid':return aggregate_references(daily,period)
        span=SECONDS[period];groups={}
        for r in daily:
            bucket=r['start']//span*span
            if bucket not in groups:groups[bucket]={**r,'bucket':str(bucket),'complete':r['complete'] and r['start']==bucket}
            else:
                v=groups[bucket];v.update(high=max(v['high'],r['high']),low=min(v['low'],r['low']),close=r['close'],end=r['end'],complete=v['complete'] and r['complete'])
        return [{**r,'complete':r['complete'] and r['end']==bucket+span} for bucket,r in groups.items()]
    return {'1d':daily,'1w':aggregate('1w'),'1M':aggregate('1M')}
def custom_calculate(rows,c,interval='1d',context=None):
    from .indicators import rolling,smooth,source,rsi
    from .volume_indicators import calculate_volume
    ctx=context or {};names=fields(c);out={n:[None]*len(rows) for n in names};warnings=[];k=c['kind'];count=len(rows)
    if k in ('PIVOT','CPR','CPR_MTF','PREV_OHLC'):
        if c.get('reference_source')=='chart':ctx={**ctx,'references':chart_references(rows,interval,ctx)}
        periods=('1d','1w','1M') if k=='CPR_MTF' else ('1d',) if k=='PREV_OHLC' else (c['pivot_reference'],)
        opens={r.get('day'):r['start'] for r in ctx.get('references',{}).get('1d',[])};has_days=any(k is not None for k in opens)
        current_buckets={r.get('bucket'):r['start'] for r in ctx.get('references',{}).get(interval,[])}
        for period in periods:
            all_refs=sorted(ctx.get('references',{}).get(period,[]),key=lambda v:v['start']);starts=[v['start'] for v in all_refs]
            refs=sorted([r for r in ctx.get('references',{}).get(period,[]) if finite(r.get('end'))],key=lambda r:r['end']);ends=[r['end'] for r in refs]
            for i,r in enumerate(rows):
                t=opens.get(datetime.fromtimestamp(r['time'],timezone.utc).date().isoformat(),r['time']) if interval in ('1d','1w','1M') and ctx.get('primary',{}).get('provider')!='hyperliquid' else r['time'];j=bisect_right(ends,t)-1
                if interval in ('1w','1M') and ctx.get('primary',{}).get('provider')!='hyperliquid':
                    d=datetime.fromtimestamp(r['time'],timezone.utc).date();key=str(d-timedelta(days=d.weekday())) if interval=='1w' else str(d.replace(day=1))
                    current=current_buckets.get(key)
                    if current is not None:t=current;j=bisect_right(ends,t)-1
                if j<0:continue
                if period=='1d' and ctx.get('primary',{}).get('provider')!='hyperliquid' and has_days:
                    day=datetime.fromtimestamp(r['time'],timezone.utc if interval in ('1d','1w','1M') else ZoneInfo(ctx.get('primary',{}).get('timezone','UTC'))).date().isoformat()
                    if day not in opens:continue
                ref=refs[j]
                if not ref.get('complete') or not valid(ref):continue
                if ctx.get('primary',{}).get('provider')=='hyperliquid' and ref['end']!=t//SECONDS[period]*SECONDS[period]:continue
                if period in ('1w','1M') and ctx.get('primary',{}).get('provider')!='hyperliquid' and ref.get('bucket'):
                    day=datetime.fromtimestamp(r['time'],timezone.utc if interval in ('1d','1w','1M') else ZoneInfo(ctx.get('primary',{}).get('timezone','UTC'))).date()
                    key=str(day-timedelta(days=day.weekday()+7)) if period=='1w' else str((day.replace(day=1)-timedelta(days=1)).replace(day=1))
                    if ref['bucket']!=key:continue
                # A monthly chart cannot display previous-day levels for every hidden session.
                if SECONDS[interval]>SECONDS[period]:continue
                current_open=None
                if k=='PIVOT' and c['pivot_variant']=='woodie':
                    position=bisect_right(starts,t)-1;current=all_refs[position] if position>=0 else None
                    if current is None or current['start']<ref['end'] or not finite(current.get('open')):continue
                    current_open=current['open']
                v=cpr(ref) if k in ('CPR','CPR_MTF') else {f'Previous {n}':ref[n] for n in ('open','high','low','close')} if k=='PREV_OHLC' else pivot_levels(ref,c['pivot_variant'],current_open)
                for name,value in v.items():out[f'{period} {name}' if k=='CPR_MTF' else name][i]=value
        if k=='CPR_MTF':
            for period in periods:
                if not any(v is not None for name,a in out.items() if name.startswith(period+' ') for v in a):warnings.append(period+': completed reference unavailable or chart timeframe exceeds this reference.')
        elif not any(v is not None for a in out.values() for v in a):warnings.append('Completed reference periods unavailable or chart timeframe exceeds reference timeframe.')
    elif k=='SWING_PIVOT':
        left,right=c['swing_left'],c['swing_right'];hi=lo=None
        for i,r in enumerate(rows):
            j=i-right
            if j>=left and (i<count-1 or r.get('complete') is True) and all(valid(v) for v in rows[j-left:i+1]):
                window=rows[j-left:i+1];candidate=rows[j]
                if all(candidate['high']>v['high'] for n,v in enumerate(window) if n!=left):hi=candidate['high']
                if all(candidate['low']<v['low'] for n,v in enumerate(window) if n!=left):lo=candidate['low']
            out['Swing high'][i]=hi;out['Swing low'][i]=lo
    elif k=='ORB':
        seconds=SECONDS[interval];duration=c['orb_minutes']*60
        if seconds>=86400 or seconds>duration or duration%seconds:warnings.append('ORB requires aligned intraday candles that exactly divide the opening duration; daily OHLC cannot supply an opening range.')
        else:
            sessions=ctx.get('sessions',[]);template=c['session_template'];zone=c['session_zone'] if c['session_zone']!='exchange' else ctx.get('primary',{}).get('timezone','UTC')
            if template!='auto':
                zone='Asia/Kolkata' if template=='nse' else 'America/New_York' if template=='us' else 'UTC' if template=='utc' else zone
                minute=555 if template=='nse' else 570 if template=='us' else 0 if template=='utc' else c['session_open']
                days=sorted({datetime.fromtimestamp(r['time'],ZoneInfo(zone)).date() for r in rows});sessions=[]
                for day in days:
                    start=int(datetime.combine(day,time(minute//60,minute%60),ZoneInfo(zone)).timestamp());end=start+22500 if template=='nse' else start+23400 if template=='us' else int(datetime.combine(day+timedelta(days=1),time(minute//60,minute%60),ZoneInfo(zone)).timestamp());sessions.append((start,end,day.isoformat()))
            for start,end,label in sessions:
                selected=[(i,r) for i,r in enumerate(rows) if start<=r['time']<end];opening=[r for _,r in selected if r['time']<start+duration]
                expected=duration//seconds
                if len(opening)!=expected or any(r['time']!=start+n*seconds or not valid(r) or r.get('partial') for n,r in enumerate(opening)):continue
                h=max(r['high'] for r in opening);l=min(r['low'] for r in opening);previous=opening[-1]['close']
                for i,r in selected:
                    if r['time']<start+duration:continue
                    out['Range high'][i]=h;out['Range low'][i]=l;out['Range midpoint'][i]=(h+l)/2
                    if previous is not None and (i<count-1 or r.get('complete') is True):
                        if previous<=h<r['close']:out['Break above'][i]=r['close']
                        if previous>=l>r['close']:out['Break below'][i]=r['close']
                    previous=r['close']
            if not any(v is not None for v in out['Range high']):warnings.append('ORB unavailable: verified session/opening candles are missing or incomplete. Explicit templates describe user-chosen regular anchors, not certified special sessions.')
    elif k in ('ALPHATREND','HALFTREND'):
        ok=[valid(r) for r in rows];tr=[None if not ok[i] or i and not ok[i-1] else max(r['high']-r['low'],abs(r['high']-rows[i-1]['close']),abs(r['low']-rows[i-1]['close'])) if i else r['high']-r['low'] for i,r in enumerate(rows)]
        if rows and not ok[0]:tr[0]=None
        if k=='ALPHATREND':
            ranges=rolling(tr,c['period']);values=[source([r],c['source'])[0] if ok[i] else None for i,r in enumerate(rows)]
            if c['alpha_momentum']=='rsi':
                changes=[None if not i or x is None or values[i-1] is None else x-values[i-1] for i,x in enumerate(values)];g=smooth([None if v is None else max(0,v) for v in changes],c['period'],True);l=smooth([None if v is None else max(0,-v) for v in changes],c['period'],True)
                mom=[None if a is None or b is None else 50 if a==b==0 else 100 if b==0 else 100-100/(1+a/b) for a,b in zip(g,l)]
            else:mom=calculate_volume(rows,{**c,'kind':'MFI','length':c['period']},ctx)
            last=None
            for i,r in enumerate(rows):
                if ranges[i] is None or mom[i] is None:last=None;continue
                bull=mom[i]>=50;candidate=r['low']-c['multiplier']*ranges[i] if bull else r['high']+c['multiplier']*ranges[i]
                last=candidate if last is None else max(last,candidate) if bull else min(last,candidate);out['AlphaTrend'][i]=last;out['AlphaTrend lag 2'][i]=out['AlphaTrend'][i-2] if i>=2 else None
        else:
            ranges=smooth(tr,c['period'],True);n=c['length'];highma=rolling([r['high'] if ok[i] else None for i,r in enumerate(rows)],n);lowma=rolling([r['low'] if ok[i] else None for i,r in enumerate(rows)],n);trend=0;nexttrend=0;maxlow=minhigh=line=None
            for i,r in enumerate(rows):
                if highma[i] is None or ranges[i] is None or not ok[i]:maxlow=minhigh=line=None;trend=nexttrend=0;continue
                h=max(v['high'] for v in rows[i-n+1:i+1]);l=min(v['low'] for v in rows[i-n+1:i+1]);maxlow=l if maxlow is None else maxlow;minhigh=h if minhigh is None else minhigh;old=trend
                if nexttrend:
                    maxlow=max(l,maxlow)
                    if highma[i]<maxlow and r['close']<rows[i-1]['low']:trend=1;nexttrend=0;minhigh=h
                else:
                    minhigh=min(h,minhigh)
                    if lowma[i]>minhigh and r['close']>rows[i-1]['high']:trend=0;nexttrend=1;maxlow=l
                candidate=maxlow if trend==0 else minhigh;line=candidate if line is None else line if trend!=old else max(line,candidate) if trend==0 else min(line,candidate);dev=c['multiplier']*ranges[i]/2
                out['HalfTrend'][i]=line;out['HalfTrend upper'][i]=line+dev;out['HalfTrend lower'][i]=line-dev
    elif k in ('RELATIVE_STRENGTH','INDIA_VIX'):
        key=c['benchmark'];entry=ctx.get('benchmarks',{}).get(key,{});meta=entry.get('instrument',{});primary=ctx.get('primary',{})
        if not entry:warnings.append('Benchmark history unavailable. Select a verified canonical benchmark.')
        elif primary.get('provider')!=meta.get('provider'):warnings.append('Cross-provider benchmark comparison disabled.')
        elif k=='INDIA_VIX' and (meta.get('yahoo_symbol')!='^INDIAVIX' or meta.get('kind')!='index' or meta.get('provider')!='yahoo'):warnings.append('India VIX requires a verified Yahoo ^INDIAVIX index identity.')
        elif k=='RELATIVE_STRENGTH' and c['relative_mode']=='ratio' and primary.get('currency')!=meta.get('currency'):warnings.append('Price ratio requires matching currencies; select explicit normalized relative performance for differing currencies.')
        else:
            # Exact timestamps only; no forward-fill across calendars or holidays.
            lookup={r['time']:r for r in entry.get('candles',[])};ratios=[]
            for i,r in enumerate(rows):
                b=lookup.get(r['time']);b=b if b and valid(b) else None;ratio=r['close']/b['close'] if valid(r) and b and b['close']!=0 else None;ratios.append(ratio)
                if k=='INDIA_VIX':value=b['close'] if b and (i<count-1 or b.get('complete') is True) else None
                elif c['relative_mode']=='ratio':value=ratio
                else:
                    j=i-c['length'];base=ratios[j] if j>=0 else None;value=(ratio/base-1)*(100 if c['relative_mode']=='percent' else 1) if ratio is not None and base not in (None,0) and all(x is not None for x in ratios[j:i+1]) else None
                out[names[0]][i]=value
            if not any(v is not None and finite(v) for v in out[names[0]]):warnings.append('Reference unavailable: no valid aligned benchmark output (missing timestamps, undefined denominator or lookback warmup).')
            visible=[v for v in entry.get('candles',[]) if rows and v['time']<=rows[-1]['time']];last=datetime.fromtimestamp(visible[-1]['time'],timezone.utc).strftime('%Y-%m-%d %H:%M UTC') if visible else 'unavailable';retrieved=datetime.fromtimestamp(entry['fetched_at'],timezone.utc).strftime('%Y-%m-%d %H:%M UTC') if finite(entry.get('fetched_at')) else 'unknown'
            warnings.append(f"Historical reference · {meta.get('symbol',key)} · last available {last} · retrieved {retrieved} · exact timestamp intersection; unmatched bars are gaps.")
    out={name:[v if finite(v) else None for v in values] for name,values in out.items()}
    if k!='VRVP' and not warnings and not any(v is not None for a in out.values() for v in a):warnings.append('Insufficient valid history, completed confirmations or required input data.')
    return out,warnings

def custom_studies(rows,c,interval='1d',context=None):
    values,warnings=custom_calculate(rows,c,interval,context);result=[];k=c['kind'];separate=k in ('RELATIVE_STRENGTH','INDIA_VIX');names=fields(c)
    for name,arr in values.items():
        options=c['line_options'].get(name,{})
        if options.get('visible') is False:continue
        result.append(dict(id=c['id'],name=name,pane='e3b:'+c['id'] if separate else 'main',histogram=False,step=k in ('PIVOT','SWING_PIVOT','CPR','CPR_MTF','ORB','PREV_OHLC'),linear_scale=separate,vector=not separate,dots=name.startswith('Break '),color=options.get('color') or c['color'],width=options.get('width') or c['width'],style=c['style'] if options.get('style') is None else options['style'],opacity=c['opacity'] if options.get('opacity') is None else options['opacity'],points=[] if k=='VRVP' else [dict(time=r['time'],value=v if finite(v) else None) for r,v in zip(rows,arr)],levels=[],units='index points' if k=='INDIA_VIX' else '%' if k=='RELATIVE_STRENGTH' and c['relative_mode']=='percent' else 'relative return (fraction)' if k=='RELATIVE_STRENGTH' and c['relative_mode']=='performance' else 'price ratio' if k=='RELATIVE_STRENGTH' else (context or {}).get('volume_unit','provider volume units (unspecified)') if k=='VRVP' else 'price'))
    return result,warnings
