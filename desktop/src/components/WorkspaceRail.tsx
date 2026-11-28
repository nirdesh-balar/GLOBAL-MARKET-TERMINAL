import { Bell, ChartNoAxesCombined, TableProperties, Layers3, LayoutGrid, List, ScanSearch } from 'lucide-react';
import type { Ref } from 'react';

interface WorkspaceRailProps {
  watchlistOpen: boolean;
  orderFlowOpen: boolean;
  orderFlowButton: Ref<HTMLButtonElement>;
  onWatchlist: () => void;
  onScanner: () => void;
  onAlerts: () => void;
  onGrid: () => void;
  onData: () => void;
  onInspect: () => void;
  dataOpen: boolean;
  onOrderFlow: () => void;
}

export function WorkspaceRail({ watchlistOpen, orderFlowOpen, orderFlowButton, onWatchlist, onScanner, onAlerts, onGrid, onData, onInspect, dataOpen, onOrderFlow }: WorkspaceRailProps) {
  return (
    <nav className="analysis-rail" aria-label="Chart analysis">
      <button type="button" title="Show or hide watchlist" aria-label="Toggle sidebar" aria-expanded={watchlistOpen} onClick={onWatchlist}>
        <List size={19} />
      </button>
      <button type="button" title="Market scanner" aria-label="Screener workspace" onClick={onScanner}>
        <ScanSearch size={18} />
      </button>
      <button type="button" title="Local analytical alerts" aria-label="Alerts workspace" onClick={onAlerts}>
        <Bell size={18} />
      </button>
      <button type="button" title="Chart Grid" aria-label="Chart Grid workspace" onClick={onGrid}>
        <LayoutGrid size={18} />
      </button>
      <button ref={orderFlowButton} type="button" title="Public Order Flow" aria-label="Order Flow" aria-expanded={orderFlowOpen} onClick={onOrderFlow}>
        <Layers3 size={18} />
      </button>
      <button type="button" title="Crosshair candle and provider data" aria-label="Data Window" aria-expanded={dataOpen} onClick={onInspect}>
        <TableProperties size={18} />
      </button>
      <div className="analysis-rail-spacer" />
      <button type="button" title="Chart data" aria-label="Inspect active chart data" onClick={onData}>
        <ChartNoAxesCombined size={18} />
      </button>
    </nav>
  );
}
