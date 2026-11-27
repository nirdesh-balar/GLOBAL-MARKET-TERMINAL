import {LocalStudyLibrary} from '../studies/LocalStudyLibrary';
import type {LocalStudy,RecipeRule,StudyRecipe} from '../studies/recipes';
import type {PineScript} from '../studies/pineScripts';
import {searchLibrary} from './indicatorLibrary';
import {isVolume} from '../charts/volume';
import {tools as drawingTools,type DrawingKind} from '../drawings/registry';
import {useState,useMemo,useEffect,useRef} from 'react';
import {X,Settings2,Eye,EyeOff,Trash2,ArrowUp,ArrowDown,Plus,Star} from 'lucide-react';
import type {IndicatorConfig,IndicatorPreset,IndicatorKind,Workspace,Pane,StudyLibraryKind} from '../types';
import {defaultIndicator,indicatorLabel} from '../charts/indicators';
import {IndicatorSettingsDialog} from './IndicatorSettingsDialog';
import {VolumeControls} from './VolumeControls';
import {VolumeSettingsDialog} from './VolumeSettingsDialog';
import {defaultVolumeSettings,volumeInstance,type VolumeInstance} from '../charts/volumeIndicator';
const overlayKinds=new Set<IndicatorKind>(['SMA','EMA','WMA','VWMA','BB','SUPERTREND','VWAP','HMA','ICHIMOKU','SAR','ZIGZAG','LINREG','KAMA','LSMA','MCGINLEY','SMMA','TEMA','DEMA','CKS','KC','DC','PIVOT','SWING_PIVOT','CPR','CPR_MTF','ORB','PREV_OHLC','ALPHATREND','HALFTREND','VRVP']);
type Library=NonNullable<Workspace['study_library']>;

export function IndicatorManager({
 library,scripts,legacy,onLibrary,onOpenScript,onOpenLegacy,onNewScript,onScriptApply,onScriptRemove,onStudyApply,onStudyAlert,
 pane,presets,theme,adjacentPanes,onChange,onVolumeChange,onPresets,onApplyPreset,onClose,onDrawing,volumeAvailable
}:{
 library:Library;scripts:PineScript[];legacy:LocalStudy[];onLibrary:(value:Library)=>void;
 onOpenScript:(id:string)=>void;onOpenLegacy:(id:string)=>void;onNewScript:()=>void;onScriptApply:(id:string)=>void;onScriptRemove:(id:string)=>void;
 onStudyApply:(name:string,recipe:StudyRecipe)=>void;onStudyAlert:(name:string,rule:RecipeRule)=>void;
 onDrawing?:(kind:DrawingKind)=>void;volumeAvailable?:boolean;pane:Pane;theme:Workspace['theme'];adjacentPanes:number;presets:IndicatorPreset[];
 onChange:(values:IndicatorConfig[])=>void;
 onVolumeChange:(instance:VolumeInstance|null)=>void;onPresets:(presets:IndicatorPreset[])=>void;
 onApplyPreset:(values:IndicatorConfig[],targets:string[])=>void;onClose:()=>void
}){
 const {id:paneId,indicators}=pane;
 const volume=volumeInstance(pane);
 const [editVolume,setEditVolume]=useState(false);
 const [query,setQuery]=useState(''),[edit,setEdit]=useState<IndicatorConfig|null>(null),[name,setName]=useState(''),
  [preset,setPreset]=useState(''),[targets,setTargets]=useState([paneId]),[message,setMessage]=useState(''),
  [dragged,setDragged]=useState<string|null>(null),[manage,setManage]=useState(false);
 const [view,setView]=useState<'built-in'|'favorites'|'recent'|'scripts'>('built-in');
 const [displayType,setDisplayType]=useState<'all'|'overlays'|'oscillators'>('all');
 const toggleFavorite=(kind:StudyLibraryKind)=>onLibrary({...library,favorites:library.favorites.includes(kind)?
   library.favorites.filter(value=>value!==kind):[...library.favorites,kind]});
 const addIndicator=(kind:StudyLibraryKind)=>{
   onLibrary({...library,recent:[kind,...library.recent.filter(value=>value!==kind)].slice(0,20)});
   if(kind==='VOLUME')onVolumeChange({...defaultVolumeSettings,visible:true});
   else onChange([...indicators,defaultIndicator(kind)]);
 };
 const lastSavedPreset=useRef<IndicatorPreset|null>(null);
 const results=useMemo(()=>{
   const available=searchLibrary(query,'All').filter(item=>displayType==='all'||(item.kind==='VOLUME'||overlayKinds.has(item.kind))===(displayType==='overlays'));
   if(view==='favorites')return available.filter(item=>library.favorites.includes(item.kind));
   if(view==='recent')return library.recent.flatMap(kind=>available.filter(item=>item.kind===kind));
   return available;
 },[query,displayType,view,library]);const dialog=useRef<HTMLElement>(null);
 useEffect(()=>{const old=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLInputElement>('[aria-label="Search indicators"]')?.focus();const key=(e:KeyboardEvent)=>{if(e.key!=='Tab'||document.querySelector('.nested-modal'))return;const nodes=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')].filter(e=>e.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);old?.focus();};},[]);
 const reorder=(from:number,to:number)=>{if(to<0||to>=indicators.length)return;const next=[...indicators];next.splice(to,0,next.splice(from,1)[0]);onChange(next);};
 return <div className="modal-backdrop" onClick={onClose}>
 <section ref={dialog} className="indicator-manager" data-view={view} role="dialog" aria-label="Indicator manager" aria-modal="true" onClick={e=>e.stopPropagation()}>
  <header><h2>Indicators</h2><button aria-label="Close indicators" onClick={onClose}><X size={20}/></button></header>
  <div className="indicator-navigation">
   <input aria-label="Search indicators" placeholder={view==='scripts'?'Search saved scripts':'Search indicators'} value={query} onChange={e=>setQuery(e.target.value)}/>
  </div>
  <div className="indicator-library-layout">
   <nav className="indicator-library-nav" aria-label="Indicator library views">
    <small>Personal</small>
    {([['favorites','Favorites'],['recent','Recently Used'],['scripts','My Scripts']] as const).map(([key,label])=>
     <button key={key} aria-pressed={view===key} onClick={()=>{setView(key);setDisplayType('all');setManage(false);}}>{label}</button>)}
    <small>Built-in</small>
    <button aria-pressed={view==='built-in'} onClick={()=>{setView('built-in');setDisplayType('all');setManage(false);}}>Technicals</button>
   </nav>
   <div className="indicator-library-main">
    <div className="indicator-library-toolbar">
     {view!=='scripts'&&<div className="study-view-tabs study-type-tabs" role="group" aria-label="Indicator types">
      {([['all','All'],['overlays','Overlays'],['oscillators','Oscillators']] as const).map(([key,label])=>
       <button key={key} aria-pressed={displayType===key} onClick={()=>{setDisplayType(key);setManage(false);}}>{label}</button>)}
     </div>}
     <button className="indicator-manage-toggle" aria-expanded={manage} onClick={()=>setManage(open=>!open)}>
      <Settings2 size={14}/> Active indicators <small>{indicators.length}/20{volume?' + Volume':''}</small>
     </button>
    </div>
    {!manage&&(view==='scripts'?<LocalStudyLibrary scripts={scripts} legacy={legacy} query={query} onOpen={onOpenScript}
     onLegacy={onOpenLegacy} onNew={onNewScript} onApply={onScriptApply} onRemove={onScriptRemove} onLegacyApply={onStudyApply} onAlert={onStudyAlert}/>:<>
     <p className="library-results" role="status">{results.length} matching studies</p>
     <div className="indicator-catalog">
      {results.map(c=>{
       const isNativeVolume=c.kind==='VOLUME';
       const unavailable=c.kind!=='VOLUME'&&volumeAvailable===false&&(isVolume(c.kind)||c.kind==='VWAP'||c.kind==='VWMA');
       const added=isNativeVolume&&!!volume;
       const atLimit=!isNativeVolume&&indicators.length>=20;
       return <div className="study-catalog-entry" key={c.kind}>
        <button aria-label={`Add ${c.name}`} title={added?'Volume is already on this chart':unavailable?'Requires valid provider volume on this chart':atLimit?'20 indicators per chart maximum':`Add ${c.name} to chart ${Number(paneId)+1}`}
         disabled={added||atLimit||unavailable} onClick={()=>addIndicator(c.kind)}>
         <span><b>{c.name}</b>{added&&<small>{volume?.visible?'On this chart':'Hidden on this chart'}</small>}{unavailable&&<small>Valid volume unavailable</small>}</span><Plus size={14}/>
        </button>
        <button className="study-favorite" aria-label={`Favorite ${c.name}`} aria-pressed={library.favorites.includes(c.kind)}
         onClick={()=>toggleFavorite(c.kind)}><Star size={14} fill={library.favorites.includes(c.kind)?'currentColor':'none'}/></button>
       </div>;
      })}
      {view==='built-in'&&displayType!=='oscillators'&&onDrawing&&drawingTools.filter(t=>t.enabled&&['anchored_vwap','fixed_volume_profile','anchored_volume_profile'].includes(t.id)&&(t.name.toLowerCase().includes(query.toLowerCase())||t.id.includes(query.toLowerCase().replaceAll(' ','_')))).map(t=>
       <button key={t.id} aria-label={'Draw '+t.name} disabled={!volumeAvailable} title={t.description} onClick={()=>onDrawing(t.id as DrawingKind)}><span><b>{t.name}</b><small>Drawing tool</small></span><Plus size={14}/></button>)}
     </div>
    </>)}
    <section hidden={!manage} className="active-study-management" aria-label="Active indicator controls"><div className="active-indicators">
      {volume&&<div className="indicator-row" data-testid="indicator-volume">
       <span>Volume</span>
       <VolumeControls volume={volume} adjacentPanes={adjacentPanes} onChange={onVolumeChange} onSettings={()=>setEditVolume(true)} manager/>
      </div>}
      {indicators.map((i,n)=><div className="indicator-row" draggable key={i.id} data-testid={`indicator-${i.id}`} onDragStart={()=>setDragged(i.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>{const from=indicators.findIndex(v=>v.id===dragged);if(from>=0)reorder(from,n);setDragged(null);}}><span style={{color:i.color}}>{indicatorLabel(i)}</span><button title="Edit study parameters and line styles" aria-label={`Settings ${i.id}`} onClick={()=>setEdit(i)}><Settings2 size={14}/></button><button title={i.visible?'Hide indicator':'Show indicator'} aria-label={`Visibility ${i.id}`} aria-pressed={i.visible} onClick={()=>onChange(indicators.map(v=>v.id===i.id?{...v,visible:!v.visible}:v))}>{i.visible?<Eye size={14}/>:<EyeOff size={14}/>}</button><button aria-label={`Move up ${i.id}`} onClick={()=>reorder(n,n-1)}><ArrowUp size={12}/></button><button aria-label={`Move down ${i.id}`} onClick={()=>reorder(n,n+1)}><ArrowDown size={12}/></button><button title="Remove indicator" aria-label={`Delete ${i.id}`} onClick={()=>onChange(indicators.filter(v=>v.id!==i.id))}><Trash2 size={14}/></button></div>)}{!indicators.length&&!volume&&<p className="empty">Add an indicator from the library.</p>}</div><button className="text-link" onClick={()=>onChange([defaultIndicator('EMA')])}>Reset to defaults</button><div className="preset-controls"><h3>Indicator presets</h3><div><input aria-label="Preset name" placeholder="Preset name" maxLength={64} value={name} onChange={e=>setName(e.target.value)}/><button className="secondary-button" onClick={()=>{if(!name.trim()){setMessage('Enter a preset name.');return;}if(presets.length>=30){setMessage('Up to 30 presets are supported.');return;}const value={id:crypto.randomUUID(),name:name.trim(),indicators:structuredClone(indicators)};lastSavedPreset.current=value;onPresets([...presets,value]);setPreset(value.id);setName('');setMessage('Preset saved locally.');}}>Save preset</button></div><select aria-label="Load indicator preset" value={preset} onChange={e=>setPreset(e.target.value)}><option value="">Select a preset</option>{presets.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><p>Apply to selected chart panes:</p><div className="preset-targets">{Array.from({length:8},(_,n)=>String(n)).map(id=><label key={id}><input aria-label={`Preset target ${id}`} type="checkbox" checked={targets.includes(id)} onChange={()=>setTargets(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id])}/>{Number(id)+1}</label>)}</div><button className="secondary-button" disabled={!preset||!targets.length} onClick={()=>{const p=presets.find(p=>p.id===preset)||(lastSavedPreset.current?.id===preset?lastSavedPreset.current:undefined);if(p){onApplyPreset(p.indicators,targets);setMessage('Preset applied to selected panes.');}}}>Load preset</button><button className="text-link" disabled={!preset} onClick={()=>{if(lastSavedPreset.current?.id===preset)lastSavedPreset.current=null;onPresets(presets.filter(p=>p.id!==preset));setPreset('');}}>Delete preset</button>{message&&<p role="status">{message}</p>}</div></section></div></div></section>{editVolume&&volume&&<VolumeSettingsDialog value={volume} theme={theme} adjacentPanes={adjacentPanes} onSave={settings=>onVolumeChange({...settings,visible:volume.visible})} onClose={()=>setEditVolume(false)}/>}
 {edit&&<IndicatorSettingsDialog value={edit} onClose={()=>setEdit(null)} onSave={value=>onChange(indicators.map(i=>i.id===value.id?value:i))}/>}</div>;
}
