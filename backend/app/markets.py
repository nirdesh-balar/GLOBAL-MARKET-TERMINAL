"""Instrument metadata only. Samples are discovery hints, never verified prices."""
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

MARKETS=[('stocks','Indian Stocks'),('us','US Stocks'),('global','Global Stocks'),('indices','Indian Indices'),('global_indices','Global Indices'),('crypto','Crypto'),('forex','Forex'),('commodities','Commodities'),('funds','ETFs & Funds'),('favourites','My Favourites')]
# Yahoo exchange codes and documented exchange calendar identities. Unknown exchanges
# retain Yahoo's timezone; 4h is disabled until a session can be verified.
EXCHANGES={}
def exchange(codes,name,country,currency,tz,calendar=None):
    for code in codes.split(','): EXCHANGES[code]=dict(exchange=name,country=country,currency=currency,timezone=tz,calendar=calendar)
exchange('NSE,NSI','NSE','India','INR','Asia/Kolkata')
exchange('BSE,BOM','BSE','India','INR','Asia/Kolkata','XBOM')
exchange('NMS,NGM,NCM,NASDAQ','NASDAQ','United States','USD','America/New_York','XNYS')
exchange('NYQ,NYSE','NYSE','United States','USD','America/New_York','XNYS')
exchange('PCX','NYSE Arca','United States','USD','America/New_York','ARCX')
exchange('ASE','NYSE American','United States','USD','America/New_York','XASE')
exchange('BTS','Cboe BZX','United States','USD','America/New_York','BATS')
exchange('PNK,OTC','OTC','United States','USD','America/New_York')
exchange('LSE,LON','LSE','United Kingdom','GBP','Europe/London','XLON')
exchange('JPX,TYO','JPX','Japan','JPY','Asia/Tokyo','XTKS')
exchange('HKG','HKEX','Hong Kong','HKD','Asia/Hong_Kong','XHKG')
exchange('GER,XETRA','XETRA','Germany','EUR','Europe/Berlin','XETR')
exchange('FRA','Frankfurt','Germany','EUR','Europe/Berlin','XFRA')
exchange('PAR','Euronext Paris','France','EUR','Europe/Paris','XPAR')
exchange('TOR','TSX','Canada','CAD','America/Toronto','XTSE')
exchange('VAN','TSXV','Canada','CAD','America/Toronto')
exchange('ASX','ASX','Australia','AUD','Australia/Sydney','XASX')
exchange('SES','SGX','Singapore','SGD','Asia/Singapore','XSES')
exchange('CCC','CRYPTO','Global','USD','UTC')
exchange('CCY','FOREX','Global','','America/New_York')
exchange('CMX,NYM,CME,CBT','CME','United States','USD','America/Chicago')
SUFFIX={'.NS':'NSI','.BO':'BOM','.L':'LSE','.T':'JPX','.HK':'HKG','.DE':'GER','.F':'FRA','.PA':'PAR','.TO':'TOR','.V':'VAN','.AX':'ASX','.SI':'SES'}
KINDS={'EQUITY':'equity','INDEX':'index','CRYPTOCURRENCY':'crypto','CURRENCY':'forex','FUTURE':'future','ETF':'etf','MUTUALFUND':'fund'}

def canonical(symbol,exch,kind):
    # Length bounded, separators escaped to prevent ambiguous concatenation.
    from urllib.parse import quote
    return 'yahoo:'+':'.join(quote(str(v),safe='') for v in (symbol.upper(),exch,kind))

def instrument(quote):
    symbol=str(quote.get('symbol','')).strip().upper()
    if not symbol or len(symbol)>60 or not re.fullmatch(r'[A-Z0-9.&^=+_/-]+',symbol):return None
    kind=KINDS.get(quote.get('quoteType','EQUITY'))
    if not kind:return None
    inferred=next((v for k,v in SUFFIX.items() if symbol.endswith(k)),None)
    code=str(quote.get('exchange') or inferred or ('CCC' if kind=='crypto' else 'CCY' if kind=='forex' else 'CME' if kind=='future' else 'UNKNOWN')).upper()
    meta=dict(EXCHANGES.get(code,dict(exchange=code,country='Unknown',currency='',timezone='UTC',calendar=None)))
    if kind=='crypto':meta.update(timezone='UTC',calendar=None)
    tz=quote.get('exchangeTimezoneName')
    if tz:
        try:ZoneInfo(tz);meta['timezone']=tz
        except (ZoneInfoNotFoundError,ValueError):pass
    if quote.get('currency'):meta['currency']=quote['currency']
    category='crypto' if kind=='crypto' else 'forex' if kind=='forex' else 'commodities' if kind=='future' else 'funds' if kind in ('etf','fund') else ('indices' if meta['country']=='India' else 'global_indices') if kind=='index' else 'stocks' if meta['country']=='India' else 'us' if meta['country']=='United States' else 'global'
    identifier=canonical(symbol,meta['exchange'],kind)
    name=str(quote.get('longname') or quote.get('shortname') or symbol)[:160]
    from .market_router import enrich
    return enrich(dict(id=identifier,canonical_id=identifier,token=identifier,provider='yahoo',symbol=symbol,base_symbol=symbol,yahoo_symbol=symbol,kind=kind,name=name,company_name=name,isin='',series='',board=kind.upper(),status='unverified',category=category,precision=3 if symbol=='JPY=X' else 4 if symbol=='INR=X' else 5 if kind=='forex' else 6 if kind=='crypto' else 2,contract='continuous front-month reference (not a tradable expiry)' if kind=='future' and symbol.endswith('=F') else 'expiring contract' if kind=='future' else '',**meta))

SAMPLES=[
('AAPL','Apple Inc.','NMS','EQUITY'),('MSFT','Microsoft Corporation','NMS','EQUITY'),('BRK-B','Berkshire Hathaway','NYQ','EQUITY'),
('RELIANCE.BO','Reliance Industries','BOM','EQUITY'),('HSBA.L','HSBC Holdings','LSE','EQUITY'),('7203.T','Toyota Motor','JPX','EQUITY'),('0700.HK','Tencent Holdings','HKG','EQUITY'),('SAP.DE','SAP SE','GER','EQUITY'),('MC.PA','LVMH','PAR','EQUITY'),('RY.TO','Royal Bank of Canada','TOR','EQUITY'),('BHP.AX','BHP Group','ASX','EQUITY'),
('^GSPC','S&P 500','NYQ','INDEX'),('^IXIC','NASDAQ Composite','NMS','INDEX'),('^DJI','Dow Jones Industrial Average','NYQ','INDEX'),('^FTSE','FTSE 100','LSE','INDEX'),('^GDAXI','DAX','GER','INDEX'),('^N225','Nikkei 225','JPX','INDEX'),('^HSI','Hang Seng','HKG','INDEX'),
*[(s,n,'CCC','CRYPTOCURRENCY') for s,n in [('BTC-USD','Bitcoin / US Dollar'),('ETH-USD','Ethereum / US Dollar'),('SOL-USD','Solana / US Dollar'),('XRP-USD','XRP / US Dollar')]],
*[(s,n,'CCY','CURRENCY') for s,n in [('INR=X','USD / INR'),('EURUSD=X','EUR / USD'),('GBPUSD=X','GBP / USD'),('JPY=X','USD / JPY')]],
*[(s,n,'CMX' if s in ('GC=F','SI=F','HG=F') else 'NYM','FUTURE') for s,n in [('GC=F','Gold'),('SI=F','Silver'),('CL=F','WTI Crude Oil'),('NG=F','Natural Gas'),('HG=F','Copper')]],
('SPY','SPDR S&P 500 ETF','PCX','ETF'),('QQQ','Invesco QQQ','NMS','ETF'),('NIFTYBEES.NS','Nippon India ETF Nifty BeES','NSI','ETF')]
def samples():return [instrument(dict(symbol=s,longname=n,exchange=e,quoteType=k)) for s,n,e,k in SAMPLES]
ENTRY_FIELDS=('symbol','token','kind','name','exchange','canonical_id','provider','category','country','currency','timezone','calendar','precision','contract','market_type','native_id','base_asset','quote_asset','identity_version','legacy_unresolved','native_mapping','size_decimals','trading_availability','verified_at')
def entry(row):return {**{k:row[k] for k in ENTRY_FIELDS if k in row},'instrument_id':row['id']}
