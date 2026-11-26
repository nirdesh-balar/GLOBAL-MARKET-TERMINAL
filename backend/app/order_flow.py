"""Bounded, public market observations used by the Order Flow panel."""

from decimal import Decimal, InvalidOperation, localcontext
from heapq import heappop, heappush

from .providers.base import ProviderError

FLOW_OWNER = 'order-flow'
BOOK_FEED = 'l2Book'
BOOK_DEPTH = 20
BOOK_STALE_SECONDS = 12
IMBALANCE_DEPTH = 5
TAPE_LIMIT = 1_000
TAPE_WINDOW_MS = 30 * 60_000


def market_decimal(value, *, allow_zero=False):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)) or len(str(value)) > 40:
        raise ProviderError('Invalid public market price or size.', 'schema')
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        raise ProviderError('Invalid public market price or size.', 'schema') from None
    if (not number.is_finite() or number < 0 or (not allow_zero and not number)
            or number.adjusted() > 18 or number.as_tuple().exponent < -18):
        raise ProviderError('Invalid public market price or size.', 'schema')
    return number


def decimal_text(number):
    return format(number, 'f')


def normalize_book(data, native, now_ms):
    if not isinstance(data, dict):
        raise ProviderError('Invalid public order-book snapshot.', 'schema')
    timestamp = data.get('time')
    sides = data.get('levels')
    if (data.get('coin') != native or type(timestamp) is not int or not 0 < timestamp <= now_ms + 1000
            or not isinstance(sides, list) or len(sides) != 2):
        raise ProviderError('Invalid public order-book snapshot.', 'schema')

    parsed = []
    for index, rows in enumerate(sides):
        if not isinstance(rows, list) or len(rows) > 100:
            raise ProviderError('Invalid public order-book depth.', 'schema')
        levels = {}
        for row in rows:
            if not isinstance(row, dict) or type(row.get('n')) is not int or not 0 < row['n'] <= 1_000_000:
                raise ProviderError('Invalid public order-book level.', 'schema')
            price = market_decimal(row.get('px'))
            size = market_decimal(row.get('sz'))
            if price in levels:
                raise ProviderError('Duplicate public order-book price.', 'schema')
            levels[price] = (size, row['n'])
        parsed.append(sorted(levels.items(), reverse=index == 0)[:BOOK_DEPTH])

    bids, asks = parsed
    if bids and asks and bids[0][0] > asks[0][0]:
        raise ProviderError('Crossed public order-book snapshot.', 'schema')

    with localcontext() as context:
        context.prec = 64
        formatted = []
        for levels in (bids, asks):
            cumulative = Decimal(0)
            side = []
            for price, (size, count) in levels:
                cumulative += size
                side.append(dict(price=decimal_text(price), size=decimal_text(size),
                                 count=count, cumulative=decimal_text(cumulative)))
            formatted.append(side)

        spread = percent = imbalance = None
        if bids and asks:
            difference = asks[0][0] - bids[0][0]
            midpoint = (asks[0][0] + bids[0][0]) / 2
            spread = decimal_text(difference)
            percent = decimal_text((100 * difference / midpoint).quantize(Decimal('0.00000001')))
        if len(bids) >= IMBALANCE_DEPTH and len(asks) >= IMBALANCE_DEPTH:
            bid_size = sum(size for _, (size, _) in bids[:IMBALANCE_DEPTH])
            ask_size = sum(size for _, (size, _) in asks[:IMBALANCE_DEPTH])
            imbalance = decimal_text(((bid_size - ask_size) / (bid_size + ask_size)).quantize(Decimal('0.00000001')))

    return dict(time_ms=timestamp, bids=formatted[0], asks=formatted[1], spread=spread,
                spread_percent=percent, imbalance=imbalance, imbalance_depth=IMBALANCE_DEPTH)


class TradeTape:
    def __init__(self, session, opened_ms):
        self.session = session
        self.opened_ms = opened_ms
        self.rows = {}
        self.by_time = []
        self.floor = 0
        self.evicted = 0
        self.last_gap_ms = None

    def cutoff(self, now_ms):
        return max(self.opened_ms, now_ms - TAPE_WINDOW_MS)

    def evict_oldest(self):
        key = heappop(self.by_time)
        revision, _ = self.rows.pop(key)
        self.floor = max(self.floor, revision)
        self.evicted += 1

    def trim(self, now_ms):
        cutoff = self.cutoff(now_ms)
        before = len(self.rows)
        while self.by_time and self.by_time[0][0] < cutoff:
            self.evict_oldest()
        return len(self.rows) != before

    def append(self, event, revision, now_ms):
        key = event['time_ms'], event['tid']
        if key in self.rows or key[0] < self.cutoff(now_ms):
            return False
        self.rows[key] = (revision, dict(time_ms=key[0], id=key[1], price=event['price_text'],
                                         size=event['size_text'], side=event['side']))
        heappush(self.by_time,key)
        if len(self.rows) > TAPE_LIMIT:
            self.evict_oldest()
        return True

    def frame(self, cursor, now_ms):
        return dict(session=self.session, opened_ms=self.opened_ms, cutoff_ms=self.cutoff(now_ms),
                    last_gap_ms=self.last_gap_ms, cursor_gap=0 < cursor < self.floor,
                    retained=len(self.rows), evicted=self.evicted,
                    trades=[row for revision, row in self.rows.values() if revision > cursor])
