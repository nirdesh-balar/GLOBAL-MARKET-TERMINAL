import { useEffect, useRef, useState } from 'react';
import { Search as SearchIcon, X, ArrowUpRight, Star } from 'lucide-react';
import { api, symbolLabel } from '../services/api';
import type { Instrument } from '../types';
export function Search({ onSelect, onClose, watchlist, onWatch }: {onSelect:(row: Instrument)=>void; onClose:()=>void; watchlist:string[]; onWatch:(row: Instrument)=>void}) {
  const [query,setQuery] = useState(''); const [results,setResults] = useState<Instrument[]>([]); const [error,setError] = useState('');
  const [category,setCategory]=useState(''),[country,setCountry]=useState(''),[exchange,setExchange]=useState(''),[loading,setLoading]=useState(false);
  const [next,setNext]=useState<number|null>(null);
  const [selected,setSelected] = useState(0); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    let cancelled=false;const id=crypto.randomUUID();setLoading(true);
    const timer=setTimeout(()=>{
      const params=new URLSearchParams({q:query,category,country,exchange});
      api<{results:Instrument[];warning:string;next_offset?:number|null}>(`/api/instruments/discover?${params}`,'GET',undefined,id).then(value=>{if(!cancelled){setResults(value.results);setNext(value.next_offset??null);setSelected(0);setError(value.warning);setLoading(false);}}).catch(e=>{if(!cancelled){setError(e.message);setLoading(false);}});
    },300);
    return()=>{cancelled=true;clearTimeout(timer);window.terminal.cancel(id);};
  },[query,category,country,exchange]);
  return <div className="modal-backdrop" onClick={onClose}><section className="search-modal" role="dialog" aria-modal="true" aria-label="Search stocks and indices" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='ArrowDown'){e.preventDefault();setSelected(i=>Math.min(i+1,results.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setSelected(i=>Math.max(i-1,0));}if(e.key==='Enter'&&results[selected])onSelect(results[selected]);}}>
    <div className="search-input"><SearchIcon size={20}/><input ref={input} placeholder="Search symbol, company, index or ISIN" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="Close search" onClick={onClose}><X size={18}/></button></div>
    <div className="search-caption"><span>ALL MARKETS · {loading?'Searching…':category.startsWith('crypto')?'Hyperliquid · verified spot / perpetual catalogue':'Yahoo non-crypto + official NSE directory'}</span></div>
    <div className="global-search-filters"><select aria-label="Search market" value={category} onChange={e=>setCategory(e.target.value)}>{[['','All markets'],['stocks','Indian Stocks'],['us','US Stocks'],['global','Global Stocks'],['indices','Indian Indices'],['global_indices','Global Indices'],['crypto','All Crypto'],['crypto_spot','Crypto Spot'],['crypto_perpetual','Crypto Perpetual'],['forex','Forex'],['commodities','Commodities'],['funds','ETFs & Funds']].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><input aria-label="Search country" placeholder="Country filter" value={country} onChange={e=>setCountry(e.target.value)}/><input aria-label="Search exchange" placeholder="Exchange filter" value={exchange} onChange={e=>setExchange(e.target.value)}/></div>
    <div className="search-results">{error&&<p className="error">{error}</p>}{!error&&!results.length&&<p className="empty">No matching instruments.</p>}{results.map((row,i)=><div className={`search-result ${i===selected?'highlighted':''}`} key={row.canonical_id||row.id}><button data-testid={`search-result-${row.provider==='hyperliquid'?row.canonical_id:row.yahoo_symbol}`} className="result-main" onClick={()=>onSelect(row)}><span className="symbol-avatar">{symbolLabel(row.symbol).slice(0,2)}</span><span><strong>{row.kind==='index'?row.name:row.symbol}</strong><small>{`${row.name} · ${row.native_id||row.yahoo_symbol} · ${row.provider} · ${row.market_type||row.kind}${row.contract?' · '+row.contract:''} · ${row.category} · ${row.currency||'currency unconfirmed'} · ${row.country} · ${row.status==='listed'?'NSE listed; Yahoo history unverified':row.status}${row.isin?' · '+row.isin:''}`}</small></span><span className="exchange">{row.exchange} <ArrowUpRight size={13}/></span></button><button aria-label={`Favourite ${row.symbol}`} className={watchlist.includes(row.token)?'gold':''} onClick={()=>onWatch(row)}><Star size={16} fill={watchlist.includes(row.token)?'currentColor':'none'}/></button></div>)}{next!==null&&<button aria-label="Load more instruments" disabled={loading} onClick={()=>{setLoading(true);const params=new URLSearchParams({q:query,category,country,exchange,offset:String(next)});void api<{results:Instrument[];next_offset:number|null}>(`/api/instruments/discover?${params}`).then(v=>{setResults(r=>[...r,...v.results]);setNext(v.next_offset);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Load more verified markets</button>}</div>
    <footer><span>↑ ↓ to navigate</span><span>↵ select symbol</span><kbd>esc</kbd></footer>
  </section></div>;
}
