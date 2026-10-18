"""Independent pandas/NumPy/Decimal vectors. No production financial helpers."""
import numpy as np
import pandas as pd
from decimal import Decimal,localcontext

def seeded(s,n,alpha):
    out=pd.Series(np.nan,index=s.index,dtype=float);g=s.notna();groups=(~g).cumsum()
    for _,part in s[g].groupby(groups[g]):
        if len(part)<n:continue
        a=part.iloc[n-1:].astype(float).copy();a.iloc[0]=part.iloc[:n].mean();out.loc[a.index]=a.ewm(alpha=alpha,adjust=False).mean()
    return out

def reference(rows,c,context=None):
    if not rows:return []
    frame=pd.DataFrame(rows);fields=['open','high','low','close','volume'];f=frame[fields].apply(pd.to_numeric,errors='coerce');ok=np.isfinite(f).all(axis=1)&(f.volume>=0)&(f.high>=f[['open','close','low']].max(axis=1))&(f.low<=f[['open','close','high']].min(axis=1))
    if (context or {}).get('zero_volume_is_missing'):ok&=f.volume!=0
    f=f.where(ok);v=f.volume;key=c['source'];x=f.close if key=='close' else f.open if key=='open' else f.high if key=='high' else f.low if key=='low' else (f.high+f.low)/2 if key=='HL2' else (f.high+f.low+f.close)/3 if key=='HLC3' else f[['open','high','low','close']].mean(axis=1,skipna=False)
    n=c['length'];k=c['kind'];rang=f.high-f.low;loc=((2*f.close-f.high-f.low)/rang).where(rang!=0,0).where(ok);mf=loc*v
    if k in ('OBV','ADL','PVT','NVI','PVI'):
        if k=='ADL':terms=mf
        elif k=='OBV':terms=np.sign(x.diff())*v;terms.iloc[0]=0 if ok.iloc[0] else np.nan
        else:
            change=x.diff()/x.shift();change=change.where(x.shift()!=0)
            if k=='PVT':terms=change*v;terms.iloc[0]=0 if ok.iloc[0] else np.nan
            else:
                eligible=(v<v.shift()) if k=='NVI' else (v>v.shift());terms=(1+change).where(eligible,1).where(ok&ok.shift(fill_value=False));terms.iloc[0]=1 if ok.iloc[0] else np.nan
        # Decimal accumulation/products provide independently rounded reference totals.
        ans=[];total=Decimal(str(c['volume_seed'])) if k in ('NVI','PVI') else Decimal(0);broken=False
        with localcontext() as ctx:
            ctx.prec=40
            for a in terms:
                if not np.isfinite(a):broken=True
                if not broken:total=total*Decimal(str(a)) if k in ('NVI','PVI') else total+Decimal(str(a))
                ans.append(np.nan if broken else float(total))
        return ans
    if k=='CMF':a=mf.rolling(n).sum();b=v.rolling(n).sum();out=a/b.where(b!=0)
    elif k=='MFI':
        valid=(x>=0)&(x.shift()>=0);raw=x*v;positive=raw.where(x>x.shift(),0).where(valid);negative=raw.where(x<x.shift(),0).where(valid);a=positive.rolling(n).sum();b=negative.rolling(n).sum();out=100*a/(a+b).where((a+b)!=0)
    elif k=='VO':
        a=v.rolling(c['fast']).mean() if c['volume_ma']=='sma' else seeded(v,c['fast'],2/(c['fast']+1));b=v.rolling(c['slow']).mean() if c['volume_ma']=='sma' else seeded(v,c['slow'],2/(c['slow']+1));out=100*(a-b)/b.where(b!=0) if c['volume_osc_mode']=='percent' else a-b
    elif k=='EOM':out=(((f.high+f.low)/2).diff()*rang*c['eom_divisor']/v.where(v!=0)).rolling(n).mean()
    elif k=='TMF':
        hi=pd.concat([f.high,f.close.shift()],axis=1).max(axis=1,skipna=False);lo=pd.concat([f.low,f.close.shift()],axis=1).min(axis=1,skipna=False);r=hi-lo;mf=((2*f.close-hi-lo)/r).where(r!=0,0)*v;good=ok&ok.shift(fill_value=False);a=seeded(mf.where(good),n,1/n);b=seeded(v.where(good),n,1/n);out=100*a/b.where(b!=0)
    else:out=(100*(v-v.shift(n))/v.shift(n).where(v.shift(n)!=0)).where(v.rolling(n+1).count()==n+1)
    return out.replace([np.inf,-np.inf],np.nan).tolist()
