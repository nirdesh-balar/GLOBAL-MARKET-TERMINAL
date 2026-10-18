"""Exclusive read-only market-data policy. No ticker-suffix classification."""
from urllib.parse import quote, unquote
from .providers.base import ProviderError
NON_CRYPTO={'equity','index','forex','future','etf','fund'}
IDENTITY_FIELDS=('market_type','native_id','base_asset','quote_asset','identity_version','legacy_unresolved')

def hyperliquid_id(market,native,base='',quote_asset=''):
    if market not in ('spot','perpetual') or not native:raise ValueError('Explicit Hyperliquid market/native identity required')
    return 'hyperliquid:'+':'.join(quote(v,safe='') for v in (market,native,base,quote_asset))

def enrich(row):
    """Add identity metadata without converting any saved provider or instrument."""
    r=dict(row);kind=r.get('kind','equity');provider=r.get('provider','yahoo')
    r.setdefault('provider',provider);r.setdefault('identity_version',1)
    r.setdefault('native_id',r.get('yahoo_symbol') or r.get('symbol',''))
    r.setdefault('market_type','legacy_reference' if kind=='crypto' and provider=='yahoo' else 'cash' if kind in ('equity','index','etf','fund') else kind)
    r.setdefault('base_asset','');r.setdefault('quote_asset','')
    if kind=='crypto' and provider=='yahoo':
        r['legacy_unresolved']=True;r['status']='migration_required';r['error']='Legacy Yahoo crypto migration required; Hyperliquid provider pending. Yahoo crypto requests are disabled.'
    else:r.setdefault('legacy_unresolved',False)
    return r

def selectable(row):
    """Ordinary discovery only. Saved legacy identities still resolve for recovery."""
    try: provider=MarketDataRouter.validate(row,allow_legacy=True)
    except (ProviderError,ValueError):return False
    if provider=='legacy':return False
    if provider=='hyperliquid':
        return row.get('status')=='available' and row.get('trading_availability')=='listed' and bool(row.get('verified_at')) and bool(row.get('native_mapping'))
    return True

class HyperliquidPendingProvider:
    """Milestone A deliberately exposes no network, candles or streaming."""
    name='HYPERLIQUID (PENDING)'
    def unavailable(self):raise ProviderError('Hyperliquid crypto data is pending Milestone B. No Yahoo fallback is permitted.','pending')

class MarketDataRouter:
    def __init__(self):self.hyperliquid=HyperliquidPendingProvider()
    @staticmethod
    def validate(security,allow_legacy=False):
        kind=security.get('kind','equity');provider=security.get('provider','yahoo');category=security.get('category','')
        if security.get('identity_version',1)!=1:raise ProviderError('Unsupported market identity version.','policy')
        if kind not in NON_CRYPTO|{'crypto'} or provider not in ('yahoo','hyperliquid'):raise ProviderError('Unsupported provider/asset identity.','policy')
        if (category=='crypto') != (kind=='crypto') and category:raise ProviderError('Asset category and instrument kind disagree.','policy')
        canonical=security.get('canonical_id') or security.get('instrument_id') or ''
        if canonical.startswith('yahoo:'):
            parts=canonical.split(':')
            if len(parts)!=4 or provider!='yahoo' or unquote(parts[3])!=kind or unquote(parts[2])!=security.get('exchange',unquote(parts[2])):raise ProviderError('Canonical provider/category/venue mismatch.','policy')
            native=security.get('native_id') or security.get('yahoo_symbol') or security.get('symbol')
            if native and unquote(parts[1]).upper()!=native.upper():raise ProviderError('Canonical native instrument mismatch.','policy')
        elif canonical.startswith('hyperliquid:'):
            expected=hyperliquid_id(security.get('market_type',''),security.get('native_id',''),security.get('base_asset',''),security.get('quote_asset',''))
            if canonical!=expected or provider!='hyperliquid':raise ProviderError('Hyperliquid canonical identity mismatch.','policy')
        elif canonical and not canonical.startswith(('equity:','index:')):raise ProviderError('Unknown canonical provider identity.','policy')
        if kind=='crypto':
            if provider=='yahoo':
                if allow_legacy:return 'legacy'
                raise ProviderError('Legacy crypto migration required. Hyperliquid is pending; Yahoo crypto data fetching is disabled.','pending')
            if security.get('market_type') not in ('spot','perpetual') or not security.get('native_id') or not security.get('base_asset') or not security.get('quote_asset') or security.get('exchange')!='HYPERLIQUID' or not canonical.startswith('hyperliquid:'):raise ProviderError('Crypto requires an explicit Hyperliquid spot/perpetual native identity.','policy')
            return 'hyperliquid'
        if provider!='yahoo':raise ProviderError('Non-crypto instruments require Yahoo Finance exclusively.','policy')
        return 'yahoo'
    def require(self,security,operation='history'):
        if not isinstance(self.hyperliquid,HyperliquidPendingProvider) and self.validate(security,allow_legacy=True)=='legacy':
            raise ProviderError('Legacy Yahoo crypto requires explicit migration to an officially verified Hyperliquid spot or perpetual market. Yahoo crypto fetching is disabled.','pending')
        provider=self.validate(security)
        if provider=='hyperliquid' and isinstance(self.hyperliquid,HyperliquidPendingProvider):self.hyperliquid.unavailable()
        return provider
    def yahoo_discovery(self,row):
        # Broad Yahoo searches may return cryptocurrency metadata; discard it.
        return row.get('kind')!='crypto' and self.validate(row)=='yahoo'
    def status(self):
        if not isinstance(self.hyperliquid,HyperliquidPendingProvider):
            return dict(policy_version=1,yahoo=dict(label='Yahoo Finance — Non-Crypto',state='available'),hyperliquid=dict(label='Hyperliquid — Crypto',**self.hyperliquid.status()),analysis_only=True,streaming=False)
        return dict(policy_version=1,yahoo=dict(label='Yahoo Finance — Non-Crypto',state='available'),hyperliquid=dict(label='Hyperliquid — Crypto',state='pending',metadata_available=False),analysis_only=True,streaming=False)
