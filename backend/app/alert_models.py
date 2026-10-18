"""Versioned, bounded alert definitions. Conditions are typed data, never executable code."""
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from pydantic import BaseModel,Field,ConfigDict,model_validator
from .models import Timeframe
from .screener_conditions import ConditionGroup,Condition,ScreenConfig

class AlertDefinition(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False,strict=True)
    version:Literal[1]=1
    name:str=Field(default='Historical alert',min_length=1,max_length=80)
    instrument:str=Field(min_length=1,max_length=180)
    interval:Timeframe='1d'
    conditions:ConditionGroup=Field(default_factory=lambda:ConditionGroup(children=[Condition(kind='price_cross_up')]))
    message:str=Field(default='',max_length=500)
    repeat:Literal['once','candle','crossing']='crossing'
    expires_at:int|None=Field(default=None,ge=0,le=4102444800)
    enabled:bool=True
    completed:bool=True
    adjusted:bool=False
    evaluation:Literal['candles','live_price']='candles'
    @model_validator(mode='after')
    def bounded(self):
        ScreenConfig(conditions=self.conditions)
        if self.evaluation=='live_price':
            def leaves(n):return [n.kind] if n.type=='condition' else [k for c in n.children for k in leaves(c)]
            if any(k not in ('close_above','close_below','price_cross_up','price_cross_down') for k in leaves(self.conditions)):raise ValueError('Live-price mode supports price threshold/crossing conditions only; indicators use candle mode')
            if self.repeat=='candle' or self.adjusted:raise ValueError('Live-price alerts use once/crossing repeat and unadjusted native prices')
        if not self.name.strip() or any(ord(c)<32 and c not in '\n\t' for c in self.message):raise ValueError('Use a name and plain notification text')
        return self

class AlertSettings(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    version:Literal[1]=1
    paused:bool=False
    poll_seconds:int=Field(default=300,ge=60,le=86400,strict=True)
    quiet_enabled:bool=False
    quiet_start:str=Field(default='22:00',pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    quiet_end:str=Field(default='08:00',pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    timezone:str=Field(default='Asia/Kolkata',max_length=80)
    sound:Literal['default','none','Basso','Glass','Hero','Ping','Pop','Submarine']='default'
    @model_validator(mode='after')
    def zone(self):
        try:ZoneInfo(self.timezone)
        except (ValueError,ZoneInfoNotFoundError):raise ValueError('Use a valid IANA quiet-hours timezone')
        if self.quiet_enabled and self.quiet_start==self.quiet_end:raise ValueError('Choose different quiet-hours start and end times')
        return self

def quiet_now(settings,now):
    if not settings.quiet_enabled:return False
    local=datetime.fromtimestamp(now,ZoneInfo(settings.timezone)).strftime('%H:%M');a,b=settings.quiet_start,settings.quiet_end
    return a<=local<b if a<b else local>=a or local<b

class AlertRuntime(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False,strict=True)
    status:Literal['disabled','arming','armed','expired','unknown','stale','waiting_candle','waiting_market','watching','skipped_old_signal','completed_once','triggered','cooldown','missing','error']
    active_since:float=Field(ge=0)
    last_attempt:float|None=None
    last_evaluated_candle:int|None=None
    last_state:bool|None=None
    last_successful_data:int|None=None
    last_fetched_at:float|None=None
    last_triggered:float|None=None
    last_candle_end:int|None=None
    source:str|None=Field(default=None,max_length=100)
    timezone:str|None=Field(default=None,max_length=80)
    error:str|None=Field(default=None,max_length=5000)
    failures:int=Field(default=0,ge=0)
    last_price:float|None=None
    last_price_time:float|None=None
    last_trade_id:int|None=None
    stream_generation:int|None=None
    monitoring:str|None=Field(default=None,max_length=100)
    connection:str|None=Field(default=None,max_length=60)
    received_at:float|None=None
    market_type:str|None=Field(default=None,max_length=30)
