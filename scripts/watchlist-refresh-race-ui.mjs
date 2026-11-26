import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, sourceElectron } from './isolated-electron.mjs';
import { chooseWatchlist } from './watchlist-controls.mjs';

const profile = await mkdtemp(join(tmpdir(), 'gmt-watchlist-ownership-'));
const releaseOrders = [
  ['crypto-start', 'crypto-retire', 'us-start', 'us-status'],
  ['crypto-retire', 'us-status', 'us-start', 'crypto-start'],
  ['us-status', 'crypto-start', 'us-start', 'crypto-retire'],
  ['us-start', 'crypto-retire', 'crypto-start', 'us-status'],
];
const launch = () => electron.launch({
  executablePath:sourceElectron, args:['.'], timeout:60000,
  env:{...process.env, IMT_TEST_DATA_DIR:profile, IMT_UI_FIXTURE:'1', IMT_REFRESH_UI:'1', IMT_OFFLINE:'1'},
});
let app, page;
const errors = [];
const evidence = [];
const request = (path, method = 'GET', body) =>
  page.evaluate(([p,m,b]) => window.terminal.request(p,m,b), [path,method,body]);
const status = () => request('/api/quotes/status?watchlist=stocks');
const sidebar = () => page.getByTestId('watchlist-sidebar');
const readyRows = () => sidebar().locator('.watch-row[data-quote-state="ready"]');
const visiblePrices = () => readyRows().evaluateAll(rows => Object.fromEntries(rows.map(row => [
  row.dataset.identity, row.querySelector('.quote-number')?.textContent,
])));
const activity = async () => {
  const quotes = await status();
  const processes = await app.evaluate(({app}) => app.getAppMetrics().map(({type,memory}) => ({
    type, working_set_kib:memory.workingSetSize,
  })));
  return {
    owned_clients:quotes.owned_clients, active_jobs:quotes.active_jobs, cached_values:quotes.cached_values,
    attempts:quotes.attempts, provider_requests:quotes.provider.provider_requests,
    quote_provider_requests:quotes.provider.quote_provider_requests, processes,
  };
};
async function load() {
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(sidebar()).toBeVisible({timeout:60000});
  await expect(page.locator('.chart-overlay')).toHaveCount(0,{timeout:45000});
}
async function currentStocks(after = 0) {
  let result;
  await expect.poll(async () => {
    result = await status();
    return !!result.job && result.generation > after && result.pending === 0 && result.completed_at > 0;
  },{timeout:45000}).toBe(true);
  await expect(sidebar()).toHaveAttribute('data-watchlist','stocks');
  await expect(sidebar()).toHaveAttribute('data-quote-generation',String(result.generation));
  await expect(sidebar()).toHaveAttribute('data-quote-job',result.job);
  await expect(readyRows()).toHaveCount(8);
  return result;
}

const controlled = (action, key) => app.evaluate(({},{action,key}) => {
  const race = globalThis.__watchlistOwnershipTest;
  if (action === 'arm') {
    race.gates = new Map();
    race.cryptoGeneration = null;
    race.on = true;
    return null;
  }
  const gate = race.gates.get(key);
  if (action === 'release') gate.release();
  return gate ? {done:gate.done, response:gate.response, generation:gate.generation} : null;
}, {action,key});

try {
  await mkdir('test-results',{recursive:true});
  app = await launch();
  await load();
  let selected = await currentStocks();
  const baseline = await activity();
  const prices = await visiblePrices();
  const values = snapshot => Object.fromEntries(Object.entries(snapshot.rows).map(([id,row]) => [id,row.value]));
  const baselineValues = values(selected);
  assert.equal(baseline.quote_provider_requests,8);
  assert.equal(baseline.cached_values,8);

  await app.evaluate(() => {
    const original = globalThis.fetch;
    const race = globalThis.__watchlistOwnershipTest = {on:false,gates:new Map(),cryptoGeneration:null};
    globalThis.fetch = async (input,options) => {
      if (!race.on) return original(input,options);
      const url = new URL(String(input));
      const body = options?.body ? JSON.parse(options.body) : {};
      const {method} = options ?? {};
      let key, generation;
      if (url.pathname === '/api/quotes/snapshot' && method === 'POST' && ['us','crypto','stocks'].includes(body.watchlist)) {
        key = body.watchlist+'-start';
        generation = body.ownership?.generation;
        if (key === 'crypto-start') race.cryptoGeneration = generation;
      }
      if (url.pathname === '/api/quotes/selection' && method === 'DELETE' && body.generation === race.cryptoGeneration) {
        key = 'crypto-retire';
        generation = body.generation;
      }
      if (url.pathname === '/api/quotes/status' && url.searchParams.get('watchlist') === 'us' && url.searchParams.has('client')) {
        key = 'us-status';
        generation = Number(url.searchParams.get('generation'));
      }
      if (!key || race.gates.has(key)) return original(input,options);
      let release;
      const wait = new Promise(resolve => { release = resolve; });
      const gate = {release, generation, done:false, response:null};
      // The delivered status is captured before changing selections and
      // returned afterwards. For held writes, simulate transport that has
      // already delivered the request despite the local AbortSignal.
      let captured;
      if (key === 'us-status') {
        const response = await original(input,options);
        captured = new Response(await response.text(),{status:response.status,headers:response.headers});
      }
      race.gates.set(key,gate);
      await wait;
      const response = captured ?? await original(input,{...options,signal:undefined});
      const result = await response.clone().json();
      gate.response = {accepted:result.accepted,cancelled:result.cancelled,job:result.job,active_jobs:result.active_jobs};
      gate.done = true;
      return response;
    };
  });

  for (const order of releaseOrders) {
    await controlled('arm');
    await chooseWatchlist(page,'us');
    await expect.poll(() => controlled('read','us-start')).not.toBeNull();
    await expect.poll(() => controlled('read','us-status')).not.toBeNull();
    await chooseWatchlist(page,'crypto');
    await expect.poll(() => controlled('read','crypto-start')).not.toBeNull();
    await chooseWatchlist(page,'stocks');
    await expect.poll(() => controlled('read','crypto-retire')).not.toBeNull();
    await expect.poll(() => controlled('read','stocks-start')).not.toBeNull();

    const warm = await status();
    assert.equal(warm.job,null,'No job is dispatched yet for the new selection');
    assert.notEqual(warm.generation,selected.generation);
    assert.deepEqual(values(warm),baselineValues);
    await expect(sidebar()).toHaveAttribute('data-quote-generation',String(warm.generation));
    await expect(readyRows()).toHaveCount(8);
    assert.deepEqual(await visiblePrices(),prices);

    await controlled('release','stocks-start');
    selected = await currentStocks(selected.generation);
    const started = await controlled('read','stocks-start');
    assert.equal(started.response.active_jobs,1);
    const late = {};
    for (const key of order) {
      await controlled('release',key);
      await expect.poll(async () => (await controlled('read',key))?.done).toBe(true);
      late[key] = (await controlled('read',key)).response;
    }
    assert.equal(late['crypto-start'].accepted,false,'Older Crypto POST was delivered and rejected');
    assert.equal(late['us-start'].accepted,false,'Older US POST was delivered and rejected');
    assert.equal(late['crypto-retire'].cancelled,false,'Older cleanup cannot cancel Stocks');
    assert.equal(late['us-status'].accepted,true,'An old, previously valid status was delivered late');
    const after = await status();
    assert.equal(after.job,selected.job);
    assert.equal(after.generation,selected.generation);
    assert.equal(after.active_jobs,0);
    assert.deepEqual(values(after),baselineValues);
    assert.deepEqual(await visiblePrices(),prices);
    evidence.push({order,generation:after.generation,matched_rows:Object.keys(prices).length,active_jobs_at_start:started.response.active_jobs,active_jobs_after:after.active_jobs});
  }
  await app.evaluate(() => { globalThis.__watchlistOwnershipTest.on = false; });
  assert.equal((await activity()).quote_provider_requests,baseline.quote_provider_requests);
  assert.equal((await activity()).attempts,baseline.attempts);

  await page.getByLabel('Close watchlist',{exact:true}).click();
  await expect(sidebar()).toHaveCount(0);
  await expect.poll(async () => (await status()).job).toBeNull();
  assert.deepEqual(values(await status()),baselineValues);
  await page.getByLabel('Toggle sidebar',{exact:true}).click();
  selected = await currentStocks(selected.generation);
  assert.deepEqual(await visiblePrices(),prices);

  await page.reload();
  await expect(sidebar()).toBeVisible();
  const reloaded = await currentStocks();
  assert.notEqual(reloaded.job,selected.job);
  assert.equal(reloaded.generation,1,'Renderer reload starts its own scope');
  await expect.poll(async () => (await status()).owned_clients).toBe(1);
  const after = await activity();
  assert.equal(after.active_jobs,0);
  assert.equal(after.cached_values,baseline.cached_values);
  assert.equal(after.quote_provider_requests,baseline.quote_provider_requests);
  assert.equal(after.provider_requests,baseline.provider_requests);
  assert.deepEqual(await visiblePrices(),prices);

  await app.close();
  app = await launch();
  await load();
  await currentStocks();
  assert.deepEqual(await visiblePrices(),prices);
  assert.deepEqual(errors,[]);
  await writeFile('test-results/watchlist-refresh-race.json',JSON.stringify({baseline,after,cycles:evidence,errors},null,2));
  console.log('PASS: late starts, cancellation and status across four controlled native switching cycles; eight cached prices; reload and restart');
} finally {
  await app?.close();
}
