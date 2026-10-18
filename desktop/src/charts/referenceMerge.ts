import type {CustomContext} from './custom';
import type {StreamFeed} from '../streams/client';
export type BenchmarkHistory=NonNullable<CustomContext['benchmarks']>[string];
/** Reconciliation replaces old corrections; newer forming data overlays REST. */
export function mergeBenchmarkSnapshot(previous:BenchmarkHistory|undefined,incoming:BenchmarkHistory):BenchmarkHistory{
 if(!previous)return incoming;
 if(previous.fetched_at>incoming.fetched_at)return {...incoming,...previous,instrument:incoming.instrument};
 if((previous.stream_received_at??0)<=incoming.fetched_at)return incoming;
 let candles=incoming.candles;const tail=previous.candles.at(-1),last=candles.at(-1);
 if(tail&&last&&tail.time===last.time)candles=[...candles.slice(0,-1),tail];
 else if(tail&&(!last||tail.time>last.time))candles=[...candles,...previous.candles.filter(r=>!last||r.time>last.time)].slice(-5000);
 return {...incoming,candles,stream_received_at:previous.stream_received_at};
}
export function applyBenchmarkFrame(entry:BenchmarkHistory,frame:StreamFeed):BenchmarkHistory{
 let candles=frame.history?.candles??entry.candles;
 if(frame.candle){const last=candles.at(-1);if(!last||frame.candle.time>last.time)candles=[...candles,frame.candle].slice(-5000);else if(frame.candle.time===last.time)candles=[...candles.slice(0,-1),frame.candle];}
 return {...entry,candles,fetched_at:frame.history?.fetched_at??entry.fetched_at,stream_received_at:frame.received_at};
}
