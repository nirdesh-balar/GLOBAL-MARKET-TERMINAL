"""Independent pandas vectors for the explicitly documented public variants.
No production financial helpers are imported.
"""
import numpy as np
import pandas as pd
def seeded(series,n,wilder=False):
    result=pd.Series(np.nan,index=series.index,dtype=float);start=0
    while start<len(series):
        while start<len(series) and pd.isna(series.iloc[start]):start+=1
        end=start
        while end<len(series) and pd.notna(series.iloc[end]):end+=1
        if end-start>=n:
            v=series.iloc[start+n-1:end].astype(float).copy();v.iloc[0]=series.iloc[start:start+n].mean();result.iloc[start+n-1:end]=v.ewm(alpha=1/n if wilder else 2/(n+1),adjust=False).mean()
        start=end+1
    return result
def alpha(rows,n=14,multiplier=1,momentum='mfi',source='HLC3'):
    f=pd.DataFrame(rows);x=(f.high+f.low+f.close)/3 if source=='HLC3' else f[source];tr=pd.concat([f.high-f.low,(f.high-f.close.shift()).abs(),(f.low-f.close.shift()).abs()],axis=1).max(axis=1);a=tr.rolling(n).mean()
    if momentum=='mfi':
        raw=x*f.volume;up=raw.where(x.diff()>0,0.);down=raw.where(x.diff()<0,0.);up.iloc[0]=down.iloc[0]=np.nan;p=up.rolling(n).sum();q=down.rolling(n).sum();m=100*p/(p+q)
    else:
        d=x.diff();g=seeded(d.clip(lower=0),n,True);l=seeded((-d).clip(lower=0),n,True);m=100-100/(1+g/l);m=m.mask((g==0)&(l==0),50).mask((l==0)&(g>0),100)
    output=[];last=None
    for i,row in f.iterrows():
        if pd.isna(a.iloc[i]) or pd.isna(m.iloc[i]):last=None
        else:
            rising=m.iloc[i]>=50;candidate=row.low-multiplier*a.iloc[i] if rising else row.high+multiplier*a.iloc[i];last=candidate if last is None else max(last,candidate) if rising else min(last,candidate)
        output.append(last)
    return output
def half(rows,n=2,atr_period=100,multiplier=2):
    f=pd.DataFrame(rows);tr=pd.concat([f.high-f.low,(f.high-f.close.shift()).abs(),(f.low-f.close.shift()).abs()],axis=1).max(axis=1);a=seeded(tr,atr_period,True);h=f.high.rolling(n).max();l=f.low.rolling(n).min();hm=f.high.rolling(n).mean();lm=f.low.rolling(n).mean();direction=0;watch_fall=False;floor=ceiling=trail=None;output=[]
    for i,r in f.iterrows():
        if pd.isna(a.iloc[i]) or pd.isna(hm.iloc[i]):output.append(None);continue
        if floor is None:floor=l.iloc[i];ceiling=h.iloc[i]
        previous=direction
        if watch_fall:
            floor=max(floor,l.iloc[i])
            if hm.iloc[i]<floor and r.close<f.low.iloc[i-1]:direction=1;watch_fall=False;ceiling=h.iloc[i]
        else:
            ceiling=min(ceiling,h.iloc[i])
            if lm.iloc[i]>ceiling and r.close>f.high.iloc[i-1]:direction=0;watch_fall=True;floor=l.iloc[i]
        boundary=floor if direction==0 else ceiling
        if trail is None:trail=boundary
        elif direction==previous:trail=max(trail,boundary) if direction==0 else min(trail,boundary)
        output.append(trail)
    return output
