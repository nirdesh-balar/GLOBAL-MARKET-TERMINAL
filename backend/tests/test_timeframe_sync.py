import pytest
from datetime import datetime, timezone
from app.history import aggregate_daily
from app.refresh import quote_value
from app.providers.base import History

def test_aggregate_daily_yearly():
    candles = []
    # 24 monthly bars across 2024 and 2025
    for y in (2024, 2025):
        for m in range(1, 13):
            t = int(datetime(y, m, 10, tzinfo=timezone.utc).timestamp())
            candles.append({'time': t, 'open': 100 + m, 'high': 150 + m, 'low': 90, 'close': 110 + m, 'volume': 1000})
    yearly = aggregate_daily(candles, '1Y')
    assert len(yearly) == 2
    y1, y2 = yearly[0], yearly[1]
    assert y1['open'] == 101 # first bar of 2024
    assert y1['close'] == 122 # last bar of 2024
    assert y1['volume'] == 12000
    assert y2['open'] == 101 # first bar of 2025
    assert y2['close'] == 122 # last bar of 2025

def test_quote_value_includes_timeframe():
    candles = [
        {'time': 1000, 'open': 100, 'high': 105, 'low': 95, 'close': 100, 'volume': 100},
        {'time': 2000, 'open': 100, 'high': 115, 'low': 98, 'close': 110, 'volume': 200},
    ]
    h = History(candles, 'TEST', fetched_at=123456)
    q = quote_value(h, {'symbol': 'TEST'}, timeframe='1w')
    assert q['timeframe'] == '1w'
    assert q['price'] == 110
    assert q['previous_close'] == 100
    assert q['absolute_change'] == 10
    assert q['change'] == 10.0
