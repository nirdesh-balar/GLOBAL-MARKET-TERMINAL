import {useState} from 'react';
import {parseGhost} from './analytics';
export function GhostEditor({value,locked,onApply}:{value:string;locked:boolean;onApply:(value:string)=>void}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('');
 const apply=(text=draft)=>{try{parseGhost(text);onApply(text);setDraft(text);setError('');}catch(e){setError((e as Error).message);}};
 return <section className="ghost-editor"><label>Hypothetical candles (bar, openΔ, highΔ, lowΔ, closeΔ)<textarea aria-label="Hypothetical candles" disabled={locked} value={draft} maxLength={2000} onChange={e=>setDraft(e.target.value)}/></label><small>Offsets relative to the anchor. Edit or delete rows; no real candles are changed.</small><button disabled={locked} onClick={()=>{try{const rows=parseGhost(draft),last=rows.at(-1)!;const next=draft.trim()+`\n${last.bar+1},${last.close},${last.close+1},${last.close-1},${last.close}`;apply(next);}catch(e){setError((e as Error).message);}}}>Add hypothetical candle</button><button disabled={locked} onClick={()=>apply()}>Apply hypothetical candles</button>{error&&<p role="alert">{error}</p>}</section>;
}
