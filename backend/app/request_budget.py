"""One bounded Yahoo budget shared by charts, quotes, alerts and screeners."""
import asyncio
import time
from contextlib import asynccontextmanager


class RequestBudget:
    def __init__(self, capacity=2):
        self.capacity = capacity
        self.active = 0
        self.waiting = []

    def drain(self):
        self.waiting = [r for r in self.waiting if not r[2].done()]
        while self.waiting and self.active < self.capacity:
            # Prefer charts (0), then quotes/alerts (1), then screeners (2).
            # Age the queue so a stream of charts cannot starve a watchlist.
            row = min(self.waiting, key=lambda r: r[0]*5+r[1])
            self.waiting.remove(row)
            self.active += 1
            row[2].set_result(None)

    @asynccontextmanager
    async def slot(self, priority=0):
        future = asyncio.get_running_loop().create_future()
        row = (priority, time.monotonic(), future)
        self.waiting.append(row)
        self.drain()
        acquired = False
        try:
            await future
            acquired = True
            yield
        finally:
            if acquired or (future.done() and not future.cancelled()):
                self.active -= 1
            if row in self.waiting:
                self.waiting.remove(row)
            self.drain()
