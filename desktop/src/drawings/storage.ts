import type {Pane} from '../types';
/** Keep an existing legacy set intact; otherwise write canonical instrument keys. */
export function drawingStorageKey(pane:Pick<Pane,'canonical_id'|'instrument_id'|'symbol'|'timeframe'|'drawing_sets'>){
 const legacy=`${pane.instrument_id||pane.symbol}/${pane.timeframe}`;
 if(Object.hasOwn(pane.drawing_sets,legacy))return legacy;
 return `${pane.canonical_id||pane.instrument_id||pane.symbol}/${pane.timeframe}`;
}
