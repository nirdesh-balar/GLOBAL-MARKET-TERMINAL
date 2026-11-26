import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(path) {
  const result = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const { subscribeClock, clockFormatter, clockText } = await load('desktop/src/charts/clockStore.ts');
const { countdownBounds, remainingCandleSeconds, candleDuration } = await load('desktop/src/charts/candleTiming.ts');
const moment = text => Date.parse(text) / 1000;
assert.equal(clockText(clockFormatter('Asia/Kolkata'), moment('2025-03-09T11:00:22Z')), '16:30:22 UTC+5:30');
assert.equal(clockText(clockFormatter('UTC'), moment('2025-03-09T00:00:00Z')), '00:00:00 UTC');
const ny = clockFormatter('America/New_York');
assert.equal(clockText(ny, moment('2025-03-09T06:59:59Z')), '01:59:59 UTC-5');
assert.equal(clockText(ny, moment('2025-03-09T07:00:00Z')), '03:00:00 UTC-4');
assert.equal(clockText(ny, moment('2025-11-02T06:00:00Z')), '01:00:00 UTC-5');
assert.match(clockText(clockFormatter(Intl.DateTimeFormat().resolvedOptions().timeZone), 1741503600), /^\d\d:\d\d:\d\d UTC/);

const bar = { time: 600, end_time: 900, complete: false };
const history = { source: 'HYPERLIQUID', fetched_at: 801, stream_received_at: 805 };
const bounds = countdownBounds(history, bar, 'live');
assert.equal(remainingCandleSeconds(bounds, 805), 95);
assert.equal(remainingCandleSeconds(bounds, 825), 75);
assert.equal(remainingCandleSeconds(bounds, 896), null);
assert.equal(remainingCandleSeconds(bounds, 900), null);
assert.equal(countdownBounds(history, bar, 'stale'), undefined);
assert.equal(countdownBounds(history, { ...bar, complete: true }), undefined);
assert.equal(countdownBounds({ ...history, stale: true }, bar), undefined);
assert.equal(countdownBounds({ source: 'YAHOO FINANCE', candle_clock: bounds }, bar), bounds);
assert.equal(countdownBounds({ source: 'YAHOO FINANCE', candle_clock: bounds }, { ...bar, time: 301 }), undefined);
assert.equal(candleDuration(75), '01:15');
assert.equal(candleDuration(8040), '2h 14m');

const original = { now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
const timers = new Map(), docEvents = new Map();
let next = 0, now = 1741503600211, lifecycle, unsubscribed = 0, first = 0, second = 0;
const document = { hidden: false, addEventListener: (event, fn) => docEvents.set(event, fn),
  removeEventListener: (event, fn) => { assert.equal(docEvents.get(event), fn); docEvents.delete(event); } };
globalThis.document = document;
globalThis.window = { terminal: { onLifecycle(fn) {
  lifecycle = fn;
  return () => { lifecycle = undefined; unsubscribed++; };
} } };
Date.now = () => now;
globalThis.setTimeout = (fn, delay) => { timers.set(++next, { fn, delay }); return next; };
globalThis.clearTimeout = id => timers.delete(id);
try {
  const offFirst = subscribeClock(() => first++);
  const offSecond = subscribeClock(() => second++);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 789);
  now += 2000;
  [...timers.values()][0].fn();
  assert.deepEqual([first, second, timers.size], [2, 1, 1]);
  lifecycle('suspend');
  assert.equal(timers.size, 0);
  now += 3600000;
  lifecycle('resume');
  assert.deepEqual([first, second, timers.size], [3, 2, 1]);
  document.hidden = true;
  docEvents.get('visibilitychange')();
  assert.equal(timers.size, 0);
  document.hidden = false;
  docEvents.get('visibilitychange')();
  assert.equal(timers.size, 1);
  offFirst();
  assert.equal(timers.size, 1);
  offSecond();
  assert.equal(timers.size + docEvents.size, 0);
  assert.equal(unsubscribed, 1);
  assert.equal(lifecycle, undefined);
} finally {
  Date.now = original.now;
  globalThis.setTimeout = original.setTimeout;
  globalThis.clearTimeout = original.clearTimeout;
  delete globalThis.document;
  delete globalThis.window;
}
console.log('PASS clock seconds, UTC offsets and DST, shared timer disposal and resume, provider candle freshness and closure.');
