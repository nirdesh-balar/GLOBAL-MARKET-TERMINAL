import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['desktop/electron/performanceDiagnostics.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false });
const { backendProcess, electronProcess, parseBackendProcess, performanceSampler } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

assert.deepEqual(parseBackendProcess(42, ' 4096 0:00.50\n'),
  { identity: '42', memoryBytes: 4 * 1024 ** 2, cpuSeconds: 0.5 });
assert.deepEqual(parseBackendProcess(42, '1024 1:02:03.45'),
  { identity: '42', memoryBytes: 1024 ** 2, cpuSeconds: 3723.45 });
assert.equal(parseBackendProcess(42, 'invalid'), null);
assert.equal(await backendProcess(process.pid, 'win32'), null);
assert.equal(await backendProcess(undefined), null);
assert.equal(electronProcess({ pid: 90, creationTime: 1, memory: { workingSetSize: 1024 } }).memoryBytes, 1024 ** 2);
assert.equal(electronProcess({ pid: 90, creationTime: 1 }).cpuSeconds, null);

let time = 0;
let calls = 0;
let marketCalls = 0;
const read = performanceSampler({ version: 'test', sourceRevision: null, electron: 'test', platform: 'test' },
  async pid => {
    calls++;
    return { main: { identity: 'main', memoryBytes: 1024, cpuSeconds: time / 20_000 },
      renderer: { identity: String(pid), memoryBytes: 2048, cpuSeconds: time / 10_000 }, backend: null };
  }, async () => { marketCalls++; return null; }, () => time, () => 100 + time);
const first = await Promise.all(Array.from({ length: 20 }, () => read(90)));
assert.ok(first.every(snapshot => snapshot === first[0]));
assert.equal(calls, 1);
assert.equal(marketCalls, 1);
assert.equal(first[0].main.cpuPercent, null);
assert.equal(first[0].backend.memoryBytes, null);
for (let i = 1; i <= 30; i++) {
  time = i * 5000;
  const snapshot = await read(90);
  assert.equal(snapshot.sampledAt, 100 + time);
  assert.equal(snapshot.main.cpuPercent, 5);
  assert.equal(snapshot.renderer.cpuPercent, 10);
  assert.equal(snapshot.cpuWindowMs, 5000);
  assert.equal(await read(90), snapshot);
}
assert.equal(calls, 31);
assert.equal(marketCalls, 31);
time += 5000;
const restarted = await read(91);
assert.equal(restarted.renderer.cpuPercent, null);
assert.equal(restarted.main.cpuPercent, 5);

let release;
let active = 0;
let peak = 0;
const coalesced = performanceSampler({ version: 'test', sourceRevision: null, electron: 'test', platform: 'test' },
  async () => {
    peak = Math.max(peak, ++active);
    if (!release) await new Promise(resolve => { release = resolve; });
    active--;
    return { main: null, renderer: null, backend: null };
  }, async () => null);
const oldSample = coalesced(90);
const nextSamples = Array.from({ length: 10 }, () => coalesced(91));
release();
await oldSample;
const next = await Promise.all(nextSamples);
assert.equal(peak, 1);
assert.ok(next.every(snapshot => snapshot === next[0]));
console.log('PASS performance sampler units, one-sample cache, coalescing, restart and unavailable process data.');
