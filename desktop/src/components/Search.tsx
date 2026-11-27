import {useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {Search as SearchIcon, X, Star, Plus} from 'lucide-react';
import {api, symbolLabel} from '../services/api';
import {providerLabel} from '../providers/label';
import type {Instrument} from '../types';
const indexCategories = [['indices','India'], ['global_indices','Global']];
const symbolCategories = [
  ['','All'], ['commodities','Commodities'], ['forex','Forex & CFD'], ['crypto','Crypto'],
  ['indices_funds','Indices & ETFs'], ['all_equities','Stocks'], ['india','India'],
  ['indices','IN Indices'], ['stocks','IN Stocks'],
];

function resultLabel(row:Instrument) {
  switch(row.kind) {
    case 'index': case 'etf': case 'fund': return 'Indices & ETFs';
    case 'crypto': return row.market_type==='perpetual'?'Crypto · Perpetual':'Crypto · Spot';
    case 'forex': return 'Forex';
    case 'future': return 'Commodities';
    default: return 'Stocks';
  }
}

export function Search({onSelect,onClose,watchlist,onWatch,watchlistName,mode,onIndices}:{
  mode?:'indices';watchlistName?:string;onSelect:(row:Instrument)=>void;onClose:()=>void;
  watchlist:string[];onWatch:(row:Instrument)=>void;onIndices?:()=>void;
}) {
  const returnFocus=useRef(document.activeElement);
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<Instrument[]>([]);
  const [error,setError]=useState('');
  const [category,setCategory]=useState(mode==='indices'?'indices':'');
  const [loading,setLoading]=useState(false);
  const [next,setNext]=useState<number|null>(null);
  const [selected,setSelected]=useState(0);
  const input=useRef<HTMLInputElement>(null);
  const filterKey=JSON.stringify([query,category]);
  const currentFilter=useRef(filterKey);
  currentFilter.current=filterKey;
  useEffect(()=>{
    input.current?.focus();
    return()=>{const previous=returnFocus.current;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{
    let cancelled=false;
    const id=crypto.randomUUID();
    setLoading(true);
    const timer=setTimeout(()=>{
      const params=new URLSearchParams({q:query,category});
      api<{results:Instrument[];warning:string;next_offset?:number|null}>(`/api/instruments/discover?${params}`,'GET',undefined,id)
        .then(value=>{
          if(cancelled)return;
          setResults(value.results);setNext(value.next_offset??null);setSelected(0);setError(value.warning);setLoading(false);
        }).catch(cause=>{
          if(cancelled)return;
          setResults([]);setNext(null);setError(cause.message);setLoading(false);
        });
    },300);
    return()=>{cancelled=true;clearTimeout(timer);window.terminal.cancel(id);};
  },[query,category]);
  const selectResult=(row:Instrument)=>{if(!loading)onSelect(row);};
  function handleKeyDown(event:KeyboardEvent<HTMLElement>){
    if(event.key==='Escape'){event.stopPropagation();onClose();return;}
    if(event.key==='Tab'){
      const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('input,button:not(:disabled)')].filter(node=>node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if(event.target!==input.current)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      setSelected(i=>Math.max(0,Math.min(i+(event.key==='ArrowDown'?1:-1),results.length-1)));
    }
    if(event.key==='Enter'&&results[selected]){event.preventDefault();selectResult(results[selected]);}
  }
  useEffect(()=>{
    if(input.current?.matches(':focus'))document.getElementById('instrument-search-result-'+selected)?.scrollIntoView({block:'nearest'});
  },[selected]);
  const title=watchlistName?'Add to '+watchlistName:mode==='indices'?'Search indices':'Symbol Search';
  return <div className="modal-backdrop" onClick={onClose}>
    <section className={`search-modal${watchlistName?' watchlist-symbol-search':''}`} role="dialog" aria-modal="true"
      aria-label={watchlistName?'Add symbol to '+watchlistName:mode?title:'Search stocks and indices'} onClick={e=>e.stopPropagation()} onKeyDown={handleKeyDown}>
      <header className="symbol-dialog-header"><h2 className="symbol-dialog-title">{title}</h2>
        <button aria-label="Close search" onClick={onClose}><X size={18}/></button>
      </header>
      <div className="search-input"><SearchIcon size={17}/><input ref={input} aria-label="Search instruments" placeholder="Search symbol, company, index or ISIN"
        value={query} onChange={e=>{setLoading(true);setQuery(e.target.value);}}/></div>
      <div className="symbol-category-tabs" role="group" aria-label="Market categories">
        {(mode==='indices'?indexCategories:symbolCategories).map(([id,name])=><button type="button" key={id} data-market-category={id} aria-pressed={category===id}
          onClick={()=>{if(category!==id){setLoading(true);setCategory(id);}}}>{name}</button>)}
      </div>
      <div className="search-results" aria-busy={loading}>
        {error&&<p className="error">{error}</p>}
        {loading&&!results.length&&<p className="empty" role="status">Searching…</p>}
        {!loading&&!error&&!results.length&&<p className="empty">No matching instruments.</p>}
        {results.map((row,i)=>{
          const id=row.canonical_id||row.id;
          const favorite=watchlist.includes(id);
          const label=resultLabel(row);
          const description=row.company_name||row.name;
          const ticker=row.kind==='index'?row.name:row.symbol;
          return <div className={`search-result ${i===selected?'highlighted':''}`} key={id}>
            <button data-testid={`search-result-${row.provider==='hyperliquid'?row.canonical_id:row.yahoo_symbol}`} className="result-main"
              id={'instrument-search-result-'+i} disabled={loading}
              title={[ticker,row.exchange,providerLabel(row),row.currency,row.status,row.isin].filter(Boolean).join(' · ')}
              onClick={()=>selectResult(row)}>
              <span className="symbol-avatar" aria-hidden="true" data-kind={row.kind}>{symbolLabel(ticker).replace(/^\^/,'').slice(0,2)}</span>
              <span className="result-description"><strong>{ticker}</strong><small>{description} · {label}</small></span>
            </button>
            {!mode&&<button aria-label={watchlistName?`Add ${row.symbol} to watchlist`:`Favourite ${row.symbol}`}
              title={watchlistName?'Add to watchlist':'Toggle favourite'} aria-pressed={watchlistName?undefined:favorite} className={favorite?'gold':''} onClick={()=>onWatch(row)}>
              {watchlistName?<Plus size={15}/>:<Star size={16} fill={favorite?'currentColor':'none'}/>}
            </button>}
          </div>;
        })}
        {next!==null&&<button aria-label="Load more instruments" disabled={loading} onClick={()=>{
          setLoading(true);
          const params=new URLSearchParams({q:query,category,offset:String(next)});
          void api<{results:Instrument[];next_offset:number|null}>(`/api/instruments/discover?${params}`).then(v=>{
            if(currentFilter.current!==filterKey)return;
            setResults(r=>[...r,...v.results]);setNext(v.next_offset);
          }).catch(e=>{if(currentFilter.current===filterKey)setError(e.message);})
            .finally(()=>{if(currentFilter.current===filterKey)setLoading(false);});
        }}>Load more instruments</button>}
      </div>
      <footer><span>↑ ↓ Navigate</span><span>{watchlistName?'↵ Add symbol':'↵ Select'}</span>
        {onIndices&&<button className="text-link" onClick={onIndices}>Search indices</button>}<kbd>esc</kbd></footer>
    </section>
  </div>;
}
