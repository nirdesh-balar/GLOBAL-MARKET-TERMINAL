"""Shared context and price-only evaluation. No fabricated OHLC, requests or indicators."""
import math
from .screener_conditions import combine

def context(history,security,interval,streams=None):
    identity=security['canonical_id'];feed=streams.feeds.get(identity+'|candle|'+interval) if streams and streams.enabled else None
    healthy=bool(feed and streams.healthy(security,interval));rows=history['candles'];latest=rows[-1] if rows else {}
    return dict(provider=security['provider'],canonical_id=identity,market_type=security.get('market_type',''),timeframe=interval,connection=feed.state if feed else 'rest_only',live_enabled=healthy,received_at=feed.received_at if feed else None,analysis_basis='Live-enabled crypto snapshot; completed candles only when selected' if healthy else 'Hyperliquid REST historical snapshot' if security['provider']=='hyperliquid' else 'Yahoo historical snapshot; may be delayed',latest_supplied_candle=latest.get('time'))

def safe_history(history,security,interval,streams=None,completed=True):
    # Freeze a reference snapshot before analysis runs in another thread. Never mutate
    # the cache or a replay-visible series. A newer provider bar confirms closure.
    value={**history,'candles':list(history['candles'])}
    if completed and streams and streams.enabled and streams.healthy(security,interval):
        feed=streams.feeds[security['canonical_id']+'|candle|'+interval]
        if feed.candle:value['candles']=[r for r in value['candles'] if r.get('end_time',float('inf'))<=feed.candle['time']]
    return value

def evaluate_price(current,previous,security,conditions):
    details=[]
    def visit(n):
        if n.type=='group':return combine(n.op,[visit(c) for c in n.children])
        state=None;reason=None;p=n.params;k=n.kind
        if not isinstance(current,(int,float)) or not math.isfinite(current):reason='Validated price unavailable'
        elif p.get('currency')!=security.get('currency'):reason='Threshold requires the exact native quote currency'
        elif k=='close_above':state=current>p['value']
        elif k=='close_below':state=current<p['value']
        elif k in ('price_cross_up','price_cross_down'):
            if previous is None:reason='Two consecutive validated live observations required'
            else:state=previous<=p['value']<current if k.endswith('up') else previous>=p['value']>current
        else:reason='This condition requires candle mode'
        details.append(dict(kind=k,state='unknown' if state is None else 'matched' if state else 'no_match',reason=reason));return state
    state=visit(conditions);return state,details
