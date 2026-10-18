"""Independent pandas/NumPy/Decimal specifications; never import production math."""
import math
from decimal import Decimal,localcontext
import numpy as np
import pandas as pd

def ema(x,n,wilder=False):
    a=pd.Series(x,dtype=float);out=pd.Series(np.nan,index=a.index);start=0
    while start<len(a):
        while start<len(a) and not np.isfinite(a.iloc[start]):start+=1
        end=start
        while end<len(a) and np.isfinite(a.iloc[end]):end+=1
        if end-start>=n:
            seed=a.iloc[start:start+n].mean();tail=pd.Series([seed,*a.iloc[start+n:end]],index=range(start+n-1,end));out.iloc[start+n-1:end]=tail.ewm(alpha=1/n if wilder else 2/(n+1),adjust=False).mean()
        start=end+1
    return out

def reference(rows,c,interval='1d'):
    df=pd.DataFrame(rows,columns=['time','open','high','low','close','volume'],dtype=float)
    good=np.isfinite(df[['open','high','low','close']]).all(axis=1)&(df.high>=df[['open','low','close']].max(axis=1))&(df.low<=df[['open','high','close']].min(axis=1))
    df.loc[~good,['open','high','low','close']]=np.nan
    h,l,close=df.high,df.low,df.close;s=c['source'];x=(h+l)/2 if s=='HL2' else (h+l+close)/3 if s=='HLC3' else df[['open','high','low','close']].mean(axis=1) if s=='OHLC4' else df[s]
    n,p=c['length'],c['period'];k=c['kind'];r={}
    def div(a,b):return a/b.where(b!=0)
    def roc(length):return (100*(x-x.shift(length))/x.shift(length).where(x.shift(length)!=0)).where(x.rolling(length+1).count()==length+1)
    tr=pd.concat([h-l,(h-close.shift()).abs(),(l-close.shift()).abs()],axis=1).max(axis=1).where(good)
    if k in ('STOCH','WILLR','DC'):
        length=c['stoch_period'] if k=='STOCH' else n;hi=h.rolling(length).max();lo=l.rolling(length).min()
        if k=='STOCH':a=100*div(x-lo,hi-lo);r={'Stochastic %K':a.rolling(c['k']).mean(),'Stochastic %D':a.rolling(c['k']).mean().rolling(c['d']).mean()}
        elif k=='WILLR':r={'Williams %R':-100*div(hi-x,hi-lo)}
        else:r={'Donchian upper':hi,'Donchian middle':(hi+lo)/2,'Donchian lower':lo}
    elif k=='CCI':
        mean=x.rolling(n).mean();mad=x.rolling(n).apply(lambda a:np.abs(a-a.mean()).mean(),raw=True);r={'CCI':div(x-mean,.015*mad)}
    elif k=='ROC':r={'ROC':roc(n)}
    elif k=='MOM':r={'Momentum':(x-x.shift(n)).where(x.rolling(n+1).count()==n+1)}
    elif k=='AO':r={'Awesome Oscillator':x.rolling(c['fast']).mean()-x.rolling(c['slow']).mean()}
    elif k=='ULTOSC':
        prev=close.shift();bp=(close-pd.concat([l,prev],axis=1).min(axis=1)).where(prev.notna());ranges=tr.where(prev.notna());a=[div(bp.rolling(q).sum(),ranges.rolling(q).sum()) for q in c['ultimate_periods']];r={'Ultimate Oscillator':100*(4*a[0]+2*a[1]+a[2])/7}
    elif k=='TSI':
        d=x.diff();tsi=100*div(ema(ema(d,c['slow']),c['fast']),ema(ema(d.abs(),c['slow']),c['fast']));r={'TSI':tsi,'TSI signal':ema(tsi,c['signal'])}
    elif k=='FISHER':
        lo=x.rolling(n).min();hi=x.rolling(n).max();out=[];trigger=[];norm=last=Decimal(0);ready=False
        with localcontext() as ctx:
            ctx.prec=40
            for i in range(len(x)):
                if pd.isna(lo.iloc[i]) or lo.iloc[i]==hi.iloc[i]:out.append(np.nan);trigger.append(np.nan);norm=last=Decimal(0);ready=False;continue
                u=(Decimal(str(x.iloc[i]))-Decimal(str(lo.iloc[i])))/(Decimal(str(hi.iloc[i]))-Decimal(str(lo.iloc[i])))
                norm=max(Decimal('-.999'),min(Decimal('.999'),Decimal('.66')*(u-Decimal('.5'))+Decimal('.67')*norm));f=((1+norm)/(1-norm)).ln()/2+last/2;out.append(float(f));trigger.append(float(last) if ready else np.nan);last=f;ready=True
        r={'Fisher':pd.Series(out,dtype=float),'Fisher trigger':pd.Series(trigger,dtype=float)}
    elif k=='PPO':
        fast=ema(x,c['fast']);slow=ema(x,c['slow']);ppo=100*div(fast-slow,slow);sig=ema(ppo,c['signal']);r={'PPO':ppo,'PPO signal':sig,'PPO histogram':ppo-sig}
    elif k=='KST':
        a=[roc(q).rolling(ma).mean() for q,ma in zip(c['roc_lengths'],c['kst_smoothing'])];kst=sum((i+1)*v for i,v in enumerate(a));r={'KST':kst,'KST signal':kst.rolling(c['signal']).mean()}
    elif k=='COPPOCK':r={'Coppock':(roc(c['fast'])+roc(c['slow'])).rolling(n).apply(lambda a:np.dot(a,np.arange(1,n+1))/np.arange(1,n+1).sum(),raw=True)}
    elif k in ('CKS','KC'):
        atr=ema(tr,p,True)
        if k=='KC':
            m=ema(x,n);r={'Keltner upper':m+c['multiplier']*atr,'Keltner middle':m,'Keltner lower':m-c['multiplier']*atr}
        else:r={'CKS short stop':(h.rolling(n).max()-c['multiplier']*atr).rolling(c['stop_period']).max(),'CKS long stop':(l.rolling(n).min()+c['multiplier']*atr).rolling(c['stop_period']).min()}
    elif k=='STDDEV':r={'Standard Deviation':x.rolling(n).std(ddof=int(c['sample']))}
    elif k=='HV':
        ret=np.log((x/x.shift()).where((x>0)&(x.shift()>0))) if c['hv_returns']=='log' else div(x-x.shift(),x.shift())
        mode=c['annualization'];days=365 if mode=='crypto' else c['annual_days'];minutes=1440 if mode=='crypto' else c['session_minutes'];factor=1 if mode=='per_bar' else c['annual_bars'] if mode=='custom' else days if interval=='1d' else 12 if interval=='1M' else days/(7 if mode=='crypto' else 5) if interval=='1w' else days*minutes/int(interval[:-1])/(60 if interval.endswith('h') else 1)
        r={'Historical Volatility':ret.rolling(n).std(ddof=int(c['sample']))*100*math.sqrt(factor)}
    elif k=='CHAIKIN_VOL':a=ema(h-l,n);r={'Chaikin Volatility':(100*div(a-a.shift(p),a.shift(p))).where(a.rolling(p+1).count()==p+1)}
    elif k=='CHOP':r={'Choppiness':100*np.log10(div(tr.rolling(n).sum(),h.rolling(n).max()-l.rolling(n).min()))/np.log10(n)}
    elif k=='MASS':a=ema(h-l,p);r={'Mass Index':div(a,ema(a,p)).rolling(n).sum()}
    return {name:v.replace([np.inf,-np.inf],np.nan).to_numpy() for name,v in r.items()}
