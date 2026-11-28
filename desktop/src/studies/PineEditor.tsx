import {useEffect,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {compilePine,maxSourceLength,PineDiagnostic} from './pine';
import {legacySource,starterSource,type PineScript} from './pineScripts';
import type {LocalStudy} from './recipes';

const syntax=/\/\/[^\n]*|"[^"\n]*"|'[^'\n]*'|#[\da-fA-F]{6,8}\b|\b(?:overlay|true|false|float|int|bool|na|and|or|not)\b|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_]\w*(?:\.\w+)*(?=\s*\()/g;

function highlight(source:string){
  const parts:React.ReactNode[]=[];
  let from=0;
  for(const match of source.matchAll(syntax)){
    const at=match.index,text=match[0];
    const type=text.startsWith('//')?'comment':/^["']/.test(text)?'string':/^[#\d]/.test(text)?'number':'keyword';
    parts.push(source.slice(from,at),<span className={'pine-'+type} key={at}>{text}</span>);
    from=at+text.length;
  }
  return [...parts,source.slice(from),'\n'];
}

export type EditorTarget={paneId:string;scriptId?:string;legacyId?:string};
export function PineEditor({target,scripts,legacy,onClose,onSave,onApply}:{
  target:EditorTarget;scripts:PineScript[];legacy:LocalStudy[];onClose:()=>void;
  onSave:(script:PineScript)=>void;onApply:(id:string)=>void;
}){
  const initial=scripts.find(script=>script.id===target.scriptId);
  const initialLegacy=legacy.find(script=>script.id===target.legacyId);
  const [id,setId]=useState(initial?.id??'');
  const [legacyId,setLegacyId]=useState(initialLegacy?.id??'');
  const [revision,setRevision]=useState(initial?.revisions.at(-1)?.number??initialLegacy?.revisions.at(-1)?.number??0);
  const [name,setName]=useState(initial?.name??initialLegacy?.name??'My EMA');
  const [source,setSource]=useState(initial?.revisions.at(-1)?.source??(initialLegacy?legacySource(initialLegacy):starterSource));
  const [notice,setNotice]=useState('');
  const [diagnostic,setDiagnostic]=useState<PineDiagnostic|null>(null);
  const [confirm,setConfirm]=useState<(()=>void)|null>(null);
  const [copy,setCopy]=useState<string|null>(null);
  const gutter=useRef<HTMLDivElement>(null);
  const syntaxLayer=useRef<HTMLPreElement>(null);
  const textarea=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{textarea.current?.focus();},[]);
  const script=scripts.find(item=>item.id===id);
  const legacyScript=legacy.find(item=>item.id===legacyId);
  const baseline=script?.revisions.find(item=>item.number===revision);
  const earlier=legacyScript?.revisions.find(item=>item.number===revision);
  const dirty=script?source!==baseline?.source||name!==script.name:source!==(legacyScript&&earlier?legacySource(legacyScript,earlier):starterSource)||name!==(legacyScript?.name??'My EMA');
  const currentSaved=script?.revisions.at(-1)?.source===source;
  const lines=useMemo(()=>source.split('\n'),[source]);
  const highlighted=useMemo(()=>highlight(source),[source]);
  const request=(action:()=>void)=>{if(dirty)setConfirm(()=>action);else action();};
  function load(next?:PineScript){
    const latest=next?.revisions.at(-1);
    setId(next?.id??'');setLegacyId('');setRevision(latest?.number??0);
    setName(next?.name??'My EMA');setSource(latest?.source??starterSource);
    setNotice('');setDiagnostic(null);
  }
  function verify(){
    try{
      const result=compilePine(source);
      setNotice(`Verified · Pine v${result.version} · ${result.plots.length} plots/levels · ${result.fills.length} fills`);
      setDiagnostic(null);
      return result;
    }catch(error){
      const detail=error instanceof PineDiagnostic?error:new PineDiagnostic(1,1,'The script could not be compiled.');
      setDiagnostic(detail);setNotice('');
    }
  }
  function save(asNew=false, chosenName=name){
    const result=verify();
    if(!result)return;
    const filename=chosenName.trim()||result.title;
    const existing=asNew?undefined:script;
    if(!existing&&scripts.length>=20){setNotice('This workspace already has 20 source scripts.');return;}
    const last=existing?.revisions.at(-1);
    const next=last?.source===source?last:{number:(last?.number??0)+1,source,version:result.version,title:result.title,overlay:result.overlay,plot_count:result.plots.length};
    const updated:PineScript={id:existing?.id??crypto.randomUUID(),name:filename,language:'pine-subset',category:'indicator',
      revisions:next===last?existing!.revisions:[...(existing?.revisions??[]).slice(-4),next]};
    onSave(updated);
    setId(updated.id);setLegacyId('');setName(filename);setRevision(next.number);
    setCopy(null);setNotice(`Saved revision ${next.number}`);
  }
  function locateError(){
    if(!diagnostic||!textarea.current)return;
    const start=lines.slice(0,diagnostic.line-1).reduce((sum,line)=>sum+line.length+1,0)+diagnostic.column-1;
    textarea.current.focus();textarea.current.setSelectionRange(start,start+1);
    const top=(diagnostic.line-1)*19;
    if(top<textarea.current.scrollTop||top>textarea.current.scrollTop+textarea.current.clientHeight-19)textarea.current.scrollTop=top;
  }
  return <aside className="pine-editor" aria-label="Pine-compatible Editor">
    <header><h2>Pine-compatible Editor</h2><span>Chart {Number(target.paneId)+1}</span>
      <button aria-label="Close editor" onClick={()=>request(onClose)}><X size={17}/></button></header>
    <div className="pine-editor-files">
      <select aria-label="Open existing script" value={id} onChange={e=>{const next=scripts.find(item=>item.id===e.target.value);request(()=>load(next));}}>
        <option value="">{legacyScript?'Legacy source draft':'New script'}</option>
        {scripts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <button className="secondary-button" onClick={()=>request(()=>load())}>New Script</button>
      <input aria-label="Script filename" placeholder="Script name" maxLength={64} value={name} onChange={e=>setName(e.target.value)}/>
      {(script||legacyScript)&&<select aria-label="Script revision" value={revision} onChange={e=>{
        const number=Number(e.target.value);
        const next=script?.revisions.find(item=>item.number===number);
        const old=legacyScript?.revisions.find(item=>item.number===number);
        request(()=>{setRevision(number);if(next)setSource(next.source);else if(old&&legacyScript)setSource(legacySource(legacyScript,old));setNotice('');setDiagnostic(null);});
      }}>{(script?.revisions??legacyScript?.revisions??[]).map(item=><option key={item.number} value={item.number}>Revision {item.number}</option>)}</select>}
    </div>
    {legacyScript&&<p className="pine-note">Legacy revision retained. Saving this draft creates a separate source script with Pine calculation semantics.</p>}
    <div className="pine-source">
      <div className="pine-gutter" ref={gutter} aria-hidden="true">{lines.map((_,i)=><span key={i} data-error={i+1===diagnostic?.line}>{i+1}</span>)}</div>
      <div className="pine-code">
        <pre ref={syntaxLayer} aria-hidden="true">{highlighted}</pre>
        <textarea ref={textarea} aria-label="Pine source code" spellCheck={false} autoCapitalize="off" autoComplete="off"
          maxLength={maxSourceLength} wrap="off" value={source} onChange={e=>{setSource(e.target.value);setDiagnostic(null);setNotice('');}}
          onScroll={e=>{if(syntaxLayer.current){syntaxLayer.current.scrollTop=e.currentTarget.scrollTop;syntaxLayer.current.scrollLeft=e.currentTarget.scrollLeft;}
            if(gutter.current)gutter.current.scrollTop=e.currentTarget.scrollTop;}}
          onKeyDown={e=>{
            if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){
              e.preventDefault();save();
            }
            if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){
              e.preventDefault();verify();
            }
            if((e.metaKey||e.ctrlKey)&&e.key===']'){
              e.preventDefault();
              // Use the native text edit operation to keep the caret and undo history.
              document.execCommand('insertText',false,'  ');
            }
            if(e.key==='Escape'){e.stopPropagation();e.currentTarget.blur();}
          }}/>
      </div>
    </div>
    <div className="pine-actions">
      <button className="secondary-button" onClick={verify}>Verify</button>
      <button className="secondary-button" onClick={()=>save()}>Save</button>
      <button className="secondary-button" onClick={()=>setCopy((name.trim()||'Script').slice(0,59)+' copy')}>Save As</button>
      <button className="secondary-button" disabled={!id||!currentSaved} onClick={()=>{if(verify())onApply(id);}}>Add to Chart</button>
    </div>
    {copy!==null&&<div className="pine-confirm" aria-label="Save script copy"><input aria-label="Copy filename" maxLength={64} value={copy} onChange={e=>setCopy(e.target.value)}/>
      <button onClick={()=>save(true,copy)}>Save copy</button><button onClick={()=>setCopy(null)}>Cancel</button></div>}
    {confirm&&<div className="pine-confirm" role="alert">
      Unsaved edits for this script. <button onClick={()=>{setConfirm(null);confirm();}}>Discard edits</button><button onClick={()=>setConfirm(null)}>Keep editing</button>
    </div>}
    {diagnostic?<button className="pine-diagnostic error" role="alert" onClick={locateError}>{diagnostic.message}</button>:<p className="pine-status" role="status">{notice||'Indicator subset · v4 / v5 / v6'}</p>}
  </aside>;
}
