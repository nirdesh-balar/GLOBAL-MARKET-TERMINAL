"""E3A price/volume studies; no network or storage. See PHASE67E3A_FORMULAS.md.
Cumulative values never silently restart after an unknown contribution.
"""
import math
from .indicators import rolling,smooth,source
from .momentum_indicators import valid
KINDS=('OBV','CMF','MFI','ADL','VO','EOM','NVI','PVI','PVT','TMF','VROC')
NAMES=dict(zip(KINDS,('On-Balance Volume','Chaikin Money Flow','Money Flow Index','Accumulation/Distribution Line','Volume Oscillator','Ease of Movement','Negative Volume Index','Positive Volume Index','Price Volume Trend','Twiggs Money Flow','Volume Rate of Change')))
DEFAULTS={'CMF':dict(length=20),'MFI':dict(length=14,source='HLC3'),'VO':dict(fast=5,slow=10),'EOM':dict(length=14),'TMF':dict(length=21),'VROC':dict(length=12)}
LEVELS={'CMF':[0],'MFI':[20,80],'VO':[0],'EOM':[0],'TMF':[0],'VROC':[0]}
CUMULATIVE=('OBV','ADL','NVI','PVI','PVT')
def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def good(r,context=None):return valid(r) and finite(r.get('volume')) and r['volume']>=0 and not ((context or {}).get('zero_volume_is_missing') and r['volume']==0)
def units(c,context=None):
    u=(context or {}).get('volume_unit','provider volume units (unspecified)');k=c['kind']
    return 'ratio' if k=='CMF' else '%' if k in ('MFI','TMF','VROC') or k=='VO' and c['volume_osc_mode']=='percent' else 'index (seed '+format(c['volume_seed'],'g')+')' if k in ('NVI','PVI') else 'price² × divisor / '+u if k=='EOM' else u

def calculate_volume(rows,c,context=None):
    k=c['kind'];n=c['length'];size=len(rows);ok=[good(r,context) for r in rows];v=[r['volume'] if g else None for r,g in zip(rows,ok)];x=[source([r],c['source'])[0] if g else None for r,g in zip(rows,ok)]
    def windows(a,p):return [a[i-p+1:i+1] if i>=p-1 and all(t is not None for t in a[i-p+1:i+1]) else None for i in range(size)]
    def div(a,b):return None if a is None or b is None or b==0 else a/b
    def flow(i,previous=False):
        if not ok[i] or previous and (not i or not ok[i-1]):return None
        r=rows[i];hi=max(r['high'],rows[i-1]['close']) if previous else r['high'];lo=min(r['low'],rows[i-1]['close']) if previous else r['low']
        return 0. if hi==lo else ((r['close']-lo)-(hi-r['close']))/(hi-lo)*v[i]
    if k in CUMULATIVE:
        out=[];total=None;broken=False
        for i,r in enumerate(rows):
            if not ok[i]:broken=True
            if broken:out.append(None);continue
            if not i:total=flow(i) if k=='ADL' else c['volume_seed'] if k in ('NVI','PVI') else 0.
            elif k=='ADL':total+=flow(i)
            elif k=='OBV':total+=v[i]*(1 if x[i]>x[i-1] else -1 if x[i]<x[i-1] else 0)
            else:
                changes=k=='PVT' or (v[i]<v[i-1] if k=='NVI' else v[i]>v[i-1])
                if changes:
                    if x[i-1]==0:broken=True
                    else:total+=(v[i] if k=='PVT' else total)*(x[i]-x[i-1])/x[i-1]
            if not finite(total):broken=True
            out.append(None if broken else total)
    elif k=='CMF':
        a=rolling([flow(i) for i in range(size)],n);b=rolling(v,n);out=[div(a,b) for a,b in zip(a,b)]
    elif k=='MFI':
        pos=[];neg=[]
        for i in range(size):
            if not i or x[i] is None or x[i-1] is None or x[i]<0 or x[i-1]<0:pos.append(None);neg.append(None)
            else:pos.append(x[i]*v[i] if x[i]>x[i-1] else 0.);neg.append(x[i]*v[i] if x[i]<x[i-1] else 0.)
        p=rolling(pos,n);q=rolling(neg,n);out=[None if a is None or b is None or a+b==0 else 100*a/(a+b) for a,b in zip(p,q)]
    elif k=='VO':
        ma=smooth if c['volume_ma']=='ema' else rolling;a=ma(v,c['fast']);b=ma(v,c['slow']);out=[None if a is None or b is None else div(100*(a-b),b) if c['volume_osc_mode']=='percent' else a-b for a,b in zip(a,b)]
    elif k=='EOM':
        raw=[None if not i or not ok[i] or not ok[i-1] or v[i]==0 else ((r['high']+r['low']-rows[i-1]['high']-rows[i-1]['low'])/2)*(r['high']-r['low'])*c['eom_divisor']/v[i] for i,r in enumerate(rows)];out=rolling(raw,n)
    elif k=='TMF':
        a=smooth([flow(i,True) for i in range(size)],n,True);b=smooth([v[i] if i and ok[i-1] else None for i in range(size)],n,True);out=[None if div(a,b) is None else 100*a/b for a,b in zip(a,b)]
    else:out=[None if not w or w[0]==0 else 100*(w[-1]-w[0])/w[0] for w in windows(v,n+1)]
    return [a if a is not None and finite(a) else None for a in out]

def volume_studies(rows,c,context=None):
    a=calculate_volume(rows,c,context);name=c['kind'];o=c['line_options'].get(name,{})
    if o.get('visible') is False:return []
    return [dict(id=c['id'],name=name,pane='e3a:'+c['id'],histogram=False,linear_scale=True,color=o.get('color') or c['color'],width=o.get('width') or c['width'],style=c['style'] if o.get('style') is None else o['style'],opacity=c['opacity'] if o.get('opacity') is None else o['opacity'],units=units(c,context),points=[dict(time=r['time'],value=v) for r,v in zip(rows,a)],levels=c['reference_levels'] if c['reference_levels'] is not None else LEVELS.get(name,[]))]
def warning(rows,c,context=None):
    if any(not good(r,context) for r in rows):return f"{c['id']}: Missing/invalid volume or OHLC; unknown volume is not zero. Cumulative studies remain unavailable after an unknown contribution; rolling studies require complete windows."
    return f"{c['id']}: Volume study unavailable: insufficient history or undefined denominator/return."
