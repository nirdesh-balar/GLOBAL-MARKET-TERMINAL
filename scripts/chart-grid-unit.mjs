import assert from 'node:assert/strict';
import { setImmediate, setTimeout } from 'node:timers/promises';
import { build } from 'esbuild';

const compiled = await build({
  stdin: {
    contents: [
      "export { gridCards, gridHistoryPath } from './desktop/src/chartGrid/model';",
      "export { GridHistoryQueue } from './desktop/src/chartGrid/history';",
      "export { gridSeries } from './desktop/src/chartGrid/GridChart';",
      "export { acquireHistory } from './desktop/src/services/api';",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  jsx: 'automatic',
});
const { gridCards, gridHistoryPath, GridHistoryQueue, gridSeries, acquireHistory } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

const yahoo = { canonical_id: 'yahoo:BTC:PCX:etf', provider: 'yahoo', kind: 'etf', token: '1', symbol: 'BTC' };
const crypto = { canonical_id: 'hyperliquid:mainnet:perp:BTC', provider: 'hyperliquid', kind: 'crypto', token: 'BTC', symbol: 'BTC', timeframe: '1h' };
const spot = { ...crypto, canonical_id: 'hyperliquid:mainnet:spot:BTC%2FUSDC' };
const mixed = gridCards([spot, yahoo, crypto, yahoo, { ...crypto, provider: 'yahoo' }, { ...yahoo, canonical_id: null }], '1d');
assert.deepEqual(mixed.cards.map(card => card.canonical_id), [spot.canonical_id, yahoo.canonical_id, crypto.canonical_id]);
assert.deepEqual(mixed.cards.map(card => card.timeframe), ['1h', '1d', '1h']);
assert.equal(mixed.unavailable, 2);
assert.equal(mixed.duplicates, 1);
const large = gridCards(Array.from({ length: 129 }, (_, i) => ({ ...yahoo, canonical_id: 'yahoo:' + i })), '1d');
assert.equal(large.cards.length, 128);
assert.equal(large.excess, 1);
assert.ok(gridHistoryPath(mixed.cards[0]).includes('source=hyperliquid'));
assert.ok(gridHistoryPath(mixed.cards[1]).includes('source=yahoo'));

const rows = Array.from({ length: 350 }, (_, i) => ({ time: i + 1, open: i + 1, high: i + 2, low: i, close: i + 1 }));
rows[349].close += 21;
const series = gridSeries({ candles: rows }, true, true);
assert.equal(series.candles.length, 320);
assert.equal(series.candles[0].time, 31);
assert.equal(series.sma.at(-1).value, 341.55);
assert.ok(Math.abs(series.ema.at(-1).value - 342.5) < 1e-9);
assert.equal(gridSeries({ candles: rows.slice(0, 19) }, true, true).sma.length, 0);
assert.equal(gridSeries({ candles: rows }, false, false).ema.length, 0);

const requests = [];
let highWater = 0;
let inFlight = 0;
const canceled = [];
globalThis.window = { terminal: {
  request(path, method, body, id) {
    const promise = new Promise((resolve, reject) => {
      requests.push({ path, id, resolve, reject });
    });
    highWater = Math.max(highWater, ++inFlight);
    return promise.finally(() => inFlight--);
  },
  cancel(id) {
    canceled.push(id);
    requests.find(request => request.id === id)?.reject(new DOMException('Canceled', 'AbortError'));
  },
} };

const queue = new GridHistoryQueue();
const a = '/api/history?symbol=a&interval=1d&priority=0';
const aAlias = '/api/history?interval=1d&symbol=a&priority=1';
const existing = acquireHistory(a);
const first = queue.request(aAlias);
const duplicate = queue.request(a);
const old = queue.request('/api/history?symbol=b&interval=1d');
const hidden = queue.request('/api/history?symbol=c&interval=1d');
const fresh = queue.request('/api/history?symbol=b&interval=1w');
for (const lease of [first, duplicate, old, hidden]) void lease.promise.catch(() => {});
assert.equal(requests.length, 2);
assert.equal(inFlight, 2);
first.release();
duplicate.release();
hidden.release();
old.release();
await setTimeout(20);
assert.deepEqual(canceled, [requests[1].id]);
assert.equal(requests.length, 3);
assert.ok(requests[2].path.includes('interval=1w'));
assert.equal(highWater, 2);
requests[2].resolve({ interval: '1w', candles: [] });
assert.equal((await fresh.promise).interval, '1w');
requests[0].resolve({ interval: '1d', candles: [] });
assert.equal((await existing.promise).interval, '1d');
await setImmediate();
fresh.release();
existing.release();
assert.equal(inFlight, 0);
console.log('PASS Grid identity, capacity, SMA/EMA, normalized coalescing, queue limit, canceled queued/active work, shared owner and rapid timeframe replacement. Peak Grid history requests: ' + highWater);
