import {X} from 'lucide-react';
import type {Instrument} from '../types';

export function IndexDetails({index,onChart,onAdd,onClose}:{index:Instrument;onChart:()=>void;onAdd?:()=>void;onClose:()=>void}){
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="index-inspector" role="dialog" aria-modal="true" aria-label="Index details"
      onClick={event=>event.stopPropagation()} onKeyDown={event=>{
        if(event.key==='Escape'){event.stopPropagation();onClose();}
        if(event.key==='Tab'){
          const controls=Array.from(event.currentTarget.querySelectorAll('button'));
          const first=controls[0],last=controls.at(-1);
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      }}>
      <header><h2>Index details</h2><button aria-label="Close index details" onClick={onClose}><X size={17}/></button></header>
      <div className="index-inspector-body">
        <h3>{index.name}</h3>
        <p>{index.yahoo_symbol} · {index.exchange} · Yahoo Finance</p>
        <dl><div><dt>History status</dt><dd>{index.status}</dd></div>
          <div><dt>Currency</dt><dd>{index.currency||'Unconfirmed'}</dd></div>
          <div><dt>Market timezone</dt><dd>{index.timezone||'Unconfirmed'}</dd></div>
        </dl>
        <p>Constituent membership and weights are unavailable from the configured data source.</p>
        <div className="index-inspector-actions"><button className="secondary-button" autoFocus onClick={onChart}>View Chart</button>
          {onAdd&&<button className="secondary-button" onClick={onAdd}>Add to Watchlist</button>}</div>
      </div>
    </section>
  </div>;
}
