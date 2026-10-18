"""Canonical global metadata with stable legacy NSE/index aliases."""
import json
import time
from .markets import samples, instrument, canonical
from .market_router import enrich,MarketDataRouter,selectable
INDICES=[('nifty50','NIFTY 50','^NSEI','NSE'),('niftybank','NIFTY BANK','^NSEBANK','NSE'),('nifty500','NIFTY 500','^CRSLDX','NSE'),('sensex','SENSEX','^BSESN','BSE')]
class InstrumentRegistry:
    def __init__(self,db,resources):
        self.db=db
        if db.get('index_metadata') is None:
            try: rows=json.loads((resources/'index-verification.json').read_text())
            except (OSError,ValueError): rows=[]
            db.put('index_metadata',{r['ticker']:r for r in rows})
    def indices(self):
        checked=self.db.get('index_metadata',{});result=[]
        for key,name,ticker,exchange in INDICES:
            row=instrument(dict(symbol=ticker,longname=name,exchange=exchange,quoteType='INDEX'))
            meta=checked.get(ticker,{});verified=meta.get('verified_at',0)
            row.update(id='index:'+key,token='index:'+key,status=meta.get('status','unverified') if time.time()-verified<86400 else 'unverified',verified_at=verified,error=meta.get('error'),timeframes=meta.get('timeframes',{}))
            result.append(row)
        return result
    def equity(self,row):
        if not row:return None
        meta=instrument(dict(symbol=row['yahoo_symbol'],exchange='NSE',quoteType='EQUITY'))
        return {**meta,**row,'id':f"equity:{row['isin']}:{row['series']}",'kind':'equity','exchange':'NSE','status':'listed'}
    def globals(self):
        rows={r['canonical_id']:r for r in samples()}
        for r in self.hyperliquid_candidates():
            if MarketDataRouter.validate(r)=='hyperliquid':rows[r['canonical_id']]=r
        for key,row in self.db.get('global_instruments',{}).items():
            if row.get('provider','yahoo')=='yahoo':rows[key]=enrich(row)
        return list(rows.values())
    def hyperliquid_candidates(self):
        return self.hyperliquid.candidates() if getattr(self,'hyperliquid',None) else []
    def resolve(self,value):
        value=str(value).strip();upper=value.upper()
        if value.startswith('hyperliquid:'):
            return self.hyperliquid.rows.get(value) if getattr(self,'hyperliquid',None) else next((r for r in self.hyperliquid_candidates() if r['canonical_id']==value),None)
        for row in self.indices():
            if upper in (row['symbol'].upper(),row['name'].upper(),row['id'].upper(),row['canonical_id'].upper()):return row
        if value.startswith('equity:'):
            parts=value.split(':')
            if len(parts)==3:return next((self.equity(r) for r in self.db.search(parts[1]) if r['isin']==parts[1] and r['series']==parts[2]),None)
        if value.startswith('yahoo:'):
            from urllib.parse import unquote
            parts=value.split(':')
            if len(parts)==4 and unquote(parts[2])=='NSE' and unquote(parts[3])=='equity':
                return self.equity(self.db.resolve(unquote(parts[1]).removesuffix('.NS')))
        local=self.equity(self.db.resolve(upper.removesuffix(".NS")) or self.db.instrument(value))
        if local:return local
        matches=[r for r in self.globals() if upper in (r['id'].upper(),r['symbol'].upper(),r['yahoo_symbol'].upper())]
        return matches[0] if len(matches)==1 else None
    def search(self,q,limit=60,category='',exchange='',country=''):
        terms=q.strip().casefold().split()
        rows=self.indices()+self.globals()+[self.equity(r) for r in self.db.search('',20000)]
        seen=set();result=[]
        for r in rows:
            if not selectable(r):continue
            if r['canonical_id'] in seen:continue
            if category in ('crypto_spot','crypto_perpetual'):
                if r.get('market_type')!=category.removeprefix('crypto_') or r.get('provider')!='hyperliquid':continue
            elif category and r['category']!=category:continue
            if exchange and exchange.casefold() not in r['exchange'].casefold() or country and country.casefold() not in r['country'].casefold():continue
            text=' '.join(str(r.get(k,'')) for k in ('name','symbol','yahoo_symbol','isin','country','exchange','kind','category','board','series','native_id','base_asset','quote_asset','market_type','provider')).casefold()
            if all(term in text for term in terms):result.append(r);seen.add(r['canonical_id'])
        # Exact tickers rank first, then names; full directory never limited to an index.
        result.sort(key=lambda r:(r['symbol'].casefold()!=q.casefold() and r['yahoo_symbol'].casefold()!=q.casefold(),0 if r['kind']=='index' else 1))
        return result[:limit]
    def discover(self,quotes):
        stored=self.db.get('global_instruments',{});result=[]
        for quote in quotes:
            r=instrument(quote)
            if not r or not MarketDataRouter().yahoo_discovery(r):continue
            existing=self.resolve(r['canonical_id'])
            if existing and (existing['id'].startswith('equity:') or existing['id'].startswith('index:')):result.append(existing);continue
            previous=stored.get(r['canonical_id'],{})
            r.update({k:previous[k] for k in ('status','verified_at','timeframes','error') if k in previous})
            stored[r['canonical_id']]=r;result.append(r)
        # Persistent metadata only, bounded; retain selected instruments before recent discoveries.
        protected={r.get('canonical_id') for r in (self.db.get('workspace',{}).get('panes',[]))}
        for w in self.db.get('workspace',{}).get('watchlists',[]):protected.update(r.get('canonical_id') for r in w['items'])
        while len(stored)>5000:
            key=next((k for k in stored if k not in protected),None)
            if key is None:break
            stored.pop(key)
        self.db.put('global_instruments',stored)
        return result
    def record(self,instrument,status,error=None,interval='1d',metadata=None):
        if instrument['id'].startswith('index:'):
            values=self.db.get('index_metadata',{});key=instrument['symbol'];previous=values.get(key,{})
        else:
            values=self.db.get('global_instruments',{});key=instrument['canonical_id'];previous={**instrument,**values.get(key,{})}
        frames=previous.get('timeframes',{});frames[interval]=dict(status=status,verified_at=time.time(),error=error)
        if interval=='1d':previous.update(status=status,verified_at=time.time(),error=error)
        previous['timeframes']=frames
        if metadata:previous.update({k:metadata[k] for k in ('currency','timezone') if metadata.get(k)})
        values[key]=previous
        self.db.put('index_metadata' if instrument['id'].startswith('index:') else 'global_instruments',values)
