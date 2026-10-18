"""Reference indicator engine. Nullable warmups/gaps, no external data requests."""
import math
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
IST=ZoneInfo('Asia/Kolkata')

def rolling(values,p,weighted=False):
    out=[];total=0.;weight=0.;invalid=0
    for i,x in enumerate(values):
        v=0. if x is None else x
        if weighted:
            weight=weight-total+p*v if i>=p else weight+(i+1)*v
        total+=v;invalid+=x is None
        if i>=p:
            old=values[i-p];total-=0. if old is None else old;invalid-=old is None
        out.append(None if i<p-1 or invalid else weight/(p*(p+1)/2) if weighted else total/p)
    return out

def smooth(values,p,wilder=False):
    out=[];seed=[];last=None;alpha=1/p if wilder else 2/(p+1)
    for x in values:
        if x is None:seed=[];last=None;out.append(None);continue
        if last is None:
            seed.append(x)
            if len(seed)==p:last=sum(seed)/p
        else:last=x*alpha+last*(1-alpha)
        out.append(last)
    return out

def rsi(values,p):
    gains=[None]+[max(0,b-a) for a,b in zip(values,values[1:])]
    losses=[None]+[max(0,a-b) for a,b in zip(values,values[1:])]
    g,l=smooth(gains,p,True),smooth(losses,p,True)
    return [None if a is None else 50. if a==0 and b==0 else 100. if b==0 else 100-100/(1+a/b) for a,b in zip(g,l)]

def source(rows,key):
    if key=='HL2':return [(r['high']+r['low'])/2 for r in rows]
    if key=='HLC3':return [(r['high']+r['low']+r['close'])/3 for r in rows]
    if key=='OHLC4':return [(r['open']+r['high']+r['low']+r['close'])/4 for r in rows]
    return [r[key] for r in rows]

def atr(rows,p):
    tr=[max(r['high']-r['low'],abs(r['high']-rows[i-1]['close']),abs(r['low']-rows[i-1]['close'])) if i else r['high']-r['low'] for i,r in enumerate(rows)]
    return smooth(tr,p,True)

class IndicatorCalculator:
    @staticmethod
    def calculate(rows,configs,interval='1d',market_timezone='Asia/Kolkata',volume_context=None,reference_context=None):
        from .volume_indicators import KINDS as VOLUME,volume_studies,warning,good
        from .models import IndicatorConfig
        from .trend_indicators import KINDS,trend_studies
        from .momentum_indicators import KINDS as E2,momentum_studies
        from .custom_indicators import KINDS as CUSTOM
        series=[];warnings=list((reference_context or {}).get('warnings',[])) if any(c.get('visible',True) and c.get('kind') in CUSTOM for c in configs) else []
        if any(not isinstance(r.get('time'),(int,float)) or not math.isfinite(r['time']) or (i and r['time']<=rows[i-1]['time']) for i,r in enumerate(rows)):
            return dict(series=[],warnings=['Invalid candle timestamps: require finite, unique, chronological UTC times.'])
        for raw in configs:
            cfg=IndicatorConfig.model_validate(raw).model_dump();kind=cfg['kind'];id=cfg['id']
            if not cfg['visible']:continue
            from .custom_indicators import KINDS as CUSTOM,custom_studies
            if kind in CUSTOM:
                result,notices=custom_studies(rows,cfg,interval,{**(reference_context or {}),**(volume_context or {})});series.extend(result);warnings.extend(f'{id}: {v}' for v in notices);continue
            if kind in VOLUME:
                result=volume_studies(rows,cfg,volume_context);series.extend(result)
                if any(not good(r,volume_context) for r in rows) or not any(p['value'] is not None for s in result for p in s['points']):warnings.append(warning(rows,cfg,volume_context))
                continue
            if kind in E2:
                result=momentum_studies(rows,cfg,interval);series.extend(result)
                if not any(p['value'] is not None for s in result for p in s['points']):warnings.append(f'{id}: Insufficient candles or undefined values for these parameters.')
                continue
            if kind in KINDS:
                result=trend_studies(rows,cfg);series.extend(result)
                if not any(p['value'] is not None for s in result for p in s['points']):warnings.append(f'{id}: Insufficient candles or undefined values for these parameters.')
                continue
            values=source(rows,cfg['source']);length=cfg['length'];period=cfg['period']
            oscillator=kind in ('RSI','MACD','STOCHRSI','ATR');pane=id if oscillator else 'main'
            def add(name,arr,color=None,hist=False,levels=None):
                series.append(dict(id=id,name=name,pane=pane,histogram=hist,color=color or cfg['color'],width=cfg['width'],style=cfg['style'],
                    points=[dict(time=r['time'],value=v) for r,v in zip(rows,arr)],levels=levels or []))
            if kind in ('SMA','EMA','WMA'):add(f'{kind} {length}',smooth(values,length) if kind=='EMA' else rolling(values,length,kind=='WMA'))
            elif kind=='VWMA':
                valid=[r['volume'] is not None for r in rows]
                vols=[r['volume'] if valid[i] else None for i,r in enumerate(rows)]
                num=rolling([v*values[i] if v is not None else None for i,v in enumerate(vols)],length);den=rolling(vols,length)
                add(f'VWMA {length}',[a/b if a is not None and b is not None and b>0 else None for a,b in zip(num,den)])
                if not all(valid):warnings.append(f'{id}: VWMA omitted where complete valid volume windows are unavailable.')
            elif kind=='RSI':add(f'RSI {period}',rsi(values,period),levels=[cfg['oversold'],cfg['overbought']])
            elif kind=='MACD':
                fast,slow=smooth(values,cfg['fast']),smooth(values,cfg['slow'])
                macd=[a-b if a is not None and b is not None else None for a,b in zip(fast,slow)]
                signal=smooth(macd,cfg['signal']);hist=[a-b if a is not None and b is not None else None for a,b in zip(macd,signal)]
                add('MACD',macd);add('Signal',signal,cfg['signal_color']);add('Histogram',hist,cfg['up_color'],True,levels=[0])
                series[-1]['down_color']=cfg['down_color']
            elif kind=='STOCHRSI':
                rs=rsi(values,period);raw=[];p=cfg['stoch_period']
                for i,x in enumerate(rs):
                    window=rs[max(0,i-p+1):i+1]
                    raw.append(None if len(window)<p or any(v is None for v in window) else 0. if max(window)==min(window) else 100*(x-min(window))/(max(window)-min(window)))
                k=rolling(raw,cfg['k']);d=rolling(k,cfg['d'])
                add('Stoch RSI K',k,levels=[cfg['oversold'],cfg['overbought']]);add('Stoch RSI D',d,cfg['signal_color'])
            elif kind=='BB':
                middle=rolling(values,length);square=rolling([x*x for x in values],length)
                dev=[None if m is None else math.sqrt(max(0,s-m*m))*cfg['deviation'] for m,s in zip(middle,square)]
                add('BB upper',[None if m is None else m+d for m,d in zip(middle,dev)],cfg['upper_color']);add('BB middle',middle);add('BB lower',[None if m is None else m-d for m,d in zip(middle,dev)],cfg['lower_color'])
            elif kind=='ATR':add(f'ATR {period}',atr(rows,period))
            elif kind=='SUPERTREND':
                ranges=atr(rows,period);up=[];down=[];upper=lower=last=None;bull=False
                for i,(r,a) in enumerate(zip(rows,ranges)):
                    if a is None:up.append(None);down.append(None);continue
                    mid=(r['high']+r['low'])/2;u=mid+cfg['multiplier']*a;l=mid-cfg['multiplier']*a
                    if upper is None:upper=u;lower=l;bull=False
                    else:
                        previous=rows[i-1]['close'];upper=u if u<upper or previous>upper else upper;lower=l if l>lower or previous<lower else lower
                        bull=r['close']>=lower if bull else r['close']>upper
                    last=lower if bull else upper;up.append(last if bull else None);down.append(None if bull else last)
                add('Supertrend up',up,cfg['up_color']);add('Supertrend down',down,cfg['down_color'])
            elif kind=='VWAP':
                if cfg['anchor']=='session' and interval in ('1d','1w','1M'):
                    warnings.append(f'{id}: Session VWAP needs intraday bars; use week/month anchoring for daily bars.');add('VWAP',[None]*len(rows));continue
                total=vol=0.;lastkey=None;broken=False;result=[]
                for r,value in zip(rows,values):
                    d=datetime.fromtimestamp(r['time'],ZoneInfo(market_timezone) if interval not in ('1d','1w','1M') else ZoneInfo('UTC')).date()
                    key=(r.get('session') or d) if cfg['anchor']=='session' else d-timedelta(days=d.weekday()) if cfg['anchor']=='week' else d.replace(day=1)
                    if key!=lastkey:total=vol=0.;broken=False;lastkey=key
                    if r['volume'] is None:broken=True
                    elif not broken:total+=value*r['volume'];vol+=r['volume']
                    result.append(total/vol if not broken and vol>0 else None)
                add('VWAP',result)
                if any(r['volume'] is None for r in rows):warnings.append(f'{id}: VWAP unavailable after missing volume until the next anchor.')
            if series and not any(p['value'] is not None for s in series if s['id']==id for p in s['points']):warnings.append(f'{id}: Insufficient candles or volume for these parameters.')
        return dict(series=series,warnings=warnings)
