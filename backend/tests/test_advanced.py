import asyncio
from datetime import date,datetime,timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.models import IndicatorConfig,IndicatorRequest
from app.indicators import IndicatorCalculator,rolling,smooth,rsi
from app.providers.yahoo import normalize_ohlcv,YahooFinanceProvider
from app.providers.base import History
from app.history import HistoryService
from app.aggregator import aggregate_four_hour,YAHOO_INTERVALS,LOOKBACK_DAYS
from fixtures import FixtureProvider,candles
IST=ZoneInfo('Asia/Kolkata');TOKEN='advanced-local-token-'+'x'*48
@pytest.fixture
def app(tmp_path):return create_app(tmp_path,TOKEN,FixtureProvider(count=90))
@pytest.fixture
def client(app):
 with TestClient(app,headers={'Authorization':'Bearer '+TOKEN}) as c:yield c

def config(kind,**kwargs):return IndicatorConfig(id=kind,kind=kind,**kwargs).model_dump()
def sample(count=60):return [dict(time=1704067200+i*86400,open=10+i,high=12+i,low=9+i,close=11+i,volume=100*(i+1)) for i in range(count)]

@pytest.mark.parametrize('name,ticker',[('NIFTY 50','^NSEI'),('NIFTY BANK','^NSEBANK'),('NIFTY 500','^CRSLDX'),('SENSEX','^BSESN')])
def test_index_mapping(client,app,name,ticker):
 row=next(r for r in client.get('/api/indices').json() if r['name']==name)
 assert row['yahoo_symbol']==ticker and not ticker.endswith('.NS') and row['kind']=='index'
 assert row['id'].startswith('index:') and row['exchange']==('BSE' if name=='SENSEX' else 'NSE')
 assert app.state.registry.resolve(row['id'])['symbol']==ticker
 assert client.get('/api/instruments/search',params={'q':name}).json()[0]['symbol']==ticker
 assert app.state.history.metrics['provider_requests']==0

def test_stock_identity_and_zero_index_volume(app):
 row=app.state.registry.resolve('M&M');assert row['id']==f"equity:{row['isin']}:{row['series']}" and row['yahoo_symbol']=='M&M.NS'
 f=pd.DataFrame(dict(Open=[10,11],High=[12,13],Low=[9,10],Close=[11,12],Volume=[0,float('nan')]),index=pd.date_range('2024-01-01',periods=2,tz=IST))
 assert all(r['volume'] is None for r in normalize_ohlcv(f,'^NSEI',kind='index').candles)
 assert normalize_ohlcv(f,'M&M.NS').candles[0]['volume']==0

@pytest.mark.parametrize('interval',YAHOO_INTERVALS)
def test_yahoo_timeframe_contract(monkeypatch,app,interval):
 import yfinance as yf
 captured={}
 class Ticker:
  def __init__(self,s):captured['ticker']=s
  def history(self,**kwargs):
   captured.update(kwargs)
   return pd.DataFrame(dict(Open=[10],High=[12],Low=[9],Close=[11],Volume=[100],**{'Adj Close':[11]}),index=pd.DatetimeIndex(['2024-01-02T09:15:00'],tz=IST))
 monkeypatch.setattr(yf,'Ticker',Ticker)
 h=YahooFinanceProvider().fetch(app.state.registry.resolve('^NSEI'),interval)
 assert captured['ticker']=='^NSEI' and captured['interval']==YAHOO_INTERVALS[interval]
 assert captured['period']==(f'{LOOKBACK_DAYS[interval]}d' if interval in LOOKBACK_DAYS else 'max')
 assert captured['auto_adjust'] is False
 assert h.interval==('15m' if interval=='4h' else interval)
 if interval in LOOKBACK_DAYS:assert datetime.fromtimestamp(h.candles[0]['time'],IST).strftime('%H:%M')=='09:15'

def intraday(day=date(2024,1,2),count=25):
 return [dict(time=int((datetime.combine(day,datetime.min.time(),IST)+timedelta(hours=9,minutes=15+15*i)).timestamp()),open=100+i,high=102+i,low=99+i,close=101+i,volume=100.,adj_close=101+i) for i in range(count)]

def test_four_hour_sessions_regular_and_half_day():
 data=intraday()+intraday(date(2024,1,3),15)
 rows=aggregate_four_hour(data)
 assert len(rows)==3
 assert [datetime.fromtimestamp(r['time'],IST).strftime('%H:%M') for r in rows]==['09:15','13:15','09:15']
 assert rows[0]['open']==100 and rows[0]['close']==116 and rows[0]['high']==117 and rows[0]['low']==99 and rows[0]['volume']==1600
 assert rows[1]['volume']==900 and datetime.fromtimestamp(rows[1]['end'],IST).strftime('%H:%M')=='15:30'
 assert rows[2]['volume']==1500 and rows[2]['partial']
 half=aggregate_four_hour(intraday(count=25),{'2024-01-02':'13:00'})
 assert len(half)==1 and half[0]['volume']==1500 and datetime.fromtimestamp(half[0]['end'],IST).strftime('%H:%M')=='13:00' and not half[0]['partial']

def test_four_hour_gaps_and_missing_volume():
 data=intraday();data.pop(3);data[0]['volume']=None
 result=aggregate_four_hour(data)
 assert result[0]['partial'] and result[0]['volume'] is None and len(result)==2
 assert aggregate_four_hour([])==[]
 assert aggregate_four_hour([dict(data[0],time=int(datetime(2024,1,2,16,0,tzinfo=IST).timestamp()))])==[]

def test_native_cache_and_4h_share_15m(app):
 class Native(FixtureProvider):
  def fetch(self,r,interval):
   self.calls+=1
   return History(intraday() if interval=='15m' else self.rows,self.name,interval=interval)
 async def run():
  p=Native(count=10);s=HistoryService(p,{'min_interval':0});security=app.state.registry.resolve('RELIANCE')
  a,b=await asyncio.gather(s.get(security,'15m'),s.get(security,'4h'))
  assert p.calls==1 and len(a['candles'])==25 and len(b['candles'])==2
  await s.get(security,'1w');assert p.calls==2 # native weekly independent of daily
  old=await s.get(security,'15m',start='1999-01-01');assert 'Requested dates extend' in old['notice']
  await s.close()
 asyncio.run(run())

@pytest.mark.parametrize('kind',['SMA','EMA','WMA','VWMA','RSI','MACD','STOCHRSI','BB','ATR','SUPERTREND','VWAP'])
def test_every_indicator(kind):
 rows=sample();cfg=config(kind,anchor='week')
 result=IndicatorCalculator.calculate(rows,[cfg])
 assert result['series'] and all(len(s['points'])==len(rows) for s in result['series'])
 assert all(p['value'] is None or __import__('math').isfinite(p['value']) for s in result['series'] for p in s['points'])

def values(kind,rows,interval='1d',**params):return [[p['value'] for p in s['points']] for s in IndicatorCalculator.calculate(rows,[config(kind,**params)],interval)['series']]
def test_known_moving_average_references():
 assert rolling([1,2,3,4,5],3)==[None,None,2,3,4]
 assert smooth([1,2,3,4,5],3)==[None,None,2,3,4]
 assert rolling([1,2,3,4],3,True)==pytest.approx([None,None,14/6,20/6])
 rows=sample(3);rows[0]['close']=10;rows[1]['close']=20;rows[2]['close']=30
 assert values('VWMA',rows,length=3)[0][-1]==pytest.approx((10*100+20*200+30*300)/600)

def test_rsi_wilder_published_reference():
 closes=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.,46.03,46.41,46.22,45.64]
 result=rsi(closes,14)
 assert result[14]==pytest.approx(70.464135,abs=1e-5)
 assert result[15]==pytest.approx(66.249619,abs=1e-5)
 assert rsi([10]*20,14)[-1]==50

def test_bbands_macd_atr_known_examples():
 rows=sample(10)
 bb=values('BB',rows,length=3,deviation=2)
 assert bb[1][2]==12 and bb[0][2]==pytest.approx(12+2*(2/3)**.5)
 macd=values('MACD',rows,fast=2,slow=3,signal=2)
 assert macd[0][2]==pytest.approx(.5) and macd[1][3]==pytest.approx(.5) and macd[2][3]==pytest.approx(0)
 assert values('ATR',rows,period=3)[0][2]==3

def test_supertrend_and_stochastic_reference_conventions():
 rows=sample(10)
 up,down=values('SUPERTREND',rows,period=2,multiplier=1)
 assert down[1]==14.5 and down[2]==14.5 and up[4]==11.5 # initially down, then close crosses the carried upper band
 k,d=values('STOCHRSI',rows,period=2,stoch_period=2,k=2,d=2)
 assert k[4]==0 and d[5]==0 # flat RSI range convention is zero

def test_vwap_volume_aware_and_session_reset():
 rows=intraday(count=3)+intraday(date(2024,1,3),2)
 out=values('VWAP',rows,source='close',interval='15m')[0]
 assert out[0]==101 and out[1]==101.5 and out[2]==102 and out[3]==101
 rows[1]['volume']=None;out=values('VWAP',rows,source='close',interval='15m')[0]
 assert out[1] is None and out[2] is None and out[3]==101
 daily=IndicatorCalculator.calculate(sample(),[config('VWAP')],'1d');assert daily['warnings'] and all(p['value'] is None for p in daily['series'][0]['points'])

@pytest.mark.parametrize('key,value',[('length',0),('period',1),('multiplier',0),('deviation',-1),('color','url(bad)'),('width',8),('fast',30)])
def test_indicator_parameter_validation(key,value):
 with pytest.raises(ValueError):IndicatorConfig.model_validate({**config('MACD'),key:value})

def test_multiple_instances_api_and_no_download(client,app):
 rows=sample(70);configs=[config('EMA',length=9),{**config('EMA',length=20),'id':'ema20'}]
 result=client.post('/api/indicators/calculate',json={'candles':rows,'indicators':configs}).json()
 assert len(result['series'])==2 and result['series'][0]['points'][19]['value']!=result['series'][1]['points'][19]['value']
 assert app.state.history.metrics['provider_requests']==0
 assert client.post('/api/indicators/calculate',json={'candles':rows[::-1],'indicators':configs}).status_code==422
 configs[1]['id']='EMA';assert client.post('/api/indicators/calculate',json={'candles':rows,'indicators':configs}).status_code==422

def test_watchlists_scale_presets_persistence_independence(client,app):
 w=client.get('/workspace').json();assert [x['name'] for x in w['watchlists']]==['Indian Indices','Indian Stocks','My Favourites','US Stocks','Global Stocks','Global Indices','Crypto','Forex','Commodities','ETFs & Funds']
 assert [i['symbol'] for i in w['watchlists'][0]['items']]==['^NSEI','^NSEBANK','^CRSLDX','^BSESN']
 w['watchlists'].append(dict(id='custom',name='Research',market=None,items=list(reversed(w['watchlists'][0]['items']))));w['active_watchlist']='custom';w['theme']='light'
 w['panes'][0]['scale']=dict(logarithmic=True,auto=False,percentage=False)
 w['presets']=[dict(id='preset',name='Trend',indicators=[config('EMA',length=9)])]
 response=client.put('/workspace',json=w);assert response.status_code==200;w['watchlist_revision']=response.json()['watchlist_revision']
 restored=client.get('/workspace').json();assert restored==w
 assert restored['panes'][1]['scale']==dict(logarithmic=False,auto=True,percentage=False)
 assert client.get('/api/provider/status').json()['storage']=='memory only'

@pytest.mark.parametrize('source',['open','high','low','close','HL2','HLC3','OHLC4'])
def test_source_parameters_recalculate(source):
 result=values('SMA',sample(3),source=source,length=1)[0][0]
 expected={'open':10,'high':12,'low':9,'close':11,'HL2':10.5,'HLC3':32/3,'OHLC4':10.5}
 assert result==pytest.approx(expected[source])

def test_null_and_absent_index_volume():
 f=pd.DataFrame(dict(Open=[10],High=[12],Low=[9],Close=[11],Volume=[None]),index=pd.date_range('2024-01-01',periods=1,tz=IST))
 assert normalize_ohlcv(f,'^NSEI',kind='index').candles[0]['volume'] is None
 assert normalize_ohlcv(f.drop(columns='Volume'),'^NSEI',kind='index').candles[0]['volume'] is None
