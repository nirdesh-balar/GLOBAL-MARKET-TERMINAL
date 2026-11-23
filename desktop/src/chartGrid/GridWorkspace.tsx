import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, Maximize, Minimize, Moon, Plus, Search as SearchIcon, Sun } from 'lucide-react';
import { Search } from '../components/Search';
import type { Instrument, Timeframe, Watchlist } from '../types';
import { GridTile } from './GridTile';
import { GRID_CARD_LIMIT, GRID_PAGE_SIZE, GRID_TIMEFRAMES, gridCards, gridIdentity, type GridPreferences, type GridCard } from './model';
import './grid.css';

type Props = {
  preferences: GridPreferences;
  sources: Watchlist[];
  notice: string;
  theme: 'dark' | 'light';
  fullscreen: boolean;
  transitioning: boolean;
  onBack: () => void;
  onFullscreen: () => void;
  onTheme: () => void;
  onOpen: (card: GridCard) => void;
  onSource: (source: Watchlist) => void;
  onWatch: (instrument: Instrument) => void;
  onChange: (change: (current: GridPreferences) => GridPreferences) => void;
};

export function GridWorkspace({ preferences, sources, notice, theme, fullscreen, transitioning, onBack, onFullscreen, onTheme, onOpen, onSource, onWatch, onChange }: Props) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [maximized, setMaximized] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef(0);
  const scrollTarget = useRef<number | null>(null);
  const focusTarget = useRef<{ id: string; maximize: boolean } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  const search = query.trim().toLowerCase();
  const filtered = preferences.cards.filter(({ instrument, canonical_id }) =>
    !search || [instrument?.symbol, instrument?.name, instrument?.exchange, canonical_id].some(value => value?.toLowerCase().includes(search)));
  const pages = Math.max(1, Math.ceil(filtered.length / GRID_PAGE_SIZE));
  const pageIndex = Math.min(page, pages - 1);
  const focusCard = maximized ? filtered.find(card => card.canonical_id === maximized) : undefined;
  const visible = focusCard ? [focusCard] : filtered.slice(pageIndex * GRID_PAGE_SIZE, (pageIndex + 1) * GRID_PAGE_SIZE);

  const toggleMaximize = useCallback((id: string) => {
    const restore = maximized === id;
    if (!restore) restoreScroll.current = scroll.current?.scrollTop ?? 0;
    scrollTarget.current = restore ? restoreScroll.current : 0;
    focusTarget.current = { id, maximize: true };
    setMaximized(restore ? null : id);
  }, [maximized]);

  useLayoutEffect(() => {
    if (scroll.current && scrollTarget.current !== null) {
      scroll.current.scrollTop = scrollTarget.current;
      scrollTarget.current = null;
    }
    const focus = focusTarget.current;
    if (!focus) return;
    focusTarget.current = null;
    const tile = Array.from(scroll.current?.querySelectorAll<HTMLElement>('[data-grid-id]') ?? [])
      .find(node => node.dataset.gridId === focus.id);
    (tile?.querySelector<HTMLButtonElement>(focus.maximize ? '[data-grid-maximize]' : '.grid-symbol') ?? addButton.current)
      ?.focus({ preventScroll: true });
  });

  const editSymbol = useCallback((id: string) => { setProblem(''); setPicker(id); }, []);
  const editCard = useCallback<(id: string, patch: Partial<Pick<GridCard, 'timeframe' | 'sma' | 'ema'>>) => void>(
    (id, patch) => {
      onChange(current => ({ ...current, cards: current.cards.map(card => card.canonical_id === id ? { ...card, ...patch } : card) }));
    }, [onChange],
  );
  const closePicker = () => {
    if (picker) focusTarget.current = { id: picker, maximize: false };
    else addButton.current?.focus();
    setPicker(null);
  };
  const chooseSymbol = (instrument: Instrument) => {
    const id = gridIdentity(instrument);
    if (!id) {
      setProblem('This instrument has no verified identity for historical data.');
      closePicker();
      return;
    }
    if (preferences.cards.some(card => card.canonical_id === id && card.canonical_id !== picker)) {
      setProblem('This instrument is already in the Chart Grid.');
      closePicker();
      return;
    }
    const card = gridCards([instrument], preferences.timeframe).cards[0];
    if (picker) {
      focusTarget.current = { id, maximize: false };
      onChange(current => ({
        ...current, cards: current.cards.map(old => old.canonical_id === picker
          ? { ...old, canonical_id: id, instrument: card.instrument } : old),
      }));
      if (maximized === picker) setMaximized(id);
    } else if (preferences.cards.length < GRID_CARD_LIMIT) {
      setQuery('');
      setPage(Math.floor(preferences.cards.length / GRID_PAGE_SIZE));
      scrollTarget.current = 0;
      focusTarget.current = { id, maximize: false };
      onChange(current => ({ ...current, source_label: current.source_label || 'Custom selection', cards: [...current.cards, card] }));
    }
    setPicker(null);
  };
  const turnPage = (next: number) => {
    setPage(next);
    scroll.current?.scrollTo(0, 0);
  };

  return <section className="grid-workspace" aria-label="Chart Grid" data-testid="chart-grid-workspace" onKeyDown={event => {
    if (event.key === 'Escape' && picker === null && focusCard) {
      event.preventDefault();
      toggleMaximize(focusCard.canonical_id);
    }
  }}>
    <header className="grid-workspace-header">
      <div className="grid-heading">
        <span className="grid-mark"><LayoutGrid size={20} aria-hidden="true" /></span>
        <div><h1 ref={heading} tabIndex={-1}>Chart Grid</h1><p>{preferences.source_label || 'Historical snapshots'}</p></div>
      </div>
      <div className="grid-header-actions">
        <button className="grid-button" onClick={onBack}><ArrowLeft size={14} /> Charts</button>
        <button className="grid-icon" onClick={onTheme} aria-label="Toggle Chart Grid theme" title="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        <button className="grid-icon" onClick={onFullscreen} disabled={transitioning} aria-label={fullscreen ? 'Exit Chart Grid fullscreen' : 'Enter Chart Grid fullscreen'} title="Native fullscreen">{fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
      </div>
    </header>
    <div className="grid-controls">
      <div className="grid-control-group">
        <label>Source<select aria-label="Chart Grid source" value="" onChange={e => {
          const source = sources.find(list => list.id === e.target.value);
          if (source) onSource(source);
        }}>
          <option value="" disabled>{preferences.cards.length ? 'Change watchlist…' : 'Choose a watchlist…'}</option>
          {sources.map(list => <option key={list.id} value={list.id} disabled={!list.items.length}>{list.name}</option>)}
        </select></label>
        <label className="grid-search-label"><span className="grid-sr-only">Filter Chart Grid symbols</span><SearchIcon size={14} aria-hidden="true" />
          <input placeholder="Filter symbols" value={query} onChange={e => { setQuery(e.target.value); setPage(0); setMaximized(null); }} />
        </label>
        <button ref={addButton} className="grid-button grid-add" disabled={preferences.cards.length >= GRID_CARD_LIMIT} onClick={() => { setProblem(''); setPicker(''); }}><Plus size={15} /> Add symbol</button>
      </div>
      <div className="grid-control-group">
        <label>Timeframe<select aria-label="Global Chart Grid timeframe" value={preferences.cards.some(card => card.timeframe !== preferences.timeframe) ? 'mixed' : preferences.timeframe}
          onChange={e => {
            const timeframe = e.target.value as Timeframe;
            onChange(current => ({ ...current, timeframe, cards: current.cards.map(card => ({ ...card, timeframe })) }));
          }}>
          <option value="mixed" disabled>Mixed</option>
          {GRID_TIMEFRAMES.map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Columns<select aria-label="Chart Grid columns" value={preferences.columns} onChange={e => {
          const columns = Number(e.target.value) as GridPreferences['columns'];
          onChange(current => ({ ...current, columns }));
        }}>{[1, 2, 3, 4].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Size<select aria-label="Chart Grid card size" value={preferences.size} onChange={e => {
          const size = e.target.value as GridPreferences['size'];
          onChange(current => ({ ...current, size }));
        }}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
      </div>
    </div>
    <div className="grid-summary">
      <div role="status">
        <strong>{search ? filtered.length + ' of ' : ''}{preferences.cards.length} symbols</strong>
        <span className="grid-summary-detail">Historical snapshots</span>
        {(problem || notice) && <span className="grid-notice">{problem || notice}</span>}
      </div>
      <nav className="grid-pages" aria-label="Chart Grid pagination">
        <button className="grid-icon" aria-label="Previous Grid page" disabled={pageIndex === 0 || !!focusCard} onClick={() => turnPage(pageIndex - 1)}><ChevronLeft size={16} /></button>
        <span>Page {pageIndex + 1} / {pages}</span>
        <button className="grid-icon" aria-label="Next Grid page" disabled={pageIndex + 1 >= pages || !!focusCard} onClick={() => turnPage(pageIndex + 1)}><ChevronRight size={16} /></button>
      </nav>
    </div>
    <div ref={scroll} className="grid-scroll">
      {visible.length ? <div className="grid-tiles" data-grid-size={preferences.size} data-grid-maximized={!!focusCard}
        style={{ '--grid-columns': preferences.columns } as CSSProperties}>
        {visible.map(card => <GridTile key={card.canonical_id} card={card} theme={theme} maximized={focusCard === card}
          openSymbol={editSymbol} toggleMaximize={toggleMaximize} openNormal={onOpen} onChange={editCard} />)}
      </div> : <div className="grid-empty">
        <LayoutGrid size={28} aria-hidden="true" />
        <strong>{search ? 'No matching symbols' : 'Your Chart Grid is empty'}</strong>
        <span>{search ? 'Try another symbol, market or company name.' : 'Choose a watchlist, open scanner results, or add a symbol.'}</span>
      </div>}
    </div>
    {picker !== null && <Search onSelect={chooseSymbol} onClose={closePicker} watchlist={[]} onWatch={onWatch} />}
  </section>;
}
