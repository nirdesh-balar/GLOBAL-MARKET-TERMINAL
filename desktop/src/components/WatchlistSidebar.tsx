import {marketIdentity,providerLabel} from '../providers/label';
import {legacyCrypto} from '../providers/legacy';
import {QuoteCells} from '../refresh/QuoteCells';
import type {QuoteSnapshot,QuoteRow,RefreshPreferences} from '../refresh/hooks';
import React, {useEffect,useLayoutEffect,useRef,useState,useCallback} from 'react';
import {Plus,X,ArrowUp,ArrowDown,MoreHorizontal,Upload,Download,RefreshCw,Check,LayoutGrid,ChevronDown,Search as SearchIcon,ListFilter} from 'lucide-react';
import type {Workspace,SymbolEntry,ChartQuote,Health,Instrument,Watchlist,Timeframe} from '../types';
import {symbolLabel,price,api} from '../services/api';
import type {ExcelWatchlistRow,ExcelExportPayload} from '../export/excelWorkbook';
import {WatchlistPopover} from '../watchlists/WatchlistPopover';
import {MARKET_SECTIONS,marketSection,type MarketSection} from '../watchlists/marketSections';
import {WatchlistDialog} from '../watchlists/WatchlistDialog';
import {ImportWatchlist} from '../watchlists/ImportWatchlist';
import {identity,type WatchlistMutation,type ImportCommit,type WatchlistResult} from '../watchlists/types';
import {useFlags} from '../flags/useFlags';
import {FLAG_COLORS,ORDERED_FLAG_COLORS,type FlagColor} from '../flags/constants';
import {FlagIcon} from './FlagIcon';
import {ColorFlagPicker} from './ColorFlagPicker';
import '../watchlists/watchlists.css';

const timeframeDisplay = (tf?: string) => {
    if (!tf || tf === '1d') return '1D';
    if (tf === '1w') return '1W';
    if (tf === '1M') return '1M';
    if (tf === '1Y') return '1Y';
    return tf;
};

export type WatchlistSortOption =
    | 'manual'
    | 'symbol'
    | 'symbol_desc'
    | 'price'
    | 'price_desc'
    | 'change'
    | 'change_desc'
    | 'change_asc'
    | 'change_abs'
    | 'change_abs_desc';

export function compareSymbolEntries(
    a: SymbolEntry,
    b: SymbolEntry,
    sort: WatchlistSortOption,
    quotes?: Record<string, QuoteRow>
): number {
    if (sort === 'manual') return 0;

    if (sort === 'symbol') {
        const cmp = a.symbol.localeCompare(b.symbol);
        return cmp !== 0 ? cmp : (a.exchange || '').localeCompare(b.exchange || '');
    }
    if (sort === 'symbol_desc') {
        const cmp = b.symbol.localeCompare(a.symbol);
        return cmp !== 0 ? cmp : (b.exchange || '').localeCompare(a.exchange || '');
    }

    const idA = identity(a);
    const idB = identity(b);
    const qA = quotes?.[idA]?.value;
    const qB = quotes?.[idB]?.value;

    const getFinite = (val: number | null | undefined, fallback: number): number => {
        return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
    };

    if (sort === 'price_desc' || sort === 'price') {
        const isDesc = sort === 'price_desc';
        const missing = isDesc ? -Infinity : Infinity;
        const pA = getFinite(qA?.price, missing);
        const pB = getFinite(qB?.price, missing);
        if (pA !== pB) {
            return isDesc ? pB - pA : pA - pB;
        }
        return a.symbol.localeCompare(b.symbol);
    }

    if (sort === 'change' || sort === 'change_desc' || sort === 'change_asc') {
        const isDesc = sort !== 'change_asc';
        const missing = isDesc ? -Infinity : Infinity;
        const cA = getFinite(qA?.change, missing);
        const cB = getFinite(qB?.change, missing);
        if (cA !== cB) {
            return isDesc ? cB - cA : cA - cB;
        }
        return a.symbol.localeCompare(b.symbol);
    }

    if (sort === 'change_abs_desc' || sort === 'change_abs') {
        const isDesc = sort === 'change_abs_desc';
        const missing = isDesc ? -Infinity : Infinity;
        const cA = getFinite(qA?.absolute_change, missing);
        const cB = getFinite(qB?.absolute_change, missing);
        if (cA !== cB) {
            return isDesc ? cB - cA : cA - cB;
        }
        return a.symbol.localeCompare(b.symbol);
    }

    return 0;
}

export function WatchlistSidebar({ onMigration, snapshots, quoteError, onQuoteRefresh, refreshPreferences, onRefreshPreferences, refreshPaused, workspace, health, indices, active, quotes, onChange, onOpen, onSearch, onAlert, onMutate, onImport, activeTimeframe, onGrid, onClose }: { onClose: () => void; onGrid: (rows: SymbolEntry[], source: string) => void; onMigration: (row: SymbolEntry) => void; snapshots: QuoteSnapshot | null; quoteError: string; onQuoteRefresh: () => void; refreshPreferences: RefreshPreferences | null; onRefreshPreferences: (value: RefreshPreferences) => void; refreshPaused: boolean; workspace: Workspace; health: Health; indices: Instrument[]; active: string; quotes: Record<string, ChartQuote>; onChange: (w: Workspace) => void; onOpen: (row: SymbolEntry, paneId: string) => void; onSearch: () => void; onAlert: (row: SymbolEntry) => void; onMutate: (op: WatchlistMutation) => Promise<WatchlistResult>; onImport: (value: ImportCommit) => Promise<WatchlistResult>; activeTimeframe?: Timeframe }) {
    const [query, setQuery] = useState(''), [manage, setManage] = useState(false), [name, setName] = useState(''), [action, setAction] = useState<'create' | 'rename' | 'duplicate'>('create'), [drag, setDrag] = useState<string | null>(null), [target, setTarget] = useState('active'), [width, setWidth] = useState(Math.round(workspace.sidebar.width || 320)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [removeList, setRemoveList] = useState<Watchlist | null>(null), [clearConfirm, setClearConfirm] = useState(false), [importing, setImporting] = useState(false), [menu, setMenu] = useState<{ row: SymbolEntry; x: number; y: number } | null>(null), [destination, setDestination] = useState('');
    const [rowPicker, setRowPicker] = useState<{ row: SymbolEntry; x: number; y: number; trigger: HTMLButtonElement } | null>(null);
    const [aliasInput, setAliasInput] = useState('');
    const [showHidden, setShowHidden] = useState(false);
    const [gridSelection, setGridSelection] = useState<{ list: string; ids: Set<string> } | null>(null);
    const [gridMenuOpen, setGridMenuOpen] = useState(false);
    const gridActions = useRef<HTMLDivElement>(null);
    const gridTrigger = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => {
        if (gridMenuOpen) gridActions.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }, [gridMenuOpen]);
    const [filterOpen, setFilterOpen] = useState(false);
    const [headerMenu, setHeaderMenu] = useState<{ kind: 'lists' | 'options' | 'export'; anchor: HTMLButtonElement } | null>(null);
    const closeHeaderMenu = (restoreFocus = true) => {
        if (restoreFocus) headerMenu?.anchor.focus();
        setHeaderMenu(null);
        setGridMenuOpen(false);
    };
    const toggleHeaderMenu = (kind: 'lists' | 'options', anchor: HTMLButtonElement) => {
        if (headerMenu?.anchor === anchor) closeHeaderMenu();
        else {
            setGridMenuOpen(false);
            setHeaderMenu({ kind, anchor });
        }
    };
 const [exporting,setExporting]=useState<{progress:string;current:number;total:number}|null>(null);
 const [noticeType,setNoticeType]=useState<'success'|'cancelled'|'notice'>('notice');
 const cancelExport=useRef(false);
 const noticeTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const noticeTokenRef=useRef(0);

 const clearStatusTimer=useCallback(()=>{
  if(noticeTimerRef.current){
   clearTimeout(noticeTimerRef.current);
   noticeTimerRef.current=null;
  }
 },[]);

 const dismissStatus=useCallback(()=>{
  clearStatusTimer();
  noticeTokenRef.current++;
  setNotice('');
  setError('');
  setNoticeType('notice');
 },[clearStatusTimer]);

 const setAutoDismissNotice=useCallback((msg:string,type:'success'|'cancelled'|'notice'='notice',durationMs=4000)=>{
  clearStatusTimer();
  const token=++noticeTokenRef.current;
  setNotice(msg);
  setNoticeType(type);
  setError('');
  noticeTimerRef.current=setTimeout(()=>{
   if(noticeTokenRef.current===token){
    setNotice('');
    setNoticeType('notice');
    noticeTimerRef.current=null;
   }
  },durationMs);
 },[clearStatusTimer]);

 const setAutoDismissError=useCallback((errMsg:string,durationMs=8000)=>{
  clearStatusTimer();
  const token=++noticeTokenRef.current;
  setError(errMsg);
  setNotice('');
  noticeTimerRef.current=setTimeout(()=>{
   if(noticeTokenRef.current===token){
    setError('');
    noticeTimerRef.current=null;
   }
  },durationMs);
 },[clearStatusTimer]);

    const { flags, counts, aliases, assignFlag, removeFlag, clearColor, setAlias, getSymbolsForColor } = useFlags();

 const resizing=useRef<{pointerId:number;startX:number;startWidth:number}|null>(null),rows=useRef<HTMLDivElement>(null),menuRef=useRef<HTMLDivElement>(null);
 const [resortEpoch, setResortEpoch] = useState(0);
 const triggerResort = useCallback(() => setResortEpoch(e => e + 1), []);

 const scrollPosRef = useRef<number>(0);
 const anchorRef = useRef<{ id: string; offset: number } | null>(null);

 const lastSortRef = useRef<string>(workspace.sidebar.sort);
 const lastWatchlistRef = useRef<string>('');
 const lastQueryRef = useRef<string>(query);
 const lastShowHiddenRef = useRef<boolean>(showHidden);
 const lastResortEpochRef = useRef<number>(resortEpoch);
 const lastItemsKeyRef = useRef<string>('');
 const displayOrderRef = useRef<string[]>([]);

 useEffect(()=>setWidth(Math.round(workspace.sidebar.width||320)),[workspace.sidebar.width]);
 useEffect(()=>{setQuery('');setMenu(null);setRowPicker(null);dismissStatus();},[workspace.active_watchlist,dismissStatus]);
 useEffect(()=>{return()=>clearStatusTimer();},[clearStatusTimer]);
 useEffect(()=>{if(!menu)return;menuRef.current?.querySelector('button')?.focus();const dismiss=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))setMenu(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();setMenu(null);rows.current?.querySelector<HTMLElement>(`[data-identity="${CSS.escape(identity(menu.row))}"] .watch-select`)?.focus({preventScroll:true});}};window.addEventListener('pointerdown',dismiss);window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('keydown',key,true);};},[menu]);

    const isColored = workspace.active_watchlist.startsWith('color:');
    const activeColor = isColored ? (workspace.active_watchlist.slice(6) as FlagColor) : null;

    const current: Watchlist = isColored && activeColor ? {
        id: workspace.active_watchlist,
        name: aliases[activeColor] || FLAG_COLORS[activeColor]?.defaultLabel || `${activeColor} List`,
        items: getSymbolsForColor(activeColor)
    } : (workspace.watchlists.find(w => w.id === workspace.active_watchlist) || workspace.watchlists[0] || { id: '', name: 'Watchlists', items: [] });
    const hasCurrent = Boolean(current.id);
    const favourites = workspace.watchlists.find(list => list.id === 'favourites');

    const isMarket = !isColored && (Boolean(current.market) || ['stocks', 'us', 'global', 'indices', 'global_indices', 'crypto', 'forex', 'commodities', 'funds'].includes(current.id));
    const hiddenSymbols = (workspace.hidden_symbols?.[current.id] || []);
    const hasHidden = hiddenSymbols.length > 0;

    const lastFetched = Math.max(0, ...Object.values(snapshots?.rows || {}).map(r => r.value?.fetched_at || 0));
    const run = async (op: WatchlistMutation) => { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await onMutate(op); setManage(false); setRemoveList(null); setMenu(null); setAutoDismissNotice('Watchlist saved', 'notice', 3000); } catch (e) { setAutoDismissError((e as Error).message); } finally { setBusy(false); } };
    const move = (from: number, to: number) => { if (isColored || workspace.sidebar.sort !== 'manual' || to < 0 || to >= current.items.length || from === to) return; const order = current.items.map(identity); order.splice(to, 0, order.splice(from, 1)[0]); void run({ action: 'reorder', id: current.id, order }); };

    const baseItems = current.items.map((row, n) => ({ row, n }))
        .filter(({ row }) => showHidden || !hiddenSymbols.includes(identity(row)))
        .filter(({ row }) => `${row.symbol} ${row.name} ${row.exchange} ${row.kind}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

    const itemsKey = baseItems.map(it => identity(it.row)).join('|');
    const currentSort = workspace.sidebar.sort;
    const isManual = currentSort === 'manual';

    const needsResort =
        currentSort !== lastSortRef.current ||
        current.id !== lastWatchlistRef.current ||
        query !== lastQueryRef.current ||
        showHidden !== lastShowHiddenRef.current ||
        resortEpoch !== lastResortEpochRef.current ||
        itemsKey !== lastItemsKeyRef.current ||
        displayOrderRef.current.length === 0;

    if (needsResort) {
        if (rows.current && rows.current.scrollTop > 0 && displayOrderRef.current.length > 0) {
            const viewport = rows.current.getBoundingClientRect();
            const headingHeight = rows.current.querySelector<HTMLElement>('.watch-columns')?.offsetHeight || 0;
            const topRow = document.elementFromPoint(viewport.left + 12, viewport.top + headingHeight + 2)
                ?.closest<HTMLElement>('.watch-row');
            const topId = topRow?.dataset.identity;
            if (topRow && topId && rows.current.contains(topRow)) {
                anchorRef.current = { id: topId, offset: viewport.top - topRow.getBoundingClientRect().top };
            }
        }

        if (isManual) {
            displayOrderRef.current = baseItems.map(it => identity(it.row));
        } else {
            const sorted = [...baseItems];
            sorted.sort((a, b) => compareSymbolEntries(a.row, b.row, currentSort, snapshots?.rows));
            displayOrderRef.current = sorted.map(it => identity(it.row));
        }

        lastSortRef.current = currentSort;
        lastWatchlistRef.current = current.id;
        lastQueryRef.current = query;
        lastShowHiddenRef.current = showHidden;
        lastResortEpochRef.current = resortEpoch;
        lastItemsKeyRef.current = itemsKey;
    }

    const baseMap = new Map<string, { row: SymbolEntry; n: number }>();
    for (const item of baseItems) {
        baseMap.set(identity(item.row), item);
    }
    const items: Array<{ row: SymbolEntry; n: number }> = [];
    for (const id of displayOrderRef.current) {
        const item = baseMap.get(id);
        if (item) {
            items.push(item);
            baseMap.delete(id);
        }
    }
    for (const item of baseMap.values()) {
        items.push(item);
    }

    useLayoutEffect(() => {
        const container = rows.current;
        if (!container) return;

        if (anchorRef.current) {
            const anchor = anchorRef.current;
            anchorRef.current = null;
            const row = container.querySelector(`[data-identity="${CSS.escape(anchor.id)}"]`);
            if (row) {
                container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top + anchor.offset;
                scrollPosRef.current = container.scrollTop;
                return;
            }
        }

        if (scrollPosRef.current > 0 && container.scrollTop === 0) {
            container.scrollTop = scrollPosRef.current;
        }
    });

    const groupPreference = workspace.sidebar.groups?.[current.id];
    const grouped = groupPreference !== undefined;
    const collapsedGroups = groupPreference || [];
    const groups = grouped ? new Map(MARKET_SECTIONS.map(([id]) => [id, [] as typeof items])) : null;
    if (groups) for (const item of items) groups.get(marketSection(item.row))?.push(item);
    const visibleItems = groups
        ? MARKET_SECTIONS.flatMap(([id]) => collapsedGroups.includes(id) ? [] : groups.get(id)!)
        : items;
    const visiblePositions = groups ? new Map(visibleItems.map((item,index)=>[item,index])) : null;
    const gridItems = groups ? MARKET_SECTIONS.flatMap(([id]) => groups.get(id)!) : items;
    const updateGroups = (collapsed?: MarketSection[]) => {
        const groups = { ...workspace.sidebar.groups };
        if (collapsed) groups[current.id] = collapsed;
        else delete groups[current.id];
        onChange({ ...workspace, sidebar: { ...workspace.sidebar, groups } });
    };

    const isSymbol = currentSort === 'symbol' || currentSort === 'symbol_desc';
    const isPrice = currentSort === 'price' || currentSort === 'price_desc';
    const isChangeAbs = currentSort === 'change_abs' || currentSort === 'change_abs_desc';
    const isChangePct = currentSort === 'change' || currentSort === 'change_desc' || currentSort === 'change_asc';

    const handleColumnSort = (column: 'symbol' | 'price' | 'change_abs' | 'change') => {
        let nextSort: Workspace['sidebar']['sort'];
        if (column === 'symbol') {
            nextSort = currentSort === 'symbol' ? 'symbol_desc' : 'symbol';
        } else if (column === 'price') {
            nextSort = currentSort === 'price_desc' ? 'price' : 'price_desc';
        } else if (column === 'change_abs') {
            nextSort = currentSort === 'change_abs_desc' ? 'change_abs' : 'change_abs_desc';
        } else {
            nextSort = (currentSort === 'change' || currentSort === 'change_desc') ? 'change_asc' : 'change';
        }
        onChange({
            ...workspace,
            sidebar: {
                ...workspace.sidebar,
                sort: nextSort,
            }
        });
        triggerResort();
    };

    const activePaneSymbol = identity(workspace.panes.find(p => p.id === active) || workspace.panes[0]);
    const openRow = (row: SymbolEntry) => onOpen(row, target === 'active' ? active : target);

    const removeRow = async (row: SymbolEntry, n: number) => {
        const id = identity(row);
        const isSelected = activePaneSymbol === id;
        if (isSelected) {
            const nextItem = items.find(it => identity(it.row) !== id);
            if (nextItem) openRow(nextItem.row);
        }
        if (isColored) {
            await removeFlag(id);
            setAutoDismissNotice(`Unflagged ${row.symbol}`, 'notice', 3000);
        } else if (isMarket) {
            const nextHidden = Array.from(new Set([...hiddenSymbols, id]));
            onChange({
                ...workspace,
                hidden_symbols: {
                    ...workspace.hidden_symbols,
                    [current.id]: nextHidden,
                }
            });
            setAutoDismissNotice(`Hidden ${row.symbol} from ${current.name}`, 'notice', 3000);
        } else {
            await run({ action: 'remove', id: current.id, instrument: id });
        }
    };

    const restoreRow = (id: string) => {
        const nextHidden = hiddenSymbols.filter(h => h !== id);
        onChange({
            ...workspace,
            hidden_symbols: {
                ...workspace.hidden_symbols,
                [current.id]: nextHidden,
            }
        });
        setAutoDismissNotice('Restored symbol to watchlist', 'notice', 3000);
    };

    const restoreAllHidden = () => {
        const nextMap = { ...workspace.hidden_symbols };
        delete nextMap[current.id];
        onChange({
            ...workspace,
            hidden_symbols: nextMap,
        });
        setAutoDismissNotice(`Restored all hidden symbols in ${current.name}`, 'notice', 3000);
        setManage(false);
    };

    const navigateRows = (direction: 'next' | 'prev' | 'home' | 'end') => {
        if (!visibleItems.length) return;
        const focusedRowId = (document.activeElement?.closest('[data-identity]') as HTMLElement)?.dataset?.identity;
        const focusedPos = focusedRowId ? visibleItems.findIndex(({ row }) => identity(row) === focusedRowId) : -1;
        const currentPos = focusedPos !== -1 ? focusedPos : visibleItems.findIndex(({ row }) => identity(row) === activePaneSymbol);
        let targetIndex = currentPos;
        if (direction === 'home') {
            targetIndex = 0;
        } else if (direction === 'end') {
            targetIndex = visibleItems.length - 1;
        } else if (direction === 'next') {
            targetIndex = currentPos === -1 ? 0 : Math.min(visibleItems.length - 1, currentPos + 1);
        } else if (direction === 'prev') {
            targetIndex = currentPos === -1 ? visibleItems.length - 1 : Math.max(0, currentPos - 1);
        }
        if (targetIndex < 0 || targetIndex >= visibleItems.length) return;
        const targetRow = visibleItems[targetIndex].row;
        openRow(targetRow);
        requestAnimationFrame(() => {
            const rowEl = rows.current?.querySelector<HTMLElement>(`[data-identity="${CSS.escape(identity(targetRow))}"]`);
            if (rowEl) {
                rowEl.scrollIntoView({ block: 'nearest' });
                const selectBtn = rowEl.querySelector<HTMLButtonElement>('.watch-select');
                selectBtn?.focus({ preventScroll: true });
            }
        });
    };

    const isFormInput = (el: EventTarget | null) => {
        if (!el || !(el instanceof HTMLElement)) return false;
        const tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };
    const isModalOpen = () => Boolean(document.querySelector('[role="dialog"],[role="alertdialog"]'));

    const handleKeyDown = (e: React.KeyboardEvent, rowPosition?: number, rowN?: number) => {
        if (isFormInput(e.target) || isModalOpen()) return;

        // Meta/Ctrl + Shift + ArrowUp/Down for manual custom list reordering
        if (!isColored && !isMarket && workspace.sidebar.sort === 'manual' && rowN !== undefined && (e.metaKey || e.ctrlKey) && e.shiftKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            move(rowN, rowN + (e.key === 'ArrowDown' ? 1 : -1));
            return;
        }

        // Shift+F10 or ContextMenu for row actions
        if (rowPosition !== undefined && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
            e.preventDefault();
            const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
            context(visibleItems[rowPosition].row, b.left, b.bottom);
            return;
        }

        // TradingView-style plain ArrowUp/ArrowDown, Home, End navigation
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            navigateRows(e.key === 'ArrowDown' ? 'next' : e.key === 'ArrowUp' ? 'prev' : e.key === 'Home' ? 'home' : 'end');
        }
    };

    const context = (row: SymbolEntry, x: number, y: number) => { setMenu({ row, x: Math.max(5, Math.min(x, window.innerWidth - 290)), y: Math.max(5, Math.min(y, window.innerHeight - 380)) }); setDestination(workspace.watchlists.find(l => l.id !== current.id)?.id || ''); };
    const exportCSV = async () => { dismissStatus(); setBusy(true); try { const result = await window.terminal.watchlistFile('export', current.id); if (result) setAutoDismissNotice(`Exported ${result}`, 'success', 4000); } catch (e) { setAutoDismissError((e as Error).message); } finally { setBusy(false); } };

 const handleExportExcel=async()=>{
  if(busy||exporting)return;
  dismissStatus();
  const exportTf=activeTimeframe||'1d';
  const listName=current.name;
  const listId=current.id;
  const targetItems=!showHidden&&hiddenSymbols.length>0?current.items.filter(r=>!hiddenSymbols.includes(identity(r))):current.items;
  if(!targetItems.length){setAutoDismissError('Watchlist contains no symbols to export.');return;}
  const sorted=[...targetItems];
  if(workspace.sidebar.sort!=='manual'){
   sorted.sort((a,b)=>compareSymbolEntries(a,b,workspace.sidebar.sort,snapshots?.rows));
  }

  cancelExport.current=false;
  setExporting({progress:`Preparing Excel export… Loaded 0 / ${sorted.length} symbols`,current:0,total:sorted.length});

  try{
   let quoteMap:Record<string,QuoteRow>={};
   if(snapshots?.watchlist===listId&&snapshots?.timeframe===exportTf&&snapshots?.rows){quoteMap={...snapshots.rows};}
   const missing=sorted.filter(r=>{const q=quoteMap[identity(r)];return !q?.value&&q?.state!=='error';});
   if(missing.length>0){
    try{
     const snapRes=await api<QuoteSnapshot>('/api/quotes/snapshot','POST',{watchlist:listId,force:false,automatic:false,timeframe:exportTf});
     if(snapRes?.rows)quoteMap={...quoteMap,...snapRes.rows};
     let pending=snapRes?.pending??0;
     let polls=0;
     while(pending>0&&!cancelExport.current&&polls<40){
      await new Promise(r=>setTimeout(r,500));
      if(cancelExport.current)break;
      polls++;
      const statusRes=await api<QuoteSnapshot>(`/api/quotes/status?watchlist=${encodeURIComponent(listId)}&timeframe=${encodeURIComponent(exportTf)}`);
      if(statusRes?.rows)quoteMap={...quoteMap,...statusRes.rows};
      pending=statusRes?.pending??0;
      const loaded=sorted.filter(r=>{const q=quoteMap[identity(r)];return Boolean(q?.value||q?.state==='error');}).length;
      setExporting({progress:`Preparing Excel export… Loaded ${loaded} / ${sorted.length} symbols`,current:loaded,total:sorted.length});
     }
    }catch{}
   }

   if(cancelExport.current){setExporting(null);setAutoDismissNotice('Export cancelled','cancelled',2000);return;}

   let successCount=0;
   let unavailCount=0;
   const rows:ExcelWatchlistRow[]=sorted.map((r,idx)=>{
    const id=identity(r);
    const qRow=quoteMap[id];
    const val=qRow?.value;
    const hasQuote=Boolean(val&&typeof val.price==='number'&&Number.isFinite(val.price));
    if(hasQuote)successCount++;else unavailCount++;

    let dataStatus='OK';
    if(hasQuote&&val){
     if(val.session?.state==='closed')dataStatus='Closed';
     else if(val.session?.state==='open')dataStatus=val.timestamp_kind==='provider_trade_time'?'Public trade snapshot · Open':'Historical snapshot · Open';
    }else{
     dataStatus=qRow?.error?`Error: ${qRow.error}`:'Unavailable';
    }

    let dataAsOf='—';
    if(val?.data_time){
     try{
      dataAsOf=new Intl.DateTimeFormat('en-IN',{timeZone:val.timestamp_kind==='trading_date'?'UTC':(val.timezone||'UTC'),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(val.data_time*1000))+` (${val.timezone||'UTC'})`;
     }catch{dataAsOf=new Date(val.data_time*1000).toISOString();}
    }

    return {
     index:idx+1,
     symbol:r.symbol,
     name:r.name||r.symbol,
     exchange:r.exchange,
     provider:r.provider||'yahoo',
     timeframe:timeframeDisplay(exportTf),
     price:hasQuote&&val?val.price:null,
     previousClose:hasQuote&&val&&typeof val.previous_close==='number'&&Number.isFinite(val.previous_close)?val.previous_close:null,
     change:hasQuote&&val&&typeof val.absolute_change==='number'&&Number.isFinite(val.absolute_change)?val.absolute_change:null,
     changePercent:hasQuote&&val&&typeof val.change==='number'&&Number.isFinite(val.change)?val.change:null,
     currency:val?.currency||(r.exchange==='NSE'||r.exchange==='BSE'?'INR':'USD'),
     dataAsOf,
     dataStatus
    };
   });

   const payload:ExcelExportPayload={
    watchlistId:listId,
    watchlistName:listName,
    timeframe:`${timeframeDisplay(exportTf)} (${exportTf})`,
    generatedAt:new Date().toISOString(),
    sourceInfo:'Yahoo Finance REST API (Equities, FX, Indices); Hyperliquid REST API (Crypto)',
    totalSymbols:sorted.length,
    successfulQuotes:successCount,
    unavailableQuotes:unavailCount,
    rows
   };

   setExporting({progress:'Saving Excel workbook…',current:sorted.length,total:sorted.length});
   const result=await window.terminal.watchlistFile('export-excel',listId,payload);
   setExporting(null);
   if(result&&typeof result==='string'){
    setAutoDismissNotice(`Excel exported successfully · Exported ${result} (${sorted.length} symbols · ${timeframeDisplay(exportTf)})`,'success',4000);
   }else{
    setAutoDismissNotice('Export cancelled','cancelled',2000);
   }
  }catch(e){
   setExporting(null);
   setAutoDismissError((e as Error).message||'Export failed',8000);
  }
 };

    const handleSaveAlias = async () => {
        if (!activeColor) return;
        setBusy(true); dismissStatus();
        try {
            await setAlias(activeColor, aliasInput.trim());
            setManage(false);
            setAutoDismissNotice('List alias saved', 'notice', 3000);
        } catch (e) { setAutoDismissError((e as Error).message); }
        finally { setBusy(false); }
    };

    const handleClearList = async () => {
        if (!activeColor) return;
        setBusy(true); dismissStatus();
        try {
            await clearColor(activeColor);
            setClearConfirm(false);
            setManage(false);
            setAutoDismissNotice(`${current.name} cleared`, 'notice', 3000);
        } catch (e) { setAutoDismissError((e as Error).message); }
        finally { setBusy(false); }
    };

 const openManagement = (nextAction: typeof action) => {
    closeHeaderMenu();
    dismissStatus();
    if (isColored && activeColor && nextAction === 'rename') setAliasInput(aliases[activeColor] || '');
    setAction(nextAction);
    setName(nextAction === 'create' ? '' : nextAction === 'duplicate' ? (current.name + ' copy').slice(0,64) : current.name);
    setManage(true);
 };
 const managementActions = () => <>
    <div className="watchlist-popover-divider"/>
    <button aria-label="Create watchlist" onClick={()=>openManagement('create')}>Create new list…</button>
    <button disabled={!hasCurrent||busy} onClick={()=>openManagement('rename')}>Rename…</button>
    <button disabled={!hasCurrent||busy} onClick={()=>openManagement('duplicate')}>Make a copy…</button>
    <button disabled={!hasCurrent||isColored||busy} onClick={()=>{closeHeaderMenu();setRemoveList(current);}}>Delete list…</button>
 </>;
 const choosingGrid=gridSelection?.list===current.id;
 const selectedForGrid=choosingGrid?gridItems.filter(({row})=>gridSelection.ids.has(identity(row))).map(({row})=>row):[];
 const selectedItem=items.find(({row})=>identity(row)===activePaneSymbol)?.row;
 const selectedQuote=selectedItem ? snapshots?.rows[identity(selectedItem)] : undefined;
 const selectedDay=selectedItem ? quotes[identity(selectedItem)] : undefined;
 const boundedWidth=(value:number)=>Math.round(Math.max(220,Math.min(480,value)));
 const persistWidth=(value:number)=>{
  setWidth(value);
  onChange({...workspace,sidebar:{...workspace.sidebar,width:value}});
 };
 const instrumentDetails = (row: SymbolEntry) => {
    const index = row.kind === 'index' ? indices.find(item=>item.symbol===row.symbol) : undefined;
    return [row.name, marketIdentity(row), row.currency, providerLabel(row),
        index?.status === 'verified' ? 'Daily history checked' : index?.error]
        .filter(Boolean).join(' · ');
 };
  const staleBefore = Date.now()/1000 - Math.max(120,(refreshPreferences?.watchlist_interval||300)*2);
 const renderRow = ({row,n}: typeof items[number], position: number) => {
   const id=identity(row),quoteRow=snapshots?.rows[id];
   const rowFlagColor=flags[id]?.color;
   const rowFlagHex=rowFlagColor?FLAG_COLORS[rowFlagColor]?.hex:undefined;
   const isHidden=hiddenSymbols.includes(id);
   return <div data-volume={workspace.sidebar.volume} data-stream-state={snapshots?.rows[id]?.stream_state} data-quote-state={snapshots?.rows[id]?.state||'idle'} data-identity={id} data-hidden={isHidden} data-flag-color={rowFlagColor||undefined} style={rowFlagHex?({'--row-flag-color':rowFlagHex} as React.CSSProperties):undefined} className={`watch-row ${activePaneSymbol===id?'selected-symbol':''}`} key={id} draggable={!isColored&&!busy&&workspace.sidebar.sort==='manual'} onClick={e=>{if((e.target as HTMLElement).closest('.symbol-flag-btn, .watch-row-actions, button, a, input'))return;openRow(row);e.currentTarget.querySelector<HTMLButtonElement>('.watch-select')?.focus({preventScroll:true});}} onContextMenu={e=>{e.preventDefault();context(row,e.clientX,e.clientY);}} onDragStart={e=>{if(isColored)return;setDrag(id);e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDrag(null)} onDragOver={e=>{if(!isColored&&drag&&workspace.sidebar.sort==='manual')e.preventDefault();}} onDrop={e=>{e.preventDefault();if(!isColored&&drag&&workspace.sidebar.sort==='manual'&&(!grouped||marketSection(row)===marketSection(current.items.find(r=>identity(r)===drag)||row)))move(current.items.findIndex(r=>identity(r)===drag),n);setDrag(null);}}>
    {choosingGrid?<input className="grid-source-choice" type="checkbox" aria-label={'Select '+row.symbol+' for Chart Grid'}
      checked={gridSelection.ids.has(id)} onChange={e=>{
        const ids=new Set(gridSelection.ids);
        if(e.target.checked)ids.add(id);else ids.delete(id);
        setGridSelection({list:current.id,ids});
      }} />:<button data-testid={`watchlist-flag-${row.symbol}`} aria-label={rowFlagColor?`${rowFlagColor.toUpperCase()} flag for ${row.symbol}`:`Add color flag for ${row.symbol}`} className={`symbol-flag-btn ${rowFlagColor?'flagged':'unflagged'}`} title={rowFlagColor?`${rowFlagColor.toUpperCase()} flag (Click to change)`:'Add color flag'} onClick={e=>{e.stopPropagation();e.preventDefault();const b=e.currentTarget.getBoundingClientRect();setRowPicker({row,x:b.left,y:b.bottom+4,trigger:e.currentTarget});}}>
     <FlagIcon color={rowFlagColor} filled={Boolean(rowFlagColor)} size={14}/>
    </button>}
    <button data-testid={`watchlist-symbol-${row.symbol}`} className="watch-select" title={`Click opens chart. ArrowUp / ArrowDown navigates and updates chart immediately. Shift+F10 opens actions.`} onClick={()=>openRow(row)} onKeyDown={e=>handleKeyDown(e,position,n)}>
     <span title={instrumentDetails(row)}>
      <strong>{row.kind==='index'?row.name:symbolLabel(row.symbol)}</strong>
      {row.kind==='crypto'&&row.market_type&&<small>{marketIdentity(row)}</small>}     </span>
     <QuoteCells row={quoteRow} showVolume={workspace.sidebar.volume} migrationRequired={legacyCrypto(row)}
       paused={refreshPaused} expired={!!quoteRow?.value&&quoteRow.value.fetched_at<staleBefore}/>
    </button>
    <div className="watch-row-actions">
     {legacyCrypto(row)&&<button className="migrate-btn" aria-label={`Migrate ${row.symbol}`} onClick={()=>onMigration(row)}>Migrate</button>}
     {!isColored&&!isMarket&&<button aria-label={`Move up ${row.symbol}`} title="Move up" disabled={busy||workspace.sidebar.sort!=='manual'||n===0} onClick={e=>{e.stopPropagation();move(n,n-1);}}><ArrowUp size={11}/></button>}
     {!isColored&&!isMarket&&<button aria-label={`Move down ${row.symbol}`} title="Move down" disabled={busy||workspace.sidebar.sort!=='manual'||n===current.items.length-1} onClick={e=>{e.stopPropagation();move(n,n+1);}}><ArrowDown size={11}/></button>}
     {isHidden?(
      <button aria-label={`Restore ${row.symbol}`} title="Restore hidden ticker" disabled={busy} onClick={e=>{e.stopPropagation();restoreRow(id);}}><RefreshCw size={11}/></button>
     ):(
      <button aria-label={`Remove ${row.symbol}`} title={isColored?'Remove flag':isMarket?'Hide ticker':'Remove from watchlist'} disabled={busy} onClick={e=>{e.stopPropagation();void removeRow(row,n);}}><X size={11}/></button>
     )}
    </div>
   </div>;
  };
 return <aside data-testid="watchlist-sidebar" aria-label="Watchlists" className="watchlist professional-watchlist" style={{width}} aria-busy={busy}
  data-watchlist={current.id} data-quote-generation={snapshots?.generation} data-quote-job={snapshots?.job ?? undefined}>
  <div className="sidebar-resizer" role="separator" aria-label="Resize watchlist" aria-orientation="vertical"
    tabIndex={0} aria-valuemin={220} aria-valuemax={480} aria-valuenow={width}
    onPointerDown={event=>{
      const startWidth=event.currentTarget.parentElement?.getBoundingClientRect().width??width;
      resizing.current={pointerId:event.pointerId,startX:event.clientX,startWidth};
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event=>{
      const drag=resizing.current;
      if(drag?.pointerId!==event.pointerId)return;
      setWidth(boundedWidth(drag.startWidth+drag.startX-event.clientX));
    }}
    onPointerUp={event=>{
      const drag=resizing.current;
      if(drag?.pointerId!==event.pointerId)return;
      resizing.current=null;
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
      if(event.clientX!==drag.startX)persistWidth(boundedWidth(drag.startWidth+drag.startX-event.clientX));
    }}
    onPointerCancel={()=>{resizing.current=null;setWidth(workspace.sidebar.width);}}
    onKeyDown={event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();
      persistWidth(boundedWidth(width+(event.key==='ArrowLeft'?16:-16)));
    }}/>
 <header data-testid="watchlist-header">
  <button className="watchlist-title" data-testid="watchlist-dropdown" data-active-list={current.id}
    aria-label="Active watchlist" aria-expanded={headerMenu?.kind === 'lists'} disabled={busy}
    title={current.name} onClick={e=>toggleHeaderMenu('lists',e.currentTarget)}
    onKeyDown={e=>{if(e.key==='ArrowDown'&&headerMenu?.kind!=='lists'){e.preventDefault();toggleHeaderMenu('lists',e.currentTarget);}}}>
    {activeColor && <FlagIcon color={activeColor} size={14}/>}
    <span>{current.name}</span><ChevronDown size={13}/>
  </button>
  <button data-testid="watchlist-add-symbol" aria-label="Add watchlist symbol" title={hasCurrent?"Add symbol":"Create a list and add symbols"} onClick={hasCurrent?onSearch:()=>openManagement('create')}><Plus size={17}/></button>
  <button aria-label="Watchlist options" title="Watchlist options" aria-expanded={headerMenu?.kind === 'options' || headerMenu?.kind === 'export'}
    onClick={e=>toggleHeaderMenu('options',e.currentTarget)}><MoreHorizontal size={17}/></button>
  <button aria-label="Close watchlist" title="Close watchlist" onClick={onClose}><X size={16}/></button>
 </header>
 {headerMenu && <WatchlistPopover key={headerMenu.kind} anchor={headerMenu.anchor} label={headerMenu.kind === 'lists' ? 'Choose watchlist' : headerMenu.kind === 'export' ? 'Watchlist export' : 'Watchlist options'}
   onClose={restoreFocus=>{
      if (restoreFocus !== false && gridMenuOpen) { setGridMenuOpen(false);gridTrigger.current?.focus(); }
      else closeHeaderMenu(restoreFocus);
   }}>
  {headerMenu.kind === 'lists' && <>
   <div className="watchlist-popover-label">Watchlists</div>
   {workspace.watchlists.map(list=><button key={list.id} type="button" data-testid={`watchlist-choice-${list.id}`}
     aria-pressed={list.id===current.id} onClick={()=>{onChange({...workspace,active_watchlist:list.id});closeHeaderMenu();}}>
      <span>{list.name}</span>{list.id===current.id&&<Check size={13}/>}
   </button>)}
   <div className="watchlist-popover-label">Flagged</div>
   {ORDERED_FLAG_COLORS.map(col=><button key={col} type="button" data-testid={`watchlist-choice-color:${col}`}
     aria-pressed={current.id===`color:${col}`} onClick={()=>{onChange({...workspace,active_watchlist:`color:${col}`});closeHeaderMenu();}}>
       <FlagIcon color={col} size={13}/><span>{aliases[col]||FLAG_COLORS[col].defaultLabel}</span><small>{counts[col]||0}</small>
   </button>)}
   {managementActions()}
  </>}
  {headerMenu.kind === 'options' && <>
   <button disabled={!hasCurrent} onClick={()=>{setFilterOpen(!filterOpen);if(filterOpen)setQuery('');closeHeaderMenu(filterOpen);}}><SearchIcon size={14}/><span>{filterOpen?'Close list filter':'Filter this watchlist'}</span></button>
   <button aria-label="Refresh watchlist prices" disabled={!hasCurrent||!!snapshots?.pending||refreshPaused} onClick={()=>{closeHeaderMenu();onQuoteRefresh();}}><RefreshCw size={14}/><span>Refresh quotes</span></button>
   <button aria-label="Import watchlist CSV" disabled={busy} onClick={()=>{closeHeaderMenu();setImporting(true);}}><Upload size={14}/>Import CSV…</button>
   <button data-testid="watchlist-export-btn" aria-label="Export watchlist" disabled={!hasCurrent||busy||Boolean(exporting)}
     onClick={()=>setHeaderMenu({...headerMenu,kind:'export'})}><Download size={14}/>Export…</button>
   <button ref={gridTrigger} aria-label="Watchlist Chart Grid actions" aria-expanded={gridMenuOpen} onClick={()=>setGridMenuOpen(!gridMenuOpen)}><LayoutGrid size={14}/>Chart Grid<ChevronDown size={12}/></button>
   {gridMenuOpen&&<div ref={gridActions} className="watchlist-popover-nested" role="group" aria-label="Watchlist Grid actions">
     <button disabled={!gridItems.length} onClick={()=>{closeHeaderMenu();setGridSelection(null);onGrid(gridItems.map(({row})=>row),current.name);}}>Open watchlist in Grid</button>
     <button aria-pressed={choosingGrid} disabled={!gridItems.length&&!choosingGrid} onClick={()=>{setGridSelection(choosingGrid?null:{list:current.id,ids:new Set()});closeHeaderMenu();}}>{choosingGrid?'Cancel symbol selection':'Select symbols'}</button>
     {choosingGrid&&<button disabled={!selectedForGrid.length} onClick={()=>{closeHeaderMenu();setGridSelection(null);onGrid(selectedForGrid,current.name+' · selection');}}>Open selected ({selectedForGrid.length}) in Grid</button>}
   </div>}
   <div className="watchlist-popover-label"><ListFilter size={12}/><span>Display</span><span data-testid="watchlist-active-timeframe" title="Comparison timeframe follows the active chart">{timeframeDisplay(activeTimeframe)}</span></div>
   <label>Open in<select aria-label="Open symbol in pane" value={target} onChange={e=>setTarget(e.target.value)}><option value="active">Active chart</option>{Array.from({length:8},(_,i)=><option key={i} value={i}>Chart {i+1}</option>)}</select></label>
   <label>Order<select aria-label="Watchlist sort" data-testid="watchlist-sort-select" value={currentSort} onChange={e=>{const sort=e.target.value as WatchlistSortOption;onChange({...workspace,sidebar:{...workspace.sidebar,sort}});triggerResort();}}>
    <option value="manual">Manual order</option><option value="symbol">Symbol (A to Z)</option><option value="symbol_desc">Symbol (Z to A)</option>
    <option value="price_desc">Last Price (High to Low)</option><option value="price">Last Price (Low to High)</option>
    <option value="change_abs_desc">Change (High to Low)</option><option value="change_abs">Change (Low to High)</option>
    <option value="change">Change % (High to Low)</option><option value="change_asc">Change % (Low to High)</option>
   </select></label>
   <label><input aria-label="Watchlist volume" type="checkbox" checked={workspace.sidebar.volume} onChange={e=>onChange({...workspace,sidebar:{...workspace.sidebar,volume:e.target.checked}})}/>Show Volume column</label>
   <label><input aria-label="Group by market" type="checkbox" disabled={!hasCurrent} checked={grouped} onChange={e=>updateGroups(e.target.checked?[]:undefined)}/>Group by market</label>
   {hasHidden&&<label><input aria-label="Show hidden symbols" type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/>Hidden ({hiddenSymbols.length})</label>}
   {hasHidden&&<button onClick={()=>{closeHeaderMenu();restoreAllHidden();}}>Restore hidden symbols</button>}
  </>}
  {headerMenu.kind === 'export' && <div data-testid="watchlist-export-menu">
   <button data-testid="export-excel-action" aria-label="Export to Excel (.xlsx)" onClick={()=>{closeHeaderMenu();void handleExportExcel();}}>Export to Excel (.xlsx)</button>
   <button data-testid="export-csv-action" aria-label="Export watchlist CSV" onClick={()=>{closeHeaderMenu();void exportCSV();}}>Export to CSV (.csv)</button>
   <button onClick={()=>setHeaderMenu({...headerMenu,kind:'options'})}>Back to options</button>
  </div>}
 </WatchlistPopover>}
 {filterOpen && hasCurrent && <div className="watch-search">
  <SearchIcon size={14}/>
  <input aria-label="Search current watchlist" placeholder="Filter this watchlist" value={query} autoFocus onChange={e=>setQuery(e.target.value)}
    onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setFilterOpen(false);setQuery('');}}}/>
  <button aria-label="Close list filter" onClick={()=>{setFilterOpen(false);setQuery('');}}><X size={14}/></button>
 </div>}
 {(error||notice||busy||exporting)&&(
  <div className={`watchlist-status ${error?'error':exporting||busy?'preparing':noticeType}`} role={error?'alert':'status'} aria-live={error?'assertive':'polite'}>
   <div className="watchlist-status-content">
    {noticeType==='success'&&!error&&!exporting&&!busy&&<Check size={11} className="status-icon success" strokeWidth={2.5}/>}
    {(exporting||busy)&&<RefreshCw size={11} className="spin status-icon preparing"/>}
    <span className="status-text">{error||(busy&&!exporting&&'Saving watchlist…')||exporting?.progress||notice}</span>
   </div>
   {exporting&&<button data-testid="watchlist-cancel-export-btn" aria-label="Cancel export" className="watchlist-cancel-btn" onClick={()=>{cancelExport.current=true;setExporting(null);setAutoDismissNotice('Export cancelled','cancelled',2000);}}>Cancel</button>}
   {(error||notice)&&!exporting&&!busy&&<button aria-label="Dismiss watchlist notification" className="watchlist-status-dismiss" onClick={dismissStatus}><X size={11}/></button>}
  </div>
 )}
 <div ref={rows} data-testid="watchlist-rows" className="watch-rows" data-volume={workspace.sidebar.volume} tabIndex={0} onKeyDown={e=>handleKeyDown(e)} onScroll={e=>{scrollPosRef.current=e.currentTarget.scrollTop;}}>
 <div className="watch-columns" data-volume={workspace.sidebar.volume}>
  <span className="watch-col-flag" aria-hidden="true"/>
  <button type="button" className={`watch-col-btn watch-col-symbol ${isSymbol?'active':''}`} onClick={()=>handleColumnSort('symbol')} title={isSymbol?(currentSort==='symbol'?'Symbol (A to Z) · Click to sort Z to A':'Symbol (Z to A) · Click to sort A to Z'):'Click to sort by Symbol'} aria-label="Sort by Symbol">
   Symbol{isSymbol&&<span className="sort-arrow">{currentSort==='symbol'?' ▲':' ▼'}</span>}
  </button>
  <button type="button" className={`watch-col-btn watch-col-price ${isPrice?'active':''}`} onClick={()=>handleColumnSort('price')} title={isPrice?(currentSort==='price_desc'?'Last Price (High to Low) · Click to sort Low to High':'Last Price (Low to High) · Click to sort High to Low'):'Click to sort by Last Price'} aria-label="Sort by Last Price">
   LAST{isPrice&&<span className="sort-arrow">{currentSort==='price_desc'?' ▼':' ▲'}</span>}
  </button>
  <button type="button" className={`watch-col-btn watch-col-change-abs ${isChangeAbs?'active':''}`} onClick={()=>handleColumnSort('change_abs')} title={isChangeAbs?(currentSort==='change_abs_desc'?'Change (High to Low) · Click to sort Low to High':'Change (Low to High) · Click to sort High to Low'):'Click to sort by Change'} aria-label="Sort by Change">
   CHG{isChangeAbs&&<span className="sort-arrow">{currentSort==='change_abs_desc'?' ▼':' ▲'}</span>}
  </button>
  <button type="button" className={`watch-col-btn watch-col-change-pct ${isChangePct?'active':''}`} onClick={()=>handleColumnSort('change')} title={isChangePct?(currentSort==='change_asc'?'Change % (Low to High) · Click to sort High to Low':'Change % (High to Low) · Click to sort Low to High'):'Click to sort by Change %'} aria-label="Sort by Change %">
   CHG %{isChangePct&&<span className="sort-arrow">{currentSort==='change_asc'?' ▲':' ▼'}</span>}
  </button>
  {workspace.sidebar.volume && <span className="watch-col-volume">Vol</span>}
  <span className="watch-col-actions" aria-hidden="true"/>
 </div>
  {groups ? MARKET_SECTIONS.map(([id,label]) => {
    const group = groups.get(id)!;
    if (!group.length) return null;
    const collapsed = collapsedGroups.includes(id);
    return <div className="watch-market-section" key={id}>
      <button className="watch-market-heading" aria-expanded={!collapsed} aria-label={label}
        onClick={()=>updateGroups(collapsed?collapsedGroups.filter(value=>value!==id):[...collapsedGroups,id])}>
        <ChevronDown size={13}/><span>{label}</span><small>{group.length}</small>
      </button>
      {!collapsed&&group.map(row=>renderRow(row,visiblePositions!.get(row)!))}
    </div>;
  }) : items.map(renderRow)}
  {!hasCurrent&&<div className="watchlist-empty-state">
    <p>No ordinary watchlists yet.</p>
    <button className="secondary-button" onClick={()=>openManagement('create')}>Create new list</button>
  </div>}
  {hasCurrent&&!items.length&&<p className="empty">{current.items.length?(hasHidden&&!showHidden?`All matching symbols hidden in this list. Use Watchlist options to show hidden symbols.`:'No symbols match your search.'):isColored?`No symbols in this flagged list. Assign a flag in Search or another watchlist.`:'Add a symbol or import a CSV.'}</p>}
 </div>
 <div className="watchlist-bottom">
  {selectedItem&&<details className="watchlist-instrument-summary">
   <summary title={instrumentDetails(selectedItem)}>{symbolLabel(selectedItem.symbol)} details</summary>
   <div><strong>{selectedItem.name || selectedItem.symbol}</strong>
    {selectedQuote?.value&&<span>{price(selectedQuote.value.price,selectedQuote.value.precision)} {selectedQuote.value.currency}
      {selectedQuote.value.change!=null&&` · ${selectedQuote.value.change.toFixed(2)}%`}
      {selectedQuote.value.absolute_change!=null&&` (${price(selectedQuote.value.absolute_change,selectedQuote.value.precision)})`}
      {selectedQuote.stale&&' · Stale'}
    </span>}
    {selectedQuote?.value?.session.reliable&&<span>Session {selectedQuote.value.session.state}</span>}
    {selectedDay?.interval==='1d'&&<span>Daily candle · High {price(selectedDay.candle.high,selectedQuote?.value?.precision)} · Low {price(selectedDay.candle.low,selectedQuote?.value?.precision)}</span>}
    {selectedQuote?.value?.timeframe==='1d'&&selectedQuote.value.volume!=null&&<span>Daily volume {selectedQuote.value.volume.toLocaleString()}</span>}
   </div>
  </details>}
  <strong>{health.instruments.toLocaleString()} <span>NSE equities · Global search</span></strong><details className="quote-preferences"><summary data-testid="quote-refresh-status" title={quoteError||snapshots?.provider.error||`Historical snapshots, not a live quote feed. Updated at is the last successful provider retrieval; each row shows its own data/retrieval times. Last check completed: ${snapshots?.completed_at?new Date(snapshots.completed_at*1000).toLocaleTimeString():'pending'}`}>{refreshPaused?'Refresh paused':quoteError?'Provider unavailable':snapshots?.pending?`Loading ${snapshots.pending} prices…`:lastFetched?`Updated at ${new Date(lastFetched*1000).toLocaleTimeString()}`:'Historical prices'} · {refreshPreferences?.watchlist_interval?`Auto ${refreshPreferences.watchlist_interval}s`:'Manual'}</summary><div><label><input type="checkbox" aria-label="Fetch watchlist prices on startup" checked={!!refreshPreferences?.startup_quotes} onChange={e=>refreshPreferences&&onRefreshPreferences({...refreshPreferences,startup_quotes:e.target.checked})}/> Fetch prices on startup</label><label>Watchlist refresh<select aria-label="Watchlist auto refresh" value={refreshPreferences?.watchlist_interval??300} onChange={e=>refreshPreferences&&onRefreshPreferences({...refreshPreferences,watchlist_interval:Number(e.target.value) as RefreshPreferences['watchlist_interval']})}><option value={0}>Manual only</option><option value={60}>60 seconds</option><option value={300}>300 seconds</option><option value={900}>900 seconds</option></select></label><label>Chart checks<select aria-label="Chart refresh interval" value={refreshPreferences?.chart_interval??300} onChange={e=>refreshPreferences&&onRefreshPreferences({...refreshPreferences,chart_interval:Number(e.target.value) as RefreshPreferences['chart_interval']})}><option value={60}>60 seconds</option><option value={300}>300 seconds</option><option value={900}>900 seconds</option></select></label><small>Yahoo historical data for non-crypto; verified crypto uses public streaming when available. Daily, weekly and monthly checks use at least 300 seconds; reliably closed markets reduce requests.</small>{(quoteError||snapshots?.provider.error)&&<small role="status">{quoteError||snapshots?.provider.error}</small>}</div></details></div>

        {manage && isColored && activeColor && action === 'rename' && <WatchlistDialog title={`Manage ${FLAG_COLORS[activeColor].name} List`} onClose={() => { if (!busy) setManage(false); }}>
            <div className="watchlist-dialog-body">
                <label>Custom Display Name / Alias
                    <input aria-label="Colored list alias" maxLength={64} value={aliasInput} onChange={e => setAliasInput(e.target.value)} placeholder={FLAG_COLORS[activeColor].defaultLabel} />
                </label>
                <p>{current.items.length} flagged symbols in {current.name}. Leave empty to restore default name.</p>
                <button className="secondary-button" disabled={busy} onClick={handleSaveAlias}>Save Alias</button>
                <button className="secondary-button" aria-label="Clear colored list" disabled={busy || !current.items.length} onClick={() => { setManage(false); setClearConfirm(true); }}>Clear List ({current.items.length} items)</button>
                {error && <p role="alert" className="error">{error}</p>}
            </div>
        </WatchlistDialog>}

        {manage && (!isColored || action !== 'rename') && <WatchlistDialog
            title={action==='create'?'Create watchlist':action==='rename'?'Rename watchlist':'Copy watchlist'}
            onClose={()=>{if(!busy)setManage(false);}}>
            <form className="watchlist-dialog-body" onSubmit={event=>{
                event.preventDefault();
                if (!busy&&name.trim()) void run({action,id:current.id,name});
            }}>
                <label>Name<input aria-label="Watchlist name" maxLength={64} value={name}
                    onChange={event=>setName(event.target.value)} placeholder="Watchlist name" autoFocus /></label>
                <p>{action==='duplicate'
                    ? `Copy ${current.items.length} instrument memberships from ${current.name}.`
                    : `${workspace.watchlists.length}/40 ordinary lists`}</p>
                <button className="secondary-button" type="submit" disabled={busy||!name.trim()}>Save watchlist</button>
                {error&&<p role="alert" className="error">{error}</p>}
            </form>
        </WatchlistDialog>}

        {clearConfirm && isColored && activeColor && <WatchlistDialog title={`Clear ${current.name}?`} onClose={() => { if (!busy) setClearConfirm(false); }}>
            <div className="watchlist-dialog-body">
                <p>Clear all {current.items.length} symbols from {current.name}? All symbols will be unflagged. Instruments remain in your directory, charts, drawings and custom watchlists.</p>
                <button className="secondary-button" onClick={() => setClearConfirm(false)}>Cancel</button>
                <button className="secondary-button" disabled={busy} onClick={handleClearList}>Confirm Clear List</button>
                {error && <p role="alert" className="error">{error}</p>}
            </div>
        </WatchlistDialog>}

        {removeList && <WatchlistDialog title="Delete watchlist?" onClose={() => { if (!busy) setRemoveList(null); }}><div className="watchlist-dialog-body"><p>Delete “{removeList.name}” and its {removeList.items.length} item memberships? Securities remain in the global directory and all other watchlists.</p><button className="secondary-button" onClick={() => setRemoveList(null)}>Cancel</button><button className="secondary-button" disabled={busy} onClick={() => void run({ action: 'delete', id: removeList.id, confirm: true })}>Confirm delete watchlist</button>{error && <p role="alert" className="error">{error}</p>}</div></WatchlistDialog>}
        {importing && <ImportWatchlist lists={workspace.watchlists} current={isColored?'':current.id} onCommit={onImport} onClose={() => setImporting(false)} />}

        {menu && <div ref={menuRef} role="menu" aria-label="Instrument actions" className="watchlist-context" style={{ left: menu.x, top: menu.y }}>
            <strong>{menu.row.symbol} · {menu.row.exchange}</strong>
            <button role="menuitem" onClick={() => { openRow(menu.row); setMenu(null); }}>Open in chart</button>
            <button role="menuitem" onClick={() => { onGrid([menu.row], current.name); setMenu(null); }}>Open in Chart Grid</button>
            {onAlert && <button role="menuitem" onClick={() => { onAlert(menu.row); setMenu(null); }}>Create alert</button>}
            {/* Color flag actions */}
            <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '3px 0' }}>
                <span style={{ fontSize: '10px', color: '#848e9c', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>Flag Symbol</span>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    {ORDERED_FLAG_COLORS.map(col => <button key={col} aria-label={`Flag ${col}`} title={FLAG_COLORS[col].name} style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: FLAG_COLORS[col].hex, border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { void assignFlag(menu.row, col); setMenu(null); }}>{flags[identity(menu.row)]?.color === col && <Check size={10} color="#ffffff" strokeWidth={3} />}</button>)}
                    {flags[identity(menu.row)] && <button aria-label="Remove flag" title="Remove flag" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '10px', display: 'flex', alignItems: 'center' }} onClick={() => { void removeFlag(identity(menu.row)); setMenu(null); }}><X size={12} /></button>}
                </div>
            </div>
            {flags[identity(menu.row)] && <button role="menuitem" onClick={() => { onChange({ ...workspace, active_watchlist: `color:${flags[identity(menu.row)]!.color}` }); setMenu(null); }}>Open {aliases[flags[identity(menu.row)]!.color] || FLAG_COLORS[flags[identity(menu.row)]!.color].defaultLabel}</button>}
            {favourites&&<button role="menuitem" disabled={busy} onClick={() => void run({ action: 'add', id: favourites.id, instrument: identity(menu.row) })}>Add to favourites</button>}
            <label>Destination<select aria-label="Destination watchlist" value={destination} onChange={e => setDestination(e.target.value)}>{workspace.watchlists.filter(w => w.id !== current.id).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <button role="menuitem" disabled={busy || !destination} onClick={() => void run({ action: 'transfer', id: current.id, instrument: identity(menu.row), destination })}>Copy to watchlist</button>
            <button role="menuitem" disabled={busy || !destination} onClick={() => void run({ action: 'transfer', id: current.id, instrument: identity(menu.row), destination, move: true })}>Move to watchlist</button>
            {isMarket ? (
                hiddenSymbols.includes(identity(menu.row)) ? (
                    <button role="menuitem" disabled={busy} onClick={() => { restoreRow(identity(menu.row)); setMenu(null); }}>Restore ticker to watchlist</button>
                ) : (
                    <button role="menuitem" disabled={busy} onClick={() => { void removeRow(menu.row, 0); setMenu(null); }}>Hide ticker from watchlist</button>
                )
            ) : hiddenSymbols.includes(identity(menu.row)) ? (
                <button role="menuitem" disabled={busy} onClick={()=>{restoreRow(identity(menu.row));setMenu(null);}}>Restore ticker to watchlist</button>
            ) : (
                <button role="menuitem" disabled={busy} onClick={() => { if (isColored) { void removeFlag(identity(menu.row)); setMenu(null); } else void run({ action: 'remove', id: current.id, instrument: identity(menu.row) }); }}>{isColored ? 'Unflag from this colored list' : 'Remove from current watchlist'}</button>
            )}
        </div>}

        {rowPicker && <ColorFlagPicker symbolName={rowPicker.row.symbol} currentColor={flags[identity(rowPicker.row)]?.color} position={{ x: rowPicker.x, y: rowPicker.y }} onSelectColor={col => void assignFlag(rowPicker.row, col)} onRemoveFlag={() => void removeFlag(identity(rowPicker.row))} compact trigger={rowPicker.trigger} onClose={() => setRowPicker(null)} />}
    </aside>;
}
