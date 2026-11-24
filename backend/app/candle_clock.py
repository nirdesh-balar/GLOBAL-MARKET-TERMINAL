"""Optional Yahoo countdown bounds derived from the history already retrieved."""
from datetime import datetime, timedelta, timezone
from math import isfinite
from zoneinfo import ZoneInfo

from .sessions import calendar_segments

NATIVE_SECONDS = {'1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600}
MAX_OBSERVATION_AGE = 90


def yahoo_candle_clock(history, security, interval, latest):
    if history.source != 'YAHOO FINANCE' or not latest or not security:
        return None
    if interval not in NATIVE_SECONDS and (interval != '1d' or security.get('kind') not in ('equity', 'etf', 'index')):
        return None
    metadata = history.metadata.get('quote_metadata') or {}
    periods = metadata.get('currentTradingPeriod')
    regular = periods.get('regular') if isinstance(periods, dict) else None
    if not isinstance(regular, dict):
        return None
    start, close = regular.get('start'), regular.get('end')
    observed, retrieved = metadata.get('regularMarketTime'), history.fetched_at
    if not all(isinstance(t, (int, float)) and not isinstance(t, bool) and isfinite(t)
               for t in (start, close, observed, retrieved)):
        return None
    if not 0 < start <= observed <= retrieved < close or close - start > 2 * 86400 or retrieved - observed > MAX_OBSERVATION_AGE:
        return None

    session_start, session_end = start, close
    try:
        zone = ZoneInfo(history.metadata.get('timezone') or security.get('timezone') or 'UTC')
        day = datetime.fromtimestamp(observed, zone).date()
    except (KeyError, ValueError, OverflowError, OSError):
        return None
    if security.get('calendar'):
        try:
            segments = calendar_segments(security['calendar'], day - timedelta(days=2), day + timedelta(days=2))
        except (ValueError, KeyError, RuntimeError):
            return None
        segment = next(((a, b) for a, b, _ in segments if a <= observed <= retrieved < b), None)
        if segment is None:
            return None
        session_start, session_end = max(start, segment[0]), min(close, segment[1])

    bar = latest['time']
    if interval == '1d':
        # Yahoo daily timestamps are UTC midnight labels for the supplied trading date.
        if (day != datetime.fromtimestamp(start, zone).date()
                or day != datetime.fromtimestamp(bar, timezone.utc).date()
                or (security.get('calendar') and session_end != close)):
            return None
        boundary = session_end
    else:
        boundary = min(bar + NATIVE_SECONDS[interval], session_end)
        if not session_start <= bar <= observed <= retrieved < boundary:
            return None
    return dict(bar_time=bar, close_time=boundary, observed_at=observed)
