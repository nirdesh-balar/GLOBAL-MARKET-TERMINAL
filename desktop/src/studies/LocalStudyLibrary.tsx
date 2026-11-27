import {Code2,Plus,Trash2,Play} from 'lucide-react';
import {useState} from 'react';
import type {PineScript} from './pineScripts';
import type {LocalStudy,RecipeRule,StudyRecipe} from './recipes';

export function LocalStudyLibrary({scripts,legacy,query,onOpen,onLegacy,onNew,onApply,onRemove,onLegacyApply,onAlert}:{
  scripts:PineScript[];legacy:LocalStudy[];query:string;
  onOpen:(id:string)=>void;onLegacy:(id:string)=>void;onNew:()=>void;
  onApply:(id:string)=>void;onRemove:(id:string)=>void;
  onLegacyApply:(name:string,recipe:StudyRecipe)=>void;onAlert:(name:string,rule:RecipeRule)=>void;
}){
  const [removing,setRemoving]=useState('');
  const terms=query.trim().toLowerCase();
  const visible=scripts.filter(item=>item.name.toLowerCase().includes(terms));
  const earlier=legacy.filter(item=>item.name.toLowerCase().includes(terms));
  return <div className="local-study-library">
    <button className="secondary-button" onClick={onNew}><Plus size={14}/> New Script</button>
    {visible.length===0&&earlier.length===0&&<p className="empty">{terms?'No matching scripts.':'Your saved scripts will appear here.'}</p>}
    {visible.map(item=><div className="script-row" key={item.id}>
      <button className="script-name" onClick={()=>onOpen(item.id)} title="Open source"><Code2 size={15}/>{item.name}</button>
      {removing===item.id?<><button className="negative" onClick={()=>{onRemove(item.id);setRemoving('');}}>Delete script and chart instances</button>
        <button onClick={()=>setRemoving('')}>Cancel</button></>:<>
        <button aria-label={`Add ${item.name} to Chart`} title="Add to Chart" onClick={()=>onApply(item.id)}><Play size={14}/></button>
        <button aria-label={`Remove ${item.name}`} title="Delete script" onClick={()=>setRemoving(item.id)}><Trash2 size={14}/></button>
      </>}
    </div>)}
    {earlier.map(item=><div className="script-row" key={item.id}>
      <button className="script-name" onClick={()=>onLegacy(item.id)} title="Open as a source draft"><Code2 size={15}/>{item.name}</button>
      <small>Legacy {item.category}</small>
      {item.category==='indicator'&&<button aria-label={`Add legacy ${item.name} to Chart`} onClick={()=>onLegacyApply(item.name,item.revisions.at(-1)!.recipe)}><Play size={14}/></button>}
      {item.category==='rule'&&<button onClick={()=>onAlert(item.name,item.revisions.at(-1)!)}>Create local alert</button>}
    </div>)}
  </div>;
}
