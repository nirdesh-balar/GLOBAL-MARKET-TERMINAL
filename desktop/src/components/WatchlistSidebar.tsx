import {legacyCrypto} from '../providers/legacy';
import {QuoteCells} from '../refresh/QuoteCells';
import type {QuoteSnapshot,RefreshPreferences} from '../refresh/hooks';
import React, {useEffect,useRef,useState,useCallback} from 'react';
import {Plus,X,ArrowUp,ArrowDown,MoreHorizontal,Upload,Download,RefreshCw,Check} from 'lucide-react';
import type {Workspace,SymbolEntry,ChartQuote,Health,Instrument,Watchlist} from '../types';
import {symbolLabel,price} from '../services/api';
import {IndexWatchlist} from './IndexWatchlist';
import {WatchlistDialog} from '../watchlists/WatchlistDialog';
import {ImportWatchlist} from '../watchlists/ImportWatchlist';
import {identity,systemList,type WatchlistMutation,type ImportCommit,type WatchlistResult} from '../watchlists/types';
import {useFlags} from '../flags/useFlags';
import {FLAG_COLORS,ORDERED_FLAG_COLORS,type FlagColor} from '../flags/constants';
import {FlagIcon} from './FlagIcon';
import {ColorFlagPicker} from './ColorFlagPicker';
import '../watchlists/watchlists.css';

export function WatchlistSidebar({onMigration,snapshots,quoteError,onQuoteRefresh,refreshPreferences,onRefreshPreferences,refreshPaused,workspace,health,indices,active,quotes,onChange,onOpen,onSearch,onAlert,onMutate,onImport}:{onMigration:(row:SymbolEntry)=>void;snapshots:QuoteSnapshot|null;quoteError:string;onQuoteRefresh:()=>void;refreshPreferences:RefreshPreferences|null;onRefreshPreferences:(value:RefreshPreferences)=>void;refreshPaused:boolean;workspace:Workspace;health:Health;indices:Instrument[];active:string;quotes:Record<string,ChartQuote>;onChange:(w:Workspace)=>void;onOpen:(row:SymbolEntry,paneId:string)=>void;onSearch:()=>void;onAlert:(row:SymbolEntry)=>void;onMutate:(op:WatchlistMutation)=>Promise<WatchlistResult>;onImport:(value:ImportCommit)=>Promise<WatchlistResult>}){
 const [query,setQuery]=useState(''),[manage,setManage]=useState(false),[name,setName]=useState(''),[action,setAction]=useState<'create'|'rename'|'duplicate'>('create'),[drag,setDrag]=useState<string|null>(null),[target,setTarget]=useState('active'),[width,setWidth]=useState(Math.round(workspace.sidebar.width||320)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removeList,setRemoveList]=useState(false),[clearConfirm,setClearConfirm]=useState(false),[importing,setImporting]=useState(false),[menu,setMenu]=useState<{row:SymbolEntry;x:number;y:number}|null>(null),[destination,setDestination]=useState('');
 const [rowPicker,setRowPicker]=useState<{row:SymbolEntry;x:number;y:number}|null>(null);
 const [aliasInput,setAliasInput]=useState('');
 const [showHidden,setShowHidden]=useState(false);

 const {flags,counts,aliases,assignFlag,removeFlag,clearColor,setAlias,getSymbolsForColor}=useFlags();

 const resizing=useRef(false),widthRef=useRef(width),rows=useRef<HTMLDivElement>(null),menuRef=useRef<HTMLDivElement>(null);widthRef.current=width;
 useEffect(()=>setWidth(Math.round(workspace.sidebar.width||320)),[workspace.sidebar.width]);
 useEffect(()=>{setQuery('');setMenu(null);setRowPicker(null);},[workspace.active_watchlist]);
 useEffect(()=>{if(!menu)return;menuRef.current?.querySelector('button')?.focus();const dismiss=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))setMenu(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();e.preventDefault();setMenu(null);rows.current?.querySelector<HTMLElement>(`[data-identity="${CSS.escape(identity(menu.row))}"] .watch-select`)?.focus();}};window.addEventListener('pointerdown',dismiss);window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('keydown',key,true);};},[menu]);

 const isColored=workspace.active_watchlist.startsWith('color:');
 const activeColor=isColored?(workspace.active_watchlist.slice(6) as FlagColor):null;

 const current:Watchlist=isColored&&activeColor?{
  id:workspace.active_watchlist,
  name:aliases[activeColor]||FLAG_COLORS[activeColor]?.defaultLabel||`${activeColor} List`,
  items:getSymbolsForColor(activeColor)
 }:(workspace.watchlists.find(w=>w.id===workspace.active_watchlist)||workspace.watchlists[0]);

 const isMarket=!isColored&&(Boolean(current.market)||['stocks','us','global','indices','global_indices','crypto','forex','commodities','funds'].includes(current.id));
 const hiddenSymbols=(workspace.hidden_symbols?.[current.id]||[]);
 const hasHidden=isMarket&&hiddenSymbols.length>0;

 const lastFetched=Math.max(0,...Object.values(snapshots?.rows||{}).map(r=>r.value?.fetched_at||0));
 const run=async(op:WatchlistMutation)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await onMutate(op);setManage(false);setRemoveList(false);setMenu(null);setNotice('Watchlist saved');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const move=(from:number,to:number)=>{if(isColored||workspace.sidebar.sort!=='manual'||to<0||to>=current.items.length||from===to)return;const order=current.items.map(identity);order.splice(to,0,order.splice(from,1)[0]);void run({action:'reorder',id:current.id,order});};

 let items=current.items.map((row,n)=>({row,n}))
  .filter(({row})=>showHidden||!hiddenSymbols.includes(identity(row)))
  .filter(({row})=>`${row.symbol} ${row.name} ${row.exchange} ${row.kind}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

 if(workspace.sidebar.sort==='symbol')items.sort((a,b)=>a.row.symbol.localeCompare(b.row.symbol));
 if(workspace.sidebar.sort==='change')items.sort((a,b)=>(snapshots?.rows[identity(b.row)]?.value?.change??-Infinity)-(snapshots?.rows[identity(a.row)]?.value?.change??-Infinity));

 const activePaneSymbol=identity(workspace.panes.find(p=>p.id===active)||workspace.panes[0]);
 const openRow=(row:SymbolEntry)=>onOpen(row,target==='active'?active:target);

 const removeRow=async(row:SymbolEntry,n:number)=>{
  const id=identity(row);
  const isSelected=activePaneSymbol===id;
  if(isSelected){
   const nextItem=items.find(it=>identity(it.row)!==id);
   if(nextItem)openRow(nextItem.row);
  }
  if(isColored){
   await removeFlag(id);
   setNotice(`Unflagged ${row.symbol}`);
  }else if(isMarket){
   const nextHidden=Array.from(new Set([...hiddenSymbols,id]));
   onChange({
    ...workspace,
    hidden_symbols:{
     ...workspace.hidden_symbols,
     [current.id]:nextHidden,
    }
   });
   setNotice(`Hidden ${row.symbol} from ${current.name}`);
  }else{
   await run({action:'remove',id:current.id,instrument:id});
  }
 };

 const restoreRow=(id:string)=>{
  const nextHidden=hiddenSymbols.filter(h=>h!==id);
  onChange({
   ...workspace,
   hidden_symbols:{
    ...workspace.hidden_symbols,
    [current.id]:nextHidden,
   }
  });
  setNotice('Restored symbol to watchlist');
 };

 const restoreAllHidden=()=>{
  const nextMap={...workspace.hidden_symbols};
  delete nextMap[current.id];
  onChange({
   ...workspace,
   hidden_symbols:nextMap,
  });
  setNotice(`Restored all hidden symbols in ${current.name}`);
  setManage(false);
 };

 const navigateRows=(direction:'next'|'prev'|'home'|'end')=>{
  if(!items.length)return;
  const currentPos=items.findIndex(({row})=>identity(row)===activePaneSymbol);
  let targetIndex=currentPos;
  if(direction==='home'){
   targetIndex=0;
  }else if(direction==='end'){
   targetIndex=items.length-1;
  }else if(direction==='next'){
   targetIndex=currentPos===-1?0:Math.min(items.length-1,currentPos+1);
  }else if(direction==='prev'){
   targetIndex=currentPos===-1?items.length-1:Math.max(0,currentPos-1);
  }
  if(targetIndex<0||targetIndex>=items.length)return;
  const targetRow=items[targetIndex].row;
  openRow(targetRow);
  requestAnimationFrame(()=>{
   const rowEl=rows.current?.querySelector<HTMLElement>(`[data-identity="${CSS.escape(identity(targetRow))}"]`);
   if(rowEl){
    rowEl.scrollIntoView({block:'nearest'});
    const selectBtn=rowEl.querySelector<HTMLButtonElement>('.watch-select');
    selectBtn?.focus({preventScroll:true});
   }
  });
 };

 const isFormInput=(el:EventTarget|null)=>{
  if(!el||!(el instanceof HTMLElement))return false;
  const tag=el.tagName.toLowerCase();
  return tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable;
 };
 const isModalOpen=()=>Boolean(document.querySelector('[role="dialog"],[role="alertdialog"]'));

 const handleKeyDown=(e:React.KeyboardEvent,rowPosition?:number,rowN?:number)=>{
  if(isFormInput(e.target)||isModalOpen())return;

  // Meta/Ctrl + Shift + ArrowUp/Down for manual custom list reordering
  if(!isColored&&!isMarket&&workspace.sidebar.sort==='manual'&&rowN!==undefined&&(e.metaKey||e.ctrlKey)&&e.shiftKey&&['ArrowUp','ArrowDown'].includes(e.key)){
   e.preventDefault();
   move(rowN,rowN+(e.key==='ArrowDown'?1:-1));
   return;
  }

  // Shift+F10 or ContextMenu for row actions
  if(rowPosition!==undefined&&(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))){
   e.preventDefault();
   const b=(e.currentTarget as HTMLElement).getBoundingClientRect();
   context(items[rowPosition].row,b.left,b.bottom);
   return;
  }

  // TradingView-style plain ArrowUp/ArrowDown, Home, End navigation
  if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
   e.preventDefault();
   navigateRows(e.key==='ArrowDown'?'next':e.key==='ArrowUp'?'prev':e.key==='Home'?'home':'end');
  }
 };

 const context=(row:SymbolEntry,x:number,y:number)=>{setMenu({row,x:Math.max(5,Math.min(x,window.innerWidth-290)),y:Math.max(5,Math.min(y,window.innerHeight-380))});setDestination(workspace.watchlists.find(l=>l.id!==current.id)?.id||'');};
 const exportCSV=async()=>{setBusy(true);setError('');try{const result=await window.terminal.watchlistFile('export',current.id);if(result)setNotice(`Exported ${result}`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};

 const handleSaveAlias=async()=>{
  if(!activeColor)return;
  setBusy(true);setError('');
  try{
   await setAlias(activeColor,aliasInput.trim());
   setManage(false);
   setNotice('List alias saved');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 };

 const handleClearList=async()=>{
  if(!activeColor)return;
  setBusy(true);setError('');
  try{
   await clearColor(activeColor);
   setClearConfirm(false);
   setManage(false);
   setNotice(`${current.name} cleared`);
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 };

 return <aside data-testid="watchlist-sidebar" aria-label="Watchlists" className="watchlist professional-watchlist" style={{width}} aria-busy={busy}><div className="sidebar-resizer" role="separator" aria-label="Resize watchlist" aria-orientation="vertical" onPointerDown={e=>{resizing.current=true;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(resizing.current)setWidth(Math.round(Math.max(220,Math.min(480,window.innerWidth-e.clientX))));}} onPointerUp={e=>{if(!resizing.current)return;resizing.current=false;e.currentTarget.releasePointerCapture(e.pointerId);onChange({...workspace,sidebar:{...workspace.sidebar,width:Math.round(widthRef.current)}});}} onPointerCancel={()=>resizing.current=false}/>
 <header data-testid="watchlist-header">
  {isColored && activeColor && <span className="watchlist-header-flag" title={`${current.name}`}><FlagIcon color={activeColor} filled={true} size={15}/></span>}
  <select data-testid="watchlist-dropdown" aria-label="Active watchlist" value={current.id} disabled={busy} onChange={e=>onChange({...workspace,active_watchlist:e.target.value})}>
   <optgroup label="CUSTOM WATCHLISTS">
    {workspace.watchlists.filter(w=>!systemList(w)).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
   </optgroup>
   <optgroup label="COLORED WATCHLISTS">
    {ORDERED_FLAG_COLORS.map(col=><option key={`color:${col}`} value={`color:${col}`} data-testid={`colored-watchlist-${col}`}>{aliases[col]||FLAG_COLORS[col].defaultLabel} ({counts[col]||0})</option>)}
   </optgroup>
   <optgroup label="MARKETS">
    {workspace.watchlists.filter(w=>systemList(w)).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
   </optgroup>
  </select>
  <button aria-label="Create watchlist" title="Create watchlist" onClick={()=>{setAction('create');setName('');setManage(true);setError('');}}><Plus size={16}/></button>
  <button aria-label="Import watchlist CSV" title="Import watchlist CSV" disabled={busy} onClick={()=>setImporting(true)}><Upload size={14}/></button>
  <button aria-label="Export watchlist CSV" title="Export watchlist CSV" disabled={busy} onClick={exportCSV}><Download size={14}/></button>
  <button aria-label="Manage watchlists" title={isColored?'Rename alias or clear color list':'Rename, duplicate or delete watchlist'} onClick={()=>{if(isColored&&activeColor){setAliasInput(aliases[activeColor]||'');setManage(true);setError('');}else{setAction(systemList(current)?'duplicate':'rename');setName(current.name);setManage(true);setError('');}}}><MoreHorizontal size={16}/></button>
 </header>
 <div className="watch-search"><button aria-label="Refresh watchlist prices" title="Fetch latest available historical prices" onClick={onQuoteRefresh} disabled={!!snapshots?.pending||refreshPaused}><RefreshCw size={14} className={snapshots?.pending&&!refreshPaused?'spin':''}/></button><input aria-label="Search current watchlist" placeholder="Search this watchlist" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="Add watchlist symbol" title="Search global instruments" onClick={onSearch}><Plus size={16}/></button></div>
 <div className="watchlist-options">
  <select aria-label="Open symbol in pane" value={target} onChange={e=>setTarget(e.target.value)}><option value="active">Active chart</option>{Array.from({length:8},(_,i)=><option key={i} value={i}>Chart {i+1}</option>)}</select>
  <select aria-label="Watchlist sort" value={workspace.sidebar.sort} onChange={e=>onChange({...workspace,sidebar:{...workspace.sidebar,sort:e.target.value as Workspace['sidebar']['sort']}})}><option value="manual">Manual order</option><option value="symbol">Symbol A–Z</option><option value="change">Change %</option></select>
  <label title="Show supplied volume"><input aria-label="Watchlist volume" type="checkbox" checked={workspace.sidebar.volume} onChange={e=>onChange({...workspace,sidebar:{...workspace.sidebar,volume:e.target.checked}})}/>Vol</label>
  {hasHidden&&<label title="Show or hide locally hidden tickers" className="watch-hidden-toggle" style={{display:'inline-flex',alignItems:'center',gap:'3px',fontSize:'10px',cursor:'pointer'}}><input aria-label="Show hidden symbols" type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)}/>Hidden ({hiddenSymbols.length})</label>}
 </div>

 {(error||notice||busy)&&<div className={`watchlist-status ${error?'error':''}`} role={error?'alert':'status'}>{error||busy&&'Saving watchlist…'||notice}{error&&<button aria-label="Dismiss watchlist error" onClick={()=>setError('')}><X size={12}/></button>}</div>}
 <div className="watch-columns"><span className="watch-col-flag" aria-hidden="true"/><span title={`${current.items.length} items`}>SYMBOL · {current.items.length}</span><span>LAST</span><span>CHG %</span><span className="watch-col-actions" aria-hidden="true"/></div>
 <div ref={rows} data-testid="watchlist-rows" className="watch-rows" tabIndex={0} onKeyDown={e=>handleKeyDown(e)}>
  {items.map(({row,n},position)=>{
   const id=identity(row),q=snapshots?.rows[id]?.value;
   const rowFlagColor=flags[id]?.color;
   const isHidden=hiddenSymbols.includes(id);
   return <div data-stream-state={snapshots?.rows[id]?.stream_state} data-quote-state={snapshots?.rows[id]?.state||'idle'} data-identity={id} data-hidden={isHidden} className={`watch-row ${activePaneSymbol===id?'selected-symbol':''}`} key={id} draggable={!isColored&&!busy&&workspace.sidebar.sort==='manual'} onClick={e=>{if((e.target as HTMLElement).closest('.symbol-flag-btn, .watch-row-actions, button, a'))return;openRow(row);e.currentTarget.querySelector<HTMLButtonElement>('.watch-select')?.focus();}} onContextMenu={e=>{e.preventDefault();context(row,e.clientX,e.clientY);}} onDragStart={e=>{if(isColored)return;setDrag(id);e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDrag(null)} onDragOver={e=>{if(!isColored&&drag&&workspace.sidebar.sort==='manual')e.preventDefault();}} onDrop={e=>{e.preventDefault();if(!isColored&&drag&&workspace.sidebar.sort==='manual')move(current.items.findIndex(r=>identity(r)===drag),n);setDrag(null);}}>
    <button data-testid={`watchlist-flag-${row.symbol}`} aria-label={rowFlagColor?`${rowFlagColor.toUpperCase()} flag for ${row.symbol}`:`Flag ${row.symbol}`} className={`symbol-flag-btn ${rowFlagColor?'flagged':'unflagged'}`} title={rowFlagColor?`${rowFlagColor.toUpperCase()} flag (Click to change)`:`Flag ${row.symbol}`} onClick={e=>{e.stopPropagation();e.preventDefault();const b=e.currentTarget.getBoundingClientRect();setRowPicker({row,x:b.left,y:b.bottom+4});}}>
     <FlagIcon color={rowFlagColor} filled={Boolean(rowFlagColor)} size={13}/>
    </button>
    <button data-testid={`watchlist-symbol-${row.symbol}`} className="watch-select" title={`Click opens chart. ArrowUp / ArrowDown navigates and updates chart immediately. Shift+F10 opens actions.`} onClick={()=>openRow(row)} onKeyDown={e=>handleKeyDown(e,position,n)}>
     <span>
      <strong>{row.kind==='index'?row.name:symbolLabel(row.symbol)}</strong>
      {row.kind==='index'?<IndexWatchlist indices={indices} symbol={row.symbol}/>:<small>{legacyCrypto(row)?'Migration required':`${row.exchange} · ${row.provider==='hyperliquid'?row.market_type:row.kind}`} {workspace.sidebar.volume&&q?.volume!==null&&q?.volume!==undefined?' · Vol '+q.volume.toLocaleString():''}</small>}
     </span>
     <QuoteCells migrationRequired={legacyCrypto(row)} row={snapshots?.rows[id]?{...snapshots.rows[id],state:refreshPaused?'cancelled':snapshots.rows[id].state,stale:snapshots.rows[id].stale||refreshPaused||!!q&&Date.now()/1000-q.fetched_at>Math.max(120,(refreshPreferences?.watchlist_interval||300)*2)}:undefined}/>
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
  })}
  {!items.length&&<p className="empty">{current.items.length?(hasHidden&&!showHidden?`All matching symbols hidden in this list. Toggle 'Hidden (${hiddenSymbols.length})' to show them.`:'No symbols match your search.'):isColored?`No symbols flagged with ${activeColor?.toUpperCase() || ''}. Flag symbols from Search or other watchlists.`:'Use Add symbol or Import CSV to populate this watchlist.'}</p>}
 </div>
 <button data-testid="watchlist-add-symbol" className="add-symbol" onClick={onSearch}><Plus size={15}/> Add symbol</button>
 <div className="watchlist-bottom"><strong>{health.instruments.toLocaleString()} <span>NSE equities · Global search</span></strong><details className="quote-preferences"><summary data-testid="quote-refresh-status" title={quoteError||snapshots?.provider.error||`Historical snapshots, not a live quote feed. Updated at is the last successful provider retrieval; each row shows its own data/retrieval times. Last check completed: ${snapshots?.completed_at?new Date(snapshots.completed_at*1000).toLocaleTimeString():'pending'}`}>{refreshPaused?'Refresh paused':quoteError?'Provider unavailable':snapshots?.pending?`Loading ${snapshots.pending} prices…`:lastFetched?`Updated at ${new Date(lastFetched*1000).toLocaleTimeString()}`:'Historical prices'} · {refreshPreferences?.watchlist_interval?`Auto ${refreshPreferences.watchlist_interval}s`:'Manual'}</summary><div><label><input type="checkbox" aria-label="Fetch watchlist prices on startup" checked={!!refreshPreferences?.startup_quotes} onChange={e=>refreshPreferences&&onRefreshPreferences({...refreshPreferences,startup_quotes:e.target.checked})}/> Fetch prices on startup</label><label>Watchlist refresh<select aria-label="Watchlist auto refresh" value={refreshPreferences?.watchlist_interval??300} onChange={e=>refreshPreferences&&onRefreshPreferences({...refreshPreferences,watchlist_interval:Number(e.target.value) as RefreshPreferences['watchlist_interval']})}><option value={0}>Manual only</option><option value={60}>60 seconds</option><option value={300}>300 seconds</option><option value={900}>900 seconds</option></select></label><label>Chart checks<select aria-label="Chart refresh interval" value={refreshPreferences?.chart_interval??300} onChange={e=>refreshPreferences&&onRefreshPreferences({...refreshPreferences,chart_interval:Number(e.target.value) as RefreshPreferences['chart_interval']})}><option value={60}>60 seconds</option><option value={300}>300 seconds</option><option value={900}>900 seconds</option></select></label><small>Yahoo historical data for non-crypto; verified crypto uses public streaming when available. Daily, weekly and monthly checks use at least 300 seconds; reliably closed markets reduce requests.</small>{(quoteError||snapshots?.provider.error)&&<small role="status">{quoteError||snapshots?.provider.error}</small>}</div></details></div>

 {manage&&isColored&&activeColor&&<WatchlistDialog title={`Manage ${FLAG_COLORS[activeColor].name} List`} onClose={()=>{if(!busy)setManage(false);}}>
  <div className="watchlist-dialog-body">
   <label>Custom Display Name / Alias
    <input aria-label="Colored list alias" maxLength={64} value={aliasInput} onChange={e=>setAliasInput(e.target.value)} placeholder={FLAG_COLORS[activeColor].defaultLabel}/>
   </label>
   <p>{current.items.length} flagged symbols in {current.name}. Leave empty to restore default name.</p>
   <button className="secondary-button" disabled={busy} onClick={handleSaveAlias}>Save Alias</button>
   <button className="secondary-button" aria-label="Clear colored list" disabled={busy||!current.items.length} onClick={()=>{setManage(false);setClearConfirm(true);}}>Clear List ({current.items.length} items)</button>
   {error&&<p role="alert" className="error">{error}</p>}
  </div>
 </WatchlistDialog>}

 {manage&&!isColored&&<WatchlistDialog title="Manage watchlists" onClose={()=>{if(!busy)setManage(false);}}><div className="watchlist-dialog-body"><label>Action<select aria-label="Watchlist action" value={action} onChange={e=>{const a=e.target.value as typeof action;setAction(a);setName(a==='create'?'':a==='duplicate'?current.name+' copy':current.name);}}><option value="create">Create watchlist</option><option value="rename" disabled={systemList(current)}>Rename current</option><option value="duplicate">Duplicate current</option></select></label><label>Name<input aria-label="Watchlist name" maxLength={64} value={name} onChange={e=>setName(e.target.value)} placeholder="Watchlist name" autoFocus/></label><p>{workspace.watchlists.length}/40 lists · {systemList(current)?'Default market list; its name and existence are protected.':`${current.items.length} items in ${current.name}`}</p><button className="secondary-button" disabled={busy||!name.trim()} onClick={()=>void run({action,id:current.id,name})}>Save watchlist</button><button className="secondary-button" aria-label="Delete watchlist" disabled={busy||systemList(current)} onClick={()=>{setManage(false);setRemoveList(true);}}>Delete current list</button>{hasHidden&&<div style={{marginTop:'12px',paddingTop:'12px',borderTop:'1px solid rgba(255,255,255,0.08)'}}><p>{hiddenSymbols.length} hidden ticker{hiddenSymbols.length===1?'':'s'} in {current.name}.</p><button className="secondary-button" disabled={busy} onClick={restoreAllHidden}>Restore {hiddenSymbols.length} hidden ticker{hiddenSymbols.length===1?'':'s'}</button></div>}{error&&<p role="alert" className="error">{error}</p>}</div></WatchlistDialog>}

 {clearConfirm&&isColored&&activeColor&&<WatchlistDialog title={`Clear ${current.name}?`} onClose={()=>{if(!busy)setClearConfirm(false);}}>
  <div className="watchlist-dialog-body">
   <p>Clear all {current.items.length} symbols from {current.name}? All symbols will be unflagged. Instruments remain in your directory, charts, drawings and custom watchlists.</p>
   <button className="secondary-button" onClick={()=>setClearConfirm(false)}>Cancel</button>
   <button className="secondary-button" disabled={busy} onClick={handleClearList}>Confirm Clear List</button>
   {error&&<p role="alert" className="error">{error}</p>}
  </div>
 </WatchlistDialog>}

 {removeList&&<WatchlistDialog title="Delete watchlist?" onClose={()=>{if(!busy)setRemoveList(false);}}><div className="watchlist-dialog-body"><p>Delete “{current.name}” and its {current.items.length} item memberships? Securities remain in the global directory and all other watchlists.</p><button className="secondary-button" onClick={()=>setRemoveList(false)}>Cancel</button><button className="secondary-button" disabled={busy} onClick={()=>void run({action:'delete',id:current.id,confirm:true})}>Confirm delete watchlist</button>{error&&<p role="alert" className="error">{error}</p>}</div></WatchlistDialog>}
 {importing&&<ImportWatchlist lists={workspace.watchlists} current={current.id} onCommit={onImport} onClose={()=>setImporting(false)}/>}

 {menu&&<div ref={menuRef} role="menu" aria-label="Instrument actions" className="watchlist-context" style={{left:menu.x,top:menu.y}}>
  <strong>{menu.row.symbol} · {menu.row.exchange}</strong>
  <button role="menuitem" onClick={()=>{openRow(menu.row);setMenu(null);}}>Open in chart</button>
  {onAlert&&<button role="menuitem" onClick={()=>{onAlert(menu.row);setMenu(null);}}>Create alert</button>}
  {/* Color flag actions */}
  <div style={{padding:'4px 8px',borderTop:'1px solid rgba(255,255,255,0.08)',borderBottom:'1px solid rgba(255,255,255,0.08)',margin:'3px 0'}}>
   <span style={{fontSize:'10px',color:'#848e9c',textTransform:'uppercase',letterSpacing:'0.04em',display:'block',marginBottom:'4px'}}>Flag Symbol</span>
   <div style={{display:'flex',gap:'5px',alignItems:'center'}}>
    {ORDERED_FLAG_COLORS.map(col=><button key={col} aria-label={`Flag ${col}`} title={FLAG_COLORS[col].name} style={{width:'16px',height:'16px',borderRadius:'50%',backgroundColor:FLAG_COLORS[col].hex,border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{void assignFlag(menu.row,col);setMenu(null);}}>{flags[identity(menu.row)]?.color===col&&<Check size={10} color="#ffffff" strokeWidth={3}/>}</button>)}
    {flags[identity(menu.row)]&&<button aria-label="Remove flag" title="Remove flag" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',padding:'2px 4px',fontSize:'10px',display:'flex',alignItems:'center'}} onClick={()=>{void removeFlag(identity(menu.row));setMenu(null);}}><X size={12}/></button>}
   </div>
  </div>
  {flags[identity(menu.row)]&&<button role="menuitem" onClick={()=>{onChange({...workspace,active_watchlist:`color:${flags[identity(menu.row)]!.color}`});setMenu(null);}}>Open {aliases[flags[identity(menu.row)]!.color]||FLAG_COLORS[flags[identity(menu.row)]!.color].defaultLabel}</button>}
  <button role="menuitem" disabled={busy} onClick={()=>void run({action:'add',id:'favourites',instrument:identity(menu.row)})}>Add to favourites</button>
  <label>Destination<select aria-label="Destination watchlist" value={destination} onChange={e=>setDestination(e.target.value)}>{workspace.watchlists.filter(w=>w.id!==current.id).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
  <button role="menuitem" disabled={busy||!destination} onClick={()=>void run({action:'transfer',id:current.id,instrument:identity(menu.row),destination})}>Copy to watchlist</button>
  <button role="menuitem" disabled={busy||!destination} onClick={()=>void run({action:'transfer',id:current.id,instrument:identity(menu.row),destination,move:true})}>Move to watchlist</button>
  {isMarket?(
   hiddenSymbols.includes(identity(menu.row))?(
    <button role="menuitem" disabled={busy} onClick={()=>{restoreRow(identity(menu.row));setMenu(null);}}>Restore ticker to watchlist</button>
   ):(
    <button role="menuitem" disabled={busy} onClick={()=>{void removeRow(menu.row,0);setMenu(null);}}>Hide ticker from watchlist</button>
   )
  ):(
   <button role="menuitem" disabled={busy} onClick={()=>{if(isColored){void removeFlag(identity(menu.row));setMenu(null);}else void run({action:'remove',id:current.id,instrument:identity(menu.row)});}}>{isColored?'Unflag from this colored list':'Remove from current watchlist'}</button>
  )}
 </div>}

 {rowPicker&&<ColorFlagPicker symbolName={rowPicker.row.symbol} currentColor={flags[identity(rowPicker.row)]?.color} position={{x:rowPicker.x,y:rowPicker.y}} onSelectColor={col=>void assignFlag(rowPicker.row,col)} onRemoveFlag={()=>void removeFlag(identity(rowPicker.row))} onClose={()=>setRowPicker(null)}/>}
 </aside>;
}
