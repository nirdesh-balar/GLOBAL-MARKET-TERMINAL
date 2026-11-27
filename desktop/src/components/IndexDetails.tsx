import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {Instrument,Pane,Watchlist} from '../types';
import type {QuoteValue} from '../refresh/hooks';
import {api,price} from '../services/api';

interface Constituent {
  name:string;
  symbol:string;
  isin:string;
  weight:number|null;
  instrument:Instrument|null;
  quote:{value:QuoteValue;stale:boolean}|null;
}
interface Membership {
  source_url:string|null;
  snapshot:{source:string;imported_at:string;as_of:string|null;members:Constituent[]}|null;
}
interface Props {
  index:Instrument|Pane;
  lists:Watchlist[];
  activeList:string;
  onChart:(row:Instrument|Pane)=>void;
  onAdd:(id:string,row:Instrument|Pane)=>Promise<void>;
  onClose:()=>void;
}

const indianDate=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'});
const volume=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2});

export function IndexDetails({index,lists,activeList,onChart,onAdd,onClose}:Props){
  const identity=index.canonical_id;
  const [data,setData]=useState<Membership|null>(null);
  const [revision,refresh]=useState(0);
  const [query,setQuery]=useState('');
  const [asOf,setAsOf]=useState('');
  const [target,setTarget]=useState(lists.some(list=>list.id===activeList)?activeList:lists[0]?.id??'');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const focus=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    const previous=document.activeElement;
    focus.current?.focus();
    return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{
    if(!identity)return;
    const id=crypto.randomUUID();
    let current=true;
    api<Membership>('/api/indices/membership?'+new URLSearchParams({index:identity}),'GET',undefined,id)
      .then(value=>{if(current)setData(value);},error=>{if(current)setError(error.message);});
    return()=>{current=false;window.terminal.cancel(id);};
  },[identity,revision]);

  const snapshot=data?.snapshot;
  const term=query.trim().toLocaleLowerCase();
  const members=snapshot?.members.filter(member=>[member.symbol,member.name,member.isin].some(value=>value.toLocaleLowerCase().includes(term)))??[];
  const targetList=lists.find(list=>list.id===target);
  const add=async(row:Instrument|Pane,close=false)=>{
    if(!targetList)return;
    setBusy(true);setError('');setMessage('');
    try {
      await onAdd(targetList.id,row);
      if(close)onClose();
      else setMessage(row.symbol+' added to '+targetList.name+'.');
    }catch(error){setError((error as Error).message);}
    finally{setBusy(false);}
  };
  const importFile=async()=>{
    if(!identity)return;
    setBusy(true);setError('');setMessage('');
    try {
      const imported=await window.terminal.importIndexMembership(identity,asOf||null);
      if(imported){refresh(n=>n+1);setMessage('Imported '+imported.count+' constituents.');}
    }catch(error){setError((error as Error).message);}
    finally{setBusy(false);}
  };

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="index-inspector" role="dialog" aria-modal="true" aria-label="Index details"
      onClick={event=>event.stopPropagation()} onKeyDown={event=>{
        if(event.key==='Escape'){event.stopPropagation();onClose();}
        if(event.key==='Tab'){
          const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'));
          const first=controls[0],last=controls.at(-1);
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      }}>
      <header><div><h2>Index details</h2><h3>{index.name}</h3><p>{index.symbol} · {index.exchange} · {index.currency||'Currency unconfirmed'} · Yahoo Finance chart</p></div>
        <button aria-label="Close index details" onClick={onClose}><X size={17}/></button></header>
      <div className="index-inspector-body">
        <div className="index-inspector-actions">
          <button ref={focus} className="secondary-button" onClick={()=>onChart(index)}>View Chart</button>
          {lists.length>0&&<><label>Watchlist <select aria-label="Destination watchlist" value={target} onChange={event=>setTarget(event.target.value)}>
            {lists.map(list=><option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
            <button className="secondary-button" disabled={busy||!targetList} onClick={()=>void add(index,true)}>Add to Watchlist</button></>}
        </div>
        <div className="index-constituents-heading">
          <h3>Constituents{snapshot?' · '+snapshot.members.length:''}</h3>
          {snapshot&&<input aria-label="Search constituents" placeholder="Find a name, symbol or ISIN" value={query} onChange={event=>setQuery(event.target.value)}/>}
        </div>
        {!data&&!error&&<p role="status">Checking local membership…</p>}
        {!!data&&!snapshot&&<p>Constituent membership and weights are unavailable for this profile.</p>}
        {snapshot&&<p className="index-membership-note">{snapshot.source} · Imported {indianDate.format(new Date(snapshot.imported_at))} · Source as-of {snapshot.as_of||'unavailable'}<br/>
          Weight unavailable in this CSV. Prices are cached Yahoo Finance daily quotes when present.</p>}
        {data?.source_url&&<div className="index-import">
          <button className="text-link" onClick={()=>void window.terminal.openExternal(data.source_url!)}>Official CSV</button>
          <label>Source as-of (optional) <input type="date" aria-label="Membership as-of date" value={asOf} onChange={event=>setAsOf(event.target.value)}/></label>
          <button className="secondary-button" disabled={busy} onClick={()=>void importFile()}>Import official CSV</button>
        </div>}
        {error&&<p className="error" role="alert">{error}</p>}
        {message&&<p role="status">{message}</p>}
        {snapshot&&<div className="index-table-scroll" tabIndex={0} aria-label="Scrollable constituent table">
          <table aria-label={index.name+' constituents'}>
            <thead><tr>{['Name / Symbol','Weight','Last','Change','Change %','Volume','Actions'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{members.map(member=>{
              const row=member.instrument;
              const quote=member.quote?.value;
              const display=(value:number|null|undefined,precision=quote?.precision??2)=>value!=null?price(value,precision):'—';
              return <tr key={member.isin}>
                <th scope="row"><strong>{member.symbol}</strong><span>{member.name}</span>
                  {!row&&<small>Exact NSE identity unavailable</small>}</th>
                <td aria-label={member.weight===null?'Weight unavailable':undefined}>{member.weight===null?'—':price(member.weight,2)+'%'}</td>
                <td>{display(quote?.price)}{quote&&<small>{quote.currency} · {indianDate.format(quote.data_time*1000)}{member.quote?.stale?' · Stale':''}</small>}</td>
                <td>{display(quote?.absolute_change)}</td>
                <td>{quote?.change!=null?display(quote.change,2)+'%':'—'}</td>
                <td>{quote?.volume!=null?volume.format(quote.volume):'—'}</td>
                <td className="index-row-actions">
                  <button aria-label={'View '+member.symbol+' Chart'} disabled={!row} onClick={()=>row&&onChart(row)}>View Chart</button>
                  <button aria-label={'Add '+member.symbol+' to Watchlist'} disabled={!row||!targetList||busy} onClick={()=>{if(row)void add(row);}}>Add to Watchlist</button>
                </td>
              </tr>;
            })}</tbody>
          </table>
          {!members.length&&<p>No matching constituents.</p>}
        </div>}
      </div>
    </section>
  </div>;
}
