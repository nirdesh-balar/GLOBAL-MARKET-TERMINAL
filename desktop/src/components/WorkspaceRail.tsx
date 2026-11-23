import { Bell, ChartNoAxesCombined, LayoutGrid, List, ScanSearch } from 'lucide-react';

interface WorkspaceRailProps {
  watchlistOpen: boolean;
  onWatchlist: () => void;
  onScanner: () => void;
  onAlerts: () => void;
  onGrid: () => void;
  onData: () => void;
}

export function WorkspaceRail({ watchlistOpen, onWatchlist, onScanner, onAlerts, onGrid, onData }: WorkspaceRailProps) {
  return (
    <nav className="analysis-rail" aria-label="Chart analysis">
      <button type="button" title="Watchlist" aria-label="Watchlist dock" aria-expanded={watchlistOpen} onClick={onWatchlist}>
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
      <div className="analysis-rail-spacer" />
      <button type="button" title="Chart data" aria-label="Inspect active chart data" onClick={onData}>
        <ChartNoAxesCombined size={18} />
      </button>
    </nav>
  );
}
