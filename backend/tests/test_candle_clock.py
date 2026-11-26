from datetime import datetime

import pytest

from app.candle_clock import yahoo_candle_clock
from app.history import response
from app.providers.base import History


def stamp(text):
    return int(datetime.fromisoformat(text.replace('Z', '+00:00')).timestamp())


def history_for(opening, closing, observed, fetched, row, zone='America/New_York'):
    return History([{'time': stamp(row), 'open': 100, 'high': 102, 'low': 99, 'close': 101, 'volume': 20}], 'YAHOO FINANCE',
                   fetched_at=stamp(fetched), metadata={
                       'timezone': zone, 'quote_metadata': {'regularMarketTime': stamp(observed),
                           'currentTradingPeriod': {'regular': {'start': stamp(opening), 'end': stamp(closing)}}}})


US = {'kind': 'equity', 'calendar': 'XNYS', 'timezone': 'America/New_York'}


def test_early_close_clips_final_intraday_bar_in_the_existing_response():
    history = history_for('2025-11-28T14:30:00Z', '2025-11-28T18:00:00Z',
                          '2025-11-28T17:45:00Z', '2025-11-28T17:45:03Z', '2025-11-28T17:30:00Z')
    history.interval = '1h'
    result = response(history, '1h', security=US)
    assert result['candle_clock'] == {
        'bar_time': stamp('2025-11-28T17:30:00Z'),
        'close_time': stamp('2025-11-28T18:00:00Z'),
        'observed_at': stamp('2025-11-28T17:45:00Z'),
    }
    assert result['candles'][0]['time'] == history.candles[0]['time']


def test_current_daily_candle_uses_verified_regular_close_after_dst_transition():
    history = history_for('2025-03-10T13:30:00Z', '2025-03-10T20:00:00Z',
                          '2025-03-10T18:13:00Z', '2025-03-10T18:13:20Z', '2025-03-10T00:00:00Z')
    bounds = yahoo_candle_clock(history, US, '1d', history.candles[-1])
    assert bounds['close_time'] == stamp('2025-03-10T20:00:00Z')


@pytest.mark.parametrize('day', ['2025-07-04', '2025-07-05'])
def test_calendar_holiday_and_weekend_override_apparently_open_provider_bounds(day):
    history = history_for(f'{day}T13:30:00Z', f'{day}T20:00:00Z',
                          f'{day}T17:45:00Z', f'{day}T17:45:15Z', f'{day}T17:30:00Z')
    assert yahoo_candle_clock(history, US, '30m', history.candles[-1]) is None


def test_an_exchange_lunch_break_is_not_an_open_candle():
    history = history_for('2025-11-25T00:00:00Z', '2025-11-25T06:30:00Z',
                          '2025-11-25T02:51:00Z', '2025-11-25T02:51:06Z', '2025-11-25T02:30:00Z', 'Asia/Tokyo')
    assert yahoo_candle_clock(history, {'kind': 'equity', 'calendar': 'XTKS'}, '1h', history.candles[-1]) is None


@pytest.mark.parametrize(('observed', 'retrieved', 'row', 'interval'), [
    ('17:45:00', '18:00:10', '17:30:00', '30m'),  # closed
    ('17:43:00', '17:45:00', '17:30:00', '30m'),  # stale
    ('17:45:00', '17:45:01', '17:00:00', '30m'),  # historical last bar
    ('17:45:00', '17:45:01', '17:30:00', '1w'),  # unsupported aggregated interval
])
def test_stale_closed_and_unverified_boundaries_are_omitted(observed, retrieved, row, interval):
    history = history_for('2025-11-28T14:30:00Z', '2025-11-28T18:00:00Z',
                          f'2025-11-28T{observed}Z', f'2025-11-28T{retrieved}Z', f'2025-11-28T{row}Z')
    assert yahoo_candle_clock(history, US, interval, history.candles[-1]) is None


def test_missing_or_malformed_provider_bounds_are_omitted():
    history = history_for('2025-11-28T14:30:00Z', '2025-11-28T18:00:00Z',
                          '2025-11-28T17:45:00Z', '2025-11-28T17:45:03Z', '2025-11-28T17:30:00Z')
    history.metadata['quote_metadata']['currentTradingPeriod'] = []
    assert yahoo_candle_clock(history, US, '30m', history.candles[-1]) is None
