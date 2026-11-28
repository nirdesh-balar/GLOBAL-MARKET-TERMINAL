import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Activity } from 'lucide-react';
import { gridHistory, GRID_HISTORY_LIMIT } from '../chartGrid/history';
import type { ChartRestoreSample } from '../services/chartRestoreTiming';
import { PERFORMANCE_SAMPLE_MS, type PerformanceSnapshot } from '../services/performanceTypes';
import './performanceDiagnostics.css';

type RestoreRef = RefObject<ChartRestoreSample | null>;
const unavailable = 'Unavailable';
const number = (value: number | null | undefined, unit = '', digits = 0) =>
  value == null ? unavailable : value.toFixed(digits) + (unit ? ' ' + unit : '');
const memory = (bytes: number | null | undefined) =>
  number(bytes == null ? null : bytes / 1024 ** 2, 'MiB', 1);
const state = (flag: boolean | undefined) => flag === undefined ? unavailable : flag ? 'Reported' : 'None reported';

type Sample = {
  snapshot: PerformanceSnapshot | null;
  charts: number;
  gridCharts: number;
  gridHistory: ReturnType<typeof gridHistory.status>;
  restoration: ChartRestoreSample | null;
};

function Metric({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return <div><dt title={title}>{label}</dt><dd>{children}</dd></div>;
}

function DiagnosticsReadings({ restore }: { restore: RestoreRef }) {
  const [sample, setSample] = useState<Sample>();
  useEffect(() => {
    let active = true;
    let pending = false;
    let next: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (!active || pending || document.hidden) return;
      pending = true;
      const snapshot = await window.terminal.performanceDiagnostics().catch(() => null);
      pending = false;
      if (!active || document.hidden) return;
      setSample({
        snapshot,
        charts: document.querySelectorAll('.chart-workspace[data-inactive="false"] .chart-pane:not([hidden]) .chart-canvas').length,
        gridCharts: document.querySelectorAll('.grid-card-canvas').length,
        gridHistory: gridHistory.status(),
        restoration: restore.current,
      });
      next = setTimeout(() => void read(), PERFORMANCE_SAMPLE_MS);
    };
    const visibility = () => {
      clearTimeout(next);
      if (!document.hidden) void read();
    };
    document.addEventListener('visibilitychange', visibility);
    void read();
    return () => {
      active = false;
      clearTimeout(next);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [restore]);

  const snapshot = sample?.snapshot;
  const market = snapshot?.market;
  const processes = [snapshot?.main, snapshot?.renderer, snapshot?.backend];
  const total = processes.every(process => process?.memoryBytes != null)
    ? processes.reduce((sum, process) => sum + (process?.memoryBytes ?? 0), 0) : null;
  return <div data-testid="performance-readings" data-sampled-at={snapshot?.sampledAt}>
    <p><time dateTime={snapshot ? new Date(snapshot.sampledAt).toISOString() : undefined}>
      {snapshot ? new Date(snapshot.sampledAt).toLocaleString() : sample ? 'Sample unavailable' : 'Collecting first sample…'}
    </time> · Samples every {PERFORMANCE_SAMPLE_MS / 1000} s while visible</p>
    <dl>
      <Metric label="GMT version">{snapshot?.version ?? unavailable}</Metric>
      <Metric label="Electron and platform">{snapshot ? `${snapshot.electron} · ${snapshot.platform}` : unavailable}</Metric>
      <Metric label="Source SHA" title="Exact revision for a clean build from the official repository.">{snapshot?.sourceRevision ?? unavailable}</Metric>
    </dl>
    <h3>Process resources</h3>
    <dl>
      {(['Main', 'Renderer', 'Backend'] as const).map((label, index) => <Metric key={label} label={label}>
        {memory(processes[index]?.memoryBytes)} · CPU {number(processes[index]?.cpuPercent, '%', 1)}
      </Metric>)}
      <Metric label="Main + renderer + backend" title="Sum of the three resident sets. Shared pages may be counted more than once.">{memory(total)}</Metric>
      <Metric label="CPU measurement window">{number(snapshot?.cpuWindowMs == null ? null : snapshot.cpuWindowMs / 1000, 's', 1)}</Metric>
    </dl>
    <p>Resident memory is a point-in-time estimate. CPU is estimated as a percentage of one core and needs two samples.</p>
    <h3>Charts and history</h3>
    <dl>
      <Metric label="Active charts">{number(sample?.charts)}</Metric>
      <Metric label="Active Grid charts">{number(sample?.gridCharts)}</Metric>
      <Metric label="Grid history active / peak / limit">
        {sample ? `${sample.gridHistory.active} / ${sample.gridHistory.peak} / ${GRID_HISTORY_LIMIT}` : unavailable}
      </Metric>
      <Metric label="History active / queued / configured limit">
        {market ? `${market.activeHistory} / ${market.queuedHistory} / ${market.historyConcurrency}` : unavailable}
      </Metric>
      <Metric label="History requests">{number(market?.historyRequests)}</Metric>
      <Metric label="Estimated candle cache">{memory(market?.historyCacheBytes)}</Metric>
      <Metric label="Last Charts restore" title="From layout commit to a frame with all requested charts ready.">
        {sample?.restoration ? `${number(sample.restoration.elapsedMs, 'ms', 1)} · ${sample.restoration.charts} chart(s)` : unavailable}
      </Metric>
    </dl>
    <h3>Providers and streaming</h3>
    <dl>
      <Metric label="Yahoo historical provider attempts">{number(market?.yahooHistoryAttempts)}</Metric>
      <Metric label="Yahoo cooldown">{number(market?.yahooCooldownSeconds, 's')}</Metric>
      <Metric label="Hyperliquid REST / candle requests">
        {number(market?.hyperliquidRestRequests)} / {number(market?.hyperliquidCandleRequests)}
      </Metric>
      <Metric label="Hyperliquid REST cooldown">{number(market?.hyperliquidCooldownSeconds, 's')}</Metric>
      <Metric label="Hyperliquid REST weight limit">{number(market?.hyperliquidWeightLimit, 'weight/min')}</Metric>
      <Metric label="Stream connection state">{market?.streamState ?? unavailable}</Metric>
      <Metric label="Stream connections / subscriptions / consumers">
        {market ? `${market.streamConnections} / ${market.streamSubscriptions} / ${market.streamConsumers}` : unavailable}
      </Metric>
      <Metric label="Stream reconnects">{number(market?.streamReconnects)}</Metric>
      <Metric label="History error" title="The local history service recorded an error.">{state(market?.historyError)}</Metric>
      <Metric label="Stream warning" title="The local stream service reports a connection or resource warning.">{state(market?.streamError)}</Metric>
    </dl>
  </div>;
}

export function PerformanceDiagnostics({ restore }: { restore: RestoreRef }) {
  const [expanded, setExpanded] = useState(false);
  return <div className="settings-card performance-diagnostics">
    <Activity size={20} aria-hidden="true"/>
    <details onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>Performance diagnostics</summary>
      {expanded && <DiagnosticsReadings restore={restore}/>}
    </details>
  </div>;
}
