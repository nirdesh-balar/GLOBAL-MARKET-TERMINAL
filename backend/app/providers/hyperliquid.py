"""Official public Info API only. No accounts, signing, execution or streams."""
import asyncio,hashlib,json,math,ssl,time,urllib.error,urllib.request
from collections import deque
from datetime import datetime,timezone
from decimal import Decimal,InvalidOperation
from email.utils import parsedate_to_datetime
import certifi
from .base import History,ProviderError
from ..market_router import MarketDataRouter,hyperliquid_id
INFO_URL='https://api.hyperliquid.xyz/info'
INTERVALS={'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800,'1M':2592000}
META_TYPES={'meta','spotMeta','allPerpMetas','perpCategories','perpConciseAnnotations'}
MAX_CANDLES=5000

def schema(message='Invalid official Hyperliquid response; existing metadata was retained.'):
    return ProviderError(message,'schema')
def integer(value):return type(value) is int and value>=0

def request_body(body):
    if not isinstance(body,dict):raise ProviderError('Public Info request must be structured data.','policy')
    kind=body.get('type')
    if kind in META_TYPES and set(body)=={'type'}:return body
    if kind=='candleSnapshot' and set(body)=={'type','req'}:
        r=body['req']
        if isinstance(r,dict) and set(r)=={'coin','interval','startTime','endTime'} and isinstance(r['coin'],str) and 0<len(r['coin'])<=60 and r['interval'] in INTERVALS and integer(r['startTime']) and integer(r['endTime']) and r['startTime']<=r['endTime']:return body
    raise ProviderError('Only documented public market metadata and candleSnapshot requests are permitted.','policy')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

class HyperliquidClient:
    """Shared application slots; separate conservative weighted REST allowance."""
    def __init__(self,budget,transport=None,clock=time.monotonic,sleep=asyncio.sleep,min_interval=1.5,weight_limit=600):
        self.budget=budget;self.transport=transport or self.post;self.clock=clock;self.sleep=sleep
        self.min_interval=min_interval;self.weight_limit=weight_limit;self.weights=deque();self.gate=asyncio.Lock();self.next_request=0.;self.cooldown=0.;self.closed=False
        self.metrics={'requests':0,'metadata_requests':0,'candle_requests':0,'retries':0,'rate_limited':0}
    def post(self,body):
        request=urllib.request.Request(INFO_URL,data=json.dumps(request_body(body)).encode(),headers={'Content-Type':'application/json','User-Agent':'GlobalMarketTerminal/0.6 public-read-only-analysis'},method='POST')
        opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())),NoRedirect())
        try:
            with opener.open(request,timeout=25) as response:
                raw=response.read(16_000_001)
                if len(raw)>16_000_000:raise schema('Hyperliquid response exceeds the safe response size.')
                try:return json.loads(raw,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
                except (ValueError,UnicodeError):raise schema() from None
        except urllib.error.HTTPError as e:
            if e.code==429:
                retry=e.headers.get('Retry-After','60')
                try:delay=max(60,math.ceil(float(retry)))
                except (ValueError,OverflowError):
                    try:delay=max(60,math.ceil(parsedate_to_datetime(retry).timestamp()-time.time()))
                    except (ValueError,TypeError):delay=60
                raise ProviderError('Hyperliquid throttled public requests. The retry restriction is respected.','rate',delay) from None
            if e.code in (401,403):raise ProviderError('Hyperliquid public API access was denied. No fallback or bypass is used.','access') from None
            if e.code>=500:raise ProviderError('Hyperliquid public market data is temporarily unavailable.','temporary') from None
            raise ProviderError('Hyperliquid rejected this documented market-data request.','source') from None
        except (urllib.error.URLError,TimeoutError,OSError):raise ProviderError('Hyperliquid could not be reached. Historical data remains unavailable until connectivity returns.','temporary') from None
    async def reserve(self,weight):
        async with self.gate:
            now=self.clock()
            if now<self.cooldown:raise ProviderError('Hyperliquid REST cooldown is active.','rate',math.ceil(self.cooldown-now))
            while self.weights and now-self.weights[0][0]>=60:self.weights.popleft()
            if sum(w for _,w in self.weights)+weight>self.weight_limit:
                raise ProviderError('Conservative Hyperliquid REST budget reached; wait before another historical request.','rate',max(1,math.ceil(60-(now-self.weights[0][0]))))
            delay=max(0,self.next_request-now)
            if delay:await self.sleep(delay)
            now=self.clock()
            if now<self.cooldown:raise ProviderError('Hyperliquid REST cooldown is active.','rate',math.ceil(self.cooldown-now))
            self.weights.append((now,weight));self.next_request=now+self.min_interval
    async def request(self,body,max_items=5000,priority=0):
        body=request_body(body);kind=body['type'];weight=20+(math.ceil(max_items/60) if kind=='candleSnapshot' else 0)
        for attempt in range(3):
            if self.closed:raise ProviderError('Hyperliquid client is closing.','source')
            try:
                async with self.budget.slot(priority):
                    await self.reserve(weight)
                    self.metrics['requests']+=1;self.metrics['candle_requests' if kind=='candleSnapshot' else 'metadata_requests']+=1
                    task=asyncio.create_task(asyncio.to_thread(self.transport,body))
                    try:return await asyncio.shield(task)
                    except asyncio.CancelledError:
                        # The socket remains counted until its blocking call finishes.
                        await asyncio.gather(task,return_exceptions=True);raise
            except ProviderError as e:
                if e.kind=='rate':self.cooldown=max(self.cooldown,self.clock()+max(1,e.retry_after));self.metrics['rate_limited']+=1
                if e.kind=='temporary' and attempt<2:self.metrics['retries']+=1;await self.sleep(2**attempt);continue
                raise
    def status(self):return {**self.metrics,'cooldown_seconds':max(0,math.ceil(self.cooldown-self.clock())),'weight_limit_per_minute':self.weight_limit,'documented_limit_per_minute':1200,'storage':'metadata and OHLCV in bounded memory; only catalogue metadata may persist'}


def parse_catalogue(spot,perpetuals,categories,annotations,fetched_at):
    """Category authority is official annotations, not a name/suffix guess."""
    if not isinstance(spot,dict) or not isinstance(spot.get('tokens'),list) or not isinstance(spot.get('universe'),list) or not isinstance(perpetuals,list) or not isinstance(categories,list) or not isinstance(annotations,list):raise schema()
    if len(spot['tokens'])>20000 or len(spot['universe'])>20000 or len(perpetuals)>100:raise schema('Official catalogue exceeds the supported safe metadata bounds.')
    tokens={}
    for token in spot['tokens']:
        if not isinstance(token,dict) or not integer(token.get('index')) or not isinstance(token.get('name'),str) or not 0<len(token['name'])<=40 or not integer(token.get('szDecimals')) or token['szDecimals']>18 or token['index'] in tokens:raise schema()
        tokens[token['index']]=token
    classes={};conflicts=set()
    for rows,is_annotation in [(categories,False),(annotations,True)]:
        for item in rows:
            if not isinstance(item,list) or len(item)!=2 or not isinstance(item[0],str):raise schema()
            category=item[1].get('category') if is_annotation and isinstance(item[1],dict) else item[1]
            if not isinstance(category,str):raise schema()
            name=item[0];category=category.casefold()
            if name in classes and classes[name]!=category:conflicts.add(name)
            classes[name]=category
    result={};excluded=[];native_ids=set()
    def add(market,native,base,quote,size,active,mapping,**extra):
        if not isinstance(native,str) or not 0<len(native)<=60 or not isinstance(base,str) or not 0<len(base)<=40 or not isinstance(quote,str) or not 0<len(quote)<=40 or not integer(size) or size>18:raise schema()
        if (market,native) in native_ids:raise schema('Duplicate official native market identifier.')
        native_ids.add((market,native))
        identifier=hyperliquid_id(market,native,base,quote)
        if len(identifier)>180 or identifier in result:raise schema('Duplicate or oversized official native market identity.')
        stamp=hashlib.sha256(json.dumps(mapping,sort_keys=True).encode()).hexdigest()
        row=dict(id=identifier,canonical_id=identifier,token=identifier,instrument_id=identifier,provider='hyperliquid',kind='crypto',category='crypto',exchange='HYPERLIQUID',market_type=market,native_id=native,base_asset=base,quote_asset=quote,symbol=f'{base}/{quote}' if market=='spot' else native,base_symbol=base,yahoo_symbol='',name=f'{base}/{quote} · Spot' if market=='spot' else f'{native} · Perpetual',company_name=base,isin='',series='',board=market.upper(),currency=quote,timezone='UTC',calendar=None,country='Global',precision=6,contract='Cryptocurrency perpetual reference' if market=='perpetual' else 'Native spot pair',identity_version=1,legacy_unresolved=False,status='available' if active else 'delisted',trading_availability='listed' if active else 'delisted',size_decimals=size,verified_at=fetched_at,native_mapping=stamp,**extra)
        MarketDataRouter.validate(row);result[identifier]=row
    for pair in spot['universe']:
        if not isinstance(pair,dict) or not integer(pair.get('index')) or not isinstance(pair.get('tokens'),list) or len(pair['tokens'])!=2 or any(not integer(i) or i not in tokens for i in pair['tokens']):raise schema()
        base,quote=(tokens[i] for i in pair['tokens']);native=pair.get('name')
        # The response's native pair name is authoritative (PURR/USDC or @index).
        if native=='PURR/USDC' and (pair['index']!=0 or base['name']!='PURR' or quote['name']!='USDC') or native!='PURR/USDC' and native!='@'+str(pair['index']):raise schema('Unexpected native spot identifier; metadata was not guessed.')
        add('spot',native,base['name'],quote['name'],base['szDecimals'],not pair.get('isDelisted',False),dict(native=native,index=pair['index'],base_index=base['index'],quote_index=quote['index'],base_token_id=base.get('tokenId'),quote_token_id=quote.get('tokenId')),pair_index=pair['index'],classification_basis='Official spotMeta token indices')
    for dex_index,value in enumerate(perpetuals):
        # Docs show [meta, contexts]; production also returns metadata objects.
        meta=value[0] if isinstance(value,list) and len(value)==2 and isinstance(value[0],dict) else value
        if not isinstance(meta,dict) or not isinstance(meta.get('universe'),list) or len(meta['universe'])>20000:raise schema()
        if not integer(meta.get('collateralToken')):raise schema('Invalid official collateral token index.')
        quote=tokens.get(meta.get('collateralToken'))
        for asset in meta['universe']:
            if not isinstance(asset,dict) or not isinstance(asset.get('name'),str):raise schema()
            native=asset['name'];builder=':' in native;category=classes.get(native)
            # Core native catalogue is crypto; builder markets require explicit crypto classification.
            if not builder and dex_index!=0 or native in conflicts or builder and category not in ('crypto','cryptocurrency') or not builder and category and category not in ('crypto','cryptocurrency'):
                excluded.append(dict(native_id=native,reason='Non-crypto or unverified/conflicting official category',official_category=category));continue
            if not quote:
                excluded.append(dict(native_id=native,reason='Official collateral quote token unavailable'));continue
            add('perpetual',native,native,quote['name'],asset.get('szDecimals'),not asset.get('isDelisted',False),dict(native=native,collateral_token=meta['collateralToken'],collateral_token_id=quote.get('tokenId')),dex=native.split(':',1)[0] if builder else '',classification_basis='Official perp category: '+category if builder else 'Official native perpetual catalogue',official_category=category or 'crypto')
    if not result:raise schema('Official metadata contained no supported verified crypto markets.')
    return list(result.values()),excluded

class HyperliquidCatalogue:
    TTL=3600
    def __init__(self,db,client,clock=time.time):
        self.db=db;self.client=client;self.clock=clock;self.rows={};self.excluded=[];self.fetched_at=0.;self.error=None;self.retry_at=0.;self.inflight=None
        saved=db.get('hyperliquid_catalogue_v1',{})
        if saved.get('version')==1 and isinstance(saved.get('rows'),list) and len(saved['rows'])<=40000:
            try:
                for r in saved['rows']:MarketDataRouter.validate(r)
                self.rows={r['canonical_id']:r for r in saved['rows']};self.fetched_at=float(saved['fetched_at']);self.excluded=saved.get('excluded',[])
            except (ValueError,KeyError,TypeError,ProviderError):self.rows={};self.fetched_at=0.
    def fresh(self):return bool(self.rows) and 0<=self.clock()-self.fetched_at<self.TTL
    def candidates(self):return [r for r in self.rows.values() if r['status']=='available'] if self.fresh() else []
    def status(self):
        active=self.candidates();return dict(state='available' if self.fresh() else 'stale' if self.rows else 'unavailable',metadata_available=self.fresh(),fetched_at=self.fetched_at,expires_at=self.fetched_at+self.TTL,spot=sum(r['market_type']=='spot' for r in active),perpetual=sum(r['market_type']=='perpetual' for r in active),hip3=sum(bool(r.get('dex')) for r in active),total_metadata=len(self.rows),excluded_noncrypto_unclassified=len(self.excluded),error=self.error,retry_at=self.retry_at,rest=self.client.status())
    async def refresh(self):
        try:
            data={}
            for kind in ['spotMeta','allPerpMetas','perpCategories','perpConciseAnnotations']:data[kind]=await self.client.request({'type':kind},priority=0)
            now=self.clock();rows,excluded=parse_catalogue(data['spotMeta'],data['allPerpMetas'],data['perpCategories'],data['perpConciseAnnotations'],now)
            self.db.put('hyperliquid_catalogue_v1',dict(version=1,fetched_at=now,rows=rows,excluded=excluded))
            self.rows={r['canonical_id']:r for r in rows};self.excluded=excluded;self.fetched_at=now;self.error=None;self.retry_at=0.
        except ProviderError as e:self.error=str(e);self.retry_at=self.clock()+max(60,e.retry_after);raise
        finally:self.inflight=None
    async def ensure(self,force=False):
        if self.fresh() and not force:return
        if self.clock()<self.retry_at:raise ProviderError(self.error or 'Hyperliquid metadata revalidation is paused.','rate',math.ceil(self.retry_at-self.clock()))
        if not self.inflight:
            self.inflight=asyncio.create_task(self.refresh());self.inflight.add_done_callback(lambda t:t.exception() if not t.cancelled() else None)
        await asyncio.shield(self.inflight)
    async def validate(self,security):
        if MarketDataRouter.validate(security)!='hyperliquid':raise ProviderError('Only crypto Hyperliquid identities can use this provider.','policy')
        await self.ensure();row=self.rows.get(security.get('canonical_id'))
        if not row:raise ProviderError('This native Hyperliquid identity is no longer in official metadata. Select a verified market again.','missing')
        if row['status']!='available':raise ProviderError('Official Hyperliquid metadata marks this market delisted/unavailable.','missing')
        if security.get('native_mapping') and security['native_mapping']!=row['native_mapping']:raise ProviderError('Official native token mapping changed. Reselect and review this instrument before fetching; saved references were retained.','identity')
        return row
    async def close(self):
        if self.inflight:self.inflight.cancel();await asyncio.gather(self.inflight,return_exceptions=True)


def month_end(stamp):
    d=datetime.fromtimestamp(stamp,timezone.utc);year,month=(d.year+1,1) if d.month==12 else (d.year,d.month+1)
    return int(datetime(year,month,1,tzinfo=timezone.utc).timestamp())
def normalize_candles(values,security,interval,now):
    if not isinstance(values,list) or len(values)>5001:raise schema('Hyperliquid candle response is invalid or exceeds its documented limit.')
    if not values:raise ProviderError('Hyperliquid returned no candles for this native market/timeframe within its recent 5,000-candle history window.','missing')
    rows={};precision=0;duration=INTERVALS[interval]
    for r in values:
        if not isinstance(r,dict) or r.get('s')!=security['native_id'] or r.get('i')!=interval or not integer(r.get('t')) or not integer(r.get('T')) or r['t']%1000 or r['T']<r['t']:raise schema('Candle identity, interval or UTC timestamp is invalid.')
        t=r['t']//1000;end=(r['T']+1)/1000
        if t>now+1:raise schema('Provider returned a candle starting in the future.')
        # Official live responses use epoch-aligned fixed durations, including
        # Thursday weekly starts and native 30-day 1M windows. Preserve t/T.
        if t%duration or end!=t+duration:raise schema('Invalid native candle spacing or start/end boundary.')
        try:
            if any(isinstance(r.get(k),bool) for k in ('o','h','l','c','v')):raise ValueError()
            numbers=[float(r[k]) for k in ('o','h','l','c','v')]
            if any(not math.isfinite(v) for v in numbers) or any(v<=0 for v in numbers[:4]) or numbers[4]<0:raise ValueError()
            for k in ('o','h','l','c'):precision=max(precision,max(0,-Decimal(str(r[k])).as_tuple().exponent))
        except (ValueError,TypeError,KeyError,InvalidOperation):raise schema('Non-finite or invalid Hyperliquid OHLCV values.') from None
        o,h,l,c,v=numbers
        if h<max(o,l,c) or l>min(o,h,c):raise schema('Invalid Hyperliquid OHLC geometry.')
        row=dict(time=t,open=o,high=h,low=l,close=c,volume=v,end_time=end,provider_end_ms=r['T'],complete=end<=now,session=datetime.fromtimestamp(t,timezone.utc).date().isoformat())
        if t in rows and rows[t]!=row:raise schema('Conflicting duplicate Hyperliquid candle timestamp.')
        rows[t]=row
    ordered=[rows[t] for t in sorted(rows)]
    # Gaps remain gaps. Each supplied start must align to its native grid.
    return ordered,min(10,precision)

class HyperliquidHistoricalProvider:
    name='HYPERLIQUID'
    def __init__(self,catalogue,client,clock=time.time):self.catalogue=catalogue;self.client=client;self.clock=clock
    def status(self):return self.catalogue.status()
    async def fetch(self,security,interval,start=None,end=None,recent=False,quote=False,priority=0):
        row=await self.catalogue.validate(security)
        if interval not in INTERVALS:raise ProviderError('Unsupported native Hyperliquid chart interval.','range')
        now=self.clock();finish=int(now*1000)
        if end:finish=min(finish,int(datetime.strptime(end,'%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp()*1000)+86400000-1)
        count=5 if quote else 4 if recent else 5000
        begin=max(0,finish-count*INTERVALS[interval]*1000)
        if start:begin=max(begin,int(datetime.strptime(start,'%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp()*1000))
        if begin>finish:raise ProviderError('Requested range has no available Hyperliquid history.','range')
        raw=await self.client.request({'type':'candleSnapshot','req':{'coin':row['native_id'],'interval':interval,'startTime':begin,'endTime':finish}},max_items=count+1,priority=priority)
        rows,precision=normalize_candles(raw,row,interval,now)
        rows=rows[-MAX_CANDLES:]
        rows=[r for r in rows if r['time']*1000<=finish and r['end_time']*1000>begin]
        if not rows:raise ProviderError('No supplied candles overlap this date range. Hyperliquid retains only its recent historical window.','missing')
        return History(rows,self.name,notice='Official public Hyperliquid historical candles; bounded REST retrieval, not streaming or guaranteed live prices. Native weekly windows are epoch-aligned and 1M denotes provider 30-day candles, not calendar months. Only the most recent 5,000 native candles are available; missing periods are not filled. Volume is the provider-reported base quantity.',fetched_at=self.clock(),interval=interval,metadata=dict(provider='hyperliquid',canonical_id=row['canonical_id'],native_id=row['native_id'],native_mapping=row['native_mapping'],market_type=row['market_type'],timezone='UTC',currency=row['quote_asset'],precision=precision,volume_unit=row['base_asset'],history_limit=5000,native_interval=True,coverage_guaranteed=False))
    async def fetch_daily(self,security):return await self.fetch(security,'1d')
    async def fetch_quote(self,security):return await self.fetch(security,'1d',quote=True,priority=1)
    def close(self):self.client.closed=True
