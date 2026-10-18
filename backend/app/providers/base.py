from dataclasses import dataclass, field
from typing import Protocol
import time

class ProviderError(Exception):
    def __init__(self, message, kind='source', retry_after=0, *, code=None, retryable=None, http_status=None):
        super().__init__(message)
        self.kind = kind
        self.retry_after = retry_after
        self.code = code or kind
        self.retryable = kind in ('temporary','rate') if retryable is None else retryable
        self.http_status = http_status
    def structured(self):
        return dict(message=str(self),kind=self.kind,code=self.code,retry_after=self.retry_after,retryable=self.retryable,http_status=self.http_status)

@dataclass
class History:
    candles: list[dict]
    source: str
    actions: list[dict] = field(default_factory=list)
    notice: str = ''
    fetched_at: float = field(default_factory=time.time)
    interval: str = "1d"
    metadata: dict = field(default_factory=dict)
    trading_periods: object = None

class HistoricalDataProvider(Protocol):
    name: str
    def fetch_daily(self, security: dict) -> History: ...
    def fetch(self, security: dict, interval: str) -> History: ...
    def close(self) -> None: ...
