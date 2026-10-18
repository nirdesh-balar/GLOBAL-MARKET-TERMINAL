from typing import Literal
from pydantic import BaseModel,Field,model_validator,field_validator,ConfigDict
Timeframe=Literal['1m','5m','15m','30m','1h','4h','1d','1w','1M']
IndicatorKind=Literal['SMA','EMA','WMA','VWMA','RSI','MACD','STOCHRSI','BB','ATR','SUPERTREND','VWAP','HMA','ICHIMOKU','SAR','ADX','ZIGZAG','AROON','LINREG','CMO','DPO','KAMA','LSMA','MCGINLEY','SMMA','TEMA','DEMA','VORTEX','STOCH','CCI','ROC','AO','MOM','WILLR','ULTOSC','TSI','FISHER','PPO','KST','COPPOCK','CKS','KC','DC','STDDEV','HV','CHAIKIN_VOL','CHOP','MASS','OBV','CMF','MFI','ADL','VO','EOM','NVI','PVI','PVT','TMF','VROC','PIVOT','SWING_PIVOT','CPR','CPR_MTF','ORB','PREV_OHLC','ALPHATREND','HALFTREND','RELATIVE_STRENGTH','VRVP','INDIA_VIX']
Source=Literal['close','open','high','low','HL2','HLC3','OHLC4']
Color=str
class StudyLineOptions(BaseModel):
    model_config=ConfigDict(extra='forbid')
    visible:bool=True
    color:str|None=Field(default=None,pattern=r'^#[0-9a-fA-F]{6}$')
    width:Literal[1,2,3,4]|None=None
    style:Literal[0,1,2,3,4]|None=None
    opacity:float|None=Field(default=None,ge=0,le=1,allow_inf_nan=False)
class IndicatorConfig(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(min_length=1,max_length=80)
    kind:IndicatorKind
    visible:bool=True
    source:Source='close'
    length:int=Field(default=20,ge=1,le=500)
    period:int=Field(default=14,ge=2,le=500)
    fast:int=Field(default=12,ge=1,le=500)
    slow:int=Field(default=26,ge=2,le=500)
    signal:int=Field(default=9,ge=1,le=500)
    stoch_period:int=Field(default=14,ge=2,le=500)
    k:int=Field(default=3,ge=1,le=50)
    d:int=Field(default=3,ge=1,le=50)
    deviation:float=Field(default=2,gt=0,le=10)
    multiplier:float=Field(default=3,gt=0,le=20)
    overbought:float=Field(default=70,ge=0,le=100)
    oversold:float=Field(default=30,ge=0,le=100)
    color:str=Field(default='#f4bd61',pattern=r'^#[0-9a-fA-F]{6}$')
    signal_color:str=Field(default='#86aaf9',pattern=r'^#[0-9a-fA-F]{6}$')
    upper_color:str=Field(default='#6d83c9',pattern=r'^#[0-9a-fA-F]{6}$')
    lower_color:str=Field(default='#6d83c9',pattern=r'^#[0-9a-fA-F]{6}$')
    up_color:str=Field(default='#37c5a2',pattern=r'^#[0-9a-fA-F]{6}$')
    down_color:str=Field(default='#ee6a79',pattern=r'^#[0-9a-fA-F]{6}$')
    width:Literal[1,2,3,4]=1
    style:Literal[0,1,2,3,4]=0
    anchor:Literal['session','week','month']='session'
    tenkan:int=Field(default=9,ge=1,le=500)
    kijun:int=Field(default=26,ge=1,le=500)
    span_b:int=Field(default=52,ge=1,le=500)
    displacement:int=Field(default=26,ge=0,le=500)
    acceleration:float=Field(default=.02,gt=0,le=1,allow_inf_nan=False)
    acceleration_step:float=Field(default=.02,gt=0,le=1,allow_inf_nan=False)
    acceleration_max:float=Field(default=.2,gt=0,le=1,allow_inf_nan=False)
    reversal:float=Field(default=5,gt=0,le=100,allow_inf_nan=False)
    kama_fast:int=Field(default=2,ge=1,le=500)
    kama_slow:int=Field(default=30,ge=2,le=500)
    mcginley_factor:float=Field(default=.6,gt=0,le=2,allow_inf_nan=False)
    centered:bool=False
    opacity:float=Field(default=1,ge=0,le=1,allow_inf_nan=False)
    cloud_opacity:float=Field(default=.16,ge=0,le=1,allow_inf_nan=False)
    line_options:dict[str, 'StudyLineOptions']=Field(default_factory=dict,max_length=12)
    reference_levels:list[float]|None=Field(default=None,max_length=6)
    reference_source:Literal['provider','chart']='provider'
    pivot_variant:Literal['traditional','classic','camarilla','woodie']='traditional'
    pivot_reference:Literal['1d','1w','1M']='1d'
    swing_left:int=Field(default=3,ge=1,le=100)
    swing_right:int=Field(default=3,ge=1,le=100)
    orb_minutes:int=Field(default=15,ge=1,le=240)
    session_template:Literal['auto','nse','us','utc','custom']='auto'
    session_zone:str=Field(default='exchange',max_length=80)
    session_open:int=Field(default=0,ge=0,le=1439)
    alpha_momentum:Literal['mfi','rsi']='mfi'
    benchmark:str=Field(default='',max_length=300)
    relative_mode:Literal['ratio','performance','percent']='percent'
    profile_bins:int=Field(default=24,ge=2,le=128)
    profile_value_area:float=Field(default=70,ge=1,le=100,allow_inf_nan=False)
    profile_width:float=Field(default=30,ge=5,le=80,allow_inf_nan=False)
    @field_validator('session_zone')
    @classmethod
    def e3b_zone(cls,v):
        if v!='exchange':
            from zoneinfo import ZoneInfo
            try:ZoneInfo(v)
            except (KeyError,ValueError):raise ValueError('Use an IANA session timezone') from None
        return v
    volume_ma:Literal['ema','sma']='ema'
    volume_osc_mode:Literal['percent','absolute']='percent'
    eom_divisor:float=Field(default=100000000,gt=0,le=1e12,allow_inf_nan=False)
    volume_seed:float=Field(default=1000,gt=0,le=1e12,allow_inf_nan=False)
    roc_lengths:list[int]=Field(default_factory=lambda:[10,15,20,30],min_length=4,max_length=4)
    kst_smoothing:list[int]=Field(default_factory=lambda:[10,10,10,15],min_length=4,max_length=4)
    ultimate_periods:list[int]=Field(default_factory=lambda:[7,14,28],min_length=3,max_length=3)
    stop_period:int=Field(default=9,ge=1,le=500)
    sample:bool=False
    hv_returns:Literal['log','arithmetic']='log'
    annualization:Literal['per_bar','sessions','crypto','custom']='per_bar'
    annual_days:int=Field(default=252,ge=1,le=366)
    session_minutes:int=Field(default=390,ge=1,le=1440)
    annual_bars:float=Field(default=252,gt=0,le=10000000,allow_inf_nan=False)
    @field_validator('roc_lengths','kst_smoothing','ultimate_periods',mode='before')
    @classmethod
    def valid_e2_periods(cls,v):
        if not isinstance(v,list) or any(not isinstance(x,int) or isinstance(x,bool) or x<1 or x>500 for x in v):raise ValueError('Study lookbacks must be integers from 1 to 500')
        return v
    @field_validator('line_options')
    @classmethod
    def valid_line_names(cls,v):
        if any(not k or len(k)>40 for k in v):raise ValueError('Invalid study line name')
        return v
    @field_validator('reference_levels')
    @classmethod
    def finite_levels(cls,v):
        import math
        if v is not None and any(not math.isfinite(x) or abs(x)>1e12 for x in v):raise ValueError('Reference levels must be finite')
        return v
    @model_validator(mode='before')
    @classmethod
    def defaults(cls,value):
        if isinstance(value,dict):
            value=dict(value)
            if value.get('kind')=='SUPERTREND':value.setdefault('period',10)
            if value.get('kind')=='VWAP':value.setdefault('source','HLC3')
            from .momentum_indicators import DEFAULTS
            for key,item in DEFAULTS.get(value.get('kind'),{}).items():value.setdefault(key,item)
            from .custom_indicators import DEFAULTS as CUSTOM_DEFAULTS
            for key,item in CUSTOM_DEFAULTS.get(value.get('kind'),{}).items():value.setdefault(key,item)
            from .volume_indicators import DEFAULTS as VOLUME_DEFAULTS
            for key,item in VOLUME_DEFAULTS.get(value.get('kind'),{}).items():value.setdefault(key,item)
            if value.get('kind')=='STOCHRSI':value.setdefault('overbought',80);value.setdefault('oversold',20)
        return value
    @model_validator(mode='after')
    def valid(self):
        from .custom_indicators import KINDS as CUSTOM
        if self.kind not in CUSTOM and len(self.line_options)>8:raise ValueError('Up to eight legacy study line options are supported')
        if self.kind=='VO' and self.fast>=self.slow:raise ValueError('Fast period must be less than slow period')
        if self.kind in ('PPO','AO','TSI','COPPOCK') and self.fast>=self.slow:raise ValueError('Fast period must be less than slow period')
        if self.kind=='ULTOSC' and not self.ultimate_periods[0]<self.ultimate_periods[1]<self.ultimate_periods[2]:raise ValueError('Ultimate periods must be strictly increasing')
        if self.kind in ('CCI','STDDEV','HV','CHOP') and self.length<2:raise ValueError('Length must be at least 2')
        if self.kind=='SAR' and self.acceleration>self.acceleration_max:raise ValueError('SAR initial acceleration exceeds maximum')
        if self.kind=='KAMA' and self.kama_fast>=self.kama_slow:raise ValueError('KAMA fast length must be less than slow length')
        if self.kind in ('HMA','LINREG','LSMA','DPO') and self.length<2:raise ValueError('Length must be at least 2')
        if self.kind=='MACD' and self.fast>=self.slow:raise ValueError('MACD fast period must be less than slow period')
        if self.oversold>=self.overbought:raise ValueError('Oversold must be less than overbought')
        return self

def migrate_indicator(value,index):
    if isinstance(value,dict):return value
    kind='BB' if value.startswith('BB') else 'RSI' if value.startswith('RSI') else value[:3]
    length=int(''.join(c for c in value if c.isdigit()) or '20')
    return dict(id=f'legacy-{index}-{value}',kind=kind,length=length,period=length,color='#b49cff' if kind=='RSI' else '#f4bd61')
class ScaleSettings(BaseModel):
    logarithmic:bool=False
    auto:bool=True
    percentage:bool=False
class SymbolEntry(BaseModel):
    symbol:str=Field(max_length=60)
    token:str=Field(min_length=1,max_length=180)
    instrument_id:str|None=Field(default=None,max_length=180)
    kind:Literal['equity','index','crypto','forex','future','etf','fund']='equity'
    name:str=Field(default='',max_length=160)
    exchange:str=Field(default='NSE',max_length=60)
    canonical_id:str|None=Field(default=None,max_length=180)
    provider:str='yahoo'
    category:str='stocks'
    country:str='India'
    currency:str='INR'
    timezone:str='Asia/Kolkata'
    calendar:str|None=None
    precision:int=Field(default=2,ge=0,le=10)
    contract:str=''
    market_type:str=Field(default='',max_length=32)
    native_id:str=Field(default='',max_length=60)
    base_asset:str=Field(default='',max_length=40)
    quote_asset:str=Field(default='',max_length=40)
    identity_version:Literal[1]=1
    legacy_unresolved:bool=False
    native_mapping:str=Field(default='',max_length=64)
    size_decimals:int|None=Field(default=None,ge=0,le=18)
    trading_availability:str=Field(default='',max_length=32)
    verified_at:float=0
    @model_validator(mode='after')
    def identity_policy(self):
        from .market_router import MarketDataRouter
        from .providers.base import ProviderError
        try:MarketDataRouter.validate(self.model_dump(),allow_legacy=True)
        except (ProviderError,ValueError) as e:raise ValueError(str(e)) from None
        if self.kind=='crypto' and self.provider=='yahoo':self.legacy_unresolved=True
        return self
    @field_validator('timezone')
    @classmethod
    def valid_timezone(cls,value):
        from zoneinfo import ZoneInfo
        try:ZoneInfo(value)
        except (KeyError,ValueError):raise ValueError('Use a valid IANA timezone') from None
        return value
class ChartAppearance(BaseModel):
    up_color:str=Field(default='#37c5a2',pattern=r'^#[0-9a-fA-F]{6}$')
    down_color:str=Field(default='#ee6a79',pattern=r'^#[0-9a-fA-F]{6}$')
    wick_up:str=Field(default='#37c5a2',pattern=r'^#[0-9a-fA-F]{6}$')
    wick_down:str=Field(default='#ee6a79',pattern=r'^#[0-9a-fA-F]{6}$')
    border_up:str=Field(default='#37c5a2',pattern=r'^#[0-9a-fA-F]{6}$')
    border_down:str=Field(default='#ee6a79',pattern=r'^#[0-9a-fA-F]{6}$')
    borders:bool=False
    price_line:bool=True
    last_value:bool=True
    background:str|None=Field(default=None,pattern=r'^#[0-9a-fA-F]{6}$')
    grid_color:str|None=Field(default=None,pattern=r'^#[0-9a-fA-F]{6}$')
    grid_visible:bool=True
    grid_opacity:float=Field(default=.45,ge=0,le=1,allow_inf_nan=False)
    watermark:bool=False
    crosshair:bool=True
    margin_top:float=Field(default=.15,ge=0,le=.4,allow_inf_nan=False)
    margin_bottom:float=Field(default=.1,ge=0,le=.4,allow_inf_nan=False)
    time_visible:bool=True
    dates_visible:bool=True
    bar_spacing:float=Field(default=7,ge=1,le=50,allow_inf_nan=False)
    session_separators:bool=False
class DrawingAnchor(BaseModel):
    time:int=Field(ge=0,le=4102444800)
    price:float=Field(allow_inf_nan=False)
DRAWING_ANCHORS={'horizontal':1,'vertical':1,'trend':2,'rectangle':2,'ray':2,'info_line':2,'extended':2,'trend_angle':2,'horizontal_ray':1,'crossline':1,'parallel_channel':3,'regression_channel':2,'flat_channel':3,'disjoint_channel':4,'text':1,'note':1,'price_note':1,'fib_retracement':2,'fib_extension':3,'price_range':2,'date_range':2,'date_price_range':2,'ruler':2,'arrow':2,'arrow_marker':1,'arrow_up':1,'arrow_down':1,'circle':2,'ellipse':2,'triangle':3,'polyline':2,'pitchfork':3,'schiff_pitchfork':3,'modified_schiff':3,'inside_pitchfork':3,'fib_channel':3,'fib_time_zone':2,'fib_speed_fan':2,'fib_trend_time':3,'fib_circles':2,'fib_spiral':2,'fib_arcs':2,'fib_wedge':2,'pitchfan':3,'gann_box':2,'gann_square_fixed':2,'gann_square':2,'gann_fan':2,'xabcd':5,'cypher':5,'head_shoulders':7,'abcd':4,'triangle_pattern':5,'three_drives':7,'elliott_impulse':6,'elliott_correction':4,'elliott_triangle':6,'elliott_double':4,'elliott_triple':6,'cyclic_lines':2,'time_cycles':2,'sine_line':3,'brush':2,'highlighter':2,'rotated_rectangle':3,'path':2,'arc':3,'curve':3,'double_curve':4,'callout':2,'comment':1,'pin':1,'price_label':1,'signpost':1,'flag_mark':1,'table':2,'image':2,'long_position':3,'short_position':3,'position_forecast':2,'bars_pattern':3,'ghost_feed':1,'sector':2,'anchored_vwap':1,'fixed_volume_profile':2,'anchored_volume_profile':1}
class FibLevel(BaseModel):
    model_config=ConfigDict(extra='forbid')
    ratio:float=Field(ge=-1000,le=1000,allow_inf_nan=False)
    color:str|None=Field(default=None,pattern=r'^#[0-9a-fA-F]{6}$')
    dash:Literal['solid','dash','dot']|None=None
    width:Literal[1,2,3,4]|None=None
    visible:bool|None=None
class DrawingParameters(BaseModel):
    model_config=ConfigDict(extra='forbid')
    price_precision:int|None=Field(default=None,ge=-1,le=10,strict=True)
    account_size:float|None=Field(default=None,ge=0,le=1000000000000000.0,allow_inf_nan=False)
    risk_percent:float|None=Field(default=None,ge=0,le=100,allow_inf_nan=False)
    position_size:float|None=Field(default=None,ge=0,le=1000000000000.0,allow_inf_nan=False)
    unit_multiplier:float|None=Field(default=None,ge=1e-12,le=1000000000000.0,allow_inf_nan=False)
    lot_step:float|None=Field(default=None,ge=1e-12,le=1000000000000.0,allow_inf_nan=False)
    money_rate:float|None=Field(default=None,ge=1e-12,le=1000000000000.0,allow_inf_nan=False)
    scale_factor:float|None=Field(default=None,ge=0.001,le=1000,allow_inf_nan=False)
    bar_scale:float|None=Field(default=None,ge=0.01,le=100,allow_inf_nan=False)
    displacement:float|None=Field(default=None,ge=-1000000000000.0,le=1000000000000.0,allow_inf_nan=False)
    sector_angle:float|None=Field(default=None,ge=-360,le=360,allow_inf_nan=False)
    fill_bands:bool|None=None
    bands:float|None=Field(default=None,ge=0,le=10,allow_inf_nan=False)
    value_area:float|None=Field(default=None,ge=1,le=100,allow_inf_nan=False)
    histogram_width:float|None=Field(default=None,ge=1,le=100,allow_inf_nan=False)
    auto_size:bool|None=None
    sizing_confirmed:bool|None=None
    profile_left:bool|None=None
    show_histogram:bool|None=None
    show_poc:bool|None=None
    show_value_area:bool|None=None
    display_currency:str|None=Field(default=None,max_length=2000)
    ghost_bars:str|None=Field(default=None,max_length=2000)
    bull_color:str|None=Field(default=None,pattern=r'^#[0-9a-fA-F]{6}$')
    bear_color:str|None=Field(default=None,pattern=r'^#[0-9a-fA-F]{6}$')
    bins:int|None=Field(default=None,ge=2,le=128)
    price_source:Literal['HLC3','O','H','L','C','HL2','OHLC4']|None=None
    @field_validator('ghost_bars')
    @classmethod
    def hypothetical_candles(cls,value):
        from .drawing_analytics import parse_ghost
        if value is not None:parse_ghost(value)
        return value

    image_data:str|None=Field(default=None,max_length=175000)
    stroke_size:float|None=Field(default=None,ge=4,le=40,allow_inf_nan=False)
    arrowhead:bool|None=None
    @field_validator('image_data')
    @classmethod
    def bounded_png(cls,value):
        if not value:return value
        import base64,struct
        if not value.startswith('data:image/png;base64,'):raise ValueError('Only embedded PNG images are permitted')
        try:data=base64.b64decode(value[22:],validate=True)
        except Exception:raise ValueError('Invalid PNG encoding')
        if len(data)>131072 or len(data)<33 or data[:8]!=b'\x89PNG\r\n\x1a\n' or data[12:16]!=b'IHDR':raise ValueError('Invalid or oversized PNG')
        width,height=struct.unpack('>II',data[16:24])
        if not 1<=width<=1024 or not 1<=height<=1024:raise ValueError('PNG dimensions exceed 1024 pixels')
        return value
    phase:float|None=Field(default=None,ge=-360,le=360,allow_inf_nan=False)
    price_per_bar:float|None=Field(default=None,ge=1e-10,le=1e12,allow_inf_nan=False)
    calibrated:bool|None=None
    show_ratios:bool|None=None
    aperture:float|None=Field(default=None,ge=1,le=360,allow_inf_nan=False)
    turns:float|None=Field(default=None,ge=.25,le=4,allow_inf_nan=False)
    levels:list[FibLevel]|None=Field(default=None,min_length=1,max_length=32)
    reverse:bool|None=None
    extend_left:bool|None=None
    extend_right:bool|None=None
    labels:bool|None=None
    marker_size:float|None=Field(default=None,ge=8,le=80,allow_inf_nan=False)
    @field_validator('levels')
    @classmethod
    def unique_levels(cls,value):
        if value and len({l.ratio for l in value})!=len(value):raise ValueError('Duplicate Fibonacci ratios')
        return value
    text:str|None=Field(default=None,max_length=2000)
    font_size:float|None=Field(default=None,ge=8,le=48,allow_inf_nan=False)
    offset_x:float|None=Field(default=None,ge=-500,le=500,allow_inf_nan=False)
    offset_y:float|None=Field(default=None,ge=-500,le=500,allow_inf_nan=False)
    channel_width:float|None=Field(default=None,ge=0,le=1e12,allow_inf_nan=False)
    deviation:float|None=Field(default=None,ge=.01,le=10,allow_inf_nan=False)
    price_unit:float|None=Field(default=None,ge=1e-10,le=1e12,allow_inf_nan=False)
    bar_unit:float|None=Field(default=None,ge=1e-6,le=1e6,allow_inf_nan=False)
class Drawing(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(min_length=1,max_length=80)
    kind:Literal['horizontal','vertical','trend','rectangle','ray','info_line','extended','trend_angle','horizontal_ray','crossline','parallel_channel','regression_channel','flat_channel','disjoint_channel','text','note','price_note','fib_retracement','fib_extension','price_range','date_range','date_price_range','ruler','arrow','arrow_marker','arrow_up','arrow_down','circle','ellipse','triangle','polyline','pitchfork','schiff_pitchfork','modified_schiff','inside_pitchfork','fib_channel','fib_time_zone','fib_speed_fan','fib_trend_time','fib_circles','fib_spiral','fib_arcs','fib_wedge','pitchfan','gann_box','gann_square_fixed','gann_square','gann_fan','xabcd','cypher','head_shoulders','abcd','triangle_pattern','three_drives','elliott_impulse','elliott_correction','elliott_triangle','elliott_double','elliott_triple','cyclic_lines','time_cycles','sine_line','brush','highlighter','rotated_rectangle','path','arc','curve','double_curve','callout','comment','pin','price_label','signpost','flag_mark','table','image','long_position','short_position','position_forecast','bars_pattern','ghost_feed','sector','anchored_vwap','fixed_volume_profile','anchored_volume_profile']
    anchors:list[DrawingAnchor]=Field(min_length=1,max_length=512)
    color:str=Field(default='#86aaf9',pattern=r'^#[0-9a-fA-F]{6}$')
    width:Literal[1,2,3,4]=2
    version:Literal[1,2]=1
    dash:Literal['solid','dash','dot']='solid'
    opacity:float=Field(default=1,ge=0,le=1,allow_inf_nan=False)
    fill_opacity:float=Field(default=.08,ge=0,le=1,allow_inf_nan=False)
    visible:bool=True
    locked:bool=False
    params:DrawingParameters=Field(default_factory=DrawingParameters)
    @model_validator(mode='after')
    def geometry(self):
        if self.version==1 and any(a.price<=0 for a in self.anchors):raise ValueError('Legacy drawing prices must be positive')
        if (self.kind in ('polyline','path','brush','highlighter','position_forecast') and not 2<=len(self.anchors)<=(512 if self.kind in ('brush','highlighter') else 32)) or (self.kind not in ('polyline','path','brush','highlighter','position_forecast') and len(self.anchors)!=DRAWING_ANCHORS[self.kind]):raise ValueError('Invalid drawing anchors')
        if self.kind in ('polyline','path','brush','highlighter','position_forecast') and any(a==b for a,b in zip(self.anchors,self.anchors[1:])):raise ValueError('Polyline vertices must be distinct')
        if self.kind in ('parallel_channel','regression_channel','flat_channel','disjoint_channel') and self.anchors[0].time==self.anchors[1].time:raise ValueError('A channel needs distinct trading bars')
        if self.kind=='disjoint_channel' and self.anchors[2].time==self.anchors[3].time:raise ValueError('The second channel boundary needs distinct trading bars')
        # Preserve degenerate legacy segments; reject new zero-length lines.
        if self.version==2 and self.kind in ('trend','ray','extended','info_line','trend_angle') and self.anchors[0]==self.anchors[1]:raise ValueError('Choose two distinct anchors')
        allowed={'text','font_size','offset_x','offset_y'} if self.kind in ('text','note','price_note') else {'price_unit','bar_unit'} if self.kind=='trend_angle' else {'channel_width','deviation'} if self.kind=='regression_channel' else {'channel_width'} if 'channel' in self.kind else {'levels','reverse','extend_left','extend_right','labels'} if self.kind in ('fib_retracement','fib_extension') else {'marker_size'} if self.kind in ('arrow_marker','arrow_up','arrow_down') else set()
        advanced={'pitchfork':{'levels','labels','extend_left','extend_right'},'schiff_pitchfork':{'levels','labels','extend_left','extend_right'},'modified_schiff':{'levels','labels','extend_left','extend_right'},'inside_pitchfork':{'levels','labels','extend_left','extend_right'},'fib_channel':{'levels','labels','extend_left','extend_right'},'fib_time_zone':{'levels','labels'},'fib_trend_time':{'levels','labels'},'fib_speed_fan':{'levels','labels'},'pitchfan':{'levels','labels'},'fib_circles':{'levels','labels','price_unit','bar_unit'},'fib_arcs':{'levels','labels','price_unit','bar_unit'},'fib_wedge':{'levels','labels','price_unit','bar_unit','aperture'},'fib_spiral':{'price_unit','bar_unit','turns','reverse','labels'}}
        advanced.update({k:{'levels','labels','price_per_bar','calibrated','reverse'} for k in ('gann_square_fixed','gann_square','gann_fan')})
        advanced['gann_box']={'levels','labels'}
        advanced.update({k:{'labels','show_ratios'} for k in ('xabcd','cypher','head_shoulders','abcd','triangle_pattern','three_drives')})
        advanced.update({k:{'labels','show_ratios'} for k in ('elliott_impulse','elliott_correction','elliott_triangle','elliott_double','elliott_triple')})
        advanced.update({'cyclic_lines':{'labels'},'time_cycles':{'labels'},'sine_line':{'labels','phase'}})
        advanced.update({k:{'price_unit','bar_unit'} for k in ('rotated_rectangle','arc')})
        advanced.update({k:{'text','font_size','offset_x','offset_y'} for k in ('callout','comment','pin','price_label','signpost','flag_mark')})
        advanced.update({'table':{'text','font_size'},'image':{'image_data'},'highlighter':{'stroke_size'},'path':{'arrowhead'}})
        advanced.update({'long_position': {'price_precision', 'auto_size', 'unit_multiplier', 'sizing_confirmed', 'position_size', 'lot_step', 'bear_color', 'bull_color', 'money_rate', 'display_currency', 'risk_percent', 'account_size'}, 'short_position': {'price_precision', 'auto_size', 'unit_multiplier', 'sizing_confirmed', 'position_size', 'lot_step', 'bear_color', 'bull_color', 'money_rate', 'display_currency', 'risk_percent', 'account_size'}, 'position_forecast': {'bull_color', 'text', 'bear_color'}, 'bars_pattern': {'displacement', 'bar_scale', 'scale_factor'}, 'ghost_feed': {'bull_color', 'ghost_bars', 'bear_color'}, 'sector': {'sector_angle', 'bar_unit', 'price_unit'}, 'anchored_vwap': {'price_source', 'bands', 'levels', 'fill_bands'}, 'fixed_volume_profile': {'show_histogram', 'profile_left', 'bull_color', 'show_poc', 'bins', 'histogram_width', 'show_value_area', 'bear_color', 'value_area'}, 'anchored_volume_profile': {'show_histogram', 'profile_left', 'bull_color', 'show_poc', 'bins', 'histogram_width', 'show_value_area', 'bear_color', 'value_area'}})
        allowed=advanced.get(self.kind,allowed)
        if any(k not in allowed for k,v in self.params.model_dump().items() if v is not None):raise ValueError('Parameter does not apply to this drawing tool')
        return self
class DrawingToolbarPreferences(BaseModel):
    favourites:list[str]=Field(default_factory=list,max_length=32)
    recent:list[str]=Field(default_factory=list,max_length=12)
    last_used:dict[str,str]=Field(default_factory=dict,max_length=7)
    @model_validator(mode='after')
    def tools(self):
        valid=set(DRAWING_ANCHORS)
        if any(t not in valid for t in self.favourites+self.recent+list(self.last_used.values())):raise ValueError('Unknown enabled drawing tool')
        if any(k not in ('lines','fibonacci','patterns','forecast','shapes','text','measure') for k in self.last_used):raise ValueError('Unknown drawing category')
        if len(set(self.favourites))!=len(self.favourites) or len(set(self.recent))!=len(self.recent):raise ValueError('Duplicate toolbar tools')
        return self
class SidebarPreferences(BaseModel):
    visible:bool=True
    width:int=Field(default=320,ge=220,le=480)
    volume:bool=False
    sort:Literal['manual','symbol','change']='manual'
class StudyLayout(BaseModel):
    height:int=Field(default=104,ge=48,le=600)
    collapsed:bool=False
class Pane(SymbolEntry):
    study_layout:dict[str,StudyLayout]=Field(default_factory=dict,max_length=21)
    @field_validator("study_layout")
    @classmethod
    def bounded_study_layout(cls,value):
        if any(not k or len(k)>100 for k in value):raise ValueError("Invalid study pane identity")
        return value
    auto_refresh:bool=True
    auto_follow:bool=True
    id:str=Field(max_length=40)
    timeframe:Timeframe='1d'
    chart_type:Literal['candles','line','area']='candles'
    indicators:list[IndicatorConfig]=Field(default_factory=lambda:[IndicatorConfig(id='default-ema',kind='EMA')],max_length=20)
    volume:bool=True
    scale:ScaleSettings=Field(default_factory=ScaleSettings)
    appearance:ChartAppearance=Field(default_factory=ChartAppearance)
    drawing_sets:dict[str,list[Drawing]]=Field(default_factory=dict,max_length=100)
    drawings_locked:bool=False
    drawings_hidden:bool=False
    indicators_hidden:bool=False
    @field_validator('drawing_sets')
    @classmethod
    def bounded_drawings(cls,value):
        if sum(len(v) for v in value.values())>250:raise ValueError('A chart supports at most 250 drawings across all symbol/timeframe sets')
        if any(len(k)>180 or len(v)>100 or len({d.id for d in v})!=len(v) for k,v in value.items()):raise ValueError('Drawing sets must contain at most 100 unique drawings')
        return value
    @field_validator('indicators',mode='before')
    @classmethod
    def migration(cls,value):return [migrate_indicator(v,i) for i,v in enumerate(value)]
    @model_validator(mode='after')
    def unique_indicators(self):
        if len({r.id for r in self.indicators})!=len(self.indicators):raise ValueError('Indicator IDs must be unique within a pane')
        return self
class Watchlist(BaseModel):
    market:str|None=None
    id:str=Field(min_length=1,max_length=80)
    name:str=Field(min_length=1,max_length=64)
    items:list[SymbolEntry]=Field(default_factory=list,max_length=100)
    @model_validator(mode='after')
    def unique_items(self):
        self.name=self.name.strip()
        if not self.name:raise ValueError('Enter a watchlist name')
        if len({r.canonical_id or r.instrument_id or r.symbol for r in self.items})!=len(self.items):raise ValueError('Duplicate watchlist symbols')
        return self
class IndicatorPreset(BaseModel):
    id:str=Field(min_length=1,max_length=80)
    name:str=Field(min_length=1,max_length=64)
    indicators:list[IndicatorConfig]=Field(max_length=20)
    @model_validator(mode='after')
    def valid_preset(self):
        self.name=self.name.strip()
        if not self.name:raise ValueError('Enter a preset name')
        if len({i.id for i in self.indicators})!=len(self.indicators):raise ValueError('Duplicate preset indicator IDs')
        return self
class Workspace(BaseModel):
    unsupported_indicator_archive:list[dict]=Field(default_factory=list,max_length=1024)
    @model_validator(mode='before')
    @classmethod
    def retain_unsupported_studies(cls,value):
        # Preserve exact legacy records, without drawing a substitute or rewriting
        # the stored database during read. Only the explicitly unsupported names
        # are archived; malformed working configurations still fail validation.
        import copy,re
        if not isinstance(value,dict):return value
        value=copy.deepcopy(value)
        archive=value.setdefault('unsupported_indicator_archive',[])
        unsupported={'OPENINTERESTPROFILE','OIPROFILE','OPTIONCHAIN','OPTIONCHAININDICATORS','DHANALPHATREND','DHANHALFTREND','DHANPROPRIETARYALPHATRENDHALFTREND'}
        for group in ('panes','presets'):
            for item in value.get(group,[]):
                if not isinstance(item,dict) or not isinstance(item.get('indicators'),list):continue
                retained=[]
                for record in item['indicators']:
                    name=record.get('kind','') if isinstance(record,dict) else record
                    key=re.sub('[^A-Z0-9]','',str(name).upper())
                    if key in unsupported:
                        entry=dict(location=group,owner=item.get('id'),record=record)
                        if entry not in archive:archive.append(entry)
                    else:retained.append(record)
                item['indicators']=retained
        return value
    watchlist_version:Literal[1]=1
    watchlist_revision:int=Field(default=0,ge=0)
    drawing_tools:DrawingToolbarPreferences=Field(default_factory=DrawingToolbarPreferences)
    layout:Literal[1,2,4,6,8]=2
    panes:list[Pane]=Field(min_length=8,max_length=8)
    watchlist:list[SymbolEntry]=Field(default_factory=list,max_length=100)
    watchlists:list[Watchlist]=Field(default_factory=list,max_length=40)
    active_watchlist:str='stocks'
    presets:list[IndicatorPreset]=Field(default_factory=list,max_length=30)
    theme:Literal['dark','light']='dark'
    sidebar:SidebarPreferences=Field(default_factory=SidebarPreferences)
    sync_time:bool=False
    sync_crosshair:bool=False
    @model_validator(mode='after')
    def validate_ids(self):
        if len({p.id for p in self.panes})!=8:raise ValueError('Pane identifiers must be unique')
        if len({w.id for w in self.watchlists})!=len(self.watchlists):raise ValueError('Watchlist IDs must be unique')
        if len({p.id for p in self.presets})!=len(self.presets):raise ValueError('Preset IDs must be unique')
        if self.watchlists and self.active_watchlist not in {w.id for w in self.watchlists}:raise ValueError('Select a valid active watchlist')
        return self
class CacheConfig(BaseModel):
    capacity:int=Field(default=32,ge=1,le=128)
    ttl:int=Field(default=900,ge=30,le=86400)
    concurrency:int=Field(default=2,ge=1,le=2)
    min_interval:float=Field(default=1.5,ge=1.5,le=30)
class InputCandle(BaseModel):
    complete:bool|None=None
    partial:bool=False
    session:str|None=None
    end_time:float|None=Field(default=None,ge=0,allow_inf_nan=False)
    time:int=Field(ge=0)
    open:float=Field(allow_inf_nan=False)
    high:float=Field(allow_inf_nan=False)
    low:float=Field(allow_inf_nan=False)
    close:float=Field(allow_inf_nan=False)
    volume:float|None=Field(default=None,ge=0,allow_inf_nan=False)
    @field_validator('volume',mode='before')
    @classmethod
    def numeric_volume(cls,value):
        if isinstance(value,bool):raise ValueError('Volume must be a number or null, not a boolean')
        return value
    @model_validator(mode='after')
    def geometry(self):
        if self.end_time is not None and self.end_time<=self.time:raise ValueError('Candle end must follow its UTC start')
        if self.high<max(self.open,self.low,self.close) or self.low>min(self.open,self.close):raise ValueError('Invalid OHLC geometry')
        return self
class IndicatorRequest(BaseModel):
    reference_context:dict=Field(default_factory=dict)
    @field_validator('reference_context')
    @classmethod
    def validated_reference_context(cls,v):
        from .custom_indicators import finite,valid
        if set(v)-{'primary','references','sessions','benchmarks','warnings','retrieved_at','volume_unit','zero_volume_is_missing'}:raise ValueError('Unknown reference-context field')
        total=0
        def bars(a,reference=False):
            nonlocal total
            if not isinstance(a,list) or len(a)>60000:raise ValueError('Reference arrays must contain at most 60,000 candles')
            total+=len(a)
            if total>240000:raise ValueError('Reference-context candle budget exceeded')
            previous=None
            for r in a:
                if not isinstance(r,dict) or not valid(r) or not finite(r.get('time')) or previous is not None and r['time']<=previous:raise ValueError('Require finite OHLC and chronological unique reference timestamps')
                previous=r['time']
                if reference and (not finite(r.get('start')) or r.get('end') is not None and (not finite(r['end']) or r['end']<=r['start']) or not isinstance(r.get('complete'),bool)):raise ValueError('Invalid completed-reference boundaries')
        refs=v.get('references',{})
        if not isinstance(refs,dict) or set(refs)-{'1d','1w','1M'}:raise ValueError('Invalid reference periods')
        for a in refs.values():bars(a,True)
        sessions=v.get('sessions',[])
        if not isinstance(sessions,list) or len(sessions)>60000 or any(not isinstance(s,(list,tuple)) or len(s)!=3 or not finite(s[0]) or not finite(s[1]) or s[1]<=s[0] or not isinstance(s[2],str) or len(s[2])>20 for s in sessions):raise ValueError('Invalid session boundaries')
        benchmarks=v.get('benchmarks',{})
        if not isinstance(benchmarks,dict) or len(benchmarks)>20:raise ValueError('Use up to 20 benchmark histories')
        for key,entry in benchmarks.items():
            if not isinstance(key,str) or len(key)>300 or not isinstance(entry,dict) or not isinstance(entry.get('instrument'),dict):raise ValueError('Invalid benchmark identity')
            bars(entry.get('candles',[]))
        if not isinstance(v.get('primary',{}),dict) or not isinstance(v.get('warnings',[]),list) or len(v.get('warnings',[]))>50 or any(not isinstance(w,str) or len(w)>2000 for w in v.get('warnings',[])):raise ValueError('Invalid reference metadata')
        return v
    volume_unit:str=Field(default="provider volume units (unspecified)",max_length=100)
    zero_volume_is_missing:bool=False
    timezone:str='Asia/Kolkata'
    @field_validator('timezone')
    @classmethod
    def valid_timezone(cls,value):
        from zoneinfo import ZoneInfo
        try:ZoneInfo(value)
        except (KeyError,ValueError):raise ValueError('Use a valid IANA timezone') from None
        return value
    candles:list[InputCandle]=Field(max_length=60000)
    indicators:list[IndicatorConfig]=Field(max_length=20)
    interval:Timeframe='1d'
    @model_validator(mode='after')
    def chronological(self):
        if any(b.time<=a.time for a,b in zip(self.candles,self.candles[1:])):raise ValueError('Candles must have unique ascending timestamps')
        if len({i.id for i in self.indicators})!=len(self.indicators):raise ValueError('Indicator IDs must be unique')
        return self
