"""E1 availability-indexed studies. See PHASE67E1_FORMULAS.md for conventions.

No transport, subscriptions, file storage or signal rules. Display offsets are metadata.
"""
import math
import time
from .indicators import rolling,smooth,source
KINDS=('HMA','ICHIMOKU','SAR','ADX','ZIGZAG','AROON','LINREG','CMO','DPO','KAMA','LSMA','MCGINLEY','SMMA','TEMA','DEMA','VORTEX')
OSCILLATORS=('ADX','AROON','CMO','DPO','VORTEX')

def valid(row):
    return all(isinstance(row.get(k),(float,int)) and math.isfinite(row[k]) for k in ('open','high','low','close')) and row['high']>=max(row['open'],row['low'],row['close']) and row['low']<=min(row['open'],row['high'],row['close'])

def calculate_trend(rows,c):
    n=c['length'];p=c['period'];kind=c['kind'];count=len(rows);ok=[valid(r) for r in rows]
    x=[source([r],c['source'])[0] if good else None for r,good in zip(rows,ok)];fields=[]
    def add(name,values,**extra):
        fields.append(dict(name=name,values=[v if v is not None and math.isfinite(v) else None for v in values],**extra))
    def windows(size):
        for i in range(count):
            yield None if i<size-1 or not all(ok[i-size+1:i+1]) else rows[i-size+1:i+1]
    def midpoint(size):
        return [None if not a else (max(r['high'] for r in a)+min(r['low'] for r in a))/2 for a in windows(size)]
    if kind=='HMA':
        half=rolling(x,max(1,n//2),True);whole=rolling(x,n,True)
        add('HMA',rolling([None if a is None or b is None else 2*a-b for a,b in zip(half,whole)],max(1,math.isqrt(n)),True))
    elif kind in ('SMMA','DEMA','TEMA'):
        a=smooth(x,n,kind=='SMMA')
        if kind=='SMMA':add('SMMA',a)
        else:
            b=smooth(a,n)
            if kind=='DEMA':add('DEMA',[None if u is None or v is None else 2*u-v for u,v in zip(a,b)])
            else:
                d=smooth(b,n);add('TEMA',[None if u is None or v is None or w is None else 3*u-3*v+w for u,v,w in zip(a,b,d)])
    elif kind=='ICHIMOKU':
        a=midpoint(c['tenkan']);b=midpoint(c['kijun']);add('Tenkan',a);add('Kijun',b)
        add('Senkou A',[None if u is None or v is None else (u+v)/2 for u,v in zip(a,b)],offset=c['displacement'])
        add('Senkou B',midpoint(c['span_b']),offset=c['displacement']);add('Chikou',[r['close'] if good else None for r,good in zip(rows,ok)],offset=-c['displacement'])
    elif kind=='SAR':
        out=[None]*count;state=None
        for i in range(count):
            if i==0 or not ok[i] or not ok[i-1]:state=None;continue
            r,prev=rows[i],rows[i-1]
            if state is None:
                bull=r['close']>prev['close'];ep=r['high'] if bull else r['low'];af=c['acceleration'];v=prev['low'] if bull else prev['high']
            else:
                bull,ep,af,v=state;v+=af*(ep-v);prior2=rows[i-2] if i>1 and ok[i-2] else prev
                if (bull and r['low']<v) or (not bull and r['high']>v):
                    v=ep;bull=not bull;ep=r['high'] if bull else r['low'];af=c['acceleration']
                else:
                    v=min(v,prev['low'],prior2['low']) if bull else max(v,prev['high'],prior2['high'])
                    if (bull and r['high']>ep) or (not bull and r['low']<ep):
                        ep=r['high'] if bull else r['low'];af=min(c['acceleration_max'],af+c['acceleration_step'])
            out[i]=v;state=bull,ep,af,v
        add('SAR',out,dots=True)
    elif kind=='ADX':
        tr=[];plus=[];minus=[]
        for i,r in enumerate(rows):
            if not i or not ok[i] or not ok[i-1]:tr.append(None);plus.append(None);minus.append(None);continue
            prev=rows[i-1];u=r['high']-prev['high'];d=prev['low']-r['low']
            tr.append(max(r['high']-r['low'],abs(r['high']-prev['close']),abs(r['low']-prev['close'])))
            plus.append(u if u>d and u>0 else 0.);minus.append(d if d>u and d>0 else 0.)
        t=smooth(tr,p,True);a=smooth(plus,p,True);b=smooth(minus,p,True)
        di=[None if t0 is None or v is None else 100*v/t0 if t0 else 0. for v,t0 in zip(a,t)]
        dn=[None if t0 is None or v is None else 100*v/t0 if t0 else 0. for v,t0 in zip(b,t)]
        dx=[None if u is None or v is None else 100*abs(u-v)/(u+v) if u+v else 0. for u,v in zip(di,dn)]
        add('+DI',di);add('-DI',dn);add('ADX',smooth(dx,p,True))
    elif kind=='AROON':
        up=[];down=[]
        for a in windows(p+1):
            if not a:up.append(None);down.append(None);continue
            h=max(range(p+1),key=lambda j:(a[j]['high'],j));l=min(range(p+1),key=lambda j:(a[j]['low'],-j));up.append(100*h/p);down.append(100*l/p)
        add('Aroon up',up);add('Aroon down',down);add('Aroon oscillator',[None if u is None else u-v for u,v in zip(up,down)])
    elif kind in ('LINREG','LSMA'):
        fit=[None]*count;den=n*(n*n-1)/12;xm=(n-1)/2
        for i,a in enumerate(windows(n)):
            if a is None:continue
            y=x[i-n+1:i+1];ym=sum(y)/n;slope=sum((j-xm)*(v-ym) for j,v in enumerate(y))/den;intercept=ym-slope*xm
            if kind=='LSMA':fit[i]=intercept+slope*(n-1)
            elif i==count-1:
                for j in range(n):fit[i-n+1+j]=intercept+slope*j
        add('Regression fit' if kind=='LINREG' else 'LSMA',fit,**({'mutable':True} if kind=='LINREG' else {}))
    elif kind=='CMO':
        gains=[None]+[None if a is None or b is None else max(b-a,0) for a,b in zip(x,x[1:])]
        losses=[None]+[None if a is None or b is None else max(a-b,0) for a,b in zip(x,x[1:])]
        a=rolling(gains,p);b=rolling(losses,p);add('CMO',[None if u is None or v is None else 100*(u-v)/(u+v) if u+v else 0. for u,v in zip(a,b)])
    elif kind=='DPO':
        ma=rolling(x,n);shift=n//2+1
        add('DPO',[x[i-shift]-v if i>=shift and x[i-shift] is not None and v is not None else None for i,v in enumerate(ma)],offset=-shift if c['centered'] else 0)
    elif kind=='KAMA':
        out=[];last=None;slow=2/(c['kama_slow']+1);fast=2/(c['kama_fast']+1)
        for i,a in enumerate(windows(n+1)):
            if a is None:last=None;out.append(None);continue
            v=x[i-n:i+1];vol=sum(abs(b-a) for a,b in zip(v,v[1:]));er=abs(v[-1]-v[0])/vol if vol else 0.;sc=(er*(fast-slow)+slow)**2
            if last is None:last=v[-2]
            last+=sc*(v[-1]-last);out.append(last)
        add('KAMA',out)
    elif kind=='MCGINLEY':
        ma=rolling(x,n);out=[];last=None
        for i,v in enumerate(x):
            if last is None:last=ma[i]
            elif v is None or v==0 or last==0:last=None
            else:
                try:den=c['mcginley_factor']*n*(v/last)**4;last=last+(v-last)/den if math.isfinite(den) and den>0 else None
                except (OverflowError,ZeroDivisionError):last=None
            if last is not None and not math.isfinite(last):last=None
            out.append(last)
        add('McGinley',out)
    elif kind=='VORTEX':
        pos=[];neg=[]
        for a in windows(p+1):
            if a is None:pos.append(None);neg.append(None);continue
            tr=sum(max(r['high']-r['low'],abs(r['high']-prev['close']),abs(r['low']-prev['close'])) for prev,r in zip(a,a[1:]))
            pos.append(sum(abs(r['high']-prev['low']) for prev,r in zip(a,a[1:]))/tr if tr else None)
            neg.append(sum(abs(r['low']-prev['high']) for prev,r in zip(a,a[1:]))/tr if tr else None)
        add('+VI',pos);add('-VI',neg)
    elif kind=='ZIGZAG':
        confirmed=[None]*count;known=[0]*count;provisional=[None]*count;seed=extreme=last=-1;direction=0
        for i,v in enumerate(x):
            if v is None:seed=extreme=last=-1;direction=0;continue
            if seed<0:seed=extreme=i;continue
            threshold=lambda value:abs(value)*c['reversal']/100
            pivot=None
            if direction==0:
                if v>x[seed] and v-x[seed]>=threshold(x[seed]):pivot=seed;direction=1;extreme=i
                elif v<x[seed] and x[seed]-v>=threshold(x[seed]):pivot=seed;direction=-1;extreme=i
            elif direction>0:
                if v>=x[extreme]:extreme=i
                elif x[extreme]-v>=threshold(x[extreme]):pivot=extreme;direction=-1;extreme=i
            else:
                if v<=x[extreme]:extreme=i
                elif v-x[extreme]>=threshold(x[extreme]):pivot=extreme;direction=1;extreme=i
            if pivot is not None:confirmed[pivot]=x[pivot];known[pivot]=rows[i]['time'];last=pivot
        if last>=0 and extreme>=0:provisional[last]=x[last];provisional[extreme]=x[extreme]
        if rows and (rows[-1].get('end_time') or 0)>time.time():
            candidate=next((i for i,t in enumerate(known) if t==rows[-1]['time']),None)
            if candidate is not None:
                confirmed[candidate]=None;known[candidate]=0;provisional[candidate]=x[candidate];provisional[-1]=x[-1]
                prior=next((j for j in range(candidate-1,-1,-1) if confirmed[j] is not None),None)
                if prior is not None:provisional[prior]=confirmed[prior]
        add('Confirmed pivots',confirmed,mutable=True,known_at=known);add('Provisional leg',provisional,mutable=True,provisional=True)
    return fields

def trend_studies(rows,c):
    fields=calculate_trend(rows,c);series=[]
    colors={'Tenkan':c['color'],'Kijun':c['signal_color'],'Senkou A':c['up_color'],'Senkou B':c['down_color'],'Chikou':c['upper_color'],'+DI':c['up_color'],'-DI':c['down_color'],'ADX':c['color'],'Aroon up':c['up_color'],'Aroon down':c['down_color'],'Aroon oscillator':c['color'],'+VI':c['up_color'],'-VI':c['down_color']}
    defaults={'ADX':[20,25],'AROON':[0,50,100],'CMO':[-50,0,50],'DPO':[0],'VORTEX':[1]}
    for f in fields:
        name=f['name'];opt=c['line_options'].get(name,{})
        if opt.get('visible') is False:continue
        points=[dict(time=r['time'],value=v) for r,v in zip(rows,f.pop('values'))]
        series.append(dict(id=c['id'],name=name,pane=c['id'] if c['kind'] in OSCILLATORS else 'main',histogram=False,color=opt.get('color') or colors.get(name,c['color']),width=opt.get('width') or c['width'],style=opt.get('style') if opt.get('style') is not None else 2 if f.get('provisional') else c['style'],opacity=opt.get('opacity') if opt.get('opacity') is not None else c['opacity'],points=points,levels=(c['reference_levels'] if c['reference_levels'] is not None else defaults.get(c['kind'],[])) if len(series)==0 else [],**{k:v for k,v in f.items() if k!='name'}))
    return series
