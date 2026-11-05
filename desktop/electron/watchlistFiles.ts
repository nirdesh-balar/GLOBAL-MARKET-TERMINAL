import{safeExportStem}from'./platform';
import {dialog,type BrowserWindow} from 'electron';
import {open,writeFile} from 'node:fs/promises';
import {basename,extname} from 'node:path';
import {formatCSV} from '../src/screener/csv';
import type {Workspace,SymbolEntry} from '../src/types';
export async function importWatchlistCSV(window:BrowserWindow){
 const selected=await dialog.showOpenDialog(window,{title:'Import watchlist CSV',properties:['openFile'],filters:[{name:'UTF-8 CSV',extensions:['csv']}]});
 if(selected.canceled||selected.filePaths.length!==1)return null;const path=selected.filePaths[0];
 if(extname(path).toLowerCase()!=='.csv')throw Error('Select a .csv file');
 const file=await open(path,'r');try{const info=await file.stat();if(!info.isFile()||info.size>1_000_000)throw Error('Select a CSV file of up to 1 MB');const buffer=Buffer.alloc(1_000_001);let size=0;while(size<buffer.length){const read=await file.read(buffer,size,buffer.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}if(size>1_000_000)throw Error('CSV exceeds 1 MB');let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size));}catch{throw Error('CSV must use UTF-8 encoding');}return {name:basename(path),content};}finally{await file.close();}
}
export async function exportWatchlistCSV(window:BrowserWindow,workspace:Workspace,id:unknown,flagsData?:{flags:Record<string,{color:string;symbol:string;name:string;exchange:string;provider:string;kind:string;metadata?:Record<string,unknown>}>;aliases?:Record<string,string>}){
 if(typeof id!=='string'||id.length>80)throw Error('Invalid watchlist identifier');
 let listName='';
 let items:SymbolEntry[]=[];
 if(id.startsWith('color:')){
  const color=id.slice(6);
  const alias=flagsData?.aliases?.[color];
  listName=alias||`${color.charAt(0).toUpperCase()+color.slice(1)} List`;
  const matching=Object.entries(flagsData?.flags||{}).filter(([,f])=>f.color===color);
  items=matching.map(([cid,f])=>({
   symbol:f.symbol,
   name:f.name,
   exchange:f.exchange,
   provider:f.provider||'yahoo',
   kind:(f.kind||'equity') as SymbolEntry['kind'],
   canonical_id:cid,
   token:String(f.metadata?.token||'0'),
   instrument_id:String(f.metadata?.instrument_id||f.metadata?.id||cid)
  }));
 }else{
  const list=workspace.watchlists.find(w=>w.id===id);
  if(!list)throw Error('Watchlist no longer exists');
  listName=list.name;
  items=list.items;
 }
 const rows=items.map(r=>{
  const cid=r.canonical_id||r.instrument_id||r.symbol;
  const color=flagsData?.flags?.[cid]?.color||(id.startsWith('color:')?id.slice(6):'');
  return [r.symbol,r.exchange,r.kind,r.provider||'yahoo',r.name,r.canonical_id||'',r.instrument_id||'',color];
 });
 const csv=formatCSV({headers:['symbol','exchange','asset_type','provider','name','canonical_id','instrument_id','color'],rows});
 const result=await dialog.showSaveDialog(window,{title:'Export watchlist CSV',defaultPath:safeExportStem(listName)+'.csv',filters:[{name:'Watchlist CSV',extensions:['csv']}]});
 if(result.canceled||!result.filePath)return null;
 await writeFile(result.filePath,csv,'utf8');
 return basename(result.filePath);
}
