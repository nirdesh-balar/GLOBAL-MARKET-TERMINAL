"""E2 nullable chart studies; formulas, seeds and units: PHASE67E2_FORMULAS.md.
No transport, signals or persistence. Existing SMA/WMA/EMA/Wilder helpers are reused.
"""
import math
from .indicators import rolling,smooth,source
KINDS=('STOCH','CCI','ROC','AO','MOM','WILLR','ULTOSC','TSI','FISHER','PPO','KST','COPPOCK','CKS','KC','DC','STDDEV','HV','CHAIKIN_VOL','CHOP','MASS')
OVERLAYS=('CKS','KC','DC')
NAMES=dict(zip(KINDS,('Stochastic Oscillator','Commodity Channel Index','Rate of Change','Awesome Oscillator','Momentum','Williams %R','Ultimate Oscillator','True Strength Index','Fisher Transform','Percentage Price Oscillator','Know Sure Thing','Coppock Curve','Chande Kroll Stop','Keltner Channels','Donchian Channels','Standard Deviation','Historical Volatility','Chaikin Volatility','Choppiness Index','Mass Index')))
DEFAULTS={'STOCH':dict(stoch_period=14,k=3,d=3),'CCI':dict(length=20,source='HLC3'),'ROC':dict(length=9),'AO':dict(fast=5,slow=34,source='HL2'),'MOM':dict(length=10),'WILLR':dict(length=14),'ULTOSC':{},'TSI':dict(fast=13,slow=25,signal=13),'FISHER':dict(length=9,source='HL2'),'PPO':dict(fast=12,slow=26,signal=9),'KST':{},'COPPOCK':dict(fast=11,slow=14,length=10),'CKS':dict(length=10,period=10,multiplier=1,stop_period=9),'KC':dict(length=20,period=10,multiplier=2),'DC':dict(length=20),'STDDEV':dict(length=20),'HV':dict(length=20,sample=True),'CHAIKIN_VOL':dict(length=10,period=10),'CHOP':dict(length=14),'MASS':dict(length=25,period=9)}
LEVELS={'STOCH':[20,80],'CCI':[-100,0,100],'ROC':[0],'AO':[0],'MOM':[0],'WILLR':[-80,-20],'ULTOSC':[30,70],'TSI':[-25,0,25],'FISHER':[-1.5,0,1.5],'PPO':[0],'KST':[0],'COPPOCK':[0],'CHAIKIN_VOL':[0],'CHOP':[38.2,61.8],'MASS':[26.5,27]}

def valid(r):
    return all(isinstance(r.get(k),(float,int)) and not isinstance(r[k],bool) and math.isfinite(r[k]) for k in ('open','high','low','close')) and r['high']>=max(r['open'],r['close'],r['low']) and r['low']<=min(r['open'],r['close'],r['high'])
def ratio(a,b,factor=1):return None if a is None or b is None or b==0 else factor*a/b

def annual_factor(c,interval):
    mode=c['annualization']
    if mode=='per_bar':return 1.
    if mode=='custom':return c['annual_bars']
    days=365 if mode=='crypto' else c['annual_days'];minutes=1440 if mode=='crypto' else c['session_minutes']
    if interval=='1d':return days
    if interval=='1w':return days/(7 if mode=='crypto' else 5)
    if interval=='1M':return 12.
    return days*minutes/({'1m':1,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240}[interval])

def calculate_momentum(rows,c,interval='1d'):
    size=len(rows);ok=[valid(r) for r in rows];x=[source([r],c['source'])[0] if good else None for r,good in zip(rows,ok)];kind=c['kind'];n=c['length'];p=c['period'];fields=[]
    def add(name,a,histogram=False):fields.append(dict(name=name,values=[v if v is not None and math.isfinite(v) else None for v in a],histogram=histogram))
    def windows(a,length):return [None if i<length-1 or any(v is None for v in a[i-length+1:i+1]) else a[i-length+1:i+1] for i in range(size)]
    def ext(a,length,fn):return [fn(w) if w else None for w in windows(a,length)]
    highs=[r['high'] if good else None for r,good in zip(rows,ok)];lows=[r['low'] if good else None for r,good in zip(rows,ok)]
    def roc(length):return [None if not w or w[0]==0 else 100*(w[-1]-w[0])/w[0] for w in windows(x,length+1)]
    tr=[None if not good else max(r['high']-r['low'],abs(r['high']-rows[i-1]['close']),abs(r['low']-rows[i-1]['close'])) if i and ok[i-1] else r['high']-r['low'] for i,(r,good) in enumerate(zip(rows,ok))]
    if kind in ('STOCH','WILLR','DC'):
        length=c['stoch_period'] if kind=='STOCH' else n;hi=ext(highs,length,max);lo=ext(lows,length,min)
        if kind=='DC':add('Donchian upper',hi);add('Donchian middle',[None if a is None or b is None else (a+b)/2 for a,b in zip(hi,lo)]);add('Donchian lower',lo)
        else:
            raw=[None if v is None or a is None or b is None or a==b else (100*(v-b)/(a-b) if kind=='STOCH' else -100*(a-v)/(a-b)) for v,a,b in zip(x,hi,lo)]
            if kind=='WILLR':add('Williams %R',raw)
            else:k=rolling(raw,c['k']);add('Stochastic %K',k);add('Stochastic %D',rolling(k,c['d']))
    elif kind=='CCI':
        values=[]
        for w in windows(x,n):
            if not w:values.append(None);continue
            mean=sum(w)/n;dev=sum(abs(v-mean) for v in w)/n;values.append(ratio(w[-1]-mean,dev,.015**-1))
        add('CCI',values)
    elif kind=='ROC':add('ROC',roc(n))
    elif kind=='MOM':add('Momentum',[None if not w else w[-1]-w[0] for w in windows(x,n+1)])
    elif kind=='AO':
        a=rolling(x,c['fast']);b=rolling(x,c['slow']);add('Awesome Oscillator',[None if u is None or v is None else u-v for u,v in zip(a,b)],True)
    elif kind=='ULTOSC':
        bp=[None if not good or not i or not ok[i-1] else r['close']-min(r['low'],rows[i-1]['close']) for i,(r,good) in enumerate(zip(rows,ok))]
        # Both windows require an actual preceding candle, not an invented close.
        ranges=[None if not i or not ok[i-1] else tr[i] for i in range(size)]
        parts=[]
        for length in c['ultimate_periods']:
            a=rolling(bp,length);b=rolling(ranges,length);parts.append([ratio(u,v) for u,v in zip(a,b)])
        add('Ultimate Oscillator',[None if any(a[i] is None for a in parts) else 100*(4*parts[0][i]+2*parts[1][i]+parts[2][i])/7 for i in range(size)])
    elif kind=='TSI':
        delta=[None if not i or x[i] is None or x[i-1] is None else x[i]-x[i-1] for i in range(size)]
        a=smooth(smooth(delta,c['slow']),c['fast']);b=smooth(smooth([None if v is None else abs(v) for v in delta],c['slow']),c['fast']);tsi=[ratio(u,v,100) for u,v in zip(a,b)];add('TSI',tsi);add('TSI signal',smooth(tsi,c['signal']))
    elif kind=='FISHER':
        out=[];trigger=[];previous=0.;normalized=0.;ready=False
        for w in windows(x,n):
            if not w or max(w)==min(w):out.append(None);trigger.append(None);previous=normalized=0.;ready=False;continue
            value=.33*2*((w[-1]-min(w))/(max(w)-min(w))-.5)+.67*normalized;normalized=max(-.999,min(.999,value));f=.5*math.log((1+normalized)/(1-normalized))+.5*previous
            out.append(f);trigger.append(previous if ready else None);previous=f;ready=True
        add('Fisher',out);add('Fisher trigger',trigger)
    elif kind=='PPO':
        a=smooth(x,c['fast']);b=smooth(x,c['slow']);ppo=[None if u is None or v is None else ratio(u-v,v,100) for u,v in zip(a,b)];sig=smooth(ppo,c['signal']);add('PPO',ppo);add('PPO signal',sig);add('PPO histogram',[None if u is None or v is None else u-v for u,v in zip(ppo,sig)],True)
    elif kind=='KST':
        a=[rolling(roc(length),ma) for length,ma in zip(c['roc_lengths'],c['kst_smoothing'])];kst=[None if any(v[i] is None for v in a) else sum((j+1)*v[i] for j,v in enumerate(a)) for i in range(size)];add('KST',kst);add('KST signal',rolling(kst,c['signal']))
    elif kind=='COPPOCK':
        a=roc(c['fast']);b=roc(c['slow']);add('Coppock',[v+u if v is not None and u is not None else None for v,u in zip(a,b)])
        fields[-1]['values']=rolling(fields[-1]['values'],n,True)
    elif kind in ('CKS','KC'):
        a=smooth(tr,p,True)
        if kind=='KC':
            middle=smooth(x,n);add('Keltner upper',[None if u is None or v is None else u+c['multiplier']*v for u,v in zip(middle,a)]);add('Keltner middle',middle);add('Keltner lower',[None if u is None or v is None else u-c['multiplier']*v for u,v in zip(middle,a)])
        else:
            hi=ext(highs,n,max);lo=ext(lows,n,min);up=[None if u is None or v is None else u-c['multiplier']*v for u,v in zip(hi,a)];dn=[None if u is None or v is None else u+c['multiplier']*v for u,v in zip(lo,a)];add('CKS short stop',ext(up,c['stop_period'],max));add('CKS long stop',ext(dn,c['stop_period'],min))
    elif kind in ('STDDEV','HV'):
        a=x
        if kind=='HV':a=[None if not i or x[i] is None or x[i-1] is None or x[i-1]==0 or c['hv_returns']=='log' and (x[i]<=0 or x[i-1]<=0) else math.log(x[i]/x[i-1]) if c['hv_returns']=='log' else (x[i]-x[i-1])/x[i-1] for i in range(size)]
        scale=100*math.sqrt(annual_factor(c,interval)) if kind=='HV' else 1;out=[];ddof=1 if c['sample'] else 0
        for w in windows(a,n):
            if not w:out.append(None);continue
            mean=sum(w)/n;out.append(math.sqrt(sum((v-mean)**2 for v in w)/(n-ddof))*scale)
        add('Historical Volatility' if kind=='HV' else 'Standard Deviation',out)
    elif kind=='CHAIKIN_VOL':
        a=smooth([None if not good else r['high']-r['low'] for r,good in zip(rows,ok)],n);add('Chaikin Volatility',[None if i<p or a[i] is None or a[i-p] is None or any(v is None for v in a[i-p:i+1]) else ratio(a[i]-a[i-p],a[i-p],100) for i in range(size)])
    elif kind=='CHOP':
        hi=ext(highs,n,max);lo=ext(lows,n,min);tot=rolling(tr,n);add('Choppiness',[None if u is None or h is None or l is None or h==l or u<=0 else 100*math.log10(u*n/(h-l))/math.log10(n) for u,h,l in zip(tot,hi,lo)])
    elif kind=='MASS':
        a=smooth([None if not good else r['high']-r['low'] for r,good in zip(rows,ok)],p);b=smooth(a,p);r=[ratio(u,v) for u,v in zip(a,b)];add('Mass Index',[None if v is None else v*n for v in rolling(r,n)])
    return fields

def momentum_studies(rows,c,interval='1d'):
    fields=calculate_momentum(rows,c,interval);out=[];overlay=c['kind'] in OVERLAYS
    for f in fields:
        name=f['name'];o=c['line_options'].get(name,{})
        if o.get('visible') is False:continue
        color=c['upper_color'] if name.endswith('upper') else c['lower_color'] if name.endswith('lower') else c['up_color'] if name=='CKS long stop' else c['down_color'] if name=='CKS short stop' else c['signal_color'] if name.endswith('signal') or name.endswith('%D') or name.endswith('trigger') else c['up_color'] if f['histogram'] else c['color']
        out.append(dict(id=c['id'],name=name,pane='main' if overlay else 'e2:'+c['id'],histogram=f['histogram'],linear_scale=not overlay,vector=overlay,color=o.get('color') or color,down_color=c['down_color'] if f['histogram'] else None,width=o.get('width') or c['width'],style=o.get('style') if o.get('style') is not None else c['style'],opacity=o.get('opacity') if o.get('opacity') is not None else c['opacity'],points=[dict(time=r['time'],value=v) for r,v in zip(rows,f['values'])],levels=(c['reference_levels'] if c['reference_levels'] is not None else LEVELS.get(c['kind'],[])) if not out else []))
    upper=next((s for s in out if s['name'].endswith('upper')),None);lower=next((s for s in out if s['name'].endswith('lower')),None)
    if upper and lower:upper['cloud']=dict(peer=lower['points'],up=c['upper_color'],down=c['lower_color'],opacity=c['cloud_opacity'])
    return out
