/** LWC 5.2.1's indexToCoordinate rejects non-integer indices. Interpolate its
 * integer coordinates for financial curves, sub-bar anchors and projections.
 * This remains chart-synchronized under zoom/pan and introduces no candles.
 */
export function interpolateLogicalCoordinate(logical:number,coordinate:(integer:number)=>number|null):number|null{
 if(!Number.isFinite(logical))return null;const left=Math.floor(logical),right=Math.ceil(logical),a=coordinate(left);if(a===null||!Number.isFinite(a))return null;if(left===right)return a;const b=coordinate(right);return b===null||!Number.isFinite(b)?null:a+(b-a)*(logical-left);
}
