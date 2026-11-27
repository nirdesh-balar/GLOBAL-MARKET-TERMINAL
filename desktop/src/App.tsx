import {ChartDataWindow} from './components/ChartDataWindow';
import {PineEditor,type EditorTarget} from './studies/PineEditor';
import type {PineScript} from './studies/pineScripts';
import {compilePine} from './studies/pine';
import {IndexDetails} from './components/IndexDetails';
import './reference-analysis.css';
import {legacyCrypto,type MigrationRequest} from './providers/legacy';
import {useLiveWatchlist} from './streams/watchlist';
import {ProviderStatus} from './providers/ProviderStatus';
import {useRefreshLifecycle,useRefreshPreferences,useWatchlistQuotes} from './refresh/hooks';
import type {WatchlistMutation,ImportCommit,WatchlistResult} from './watchlists/types';
import {AlertDialog} from './alerts/AlertDialog';
import {AlertsPage} from './alerts/AlertsPage';
import type {AlertSeed,AlertRow,AlertEvent} from './alerts/types';
import {ScreenerPage} from './screener/ScreenerPage';
import {GridWorkspace} from './chartGrid/GridWorkspace';
import {DEFAULT_GRID, gridCards, type GridCard, type GridInstrument, type GridPreferences} from './chartGrid/model';
import type {ScreenResult} from './screener/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, X, Database, Wifi } from 'lucide-react';
import { TerminalHeader,command } from './components/TerminalHeader';
import { DrawingToolbar,type DrawingTool } from './components/DrawingToolbar';
import { ChartPane } from './charts/ChartPane';
import { Search } from './components/Search';
import { Settings } from './components/Settings';
import { WorkspaceRail } from './components/WorkspaceRail';
import { WatchlistSidebar } from './components/WatchlistSidebar';
import { OrderFlowPanel } from './orderFlow/OrderFlowPanel';
import { IndicatorManager } from './components/IndicatorManager';
import { useFlags } from './flags/useFlags';
import { FLAG_COLORS, type FlagColor } from './flags/constants';
import './flags/flags.css';
import { api, price, symbolLabel } from './services/api';
import type { Health, Workspace, Instrument, Pane, ChartQuote, SymbolEntry, IndicatorConfig } from './types';

function localStudyPatch(pane:Pane, local_studies:NonNullable<Pane['local_studies']>){
  const retained=new Set(local_studies.map(study=>study.id));
  const removed=new Set((pane.local_studies??[]).filter(study=>!retained.has(study.id)).map(study=>study.id));
  return {local_studies,study_layout:removed.size?Object.fromEntries(Object.entries(pane.study_layout??{}).filter(([id])=>!removed.has(id))):pane.study_layout};
}
type SearchIntent = { kind: 'chart' | 'indices'; paneId: string } | { kind: 'watchlist'; listId: string; name: string };

export default function App(){
  const alertReturnFocus=useRef<HTMLElement|null>(null);
  const [alertsOpen,setAlertsOpen]=useState(false),[visitedAlerts,setVisitedAlerts]=useState(false),[alertSeed,setAlertSeed]=useState<AlertSeed|null>(null),[editingAlert,setEditingAlert]=useState<AlertRow|undefined>(undefined),[alertRevision,setAlertRevision]=useState(0),[navigation,setNavigation]=useState<string|null>(null);
  const [screen,setScreen]=useState(false),[visitedScreen,setVisitedScreen]=useState(false);
  const [gridOpen,setGridOpen]=useState(false),[gridEpoch,setGridEpoch]=useState(0),[gridNotice,setGridNotice]=useState('');
  const [orderFlowOpen,setOrderFlowOpen]=useState(false);
  const orderFlowButton=useRef<HTMLButtonElement>(null);
  const chartsOpen=!screen&&!alertsOpen&&!gridOpen;
  const [workspaceMenuOpen,setWorkspaceMenuOpen]=useState(false);
  const workspaceMenuRef=useRef<HTMLDivElement>(null),workspaceButtonRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!workspaceMenuOpen)return;
    const activeItem=workspaceMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"][aria-current="page"]');
    const firstItem=workspaceMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    (activeItem||firstItem)?.focus();
    const handlePointerDown=(e:PointerEvent)=>{
      if(workspaceMenuRef.current&&!workspaceMenuRef.current.contains(e.target as Node)){
        setWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown',handlePointerDown);
    return()=>document.removeEventListener('pointerdown',handlePointerDown);
  },[workspaceMenuOpen]);
  const navigateToCharts=()=>{setScreen(false);setAlertsOpen(false);setGridOpen(false);setWorkspaceMenuOpen(false);workspaceButtonRef.current?.focus();};
  const navigateToScreener=()=>{setScreen(true);setAlertsOpen(false);setGridOpen(false);setVisitedScreen(true);setWorkspaceMenuOpen(false);workspaceButtonRef.current?.focus();};
  const navigateToAlerts=()=>{setAlertsOpen(true);setScreen(false);setGridOpen(false);setVisitedAlerts(true);setWorkspaceMenuOpen(false);workspaceButtonRef.current?.focus();};
  const navigateToGrid=()=>{setGridOpen(true);setScreen(false);setAlertsOpen(false);setWorkspaceMenuOpen(false);workspaceButtonRef.current?.focus();};
  const handleWorkspaceMenuKeyDown=(e:React.KeyboardEvent<HTMLDivElement>)=>{
    const items=workspaceMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if(!items||items.length===0)return;
    const itemArray=Array.from(items);
    const currentIndex=itemArray.indexOf(document.activeElement as HTMLButtonElement);
    if(e.key==='ArrowDown'){
      e.preventDefault();
      const nextIndex=currentIndex===-1?0:(currentIndex+1)%itemArray.length;
      itemArray[nextIndex]?.focus();
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      const prevIndex=currentIndex===-1?itemArray.length-1:(currentIndex-1+itemArray.length)%itemArray.length;
      itemArray[prevIndex]?.focus();
    }else if(e.key==='Home'){
      e.preventDefault();
      itemArray[0]?.focus();
    }else if(e.key==='End'){
      e.preventDefault();
      itemArray[itemArray.length-1]?.focus();
    }else if(e.key==='Escape'){
      e.preventDefault();
      e.stopPropagation();
      setWorkspaceMenuOpen(false);
      workspaceButtonRef.current?.focus();
    }else if(e.key==='Tab'){
      setWorkspaceMenuOpen(false);
    }
  };
  const handleWorkspaceButtonKeyDown=(e:React.KeyboardEvent<HTMLButtonElement>)=>{
    if(e.key==='ArrowDown'||e.key==='Enter'||e.key===' '){
      e.preventDefault();
      setWorkspaceMenuOpen(true);
    }
  };
  const [volumes,setVolumes]=useState<Record<string,{key:string;available:boolean}>>({});const onVolume=useCallback((id:string,key:string,available:boolean)=>setVolumes(old=>old[id]?.key===key&&old[id].available===available?old:{...old,[id]:{key,available}}),[]);
  const [migrationRequest,setMigrationRequest]=useState<MigrationRequest>();
  const migration=(row:SymbolEntry,choose=false,candidate?:string)=>setMigrationRequest({nonce:Date.now(),symbol:row.symbol,identity:row.canonical_id||row.instrument_id||undefined,choose,candidate});
  const [tool,setTool]=useState<DrawingTool>('cursor');const [toolOptions,setToolOptions]=useState({magnet:false,locked:false,hidden:false});
  const [indices,setIndices]=useState<Instrument[]>([]);const [indicatorPane,setIndicatorPane]=useState<string|null>(null);
  const [workspace,setWorkspace]=useState<Workspace|null>(null);const [health,setHealth]=useState<Health|null>(null);const [error,setError]=useState('');const [active,setActive]=useState('0');const [expanded,setExpanded]=useState<string|null>(null);
  const [dataWindow,setDataWindow]=useState(false);
  const [editor,setEditor]=useState<EditorTarget|null>(null);
  const [indexDetail,setIndexDetail]=useState<{row:Instrument;paneId:string}|null>(null);
  const [search,setSearch]=useState<SearchIntent|null>(null);
  const openChartSearch=useCallback((paneId:string)=>setSearch({kind:'chart',paneId}),[]);
  const closeSearch=useCallback((intent?:SearchIntent)=>setSearch(current=>!intent||current===intent?null:current),[]);
  const [settings,setSettings]=useState(false);const [layoutMenu,setLayoutMenu]=useState(false);const [quotes,setQuotes]=useState<Record<string,ChartQuote>>({});const [saved,setSaved]=useState('Preferences ready');
  const [focus,setFocus]=useState(false),[nativeState,setNativeState]=useState({fullscreen:false,transitioning:false});
  const refreshPreferences=useRefreshPreferences();const refreshPaused=useRefreshLifecycle();
  const flags=useFlags();
  const isColoredWatchlist=Boolean(workspace?.active_watchlist.startsWith('color:'));
  const activeColor=isColoredWatchlist?(workspace!.active_watchlist.slice(6) as FlagColor):null;
  const selectedWatchlist=isColoredWatchlist&&activeColor?{id:workspace!.active_watchlist,name:flags.aliases[activeColor]||FLAG_COLORS[activeColor]?.defaultLabel||`${activeColor} List`,items:flags.getSymbolsForColor(activeColor)}:workspace?.watchlists.find(w=>w.id===workspace.active_watchlist);
  const activePane=workspace?.panes.find(p=>p.id===active)||workspace?.panes[0];
  const activeTimeframe=activePane?.timeframe||'1d';
  const activeSymbol=activePane?.canonical_id||activePane?.instrument_id||activePane?.symbol;
  const historicalQuotes=useWatchlistQuotes(selectedWatchlist?.id||'',selectedWatchlist?.items.map(r=>r.canonical_id||r.instrument_id||r.symbol).join('|')||'',!!selectedWatchlist&&!!workspace?.sidebar.visible&&chartsOpen&&!focus&&!refreshPaused,refreshPreferences.value,activeTimeframe,activeSymbol);
  const liveSnapshot=useLiveWatchlist(selectedWatchlist?.id||'',selectedWatchlist?.items||[],!!selectedWatchlist&&!!workspace?.sidebar.visible&&chartsOpen&&!focus&&!refreshPaused,historicalQuotes.snapshot,activeTimeframe);
  const watchlistQuotes={...historicalQuotes,snapshot:liveSnapshot};
  useEffect(()=>{const off=window.terminal.onWindowState(setNativeState);void window.terminal.windowControl('status').then(setNativeState).catch(e=>setError(e.message));return off;},[]);
  const nativeFullscreen=()=>void window.terminal.windowControl('toggle').then(setNativeState).catch(e=>setError(e.message));
  const activeRef=useRef(active);activeRef.current=active;
  useEffect(()=>{const unsubscribe=window.terminal.onAlertNavigation(setNavigation);void window.terminal.notificationControl('navigation').then(id=>{if(typeof id==='string')setNavigation(id);}).catch(()=>{});return unsubscribe;},[]);
  useEffect(()=>{if(!navigation||!workspace)return;let live=true;void api<AlertEvent[]>('/api/alerts/history').then(events=>{const event=events.find(e=>e.id===navigation);if(live&&event){const id=activeRef.current;setWorkspace(w=>w?{...w,panes:w.panes.map(p=>p.id===id?{...p,...entry(event.payload.instrument),timeframe:event.payload.interval}:p)}:w);setExpanded(null);setScreen(false);setAlertsOpen(false);setGridOpen(false);}if(live)setNavigation(null);}).catch(e=>{if(live){setError(e.message);setNavigation(null);}});return()=>{live=false;};},[navigation,!!workspace]);
  const operations=useRef<Promise<unknown>>(Promise.resolve()),watchlistState=useRef<Pick<Workspace,'watchlists'|'watchlist_revision'>|null>(null);
  function enqueue<T>(work:()=>Promise<T>):Promise<T>{const task=operations.current.catch(()=>{}).then(work);operations.current=task;return task;}
  const acceptWorkspace=(w:Workspace)=>{watchlistState.current={watchlists:w.watchlists,watchlist_revision:w.watchlist_revision};setWorkspace(w);};
  const changeWatchlists=(path:string,op:WatchlistMutation|ImportCommit)=>{
    if(savePending.current)flushWorkspace();
    return enqueue(async()=>{
      const result=await api<WatchlistResult>(path,'POST',{...op,revision:watchlistState.current?.watchlist_revision||0});
      watchlistState.current={watchlists:result.watchlists,watchlist_revision:result.watchlist_revision};
      setWorkspace(w=>{
        if(!w)return w;
        const groups={...w.sidebar.groups};
        const hidden_symbols={...w.hidden_symbols};
        if('action' in op && op.action==='duplicate'){
          const id=result.active_watchlist;
          if(result.groups[id])groups[id]=result.groups[id];
          if(result.hidden_symbols[id])hidden_symbols[id]=result.hidden_symbols[id];
        }
        if('action' in op && op.action==='delete' && op.id){
          delete groups[op.id];
          delete hidden_symbols[op.id];
        }
        const selectResult=!('action' in op)||op.action==='create'||op.action==='duplicate'||
          (op.action==='delete'&&w.active_watchlist===op.id);
        return {...w,watchlists:result.watchlists,watchlist_revision:result.watchlist_revision,
          active_watchlist:selectResult?result.active_watchlist:w.active_watchlist,
          sidebar:{...w.sidebar,groups},hidden_symbols};
      });
      return result;
    });
  };
  const mutateWatchlist=(op:WatchlistMutation)=>changeWatchlists('/api/watchlists/mutate',op);
  const importWatchlist=(op:ImportCommit)=>changeWatchlists('/api/watchlists/import/commit',op);
  const savePending=useRef<Workspace|null>(null),saveRunning=useRef(false),saveTimeout=useRef<ReturnType<typeof setTimeout>|null>(null);const initialized=useRef(false);const revision=useRef<number|undefined>(undefined);
  const refreshHealth=useCallback(async()=>{try{const h=await api<Health>('/health');setHealth(h);setIndices(await api<Instrument[]>('/api/indices'));if(revision.current!==undefined&&revision.current!==h.catalogue.updated){acceptWorkspace(await api<Workspace>('/workspace'));}revision.current=h.catalogue.updated;}catch(e){setError((e as Error).message);}},[]);
  useEffect(()=>{let alive=true;Promise.all([api<Health>('/health'),api<Workspace>('/workspace'),api<Instrument[]>('/api/indices')]).then(([h,w,i])=>{if(alive){revision.current=h.catalogue.updated;setHealth(h);acceptWorkspace(w);setIndices(i);}}).catch(e=>{if(alive)setError(e.message);});const poll=setInterval(refreshHealth,3000);return()=>{alive=false;clearInterval(poll);};},[refreshHealth]);
  const flushWorkspace=()=>{
    if(saveRunning.current)return;
    saveRunning.current=true;
    void enqueue(async()=>{
      try{
        while(savePending.current){
          const next=savePending.current;
          savePending.current=null;
          const lists=watchlistState.current||next;
          const activeWatchlist=next.active_watchlist.startsWith('color:')||
            lists.watchlists.some(list=>list.id===next.active_watchlist)?next.active_watchlist:lists.watchlists[0]?.id||'';
          const grid=next.chart_grid||DEFAULT_GRID;
          const chart_grid={...grid,cards:grid.cards.map(({instrument,...card})=>card)};
          const result=await api<{watchlist_revision:number}>('/workspace','PUT',{...next,...lists,active_watchlist:activeWatchlist,chart_grid});
          if(watchlistState.current)watchlistState.current.watchlist_revision=result.watchlist_revision;
        }
        setSaved('Saved locally');
      }catch(error){
        setSaved('Save failed');
        setError((error as Error).message);
      }finally{saveRunning.current=false;}
    });
  };
  const requestWorkspaceSave=(next:Workspace,delay:number)=>{
    savePending.current=next;
    setSaved('Saving…');
    if(saveTimeout.current)clearTimeout(saveTimeout.current);
    saveTimeout.current=null;
    if(delay===0)flushWorkspace();
    else saveTimeout.current=setTimeout(flushWorkspace,delay);
  };
  useEffect(()=>{
    if(!workspace)return;
    if(!initialized.current){initialized.current=true;return;}
    requestWorkspaceSave(workspace,250);
    return()=>{if(saveTimeout.current)clearTimeout(saveTimeout.current);};
  },[workspace]);
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(!chartsOpen||alertSeed)return;const input=e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement;const modal=!!document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]');if(e.key==='Escape'){if(workspaceMenuOpen){setWorkspaceMenuOpen(false);workspaceButtonRef.current?.focus();return;}if(modal){closeSearch();setSettings(false);setIndicatorPane(null);return;}if(layoutMenu){setLayoutMenu(false);return;}if(tool!=='cursor'){setTool('cursor');return;}if(focus){setFocus(false);return;}if(expanded){setExpanded(null);return;}if(nativeState.fullscreen)void window.terminal.windowControl('exit').catch(e=>setError(e.message));return;}if(modal)return;if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openChartSearch(active);}if(!input&&!e.metaKey&&!e.ctrlKey&&!e.altKey){if(e.key==='f'){setExpanded(v=>v===active?null:active);}if(e.key==='i'){setIndicatorPane(active);}}};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[active,chartsOpen,alertSeed,expanded,focus,nativeState.fullscreen,layoutMenu,tool,closeSearch,openChartSearch]);
  const updatePane=(id:string,value:Partial<Pane>)=>setWorkspace(w=>w?{...w,panes:w.panes.map(p=>p.id===id?{...p,...value,...(value.local_studies?localStudyPatch(p,value.local_studies):{})}:p)}:w);
  const entry=(row:Instrument|SymbolEntry):SymbolEntry=>({symbol:row.symbol,token:row.token,instrument_id:(row as Instrument).id||(row as SymbolEntry).instrument_id,kind:row.kind,name:row.name,exchange:row.exchange,canonical_id:row.canonical_id,provider:row.provider,category:row.category,country:row.country,currency:row.currency,timezone:row.timezone,calendar:row.calendar,precision:row.precision,contract:row.contract,market_type:row.market_type,native_id:row.native_id,base_asset:row.base_asset,quote_asset:row.quote_asset,identity_version:row.identity_version,legacy_unresolved:row.legacy_unresolved,native_mapping:row.native_mapping,size_decimals:row.size_decimals,trading_availability:row.trading_availability,verified_at:row.verified_at});
  const addSearchResult = async (listId: string, row: Instrument|SymbolEntry) => {
    const id = row.canonical_id || ('id' in row ? row.id : row.instrument_id) || row.token;
    if (listId.startsWith('color:')) {
      await flags.assignFlag(row, listId.slice(6) as FlagColor);
      return;
    }
    const list = watchlistState.current?.watchlists.find(item => item.id === listId);
    if (!list) throw new Error('Watchlist no longer exists');
    if (!list.items.some(item => (item.canonical_id || item.instrument_id || item.symbol) === id)) {
      await mutateWatchlist({ action:'add', id:listId, instrument:id });
    }
    setWorkspace(current=>{
      const hidden = current?.hidden_symbols?.[listId];
      if (!current || !hidden?.includes(id)) return current;
      return {...current, hidden_symbols:{...current.hidden_symbols, [listId]:hidden.filter(item=>item!==id)}};
    });
  };
  const selectSearchResult = (intent: SearchIntent, row: Instrument) => {
    if (intent.kind === 'watchlist') {
      void addSearchResult(intent.listId,row).then(()=>closeSearch(intent)).catch(cause=>setError((cause as Error).message));
      return;
    }
    const pane = workspace?.panes.find(p=>p.id===intent.paneId);
    if(intent.kind==='indices'){
      if(row.kind==='index'){setIndexDetail({row,paneId:intent.paneId});closeSearch(intent);}
      return;
    }
    if (pane && legacyCrypto(pane) && row.provider==='hyperliquid') migration(pane,true,row.canonical_id||undefined);
    else updatePane(intent.paneId,entry(row));
    closeSearch(intent);
  };
  const watch=(row:Instrument)=>{const targetId=workspace?.active_watchlist.startsWith('color:')?'favourites':workspace?.active_watchlist;const list=watchlistState.current?.watchlists.find(l=>l.id===targetId);if(!list)return;const id=row.canonical_id||row.id;void mutateWatchlist({action:list.items.some(r=>r.canonical_id===id)?'remove':'add',id:list.id,instrument:id}).catch(e=>setError(e.message));};
  const open=(row:SymbolEntry,id:string)=>{const old=workspace?.panes.find(p=>p.id===id);if(old&&legacyCrypto(old)&&row.provider==='hyperliquid'){migration(old,true,row.canonical_id||undefined);return;}setActive(id);setExpanded(null);setWorkspace(w=>w?{...w,layout:([1,2,4,6,8] as const).find(n=>n>=Math.max(w.layout,Number(id)+1))||8,panes:w.panes.map(p=>p.id===id?{...p,...entry(row)}:p)}:w);};
  const changeGrid=useCallback((change:(current:GridPreferences)=>GridPreferences)=>{
    setWorkspace(current=>current?{...current,chart_grid:change(current.chart_grid||DEFAULT_GRID)}:current);
  },[]);
  const openGridRows=(rows:readonly GridInstrument[],source:string)=>{
    const {cards,unavailable,duplicates,excess}=gridCards(rows,workspace?.chart_grid?.timeframe||DEFAULT_GRID.timeframe);
    const issues=[
      unavailable&&unavailable+' unresolved',
      duplicates&&duplicates+' duplicate',
      excess&&excess+' over the 128-symbol limit',
    ].filter(Boolean);
    setGridNotice(issues.length?'Skipped '+issues.join(', ')+'.':'');
    changeGrid(current=>({...current,cards,source_label:source.slice(0,96)}));
    setGridEpoch(epoch=>epoch+1);
    navigateToGrid();
  };
  const openGridCardInChart=(card:GridCard)=>{
    if(!card.instrument)return;
    open(entry(card.instrument),active);updatePane(active,{timeframe:card.timeframe});navigateToCharts();
  };
  const closeAlert=()=>{setAlertSeed(null);requestAnimationFrame(()=>{
    if(alertReturnFocus.current?.isConnected)alertReturnFocus.current.focus();
    else document.querySelector<HTMLElement>(`[data-testid="pane-${active}"] .chart-scroll`)?.focus();
  });};
  const createAlert=(seed:AlertSeed)=>{alertReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setEditingAlert(undefined);setAlertSeed(seed);};
  const openAlertChart=(row:SymbolEntry,timeframe:Pane['timeframe'])=>{open(entry(row),active);updatePane(active,{timeframe});setAlertsOpen(false);setScreen(false);};
  const applyIndicators=(values:IndicatorConfig[],targets:string[])=>setWorkspace(w=>w?{...w,panes:w.panes.map(p=>targets.includes(p.id)?{...p,indicators:values.map(i=>({...i,id:crypto.randomUUID()}))}:p)}:w);
  const onData=useCallback((symbol:string,candle:ChartQuote)=>setQuotes(old=>({...old,[symbol]:candle})),[]);
  if(!workspace||!health)return <div className="boot"><div className="brand-mark"><Activity size={28}/></div><h1>GLOBAL MARKET TERMINAL</h1><p>{error||'Starting your local workspace…'}</p>{error&&<button className="secondary-button" onClick={()=>location.reload()}>Retry startup</button>}</div>;
  const selected=workspace.panes.find(p=>p.id===active)||workspace.panes[0];const visible=workspace.panes.slice(0,workspace.layout);const columns=expanded||workspace.layout===1?1:workspace.layout===2||workspace.layout===4?2:workspace.layout===6?3:4;
  const editorVisible=chartsOpen&&!focus&&editor!==null;
  const sidebar=workspace.sidebar.visible;
  const showWatchlist=sidebar&&!editorVisible;
  const openScript=(target:EditorTarget)=>{setIndicatorPane(null);setEditor(target);};
  const saveScript=(script:PineScript)=>setWorkspace(current=>{
    if(!current)return current;
    const scripts=current.pine_scripts??[];
    return {...current,pine_scripts:scripts.some(item=>item.id===script.id)?scripts.map(item=>item.id===script.id?script:item):[...scripts,script],
      panes:current.panes.map(pane=>pane.local_studies?.some(item=>'script_id' in item&&item.script_id===script.id&&item.name!==script.name)?
        {...pane,local_studies:pane.local_studies.map(item=>'script_id' in item&&item.script_id===script.id?{...item,name:script.name}:item)}:pane)};
  });
  const applyScript=(paneId:string,scriptId:string)=>{
    const script=workspace.pine_scripts?.find(item=>item.id===scriptId);
    const pane=workspace.panes.find(item=>item.id===paneId);
    if(!script||!pane)return;
    try{compilePine(script.revisions.at(-1)!.source);}
    catch(error){setError((error as Error).message);return;}
    const instances=pane.local_studies??[];
    if(instances.some(item=>'script_id' in item&&item.script_id===scriptId)){setIndicatorPane(null);return;}
    if(instances.length>=3){setError('Up to three local studies per chart.');return;}
    updatePane(paneId,{local_studies:[...instances,{id:crypto.randomUUID(),name:script.name,script_id:scriptId,visible:true}]});
    setIndicatorPane(null);
  };
  const removeScript=(scriptId:string)=>{
    if(editor?.scriptId===scriptId)setEditor(null);
    setWorkspace(current=>current?{...current,pine_scripts:current.pine_scripts?.filter(item=>item.id!==scriptId),
      panes:current.panes.map(pane=>pane.local_studies?.some(item=>'script_id' in item&&item.script_id===scriptId)?
        {...pane,...localStudyPatch(pane,pane.local_studies.filter(item=>!('script_id' in item)||item.script_id!==scriptId))}:pane)}:current);
  };
  const inspectVisible=chartsOpen&&dataWindow&&!focus&&!orderFlowOpen;
  const flowVisible=chartsOpen&&orderFlowOpen&&!focus;
  const closeOrderFlow=()=>{setOrderFlowOpen(false);orderFlowButton.current?.focus();};
  const toggleWatchlist=()=>setWorkspace({...workspace,sidebar:{...workspace.sidebar,visible:!sidebar}});
  return <div className={`app-shell terminal-shell theme-${workspace.theme} ${focus?'focus-mode':''}`} data-charts={chartsOpen} data-native-fullscreen={nativeState.fullscreen}><div className="titlebar"><span className="titlebar-name">GLOBAL MARKET TERMINAL</span><span className="titlebar-right">{!chartsOpen&&<div className="desktop-workspace-nav"><button className="workspace-switch" aria-label="Screener workspace" aria-pressed={screen} onClick={screen?navigateToCharts:navigateToScreener}>{screen?'Charts':'Screener'}</button><button className="workspace-switch" aria-label="Alerts workspace" aria-pressed={alertsOpen} onClick={alertsOpen?navigateToCharts:navigateToAlerts}>{alertsOpen?'Charts':'Alerts'}</button><button className="workspace-switch" aria-label="Chart Grid workspace" aria-pressed={gridOpen} onClick={navigateToGrid}>Chart Grid</button><span className="titlebar-status">LOCAL · HISTORICAL DATA</span></div>}<div className="responsive-workspace-nav" ref={workspaceMenuRef}><button ref={workspaceButtonRef} className={`workspace-switch workspace-menu-btn ${workspaceMenuOpen?'open':''}`} aria-label="Workspaces menu" aria-haspopup="true" aria-expanded={workspaceMenuOpen} onClick={()=>setWorkspaceMenuOpen(v=>!v)} onKeyDown={handleWorkspaceButtonKeyDown}><span>Workspaces</span><span className="workspace-menu-chevron" aria-hidden="true">▾</span></button>{workspaceMenuOpen&&<div className="workspace-dropdown-menu" role="menu" aria-label="Workspaces" onKeyDown={handleWorkspaceMenuKeyDown}><button role="menuitem" className={`workspace-dropdown-item ${chartsOpen?'active':''}`} aria-label="Charts workspace" aria-current={chartsOpen?'page':undefined} onClick={navigateToCharts}><span className="workspace-item-check" aria-hidden="true">{chartsOpen?'✓':''}</span><span>Charts</span></button><button role="menuitem" className={`workspace-dropdown-item ${gridOpen?'active':''}`} aria-label="Chart Grid workspace" aria-current={gridOpen?'page':undefined} onClick={navigateToGrid}><span className="workspace-item-check" aria-hidden="true">{gridOpen?'✓':''}</span><span>Chart Grid</span></button><button role="menuitem" className={`workspace-dropdown-item ${screen?'active':''}`} aria-label="Screener workspace" aria-current={screen?'page':undefined} onClick={navigateToScreener}><span className="workspace-item-check" aria-hidden="true">{screen?'✓':''}</span><span>Screener</span></button><button role="menuitem" className={`workspace-dropdown-item ${alertsOpen?'active':''}`} aria-label="Alerts workspace" aria-current={alertsOpen?'page':undefined} onClick={navigateToAlerts}><span className="workspace-item-check" aria-hidden="true">{alertsOpen?'✓':''}</span><span>Alerts</span></button></div>}</div></span></div>
    <div className="chart-workspace" data-inactive={!chartsOpen} style={{display:'contents'}}><TerminalHeader focused={focus} expanded={expanded===active} nativeState={nativeState} onNativeFullscreen={nativeFullscreen} onFocus={()=>setFocus(v=>!v)} workspace={workspace} pane={selected} layoutMenu={layoutMenu} onSearch={()=>openChartSearch(active)} onChange={value=>updatePane(active,value)} onIndicators={()=>setIndicatorPane(active)} onLayoutMenu={()=>setLayoutMenu(!layoutMenu)} onLayout={n=>{setWorkspace({...workspace,layout:n});setExpanded(null);setActive('0');setLayoutMenu(false);}} onTheme={()=>setWorkspace({...workspace,theme:workspace.theme==='dark'?'light':'dark'})} onSettings={()=>setSettings(true)} onSave={()=>requestWorkspaceSave(workspace,0)} saved={saved==='Saved locally'} onData={()=>command(active,'data')} onChartSettings={()=>command(active,'settings')} onSync={(key)=>setWorkspace({...workspace,[key]:!workspace[key]})}/>
    <div className={`workspace-shell${flowVisible?' order-flow-open':inspectVisible?' data-window-open':''}`}><DrawingToolbar volumeAvailable={volumes[active]?.key===(selected.canonical_id||selected.instrument_id||selected.symbol)+'/'+selected.timeframe&&!!volumes[active]?.available} tool={tool} onTool={setTool} magnet={toolOptions.magnet} locked={selected.drawings_locked} hidden={selected.drawings_hidden} indicatorsHidden={!!selected.indicators_hidden} preferences={workspace.drawing_tools||{favourites:[],recent:[],last_used:{}}} onPreferences={drawing_tools=>setWorkspace({...workspace,drawing_tools})} onAction={action=>{if(action==='magnet')setToolOptions(o=>({...o,magnet:!o.magnet}));else if(action==='lock')updatePane(active,{drawings_locked:!selected.drawings_locked});else if(action==='hide-indicators')updatePane(active,{indicators_hidden:!selected.indicators_hidden});else if(action==='hide-all'){const hide=!(selected.drawings_hidden&&selected.indicators_hidden);updatePane(active,{drawings_hidden:hide,indicators_hidden:hide});}else if(action==='hide')updatePane(active,{drawings_hidden:!selected.drawings_hidden});else command(active,action);}}/>
    <main className="main-workspace">{health.catalogue_error&&<div className="directory-notice" onClick={()=>setSettings(true)}>{health.catalogue_error}</div>}<div className="chart-grid" data-count={visible.length} style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${!expanded&&visible.length>columns?2:1},minmax(0,1fr))`}}>{visible.map(p=><ChartPane inspect={inspectVisible&&p.id===selected.id} singleChart={workspace.layout===1} refreshPaused={refreshPaused} refreshSeconds={refreshPreferences.value?.chart_interval||300} refreshVisible={chartsOpen} hidden={!!expanded&&expanded!==p.id} onAlert={price=>createAlert({instrument:entry(p),interval:p.timeframe,price})} key={p.id} pane={p} pineScripts={workspace.pine_scripts} onScriptEdit={scriptId=>openScript({paneId:p.id,scriptId})} theme={workspace.theme} onIndicators={()=>setIndicatorPane(p.id)} active={chartsOpen&&!alertSeed&&(!expanded||expanded===p.id)&&p.id===active} expanded={expanded===p.id} onActive={()=>setActive(p.id)} onChange={value=>updatePane(p.id,value)} onSearch={()=>openChartSearch(p.id)} onMigration={choose=>migration(p,choose)} onExpand={()=>{setActive(p.id);setExpanded(expanded===p.id?null:p.id);}} onData={onData} onVolume={onVolume} tool={tool} onTool={setTool} magnet={toolOptions.magnet} syncTime={workspace.sync_time} syncCrosshair={workspace.sync_crosshair}/>)}</div></main>
    {editorVisible&&editor&&<PineEditor key={JSON.stringify(editor)} target={editor} scripts={workspace.pine_scripts??[]} legacy={workspace.local_studies??[]}
      onClose={()=>setEditor(null)} onSave={saveScript} onApply={scriptId=>applyScript(editor.paneId,scriptId)}/>}
    {showWatchlist&&<WatchlistSidebar onClose={toggleWatchlist} onGrid={openGridRows} activeTimeframe={activeTimeframe} onMigration={row=>migration(row,true)} snapshots={watchlistQuotes.snapshot} quoteError={watchlistQuotes.error||refreshPreferences.error} onQuoteRefresh={watchlistQuotes.refresh} refreshPreferences={refreshPreferences.value} onRefreshPreferences={refreshPreferences.change} refreshPaused={refreshPaused} onMutate={mutateWatchlist} onImport={importWatchlist} onAlert={row=>createAlert({instrument:entry(row),interval:selected.timeframe,price:quotes[row.canonical_id||row.instrument_id||row.symbol]?.candle.close})} workspace={workspace} health={health} indices={indices} active={active} quotes={quotes} onChange={next=>setWorkspace(prev=>prev?(typeof next==='function'?(next as any)(prev):{...prev,...next,watchlists:prev.watchlists}):prev)} onOpen={open} onSearch={()=>{if(selectedWatchlist)setSearch({kind:'watchlist',listId:selectedWatchlist.id,name:selectedWatchlist.name});}}/>}
    {inspectVisible&&<ChartDataWindow pane={selected} onClose={()=>setDataWindow(false)}/>}
    {flowVisible&&<OrderFlowPanel key={JSON.stringify([selected.canonical_id||selected.instrument_id,selected.native_mapping])} instrument={selected} onClose={closeOrderFlow}/>}
    {chartsOpen&&<WorkspaceRail watchlistOpen={showWatchlist&&!flowVisible&&!inspectVisible} dataOpen={inspectVisible} orderFlowOpen={flowVisible} orderFlowButton={orderFlowButton}
      onWatchlist={()=>{if(inspectVisible){setDataWindow(false);if(!sidebar)toggleWatchlist();}else if(flowVisible){setOrderFlowOpen(false);if(!sidebar)toggleWatchlist();}else toggleWatchlist();}}
      onAlerts={navigateToAlerts} onGrid={navigateToGrid} onScanner={navigateToScreener} onData={()=>command(active,'data')}
      onInspect={()=>{setOrderFlowOpen(false);setDataWindow(open=>!open);}} onOrderFlow={()=>{setDataWindow(false);setOrderFlowOpen(open=>!open);}}/>}
    </div></div>{visitedScreen&&<ScreenerPage onGrid={openGridRows} onAlert={row=>createAlert({instrument:entry(row),interval:row.timeframe,price:row.close??undefined})} active={screen} watchlists={workspace.watchlists} onBack={()=>setScreen(false)} onChart={row=>{open(entry(row),active);updatePane(active,{timeframe:row.timeframe});setScreen(false);}} onAdd={(row,id)=>{const r:SymbolEntry={symbol:row.symbol,token:row.token,instrument_id:row.instrument_id,kind:row.kind,name:row.name,exchange:row.exchange,canonical_id:row.canonical_id,provider:row.provider,category:row.category,country:row.country,currency:row.currency,timezone:row.timezone,calendar:row.calendar,precision:row.precision,contract:row.contract,market_type:row.market_type,native_id:row.native_id,base_asset:row.base_asset,quote_asset:row.quote_asset,identity_version:row.identity_version,legacy_unresolved:row.legacy_unresolved,native_mapping:row.native_mapping,size_decimals:row.size_decimals,trading_availability:row.trading_availability,verified_at:row.verified_at};void mutateWatchlist({action:'add',id,instrument:r.canonical_id||r.instrument_id||r.symbol}).catch(e=>setError(e.message));}}/>}{visitedAlerts&&<AlertsPage active={alertsOpen} current={{instrument:entry(selected),interval:selected.timeframe}} onBack={()=>setAlertsOpen(false)} onCreate={()=>createAlert({instrument:entry(selected),interval:selected.timeframe})} onEdit={row=>{const instrument=workspace.watchlists.flatMap(w=>w.items).find(r=>r.canonical_id===row.definition.instrument)||workspace.panes.find(r=>r.canonical_id===row.definition.instrument);if(instrument){setEditingAlert(row);setAlertSeed({instrument:entry(instrument),interval:row.definition.interval});}else{void api<Instrument[]>('/api/instruments/search?q='+encodeURIComponent(decodeURIComponent(row.definition.instrument.split(':')[1]||row.definition.instrument))).then(rows=>{const r=rows.find(r=>r.canonical_id===row.definition.instrument);if(r){setEditingAlert(row);setAlertSeed({instrument:entry(r),interval:row.definition.interval});}else setError('Alert identity no longer resolves. Disable/delete it or select a replacement.');}).catch(e=>setError(e.message));}}} onOpen={openAlertChart} revision={alertRevision}/>}{gridOpen&&<GridWorkspace key={gridEpoch} preferences={workspace.chart_grid||DEFAULT_GRID}
      sources={isColoredWatchlist&&selectedWatchlist?[selectedWatchlist,...workspace.watchlists]:workspace.watchlists}
      notice={gridNotice} theme={workspace.theme} fullscreen={nativeState.fullscreen} transitioning={nativeState.transitioning}
      onBack={navigateToCharts} onFullscreen={nativeFullscreen}
      onTheme={()=>setWorkspace(current=>current?{...current,theme:current.theme==='dark'?'light':'dark'}:current)}
      onOpen={openGridCardInChart} onSource={source=>openGridRows(source.items,source.name)} onWatch={watch} onChange={changeGrid}/>}
    {alertSeed&&<AlertDialog seed={alertSeed} editing={editingAlert} onClose={closeAlert} onSaved={()=>setAlertRevision(n=>n+1)}/>}<footer className="statusbar"><span><Wifi size={12}/><span className="positive">DIRECT FETCH</span></span><span className="status-separator"/><span>{selected.kind==='index'?selected.name:symbolLabel(selected.symbol)} · {selected.exchange}</span><span className="status-separator"/><span>{health.provider.entries} histories in RAM</span><span className="grow"/><span><Database size={12}/>{saved}</span><ProviderStatus request={migrationRequest} onApplied={async()=>{await enqueue(async()=>{acceptWorkspace(await api<Workspace>('/workspace'));});}}/><span className="status-time">{health.provider.cooldown_seconds?`Yahoo paused · ${health.provider.cooldown_seconds}s`:`Local backend · ${selected.timezone||'Asia/Kolkata'}`}</span><button className="tradingview-link" onClick={()=>window.terminal.openExternal('https://www.tradingview.com/')}>Charts by TradingView</button></footer>
    {error&&<div className="toast" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}
    {indexDetail&&<IndexDetails key={indexDetail.row.canonical_id} index={indexDetail.row}
      lists={workspace.watchlists} activeList={workspace.active_watchlist}
      onClose={()=>setIndexDetail(current=>current===indexDetail?null:current)}
      onChart={row=>{open(entry(row),indexDetail.paneId);setIndexDetail(null);}}
      onAdd={addSearchResult}/>}
    {search&&<Search key={search.kind} mode={search.kind==='indices'?'indices':undefined} watchlistName={search.kind==='watchlist'?search.name:undefined} onClose={()=>closeSearch(search)}
      onSelect={row=>selectSearchResult(search,row)}
      onIndices={search.kind==='chart'?()=>setSearch({kind:'indices',paneId:search.paneId}):undefined}
      watchlist={(workspace.watchlists.find(list=>list.id===(search.kind==='watchlist'?search.listId:workspace.active_watchlist.startsWith('color:')?'favourites':workspace.active_watchlist))?.items||[]).map(row=>row.canonical_id||row.instrument_id||row.token)}
      onWatch={search.kind==='watchlist'?row=>selectSearchResult(search,row):watch}/>} {indicatorPane!==null&&<IndicatorManager library={workspace.study_library??{favorites:[],recent:[]}} scripts={workspace.pine_scripts??[]} legacy={workspace.local_studies??[]}
      onOpenScript={scriptId=>openScript({paneId:indicatorPane,scriptId})}
      onOpenLegacy={legacyId=>openScript({paneId:indicatorPane,legacyId})}
      onNewScript={()=>openScript({paneId:indicatorPane})}
      onScriptApply={scriptId=>applyScript(indicatorPane,scriptId)} onScriptRemove={removeScript}
      onLibrary={study_library=>setWorkspace(current=>current?{...current,study_library}:current)}
      onStudyApply={(name,recipe)=>{
        const pane=workspace.panes.find(item=>item.id===indicatorPane);
        if(!pane)return;
        if((pane.local_studies?.length??0)>=3){setError('Up to three local studies per chart.');return;}
        updatePane(pane.id,{local_studies:[...(pane.local_studies??[]),{id:crypto.randomUUID(),name,recipe,visible:true}]});
        setIndicatorPane(null);
      }}
      onStudyAlert={(name,rule)=>{
        const pane=workspace.panes.find(item=>item.id===indicatorPane);
        if(!pane)return;
        if(pane.timeframe==='1Y'){setError('Select a shorter completed candle interval for this alert.');return;}
        setIndicatorPane(null);
        createAlert({instrument:entry(pane),interval:pane.timeframe,studyName:name,
          studyRule:{recipe:rule.recipe,output:rule.output,direction:rule.direction,level:rule.level}});
      }} volumeAvailable={!!volumes[indicatorPane]?.available} onDrawing={kind=>{setActive(indicatorPane);setTool(kind);setIndicatorPane(null);}} paneId={indicatorPane} indicators={workspace.panes.find(p=>p.id===indicatorPane)!.indicators} presets={workspace.presets} onChange={indicators=>updatePane(indicatorPane,{indicators})} onPresets={presets=>setWorkspace({...workspace,presets})} onApplyPreset={applyIndicators} onClose={()=>setIndicatorPane(null)}/>} {settings&&<Settings health={health} onClose={()=>setSettings(false)} onRefresh={refreshHealth}/>}</div>;
}
