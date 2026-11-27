import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search as SearchIcon, X, ArrowUpRight, Star, Plus } from 'lucide-react';
import { api, symbolLabel } from '../services/api';
import type { Instrument } from '../types';
import { useFlags } from '../flags/useFlags';
import { FlagIcon } from './FlagIcon';
import { ColorFlagPicker } from './ColorFlagPicker';
const indexCategories=[['indices','India'],['global_indices','Global']];
const symbolCategories=[
  ['','All'],['stocks','India equities'],['us','US equities'],['indices','Indices'],['crypto','Crypto'],['forex','FX'],
  ['global','Global equities'],['global_indices','Global indices'],['crypto_spot','Crypto Spot'],
  ['crypto_perpetual','Crypto Perpetual'],['commodities','Commodities'],['funds','ETFs & Funds'],
];
export function Search({ onSelect, onClose, watchlist, onWatch, watchlistName, mode }: {mode?:"indices";watchlistName?:string;onSelect:(row: Instrument)=>void; onClose:()=>void; watchlist:string[]; onWatch:(row: Instrument)=>void}) {
  const returnFocus=useRef(document.activeElement);
  const [query,setQuery] = useState(''); const [results,setResults] = useState<Instrument[]>([]); const [error,setError] = useState('');
  const [category,setCategory]=useState(mode==='indices'?'indices':''),[loading,setLoading]=useState(false);
  const [next,setNext]=useState<number|null>(null);
  const [selected,setSelected] = useState(0); const input = useRef<HTMLInputElement>(null);
  const filterKey=JSON.stringify([query,category]);
  const currentFilter=useRef(filterKey);
  currentFilter.current=filterKey;
  const { flags, assignFlag, removeFlag } = useFlags();
  const [picker, setPicker] = useState<{ row: Instrument; x: number; y: number } | null>(null);
  useEffect(() => { input.current?.focus(); return()=>{const previous=returnFocus.current;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();}; }, []);
  useEffect(() => {
    let cancelled=false;const id=crypto.randomUUID();setLoading(true);
    const timer=setTimeout(()=>{
      const params=new URLSearchParams({q:query,category});
      api<{results:Instrument[];warning:string;next_offset?:number|null}>(`/api/instruments/discover?${params}`,'GET',undefined,id).then(value=>{if(!cancelled){setResults(value.results);setNext(value.next_offset??null);setSelected(0);setError(value.warning);setLoading(false);}}).catch(e=>{if(!cancelled){setError(e.message);setLoading(false);}});
    },300);
    return()=>{cancelled=true;clearTimeout(timer);window.terminal.cancel(id);};
  },[query,category]);
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (picker) setPicker(null);
      else onClose();
      return;
    }
    if(event.key==='Tab'){
      const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('input,select,button:not(:disabled)')].filter(node=>node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if (event.target === input.current && event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected(i=>Math.max(0,Math.min(i+1,results.length-1)));
    }
    if (event.target === input.current && event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(i=>Math.max(i-1,0));
    }
    if (event.key === 'Enter' && event.target === input.current && results[selected]) {
      event.preventDefault();
      selectResult(results[selected]);
    }
  }
  useEffect(()=>{if(input.current?.matches(':focus'))document.getElementById('instrument-search-result-'+selected)?.scrollIntoView({block:'nearest'});},[selected]);
  const title=watchlistName?'Add to '+watchlistName:mode==='indices'?'Search indices':'Search Symbol';
  const selectResult=(row:Instrument)=>{if(!loading)onSelect(row);};
  return <div className="modal-backdrop" onClick={onClose}><section className={`search-modal${watchlistName?' watchlist-symbol-search':''}`} role="dialog" aria-modal="true" aria-label={watchlistName?'Add symbol to '+watchlistName:mode?title:'Search stocks and indices'} onClick={e=>e.stopPropagation()} onKeyDown={handleKeyDown}>
    <h2 className="symbol-dialog-title">{title}</h2>
    <div className="search-input"><SearchIcon size={20}/><input ref={input} placeholder="Search symbol, company, index or ISIN" value={query} onChange={e=>{setLoading(true);setQuery(e.target.value);}}/><button aria-label="Close search" onClick={onClose}><X size={18}/></button></div>
    <div className="symbol-category-tabs" role="group" aria-label="Market categories">
      {(mode==='indices'?indexCategories:symbolCategories).map(([id,name])=><button
        type="button" key={id} data-market-category={id} aria-pressed={category===id} onClick={()=>{
          if(category!==id){setLoading(true);setCategory(id);}
        }}>{name}</button>)}
    </div>
    <div className="search-results">{error&&<p className="error">{error}</p>}{loading&&!results.length&&<p className="empty" role="status">Searching…</p>}{!loading&&!error&&!results.length&&<p className="empty">No matching instruments.</p>}{results.map((row,i)=>{const cid=row.canonical_id||row.id;const flagColor=flags[cid]?.color;return <div className={`search-result ${i===selected?'highlighted':''}`} key={cid}><button data-testid={`search-result-${row.provider==='hyperliquid'?row.canonical_id:row.yahoo_symbol}`} className="result-main" id={'instrument-search-result-'+i} disabled={loading} onClick={()=>selectResult(row)}><span className="symbol-avatar">{symbolLabel(row.symbol).slice(0,2)}</span><span><strong>{row.kind==='index'?row.name:row.symbol}</strong><small>{`${row.name} · ${row.native_id||row.yahoo_symbol} · ${row.provider} · ${row.market_type||row.kind}${row.contract?' · '+row.contract:''} · ${row.category} · ${row.currency||'currency unconfirmed'} · ${row.country} · ${row.status==='listed'?'NSE listed; Yahoo history unverified':row.status}${row.isin?' · '+row.isin:''}`}</small></span><span className="exchange">{row.exchange} <ArrowUpRight size={13}/></span></button>{!mode&&<><button data-testid={`flag-button-${row.symbol}`} aria-label={flagColor?`${flagColor.toUpperCase()} flag for ${row.symbol}`:`Add color flag for ${row.symbol}`} className={`symbol-flag-btn ${flagColor?'flagged':'unflagged'}`} title={flagColor?`${flagColor.toUpperCase()} flag (Click to change)`:'Add color flag'} onClick={e=>{e.stopPropagation();e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();setPicker({row,x:rect.left,y:rect.bottom+4});}}><FlagIcon color={flagColor} filled={Boolean(flagColor)} size={14}/></button><button aria-label={watchlistName?`Add ${row.symbol} to watchlist`:`Favourite ${row.symbol}`} className={watchlist.includes(row.token)?'gold':''} onClick={()=>onWatch(row)}>{watchlistName?<Plus size={15}/>:<Star size={16} fill={watchlist.includes(row.token)?'currentColor':'none'}/>}</button></>}</div>;})}{next!==null&&<button aria-label="Load more instruments" disabled={loading} onClick={()=>{
      setLoading(true);
      const params=new URLSearchParams({q:query,category,offset:String(next)});
      void api<{results:Instrument[];next_offset:number|null}>(`/api/instruments/discover?${params}`).then(v=>{
        if(currentFilter.current!==filterKey)return;
        setResults(r=>[...r,...v.results]);setNext(v.next_offset);
      }).catch(e=>{if(currentFilter.current===filterKey)setError(e.message);})
        .finally(()=>{if(currentFilter.current===filterKey)setLoading(false);});
    }}>Load more verified markets</button>}</div>
    <footer><span>↑ ↓ to navigate</span><span>{watchlistName?'↵ add symbol':'↵ select symbol'}</span><kbd>esc</kbd></footer>
    {picker&&<ColorFlagPicker symbolName={picker.row.symbol} currentColor={flags[picker.row.canonical_id||picker.row.id]?.color} position={{x:picker.x,y:picker.y}} onSelectColor={col=>void assignFlag(picker.row,col)} onRemoveFlag={()=>void removeFlag(picker.row.canonical_id||picker.row.id)} onClose={()=>setPicker(null)}/>}
  </section></div>;
}
