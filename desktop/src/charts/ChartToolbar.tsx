import {volumeVisibilityPatch} from './volumeIndicator';
import {ChartTypeMenu} from './ChartTypeMenu';
import { ChevronDown, SlidersHorizontal, RefreshCw, Volume2, Maximize2, Minimize2 } from 'lucide-react';
import type { Pane } from '../types';
import { TimeframeSelector } from './TimeframeSelector';
import { symbolLabel } from '../services/api';

interface ChartToolbarProps {
  pane: Pane;
  singleChart: boolean;
  replay?: boolean;
  loading: boolean;
  expanded: boolean;
  onSearch: () => void;
  onChange: (value: Partial<Pane>) => void;
  onIndicators: () => void;
  onRefresh: () => void;
  onExpand: () => void;
  onAlert: () => void;
}

export function ChartToolbar({
  pane, singleChart, replay = false, loading, expanded,
  onSearch, onChange, onIndicators, onRefresh, onExpand, onAlert,
}: ChartToolbarProps) {
  return (
    <header className="pane-toolbar">
      {!singleChart && <>
        <button className="pane-symbol" title="Change this chart’s instrument" onClick={onSearch}>
          <span>{pane.kind === 'index' ? pane.name : symbolLabel(pane.symbol)}</span><ChevronDown size={13} />
        </button>
        <div className="divider" />
        <TimeframeSelector paneId={pane.id} value={pane.timeframe} onChange={timeframe => onChange({ timeframe })} />
        <ChartTypeMenu label={`Chart type pane ${pane.id}`} scope={pane.id} value={pane.chart_type}
          onChange={chart_type=>onChange({chart_type})}/>
        <div className="grow" />
        <button aria-label={`Create alert pane ${pane.id}`} onClick={onAlert}>Alert</button>
        <button aria-label={`Indicators pane ${pane.id}`} onClick={onIndicators}>
          <SlidersHorizontal size={15} /><span className="indicator-word">Indicators</span>
        </button>
      </>}
      <button aria-label={`Auto Refresh pane ${pane.id}`} title="Automatically check visible historical candles"
        aria-pressed={pane.auto_refresh} className={pane.auto_refresh ? 'selected' : ''}
        onClick={() => onChange({ auto_refresh: !pane.auto_refresh })}>A</button>
      <button aria-label={`Refresh pane ${pane.id}`} title="Refresh historical candles now" disabled={loading || replay} onClick={onRefresh}>
        <RefreshCw size={15} className={loading ? 'spin' : ''} />
      </button>
      <button aria-label={`Volume pane ${pane.id}`} aria-pressed={pane.volume} className={pane.volume ? 'selected' : ''} onClick={() => onChange(volumeVisibilityPatch(pane, !pane.volume))}>
        <Volume2 size={15} />
      </button>
      <button data-testid={`pane-maximize-${pane.id}`} aria-label={`${expanded ? 'Restore' : 'Maximize'} chart ${pane.id}`}
        title={expanded ? 'Restore all chart panes' : 'Maximize chart pane'} aria-pressed={expanded} onClick={onExpand}>
        {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </header>
  );
}
