import {ChartStyleOptions} from '../charts/ChartStyleOptions';
import { Activity, Search, Settings2, LayoutGrid, ChevronDown, Check, Sun, Moon, Undo2, Redo2,
  Play, Maximize2, Expand, Shrink, Camera, SlidersHorizontal,
  Minimize2, Scan, Save, Ellipsis, Database, GitCompareArrows, ChartNoAxesCombined } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OS_NAME, PRIMARY_KEY, FULLSCREEN_HINT, UNDO_HINT, REDO_HINT } from '../platform';
import { providerLabel } from '../providers/label';
import type { Pane, Workspace } from '../types';
import { useFlags } from '../flags/useFlags';
import { FlagIcon } from './FlagIcon';
import { ColorFlagPicker } from './ColorFlagPicker';
import { frames, timeframeLabel, TimeframeOptions } from '../charts/TimeframeSelector';

export function command(id: string, action: string, value?: unknown) {
  window.dispatchEvent(new CustomEvent('terminal-command', { detail: { id, action, value } }));
}

interface HeaderProps {
  workspace: Workspace;
  pane: Pane;
  layoutMenu: boolean;
  onSearch: () => void;
  onCompare: () => void;
  onIndices: () => void;
  onChange: (value: Partial<Pane>) => void;
  onIndicators: () => void;
  onLayoutMenu: () => void;
  onLayout: (n: Workspace['layout']) => void;
  onTheme: () => void;
  onSettings: () => void;
  onSave: () => void;
  saved: boolean;
  onData: () => void;
  onChartSettings: () => void;
  onSync: (key: 'sync_time' | 'sync_crosshair') => void;
  focused: boolean;
  expanded: boolean;
  nativeState: { fullscreen: boolean; transitioning: boolean };
  onNativeFullscreen: () => void;
  onFocus: () => void;
}

export function TerminalHeader({
  workspace, pane, layoutMenu, onSearch, onCompare, onIndices, onChange, onIndicators, onLayoutMenu,
  onLayout, onTheme, onSettings, onChartSettings, onSync, focused,
  expanded, nativeState, onNativeFullscreen, onFocus, onSave, saved, onData,
}: HeaderProps) {
  const { flags, assignFlag, removeFlag } = useFlags();
  const [headerPicker, setHeaderPicker] = useState<{ x: number; y: number } | null>(null);
  const layout = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDetailsElement>(null);
  const layoutButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!layoutMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (!layout.current?.contains(event.target as Node)) onLayoutMenu();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [layoutMenu, onLayoutMenu]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (more.current?.open && !more.current.contains(event.target as Node)) more.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const cid = pane.canonical_id || pane.instrument_id || pane.symbol;
  const flagColor = flags[cid]?.color;

  return (
    <header className="terminal-header">
      <div className="terminal-brand" title="GLOBAL MARKET TERMINAL" data-testid="product-brand" aria-label="GLOBAL MARKET TERMINAL">
        <Activity size={17} /><strong>GMT</strong>
      </div>
      <button className="header-symbol" aria-label="Search stocks and indices" title={`Find an instrument · ${PRIMARY_KEY}K`} onClick={onSearch}>
        <Search size={15} /><strong>{pane.kind === 'index' ? pane.name : pane.symbol.replace(/-EQ$/, '')}</strong><ChevronDown size={12} />
      </button>
      <button type="button" aria-label="Compare Symbol" title="Compare Symbol" onClick={onCompare}><GitCompareArrows size={15}/></button>
      <button
        data-testid="header-symbol-flag" aria-label={flagColor ? `${flagColor.toUpperCase()} flag for ${pane.symbol}` : `Add color flag for ${pane.symbol}`}
        className={`symbol-flag-btn ${flagColor ? 'flagged' : 'unflagged'}`} title={flagColor ? 'Change color flag' : 'Add color flag'}
        onClick={e => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setHeaderPicker({ x: rect.left, y: rect.bottom + 4 });
        }}
      ><FlagIcon color={flagColor} filled={Boolean(flagColor)} size={15} /></button>
      {headerPicker && <ColorFlagPicker symbolName={pane.symbol} currentColor={flagColor} position={headerPicker}
        onSelectColor={col => void assignFlag(pane, col)} onRemoveFlag={() => void removeFlag(cid)} onClose={() => setHeaderPicker(null)} />}
      <span className="header-exchange header-provider" title={providerLabel(pane)}>{providerLabel(pane)}</span>
      <div className="toolbar-divider" />
      <div className="timeframe-toolbar">
        {frames.map(interval => <button key={interval} aria-label={`Active timeframe ${interval}`}
          aria-pressed={pane.timeframe === interval} className={pane.timeframe === interval ? 'selected' : ''}
          onClick={() => onChange({ timeframe: interval })}>{timeframeLabel(interval)}</button>)}
      </div>
      <select className="grouped-timeframe" aria-label="Grouped intervals" value={pane.timeframe} onChange={e=>onChange({timeframe:e.target.value as Pane['timeframe']})}>
        <TimeframeOptions/>
      </select>
      <select aria-label="Active chart type"  value={pane.chart_type} onChange={e => onChange({ chart_type: e.target.value as Pane['chart_type'] })}>
        <ChartStyleOptions/>
      </select>
      <button className="header-indicators" aria-label="Indicators" title="Indicators" onClick={onIndicators}>
        <SlidersHorizontal size={15} />
      </button>
      <div className="toolbar-divider" />
      <button aria-label="Search indices" title="Search indices" onClick={onIndices}><ChartNoAxesCombined size={16}/></button>
      <button aria-label="Historical replay" title="Historical candle replay" onClick={() => command(pane.id, 'replay')}>
        <Play size={15} /><span className="replay-word">Replay</span>
      </button>
      <button aria-label="Undo drawing" title={`Undo drawing · ${UNDO_HINT}`} onClick={() => command(pane.id, 'undo')}><Undo2 size={16} /></button>
      <button aria-label="Redo drawing" title={`Redo drawing · ${REDO_HINT}`} onClick={() => command(pane.id, 'redo')}><Redo2 size={16} /></button>
      <div className="grow" />
      <div className="layout-control" ref={layout} onKeyDown={event => {
        if (event.key !== 'Escape' || !layoutMenu) return;
        event.stopPropagation();
        onLayoutMenu();
        layoutButton.current?.focus();
      }}>
        <button ref={layoutButton} aria-label="Chart layout" aria-expanded={layoutMenu} title="Chart layout" onClick={onLayoutMenu}>
          <LayoutGrid size={16} /><span>{workspace.layout}</span>
        </button>
        {layoutMenu && <div className="layout-menu">
          {([1, 2, 4, 6, 8] as const).map(n => <button key={n} aria-label={`Layout ${n}`} onClick={() => onLayout(n)}>
            <span className="layout-preview" style={{ gridTemplateColumns: `repeat(${n === 1 ? 1 : n <= 4 ? 2 : n === 6 ? 3 : 4},1fr)` }}>
              {Array.from({ length: n }, (_, i) => <i key={i} />)}
            </span>{n === 1 ? 'Single chart' : `${n} charts`}{workspace.layout === n && <Check size={14} />}
          </button>)}
          <label className="sync-option"><input type="checkbox" aria-label="Synchronize time ranges" checked={workspace.sync_time}
            onChange={() => onSync('sync_time')} /> Sync visible dates</label>
          <label className="sync-option"><input type="checkbox" aria-label="Synchronize crosshair" checked={workspace.sync_crosshair}
            onChange={() => onSync('sync_crosshair')} /> Sync crosshair time</label>
        </div>}
      </div>
      <button aria-label="Chart settings" title="Chart appearance" onClick={onChartSettings}><Settings2 size={16} /></button>
      <button data-testid="maximize-active-chart" aria-label={expanded ? 'Restore Active Chart' : 'Maximize Active Chart'}
        title={expanded ? 'Restore chart panes · F' : 'Maximize selected pane · F'} aria-pressed={expanded} onClick={() => command(pane.id, 'fullscreen')}>
        {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <button aria-label={focused ? 'Exit focus mode' : 'Enter focus mode'} aria-pressed={focused} title="Focus mode · Escape exits" onClick={onFocus}><Scan size={15} /></button>
      <button className="workspace-save" aria-label="Save workspace" title={saved ? 'Workspace saved locally' : 'Save workspace locally'} data-saved={saved} onClick={onSave}><Save size={15} /></button>
      <button aria-label="Toggle theme" title="Dark / light appearance" onClick={onTheme}>{workspace.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      <button aria-label="Export active chart" title="Export chart PNG" onClick={() => command(pane.id, 'screenshot')}><Camera size={17} /></button>
      <details className="tool-more" ref={more} onKeyDown={event => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }}>
        <summary aria-label="More chart options" title="More chart options"><Ellipsis size={17} /></summary>
        <div className="tool-more-panel">
          <button aria-label="Settings" onClick={() => { if (more.current) more.current.open = false; onSettings(); }}><Settings2 size={14} /> Application settings</button>
          <button onClick={() => { if (more.current) more.current.open = false; onData(); }}><Database size={14} /> Chart data and source</button>
        </div>
      </details>
      <button data-testid="macos-fullscreen" aria-label={nativeState.fullscreen ? `Exit ${OS_NAME} Fullscreen` : `Enter ${OS_NAME} Fullscreen`}
        aria-pressed={nativeState.fullscreen} title={`Native ${OS_NAME} fullscreen · ${FULLSCREEN_HINT}`}
        disabled={nativeState.transitioning} onClick={onNativeFullscreen}>{nativeState.fullscreen ? <Shrink size={16} /> : <Expand size={16} />}</button>
    </header>
  );
}
