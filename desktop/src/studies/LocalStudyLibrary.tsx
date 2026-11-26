import {useState} from 'react';
import {defaultRecipe,recipeSources,validRecipe,type LocalStudy,type StudyRecipe,type StudyRevision,type RecipeRule} from './recipes';

const categories:Record<LocalStudy['category'],string>={indicator:'Indicators',rule:'Analytical rules',library:'Libraries'};
const example:StudyRevision={number:1,recipe:defaultRecipe,output:'rsi',direction:'above',level:50};

export function LocalStudyLibrary({scripts,query,onSave,onApply,onAlert}:{
  scripts:LocalStudy[];query:string;onSave:(value:LocalStudy[])=>void;
  onApply:(name:string,recipe:StudyRecipe)=>void;onAlert:(name:string,rule:RecipeRule)=>void;
}){
  const [filter,setFilter]=useState<LocalStudy['category']|'all'>('all');
  const [selected,setSelected]=useState('');
  const [name,setName]=useState('');
  const [category,setCategory]=useState<LocalStudy['category']>('indicator');
  const [draft,setDraft]=useState<StudyRevision>(example);
  const [verified,setVerified]=useState(false);
  const [message,setMessage]=useState('');
  const saved=scripts.find(item=>item.id===selected);
  const list=scripts.filter(item=>(filter==='all'||filter===item.category)&&item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const edit=(next:StudyRevision)=>{setDraft(next);setVerified(false);setMessage('');};
  const field=(value:Partial<StudyRecipe>)=>edit({...draft,recipe:{...draft.recipe,...value}});
  const valid=()=>!!name.trim()&&validRecipe(draft.recipe)&&Number.isFinite(draft.level)&&draft.level>=0&&draft.level<=100;
  const load=(item:LocalStudy)=>{setSelected(item.id);setName(item.name);setCategory(item.category);edit(item.revisions.at(-1)!);};
  const save=()=>{
    if(!verified||!valid())return;
    if(!saved&&scripts.length>=20){setMessage('The workspace can store up to 20 studies.');return;}
    const item:LocalStudy={id:saved?.id??crypto.randomUUID(),name:name.trim(),category,
      revisions:[...(saved?.revisions??[]).slice(-4),{...draft,number:(saved?.revisions.at(-1)?.number??0)+1}]};
    onSave(saved?scripts.map(value=>value.id===saved.id?item:value):[...scripts,item]);
    load(item);
    setMessage('Saved revision '+item.revisions.at(-1)!.number);
  };
  const selectedRevision=saved?.revisions.find(item=>item.number===draft.number);
  return <div className="local-study-library">
    <div className="study-view-tabs"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All</button>
      {Object.entries(categories).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key as LocalStudy['category'])}>{label}</button>)}</div>
    <div className="local-study-list">{list.map(item=><button key={item.id} className="secondary-button" aria-pressed={item.id===selected} onClick={()=>load(item)}>{item.name}</button>)}
      {list.length===0&&<small>No saved studies in this view.</small>}
    </div>
    <button className="text-link" onClick={()=>{setSelected('');setName('');setCategory(filter==='all'?'indicator':filter);edit(example);}}>New study</button>
    <fieldset className="local-study-editor"><legend>Study editor</legend>
      <label>Name<input aria-label="Study name" maxLength={64} value={name} onChange={e=>{setName(e.target.value);setVerified(false);}}/></label>
      <label>Type<select aria-label="Study type" value={category} onChange={e=>{setCategory(e.target.value as LocalStudy['category']);setVerified(false);}}>
        {Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {saved&&<label>Revision<select aria-label="Load study revision" value={draft.number} onChange={e=>edit(saved.revisions.find(revision=>revision.number===Number(e.target.value))!)}>
        {saved.revisions.map(revision=><option key={revision.number} value={revision.number}>{revision.number}</option>)}</select></label>}
      <label>Source<select aria-label="Study price source" value={draft.recipe.source} onChange={e=>field({source:e.target.value as StudyRecipe['source']})}>
        {recipeSources.map(source=><option key={source}>{source}</option>)}</select></label>
      {(['rsi','ema','wma'] as const).map(key=><label key={key}>{key.toUpperCase()} length
        <input aria-label={key.toUpperCase()+' length'} type="number" min={2} max={200} value={draft.recipe[key]}
          onChange={e=>field({[key]:Number(e.target.value)})}/></label>)}
      {category==='rule'&&<>
        <label>Output<select aria-label="Rule output" value={draft.output} onChange={e=>edit({...draft,output:e.target.value as StudyRevision['output']})}>
          <option value="rsi">RSI</option><option value="ema">EMA of RSI</option><option value="wma">WMA of RSI</option></select></label>
        <label>Crosses<select aria-label="Rule direction" value={draft.direction} onChange={e=>edit({...draft,direction:e.target.value as StudyRevision['direction']})}>
          <option value="above">Above</option><option value="below">Below</option></select></label>
        <label>Level<input aria-label="Rule level" type="number" min={0} max={100} step="any" value={draft.level} onChange={e=>edit({...draft,level:Number(e.target.value)})}/></label>
      </>}
    </fieldset>
    <pre className="local-study-formula"><b>RSI</b>({draft.recipe.source}, {draft.recipe.rsi}){'\n'}<b>EMA</b>(RSI, {draft.recipe.ema}){'\n'}<b>WMA</b>(RSI, {draft.recipe.wma})</pre>
    <div className="local-study-actions">
      <button className="secondary-button" onClick={()=>{const ok=valid();setVerified(ok);setMessage(ok?'Verified':'Enter a name, integer lengths from 2 to 200, and a rule level from 0 to 100.');}}>Verify</button>
      <button className="secondary-button" disabled={!verified} onClick={save}>Save revision</button>
      {saved&&selectedRevision&&category==='indicator'&&<button className="secondary-button" onClick={()=>onApply(saved.name,selectedRevision.recipe)}>Add to Chart</button>}
      {saved&&selectedRevision&&category==='rule'&&<button className="secondary-button" onClick={()=>onAlert(saved.name,selectedRevision)}>Create local alert</button>}
      {saved&&selectedRevision&&category==='library'&&<button className="secondary-button" onClick={()=>{
        setSelected('');setName(saved.name+' copy');setCategory('indicator');edit(selectedRevision);
      }}>Use recipe</button>}
    </div>
    {message&&<p role="status">{message}</p>}
  </div>;
}
