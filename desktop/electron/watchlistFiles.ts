import{safeExportStem}from'./platform';
import {dialog,type BrowserWindow} from 'electron';
import {open,writeFile} from 'node:fs/promises';
import {basename,extname} from 'node:path';
import {formatCSV} from '../src/screener/csv';
import type {Workspace} from '../src/types';
export async function importWatchlistCSV(window:BrowserWindow){
 const selected=await dialog.showOpenDialog(window,{title:'Import watchlist CSV',properties:['openFile'],filters:[{name:'UTF-8 CSV',extensions:['csv']}]});
 if(selected.canceled||selected.filePaths.length!==1)return null;const path=selected.filePaths[0];
 if(extname(path).toLowerCase()!=='.csv')throw Error('Select a .csv file');
 const file=await open(path,'r');try{const info=await file.stat();if(!info.isFile()||info.size>1_000_000)throw Error('Select a CSV file of up to 1 MB');const buffer=Buffer.alloc(1_000_001);let size=0;while(size<buffer.length){const read=await file.read(buffer,size,buffer.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}if(size>1_000_000)throw Error('CSV exceeds 1 MB');let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size));}catch{throw Error('CSV must use UTF-8 encoding');}return {name:basename(path),content};}finally{await file.close();}
}
export async function exportWatchlistCSV(window:BrowserWindow,workspace:Workspace,id:unknown){
 if(typeof id!=='string'||id.length>80)throw Error('Invalid watchlist identifier');const list=workspace.watchlists.find(w=>w.id===id);if(!list)throw Error('Watchlist no longer exists');
 const csv=formatCSV({headers:['symbol','exchange','asset_type','provider','name','canonical_id','instrument_id'],rows:list.items.map(r=>[r.symbol,r.exchange,r.kind,r.provider||'yahoo',r.name,r.canonical_id||'',r.instrument_id||''])});
 const result=await dialog.showSaveDialog(window,{title:'Export watchlist CSV',defaultPath:safeExportStem(list.name)+'.csv',filters:[{name:'Watchlist CSV',extensions:['csv']}]});if(result.canceled||!result.filePath)return null;await writeFile(result.filePath,csv,'utf8');return basename(result.filePath);
}
