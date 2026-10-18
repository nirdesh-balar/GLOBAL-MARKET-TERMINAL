import type {ScreenResult} from './types';
/** Absolute prices/MACD are grouped by exact quote units. Unconfirmed units never rank across assets. */
export function compareScreenRows(a:ScreenResult,b:ScreenResult,key:string,descending=false){
 let order=0;const priceGroup=(r:ScreenResult)=>r.currency||r.canonical_id||r.symbol,volumeGroup=(r:ScreenResult)=>r.volume_unit?.startsWith('provider')?(r.canonical_id||r.symbol):r.volume_unit||r.canonical_id||r.symbol;
 if(['close','macd'].includes(key)&&priceGroup(a)!==priceGroup(b))order=priceGroup(a).localeCompare(priceGroup(b));
 else if(key==='volume'&&volumeGroup(a)!==volumeGroup(b))order=volumeGroup(a).localeCompare(volumeGroup(b));
 else{const x=a[key as keyof ScreenResult],y=b[key as keyof ScreenResult];order=x==null?y==null?0:1:y==null?-1:typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));}return descending?-order:order;
}
