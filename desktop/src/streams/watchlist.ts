import {useCallback,useEffect,useState} from 'react';
import type {SymbolEntry} from '../types';
import type {QuoteSnapshot,QuoteRow} from '../refresh/hooks';
import {useStreamStatus,useWatchlistStream,type StreamFeed} from './client';
export function useLiveWatchlist(id:string,items:SymbolEntry[],enabled:boolean,snapshot:QuoteSnapshot|null){
 const status=useStreamStatus(),[frames,setFrames]=useState<Record<string,StreamFeed>>({});
 const accept=useCallback((frame:StreamFeed)=>setFrames(old=>({...old,[frame.identity]:frame})),[]);
 useEffect(()=>setFrames({}),[id]);
 useWatchlistStream('watchlist:'+id,items,status.enabled&&enabled,accept);
 if(!status.enabled)return snapshot;
 const rows={...(snapshot?.rows||{})};
 for(const item of items){if(item.provider!=='hyperliquid')continue;const key=item.canonical_id||item.instrument_id||'',frame=frames[key];
  const old=rows[key],state=!enabled?'paused':status.state!=='connected'?status.state:frame?.state||'connecting';
  const value=frame?.quote||old?.value||null;
  rows[key]={identity:key,state:value?'ready':'idle',value,stale:state!=='live',error:frame?.error||status.error||null,stream_state:state,receive_time:frame?.received_at} satisfies QuoteRow;
 }
 return {...(snapshot||{job:null,watchlist:id,pending:0,completed_at:null,provider:{cooldown_seconds:0,error:null},storage:'memory only'}),rows};
}
