"""Validated historical conditions. Three-valued logic; no market requests or persistence."""
import math,time
from datetime import datetime,timedelta,time as daytime,timezone
from zoneinfo import ZoneInfo
from typing import Literal,Union,Annotated
from pydantic import BaseModel,Field,ConfigDict,model_validator
from .models import Timeframe,Source
from .indicators import IndicatorCalculator,rolling
UTC=timezone.utc
CATALOG={}
def register(kind,label,family,params=None):CATALOG[kind]=dict(kind=kind,label=label,family=family,defaults=params or {})
for direction in ('above','below'):
    register('close_'+direction,'Close '+direction+' price','Price',dict(value=100,currency='INR'))
    register('change_'+direction,'Price change % '+direction,'Price',dict(value=0))
    register('distance_ema_'+direction,'Distance from EMA % '+direction,'Price',dict(period=20,value=0))
    for ma in ('ema','sma'):register('price_'+direction+'_'+ma,'Close '+direction+' '+ma.upper(),'Moving averages',dict(period=20))
    register('rsi_'+direction,'RSI '+direction,'RSI',dict(period=14,source='close',value=30 if direction=='below' else 70))
    register('atr_'+direction,'ATR '+direction,'Volatility',dict(period=14,value=1,currency='INR'))
    register('volume_'+direction,'Volume '+direction,'Volume',dict(value=100000,volume_unit='shares'))
for direction in ('up','down'):
    register('price_cross_'+direction,'Price crosses '+direction+' level','Price',dict(value=100,currency='INR'))
    register('rsi_cross_'+direction,'RSI crosses '+direction,'RSI',dict(period=14,source='close',value=30 if direction=='up' else 70))
    for ma in ('ema','sma'):
        register(ma+'_cross_'+direction,ma.upper()+' crossover '+direction,'Moving averages',dict(fast=9,slow=21))
        register('price_cross_'+ma+'_'+direction,'Price crosses '+ma.upper()+' '+direction,'Moving averages',dict(period=20))
    register('macd_cross_'+direction,'MACD crossover '+direction,'MACD',dict(fast=12,slow=26,signal=9))
    register('bb_middle_cross_'+direction,'Close crosses BB middle '+direction,'Bollinger',dict(period=20,deviation=2))
    register('stoch_cross_'+direction,'Stochastic RSI K/D cross '+direction,'Stochastic RSI',dict(period=14,stoch_period=14,k=3,d=3))
for trend in ('rising','falling'):
    register('rsi_'+trend,'RSI '+trend,'RSI',dict(period=14,source='close'))
    register('histogram_'+trend,'MACD histogram '+trend,'MACD',dict(fast=12,slow=26,signal=9))
for sign in ('positive','negative'):
    for name in ('macd','histogram'):register(name+'_'+sign,name.upper()+' '+sign,'MACD',dict(fast=12,slow=26,signal=9))
for name in ('high','low'):
    register('nbar_'+name,'Bar reaches N-bar '+name,'Price',dict(period=20))
    register('year_'+name,'Bar reaches 52-week '+name,'Price')
for state in ('bullish','bearish','change'):
    register('supertrend_'+state,'Supertrend '+state,'Supertrend',dict(period=10,multiplier=3))
register('bb_above','Close above upper Bollinger','Bollinger',dict(period=20,deviation=2))
register('bb_below','Close below lower Bollinger','Bollinger',dict(period=20,deviation=2))
register('multi_ema_above','Close above multiple EMAs','Moving averages',dict(periods='9,21,50,200'))
register('rsi_overbought','RSI overbought','RSI',dict(period=14,source='close',value=70))
register('rsi_oversold','RSI oversold','RSI',dict(period=14,source='close',value=30))
for direction in ('above','below'):register('stoch_'+direction,'Stochastic RSI K '+direction,'Stochastic RSI',dict(period=14,stoch_period=14,k=3,d=3,value=80 if direction=='above' else 20))
register('volume_average','Volume above moving average','Volume',dict(period=20,volume_basis='including_current'))
register('relative_volume','Relative volume above multiplier','Volume',dict(period=20,value=1.5,volume_basis='previous'))
register('volume_breakout','Volume above preceding N-bar maximum','Volume',dict(period=20,multiplier=1))
class Parameters(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False,strict=True)
    period:int=Field(default=20,ge=2,le=500,strict=True)
    fast:int=Field(default=12,ge=1,le=499,strict=True)
    slow:int=Field(default=26,ge=2,le=500,strict=True)
    signal:int=Field(default=9,ge=1,le=500,strict=True)
    stoch_period:int=Field(default=14,ge=2,le=500,strict=True)
    k:int=Field(default=3,ge=1,le=50,strict=True)
    d:int=Field(default=3,ge=1,le=50,strict=True)
    value:float=Field(default=0,ge=-1e15,le=1e15)
    multiplier:float=Field(default=3,gt=0,le=20)
    deviation:float=Field(default=2,gt=0,le=10)
    source:Source='close'
    currency:str=Field(default='',max_length=12,pattern=r'^[A-Za-z0-9]*$')
    volume_basis:Literal['previous','including_current']='previous'
    volume_unit:Literal['shares','provider','base','quote','contracts']='shares'
    periods:str=Field(default='9,21,50,200',max_length=40)
    @model_validator(mode='after')
    def valid(self):
        if self.fast>=self.slow:raise ValueError('Fast period must precede slow period')
        try:periods=list(map(int,self.periods.split(',')))
        except ValueError:raise ValueError('Use comma-separated MA periods')
        if not 1<=len(periods)<=8 or len(set(periods))!=len(periods) or any(not 2<=p<=500 for p in periods):raise ValueError('Use 1–8 unique MA periods from 2 to 500')
        return self
class Condition(BaseModel):
    model_config=ConfigDict(extra='forbid')
    type:Literal['condition']='condition'
    kind:str=Field(max_length=60)
    params:dict=Field(default_factory=dict)
    @model_validator(mode='after')
    def valid(self):
        if self.kind not in CATALOG:raise ValueError('Unknown screener condition')
        defaults=CATALOG[self.kind]['defaults']
        if any(k not in defaults for k in self.params):raise ValueError('Parameter does not apply to this condition')
        merged={**defaults,**self.params};Parameters.model_validate(merged)
        if ('rsi' in self.kind or self.kind.startswith('stoch_')) and 'value' in merged and not 0<=merged['value']<=100:raise ValueError('Oscillator threshold must be 0–100')
        if self.kind in ('relative_volume','volume_breakout') and merged.get('value',1)<0:raise ValueError('Volume multiplier must be nonnegative')
        self.params=merged;return self
class ConditionGroup(BaseModel):
    model_config=ConfigDict(extra='forbid')
    type:Literal['group']='group'
    op:Literal['and','or']='and'
    children:list[Annotated[Union[Condition,'ConditionGroup'],Field(discriminator='type')]]=Field(min_length=1,max_length=12)
ConditionGroup.model_rebuild()
class ScreenConfig(BaseModel):
    model_config=ConfigDict(extra='forbid')
    version:Literal[1]=1
    universe:str=Field(default='nse_mainboard',max_length=100)
    mode:Literal['universe','watchlist','symbols']='universe'
    symbols:list[str]=Field(default_factory=list,max_length=1000)
    watchlist:str=Field(default='stocks',max_length=80)
    interval:Timeframe='1d'
    as_of:int|None=Field(default=None,ge=0,le=4102444800)
    completed:bool=True
    adjusted:bool=False
    batch_size:int=Field(default=25,ge=1,le=100,strict=True)
    offset:int=Field(default=0,ge=0,le=20000,strict=True)
    conditions:ConditionGroup=Field(default_factory=lambda:ConditionGroup(children=[Condition(kind='rsi_below',params={'period':14,'value':30})]))
    @model_validator(mode='after')
    def bounded(self):
        count=0
        def visit(node,depth):
            nonlocal count
            count+=1
            if depth>4 or count>64:raise ValueError('Use at most 64 nodes and four nested groups')
            if node.type=='group':
                for child in node.children:visit(child,depth+1)
        visit(self.conditions,0)
        if any(not s or len(s)>180 for s in self.symbols):raise ValueError('Invalid instrument identity')
        return self
class Preset(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(min_length=1,max_length=80)
    name:str=Field(min_length=1,max_length=64)
    config:ScreenConfig
class Presets(BaseModel):
    model_config=ConfigDict(extra='forbid')
    version:Literal[1]=1
    presets:list[Preset]=Field(default_factory=list,max_length=30)
    @model_validator(mode='after')
    def unique(self):
        if len({p.id for p in self.presets})!=len(self.presets):raise ValueError('Duplicate preset IDs')
        return self

def combine(op,values):
    if op=='and':return False if False in values else None if None in values else True
    return True if True in values else None if None in values else False

def completed_rows(rows,security,interval,cutoff,completed=True):
    """Published calendars where known; conservative next-local-period boundary otherwise."""
    zone=ZoneInfo(security.get('timezone') or 'UTC');result=[];closes={}
    if not rows:return result
    if security.get('calendar'):
        try:
            import exchange_calendars as xcals
            start=datetime.fromtimestamp(rows[0]['time'],UTC).date();end=datetime.fromtimestamp(min(cutoff,rows[-1]['time']+35*86400),UTC).date()+timedelta(days=35)
            cal=xcals.get_calendar(security['calendar'],start=str(start),end=str(end));closes={str(d)[:10]:int(r['close'].timestamp()) for d,r in cal.schedule.iterrows()}
        except (ValueError,KeyError,RuntimeError):pass
    seconds={'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400}
    for r in rows:
        if r['time']>cutoff:break
        if not completed:result.append(r);continue
        if r.get('partial'):continue
        if security.get('provider')=='hyperliquid' and r.get('end_time') is not None:
            if r['end_time']<=cutoff:result.append(r)
            continue
        if interval in seconds:
            end=r['time']+seconds[interval];day=datetime.fromtimestamp(r['time'],zone).date();close=closes.get(str(day))
            if security.get('exchange') in ('NSE','BSE'):close=int(datetime.combine(day,daytime(15,30),zone).timestamp())
            if close and r['time']<close:end=min(end,close)
        else:
            day=datetime.fromtimestamp(r['time'],UTC).date()
            if interval=='1d':boundary=day+timedelta(days=1);end=closes.get(str(day))
            elif interval=='1w':boundary=day-timedelta(days=day.weekday())+timedelta(days=7);end=max([v for k,v in closes.items() if str(day)<=k<str(boundary)],default=None)
            else:boundary=day.replace(day=28)+timedelta(days=4);boundary=boundary.replace(day=1);end=max([v for k,v in closes.items() if str(day)<=k<str(boundary)],default=None)
            if interval=='1d' and security.get('exchange') in ('NSE','BSE'):end=int(datetime.combine(day,daytime(15,30),zone).timestamp())
            if end is None:end=int(datetime.combine(boundary,daytime(),UTC if security.get('kind')=='crypto' else zone).timestamp())
        if end<=cutoff:result.append(r)
    return result

class Evaluation:
    def __init__(self,rows,security,interval):
        self.rows=rows;self.security=security;self.interval=interval;self.cache={};self.details=[]
        self.valid=all(all(type(r.get(k)) in (int,float) and math.isfinite(r[k]) for k in ('open','high','low','close')) and r['high']>=max(r['open'],r['low'],r['close']) and r['low']<=min(r['open'],r['close']) for r in rows)
    def indicator(self,kind,**params):
        key=(kind,tuple(sorted(params.items())))
        if key not in self.cache:self.cache[key]=IndicatorCalculator.calculate(self.rows,[dict(id='screen',kind=kind,**params)],self.interval,self.security.get('timezone','UTC'))['series']
        return [[p['value'] for p in s['points']] for s in self.cache[key]]
    def condition(self,c):
        p=c.params;k=c.kind;rows=self.rows;v=p.get('value',0);n=p.get('period',20)
        def unknown(message):return None,message
        def last(a):return a[-1] if a else None
        def compare(a,b,mode):
            if not a or not b or a[-1] is None or b[-1] is None:return unknown('Insufficient valid indicator history')
            if mode=='above':return a[-1]>b[-1],None
            if mode=='below':return a[-1]<b[-1],None
            if len(a)<2 or a[-2] is None or b[-2] is None:return unknown('Two consecutive completed values are required')
            return (a[-2]<=b[-2] and a[-1]>b[-1] if mode=='up' else a[-2]>=b[-2] and a[-1]<b[-1]),None
        if not rows:return unknown('No eligible as-of/completed candle')
        if not self.valid:return unknown('Invalid OHLC data; no prices or indicator values are invented')
        close=[r['close'] for r in rows];threshold=[v]*len(rows)
        if 'currency' in p and (not p['currency'] or p['currency']!=(self.security.get('currency') or '')):return unknown('Price/ATR threshold currency differs from instrument currency; no FX conversion assumed')
        ma=lambda kind,period:self.indicator(kind.upper(),length=period)[0]
        if k.startswith('close_'):return compare(close,threshold,k.split('_')[-1])
        if k.startswith('price_cross_') and k in ('price_cross_up','price_cross_down'):return compare(close,threshold,k.split('_')[-1])
        if k.startswith('change_'):
            if len(close)<2 or close[-2]==0:return unknown('Previous close is absent or zero')
            change=(close[-1]-close[-2])/abs(close[-2])*100;return (change>v if k.endswith('above') else change<v),None
        if k.startswith('distance_ema_'):
            avg=last(ma('EMA',n))
            if avg is None or avg==0:return unknown('EMA is unavailable or zero')
            value=(close[-1]-avg)/abs(avg)*100;return (value>v if k.endswith('above') else value<v),None
        if k.startswith(('nbar_','year_')):
            if k.startswith('year_'):
                start=rows[-1]['time']-364*86400
                if rows[0]['time']>start:return unknown('52 weeks of history unavailable')
                window=[r for r in rows if r['time']>=start]
            else:
                if len(rows)<n:return unknown('N-bar window unavailable')
                window=rows[-n:]
            high=k.endswith('high');level=max(r['high'] for r in window) if high else min(r['low'] for r in window);return (rows[-1]['high']>=level if high else rows[-1]['low']<=level),None
        if k=='multi_ema_above':
            values=[last(ma('EMA',int(period))) for period in p['periods'].split(',')]
            if any(a is None for a in values):return unknown('Some EMA periods are not warmed up')
            return all(close[-1]>a for a in values),None
        if k.startswith('price_'):
            kind='EMA' if 'ema' in k else 'SMA';return compare(close,ma(kind,n),'up' if k.endswith('_up') else 'down' if k.endswith('_down') else k.split('_')[1])
        if k.startswith(('ema_cross_','sma_cross_')):return compare(ma(k[:3],p['fast']),ma(k[:3],p['slow']),k.split('_')[-1])
        if k.startswith('rsi_'):
            a=self.indicator('RSI',period=n,source=p.get('source','close'))[0]
            if k.endswith(('rising','falling')):return compare(a,[None]+a[:-1],'above' if k.endswith('rising') else 'below')
            mode='up' if k.endswith('_up') else 'down' if k.endswith('_down') else 'above' if k.endswith(('above','overbought')) else 'below';return compare(a,threshold,mode)
        if k.startswith(('macd_','histogram_')):
            macd,signal,hist=self.indicator('MACD',fast=p['fast'],slow=p['slow'],signal=p['signal'])
            if 'cross' in k:return compare(macd,signal,k.split('_')[-1])
            a=hist if k.startswith('histogram') else macd
            return compare(a,[None]+a[:-1] if k.endswith(('rising','falling')) else [0]*len(a),'above' if k.endswith(('rising','positive')) else 'below')
        if k.startswith('bb_'):
            upper,middle,lower=self.indicator('BB',length=n,deviation=p['deviation'])
            return compare(close,middle if 'middle' in k else upper if k.endswith('above') else lower,'up' if k.endswith('_up') else 'down' if k.endswith('_down') else k.split('_')[-1])
        if k.startswith('supertrend_'):
            up,down=self.indicator('SUPERTREND',period=n,multiplier=p['multiplier']);states=[True if a is not None else False if b is not None else None for a,b in zip(up,down)]
            if states[-1] is None:return unknown('Supertrend warmup unavailable')
            if k.endswith('change'):return unknown('Two valid trend states required') if len(states)<2 or states[-2] is None else (states[-1]!=states[-2],None)
            return (states[-1] if k.endswith('bullish') else not states[-1]),None
        if k.startswith('atr_'):return compare(self.indicator('ATR',period=n)[0],threshold,k.split('_')[-1])
        if k.startswith('stoch_'):
            a,b=self.indicator('STOCHRSI',period=n,stoch_period=p['stoch_period'],k=p['k'],d=p['d'])
            return compare(a,b if 'cross' in k else threshold,k.split('_')[-1])
        if CATALOG[k]['family']=='Volume':
            kind=self.security.get('kind');expected='provider' if kind in ('crypto','future') else 'shares';allowed=('provider','base') if self.security.get('provider')=='hyperliquid' else (expected,)
            if kind in ('forex','index') or 'volume_unit' in p and p['volume_unit'] not in allowed:return unknown('Unsupported or mismatched volume units; crypto/futures volume is in provider-reported units; base/quote units are unconfirmed')
            vol=[r.get('volume') for r in rows]
            if vol[-1] is None or not math.isfinite(vol[-1]) or vol[-1]<0:return unknown('Valid volume unavailable')
            if k in ('volume_above','volume_below'):return compare(vol,threshold,k.split('_')[-1])
            window=vol[-n:] if p.get('volume_basis')=='including_current' else vol[-n-1:-1]
            if len(window)<n or any(a is None or a<0 or not math.isfinite(a) for a in window):return unknown('Preceding valid volume window unavailable')
            avg=sum(window)/n
            if k=='volume_breakout':return vol[-1]>max(window)*p['multiplier'],None
            if k=='volume_average':return vol[-1]>avg,None
            if avg==0:return unknown('Zero average volume; relative volume is undefined')
            return vol[-1]/avg>(v if k=='relative_volume' else 1),None
        return unknown('Unavailable condition')
    def tree(self,node):
        if node.type=='group':return combine(node.op,[self.tree(c) for c in node.children])
        value,reason=self.condition(node);self.details.append(dict(kind=node.kind,state='unknown' if value is None else 'matched' if value else 'no_match',reason=reason));return value
    def snapshot(self):
        if not self.rows or not self.valid:return {}
        def value(kind,index=0,**params):return self.indicator(kind,**params)[index][-1]
        closes=[r['close'] for r in self.rows];vol=[r.get('volume') for r in self.rows];window=vol[-21:-1];avg=sum(window)/20 if len(window)==20 and all(v is not None and v>=0 for v in window) else None
        valid_volume=self.security.get('kind') not in ('index','forex')
        periods={20,50,200}
        for kind,params in self.cache:
            if kind in ('EMA','SMA'):periods.add(dict(params)['length'])
        return dict(close=closes[-1],change=(closes[-1]-closes[-2])/abs(closes[-2])*100 if len(closes)>1 and closes[-2] else None,rsi=value('RSI',period=14),ema={str(p):value('EMA',length=p) for p in sorted(periods)},sma={str(p):value('SMA',length=p) for p in sorted(periods)},macd=value('MACD',fast=12,slow=26,signal=9),volume=vol[-1] if valid_volume else None,relative_volume=vol[-1]/avg if valid_volume and avg and vol[-1] is not None else None,volume_unit=(self.security.get('base_asset') or 'provider base')+' (base)' if self.security.get('provider')=='hyperliquid' else 'provider units (base/quote unconfirmed)' if self.security.get('kind')=='crypto' else 'provider units (contract reference)' if self.security.get('kind')=='future' else 'shares' if valid_volume else 'unavailable',candle_time=self.rows[-1]['time'])

def evaluate(history,security,config,now=None):
    instant=time.time() if now is None else now
    cutoff=min(config.as_of,instant) if config.as_of is not None else instant
    rows=completed_rows(history['candles'],{**security,'timezone':history.get('timezone') or security.get('timezone','UTC')},config.interval,cutoff,config.completed or config.as_of is not None)
    engine=Evaluation(rows,{**security,'currency':history.get('currency') or security.get('currency','')},config.interval);matched=engine.tree(config.conditions)
    return dict(currency=history.get('currency') or security.get('currency',''),timezone=history.get('timezone') or security.get('timezone','UTC'),status='matched' if matched is True else 'no_match' if matched is False else 'unknown',details=engine.details,**engine.snapshot(),bars=len(rows),source=history['source'],fetched_at=history['fetched_at'],first_available=history['first_available'],last_available=history['last_available'],adjusted=config.adjusted,as_of=cutoff,notice=history.get('notice','')+(' Current Yahoo adjustment factors are not point-in-time reconstructed.' if config.adjusted else '')+' Completed periods use exchange calendars where available; unknown session calendars conservatively wait for the next local period boundary.')
