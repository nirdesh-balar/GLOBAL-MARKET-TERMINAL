import { execFile } from 'node:child_process';
import type { MarketPerformance, PerformanceSnapshot, ProcessSample } from '../src/services/performanceTypes';
import { PERFORMANCE_SAMPLE_MS } from '../src/services/performanceTypes';

interface ProcessReading {
  identity: string;
  memoryBytes: number | null;
  cpuSeconds: number | null;
}

const emptyProcess: ProcessSample = { memoryBytes: null, cpuPercent: null };
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function electronProcess(metric?: Electron.ProcessMetric): ProcessReading | null {
  if (!metric) return null;
  const memory = metric.memory?.workingSetSize;
  const cpu = metric.cpu?.cumulativeCPUUsage;
  return {
    identity: `${metric.pid}:${metric.creationTime}`,
    memoryBytes: valid(memory) ? memory * 1024 : null,
    cpuSeconds: valid(cpu) ? cpu : null,
  };
}

export function parseBackendProcess(pid: number, output: string): ProcessReading | null {
  const match = /^(\d+)\s+(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(output.trim());
  if (!match) return null;
  const [, kibibytes, hours, minutes, seconds] = match;
  return {
    identity: String(pid),
    memoryBytes: Number(kibibytes) * 1024,
    cpuSeconds: Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds),
  };
}

export function backendProcess(pid: number | undefined, platform = process.platform): Promise<ProcessReading | null> {
  if (platform !== 'darwin' || pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve(null);
  return new Promise(resolve => {
    execFile('/bin/ps', ['-o', 'rss=,time=', '-p', String(pid)], { timeout: 1000, maxBuffer: 4096 },
      (error, output) => resolve(error ? null : parseBackendProcess(pid, output)));
  });
}

function processSample(now: ProcessReading | null, prev: ProcessReading | null | undefined, elapsedMs: number | null): ProcessSample {
  if (!now) return emptyProcess;
  const delta = now.cpuSeconds !== null && prev?.cpuSeconds != null && now.identity === prev.identity
    ? now.cpuSeconds - prev.cpuSeconds : null;
  return { memoryBytes: now.memoryBytes, cpuPercent: delta !== null && delta >= 0 && elapsedMs ? 100000 * delta / elapsedMs : null };
}

type Identity = Pick<PerformanceSnapshot, 'version' | 'sourceRevision' | 'electron' | 'platform'>;
type Readings = { main: ProcessReading | null; renderer: ProcessReading | null; backend: ProcessReading | null };

export function performanceSampler(identity: Identity, readProcesses: (renderer: number) => Promise<Readings>,
  readMarket: () => Promise<MarketPerformance | null>, clock = () => performance.now(), wallClock = Date.now) {
  let last: { at: number; renderer: number; readings: Readings; snapshot: PerformanceSnapshot } | undefined;
  let pending: Promise<PerformanceSnapshot> | undefined;
  return async (renderer: number): Promise<PerformanceSnapshot> => {
    while (pending) await pending;
    const at = clock();
    if (last?.renderer === renderer && at - last.at < PERFORMANCE_SAMPLE_MS) return last.snapshot;
    pending = Promise.all([readProcesses(renderer), readMarket()]).then(([readings, market]) => {
      const elapsed = last ? at - last.at : null;
      const snapshot = {
        ...identity, sampledAt: wallClock(), intervalMs: PERFORMANCE_SAMPLE_MS, cpuWindowMs: elapsed,
        main: processSample(readings.main, last?.readings.main, elapsed),
        renderer: processSample(readings.renderer, last?.readings.renderer, elapsed),
        backend: processSample(readings.backend, last?.readings.backend, elapsed), market,
      };
      last = { at, renderer, readings, snapshot };
      return snapshot;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
