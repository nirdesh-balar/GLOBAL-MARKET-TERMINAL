// Run with node --import ./scripts/performance-probe.mjs scripts/<native-fixture>.mjs.
import { appendFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { _electron } from './isolated-electron.mjs';

const output = resolve(process.env.GMT_PERF_TRACE ?? 'test-results/performance-trace.jsonl');
await mkdir(dirname(output), { recursive: true });
const script = process.argv[1]?.split('/').at(-1);
const launch = _electron.launch.bind(_electron);
const profiles = new Set();
const sampleMs = 2000;
const write = data => appendFile(output, JSON.stringify({ script, ...data }) + '\n');

function observeCharts() {
  const instances = '.tv-lightweight-charts';
  let current = new Set(document.querySelectorAll(instances));
  const counters = { mounts: current.size, unmounts: 0 };
  const observer = new MutationObserver(() => {
    const next = new Set(document.querySelectorAll(instances));
    for (const node of next) if (!current.has(node)) counters.mounts++;
    for (const node of current) if (!next.has(node)) counters.unmounts++;
    current = next;
  });
  observer.observe(document, { childList: true, subtree: true });
  window.gmtChartLifecycle = counters;
}

function resources(mainPid, rendererPid) {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,%cpu=,comm='], { encoding: 'utf8' })
    .trim().split('\n').flatMap(line => {
      const row = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);
      if (!row) return [];
      return [{ pid: +row[1], parent: +row[2], rssBytes: +row[3] * 1024, cpuPercent: +row[4], name: row[5].split('/').at(-1) }];
    });
  const owned = new Set([mainPid]);
  while (true) {
    const added = rows.filter(row => owned.has(row.parent) && !owned.has(row.pid));
    if (!added.length) break;
    for (const row of added) owned.add(row.pid);
  }
  const metrics = row => row ? { rssBytes: row.rssBytes, cpuPercent: row.cpuPercent } : null;
  const members = rows.filter(row => owned.has(row.pid));
  return {
    main: metrics(members.find(row => row.pid === mainPid)),
    renderer: metrics(members.find(row => row.pid === rendererPid)),
    backend: metrics(members.find(row => row.parent === mainPid && /^python/i.test(row.name))),
    total: members.reduce((sum, row) => ({
      rssBytes: sum.rssBytes + row.rssBytes, cpuPercent: sum.cpuPercent + row.cpuPercent,
    }), { rssBytes: 0, cpuPercent: 0 }),
  };
}

_electron.launch = async options => {
  const start = Date.now();
  const profile = options.env.IMT_TEST_DATA_DIR;
  const startup = profiles.has(profile) ? 'existing-profile' : 'fresh-profile';
  profiles.add(profile);
  const app = await launch(options);
  const page = await app.firstWindow();
  const mainPid = app.process().pid;
  await page.addInitScript(observeCharts);
  await page.evaluate(observeCharts);
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  let closed = false, timer, active;
  const ready = page.waitForFunction(() => {
    const chart = document.querySelector('.chart-canvas[data-rendered-bars]');
    return chart && Number(chart.dataset.renderedBars) > 0;
  }, null, { timeout: 45000 }).then(() => write({ kind: 'startup', startup, elapsedMs: Date.now() - start })).catch(() => {});
  const sample = async () => {
    try {
      const [rendererPid, { metrics }, view] = await Promise.all([
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId()),
        session.send('Performance.getMetrics'),
        page.evaluate(async () => {
          if (!document.querySelector('.terminal-shell')) return null;
          const [history, stream] = await Promise.all([
            window.terminal.request('/api/history/status'),
            window.terminal.request('/api/streams/status'),
          ]);
          const charts = [...document.querySelectorAll('.chart-canvas')];
          return {
            mounted: charts.filter(node => node.__chart).length,
            normal: charts.filter(node => node.__chart && !node.closest('[hidden]') &&
              node.closest('.chart-workspace')?.dataset.inactive === 'false').length,
            grid: document.querySelectorAll('.grid-card-canvas .tv-lightweight-charts').length,
            studyMs: charts.map(node => Number(node.dataset.studyMs)),
            lifecycle: window.gmtChartLifecycle,
            settings: !!document.querySelector('.settings-modal'),
            indicators: !!document.querySelector('.indicator-manager'),
            orderFlow: !!document.querySelector('[data-testid="order-flow-panel"]'),
            replay: charts.some(node => node.dataset.replay === 'true'),
            history: { active: history.active, queued: history.queued, requests: history.history_requests,
              yahooProviderAttempts: history.provider_requests, hyperliquidRestRequests: history.hyperliquid?.rest.requests,
              estimatedCacheBytes: history.bytes, cacheEntries: history.entries },
            stream: { connections: stream.connection_count, subscriptions: stream.subscriptions, consumers: stream.consumers,
              state: stream.state, generation: stream.generation },
          };
        }),
      ]);
      await write({ kind: 'sample', elapsedMs: Date.now() - start, sampleMs, startup, view,
        processes: resources(mainPid, rendererPid),
        renderer: Object.fromEntries(metrics.filter(({ name }) =>
          ['JSHeapUsedSize', 'JSHeapTotalSize', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'LayoutCount', 'Nodes', 'JSEventListeners'].includes(name))
          .map(({ name, value }) => [name, value])),
      });
    } catch (error) {
      if (!closed && !page.isClosed()) await write({ kind: 'sample-disrupted', reason: error.name });
    } finally {
      if (!closed) timer = setTimeout(() => { active = sample(); }, sampleMs);
    }
  };
  timer = setTimeout(() => { active = sample(); }, sampleMs);
  const close = app.close.bind(app);
  app.close = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    await active;
    try { await close(); }
    finally { await ready; }
  };
  return app;
};
