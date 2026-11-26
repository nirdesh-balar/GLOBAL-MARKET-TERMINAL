import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../services/api';
import {cleanError} from '../services/errors';
import {RefreshScheduler} from './scheduler';
export interface RefreshPreferences {startup_quotes:boolean;watchlist_interval:0|60|300|900;chart_interval:60|300|900}
export interface QuoteValue {price:number;previous_close:number|null;absolute_change:number|null;change:number|null;volume:number|null;currency:string;timezone:string;precision:number;data_time:number;received_at?:number;timestamp_kind:'trading_date'|'provider_market_time'|'native_candle_start'|'provider_trade_time';latest_bar_time:number;last_completed_bar_time:number|null;fetched_at:number;source:string;timeframe?:string;session:{state:'open'|'closed'|'unknown';reliable:boolean;basis:string};notice:string}
export interface QuoteRow {stream_state?:string;receive_time?:number;identity:string;state:'idle'|'pending'|'loading'|'ready'|'missing'|'error'|'cancelled';value:QuoteValue|null;stale:boolean;error:string|null;retry_at?:number|null}
export interface QuoteSnapshot {generation?:number;sequence?:number;job:string|null;watchlist:string;timeframe?:string;rows:Record<string,QuoteRow>;pending:number;completed_at:number|null;provider:{cooldown_seconds:number;error:string|null};storage:string}
export const refreshScheduler=new RefreshScheduler();
export function useRefreshLifecycle(){
  const [paused,setPaused]=useState(false);
  useEffect(()=>{
    let suspended=false;
    const update=()=>{const active=!suspended&&!document.hidden&&navigator.onLine;setPaused(!active);refreshScheduler.setActive(active);};
    const off=window.terminal.onLifecycle(state=>{suspended=state==='suspend';update();});
    for(const name of ['online','offline','visibilitychange'])window.addEventListener(name,update);
    update();return()=>{off();for(const name of ['online','offline','visibilitychange'])window.removeEventListener(name,update);refreshScheduler.setActive(false);};
  },[]);
  return paused;
}
export function useRefreshTask(key:string,enabled:boolean,seconds:number,run:()=>Promise<void>){
  const callback=useRef(run);callback.current=run;
  useEffect(()=>enabled&&seconds>0?refreshScheduler.register(key,seconds*1000,()=>callback.current()):undefined,[key,enabled,seconds]);
}
export function useRefreshPreferences(){
  const [value,setValue]=useState<RefreshPreferences|null>(null),[error,setError]=useState('');
  const queue=useRef<Promise<unknown>>(Promise.resolve());
  useEffect(()=>{let alive=true;void api<RefreshPreferences>('/api/refresh/preferences').then(v=>{if(alive)setValue(v);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
  const change=useCallback((next:RefreshPreferences)=>{setValue(next);queue.current=queue.current.catch(()=>{}).then(()=>api<RefreshPreferences>('/api/refresh/preferences','PUT',next)).then(()=>setError(''),e=>setError(e.message));},[]);
  return {value,change,error};
}
type OwnedSnapshot = (QuoteSnapshot & {accepted:true;generation:number;sequence:number}) | {accepted:false};
const quoteClientPath = '/api/quotes/client';
const quoteSelectionPath = '/api/quotes/selection';
const isCancelled = (error: unknown) => cleanError(error).kind === 'cancelled';

export function useWatchlistQuotes(
  watchlist: string, signature: string, enabled: boolean,
  preferences: RefreshPreferences | null, timeframe = '1d', activeSymbol?: string,
) {
  const selectionKey = JSON.stringify([watchlist, timeframe, signature]);
  const [display, setDisplay] = useState<{key:string;snapshot:QuoteSnapshot} | null>(null);
  const [failure, setFailure] = useState<{key:string;message:string} | null>(null);
  const clientRef = useRef<Promise<string> | null>(null);
  const generationRef = useRef(0);
  const lastSelection = useRef<string | null>(null);
  const runRef = useRef<(force?:boolean, automatic?:boolean) => Promise<void>>(async () => {});
  const symbolRef = useRef(activeSymbol);
  symbolRef.current = activeSymbol;
  const prefsReady = !!preferences;

  useEffect(() => () => {
    const client = clientRef.current;
    clientRef.current = null;
    void client?.then(id => api(quoteClientPath+'?client='+id, 'DELETE')).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || !preferences) return;
    const generation = ++generationRef.current;
    let alive = true;
    let sequence = 0;
    let appliedSequence = 0;
    let running: {sequence:number;force:boolean} | undefined;
    let stopPolling: (() => void) | undefined;
    let selected: Promise<string | null> | undefined;
    const requests = new Set<string>();

    async function request<T>(path: string, method = 'GET', body?: unknown) {
      const id = crypto.randomUUID();
      requests.add(id);
      try {
        return await api<T>(path, method, body, id);
      } finally {
        requests.delete(id);
      }
    }

    function error(error: unknown) {
      if (alive && !isCancelled(error)) setFailure({key:selectionKey, message:cleanError(error).message});
    }

    function select() {
      if (!clientRef.current) {
        const lease = api<{client:string}>(quoteClientPath, 'POST').then(value => value.client);
        clientRef.current = lease;
        void lease.catch(() => { if (clientRef.current === lease) clientRef.current = null; });
      }
      selected ??= clientRef.current.then(async client => {
        if (!alive) return null;
        const result = await request<{accepted:boolean}>(quoteSelectionPath, 'PUT', {
          watchlist, timeframe, ownership:{client, generation},
        });
        return result.accepted ? client : null;
      }).catch(cause => {
        selected = undefined;
        throw cause;
      });
      return selected;
    }

    function status(client: string, operation?: {sequence:number;job:string}) {
      const query = new URLSearchParams({watchlist, timeframe, client, generation:String(generation)});
      if (operation) {
        query.set('sequence', String(operation.sequence));
        query.set('job', operation.job);
      }
      return request<OwnedSnapshot>('/api/quotes/status?'+query);
    }

    function matches(value: OwnedSnapshot, expected: number): value is Extract<OwnedSnapshot, {accepted:true}> {
      return alive && value.accepted && value.watchlist === watchlist && value.timeframe === timeframe &&
        value.generation === generation && value.sequence === expected;
    }

    function show(value: QuoteSnapshot) {
      appliedSequence = value.sequence ?? 0;
      setDisplay({key:selectionKey, snapshot:value});
      setFailure(null);
    }

    async function run(force = false, automatic = false) {
      if (!alive || (running && (!force || running.force))) return;
      stopPolling?.();
      const current = {sequence:++sequence, force};
      running = current;
      const isCurrent = () => alive && running === current;
      try {
        const client = await select();
        if (!client || !isCurrent()) return;
        let value = await request<OwnedSnapshot>('/api/quotes/snapshot', 'POST', {
          watchlist, timeframe, force, automatic, active_symbol:symbolRef.current,
          ownership:{client, generation, sequence:current.sequence},
        });
        if (!isCurrent() || !matches(value, current.sequence) || !value.job) return;
        const job = value.job;
        show(value);
        while (value.pending) {
          await new Promise<void>(resolve => {
            const timer = setTimeout(() => { stopPolling = undefined; resolve(); }, 500);
            stopPolling = () => { clearTimeout(timer); stopPolling = undefined; resolve(); };
          });
          if (!isCurrent()) return;
          value = await status(client, {sequence:current.sequence, job});
          if (!isCurrent() || !matches(value, current.sequence) || value.job !== job) return;
          show(value);
        }
      } catch (cause) {
        if (!isCurrent() || isCancelled(cause)) return;
        error(cause);
        throw cause;
      } finally {
        if (running === current) running = undefined;
      }
    }

    runRef.current = run;
    setFailure(null);
    void select().then(async client => {
      if (!client || !alive) return;
      const value = await status(client);
      if (!appliedSequence && matches(value, 0) && !value.job) show(value);
    }).catch(cause => { if (!sequence) error(cause); });
    if (lastSelection.current !== null || preferences.startup_quotes) {
      void run(false, lastSelection.current === selectionKey).catch(() => {});
    }
    lastSelection.current = selectionKey;

    return () => {
      alive = false;
      stopPolling?.();
      for (const id of requests) window.terminal.cancel(id);
      void clientRef.current?.then(client => api(quoteSelectionPath, 'DELETE', {client, generation})).catch(() => {});
    };
  }, [watchlist, timeframe, selectionKey, enabled, prefsReady]);

  useRefreshTask('selected-watchlist:'+watchlist+':'+timeframe, enabled && prefsReady,
    preferences?.watchlist_interval || 0, () => runRef.current(false, true));
  return {
    snapshot: display?.key === selectionKey ? display.snapshot : null,
    error: failure?.key === selectionKey ? failure.message : '',
    refresh: () => void runRef.current(true).catch(() => {}),
  };
}

export function quoteTime(value:QuoteValue){
  return new Intl.DateTimeFormat('en-IN',{timeZone:value.timestamp_kind==='trading_date'?'UTC':value.timezone,month:'short',day:'2-digit',...(['provider_market_time','provider_trade_time'].includes(value.timestamp_kind)?{hour:'2-digit',minute:'2-digit',...(value.timestamp_kind==='provider_trade_time'?{second:'2-digit' as const}:{}),hour12:false}:{})}).format(new Date(value.data_time*1000));
}
