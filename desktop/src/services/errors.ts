export type ChartFailure={message:string;kind:string;code:string;retryable:boolean;retry_after:number;http_status?:number};
export function cleanError(value:unknown):Error&Partial<ChartFailure>{
 const original=value as Error&Partial<ChartFailure>;
 const message=String(original?.message??value??'The local service is unavailable.').replace(/^(?:Error invoking remote method '[^']+':\s*)?(?:Error:\s*)?/,'');
 return Object.assign(new Error(message),{kind:original?.kind,code:original?.code,retryable:original?.retryable,retry_after:original?.retry_after,http_status:original?.http_status});
}
export function chartFailure(value:unknown):ChartFailure{
 const e=cleanError(value),kind=e.kind??(/throttl|rate limit|cooldown/i.test(e.message)?'rate':/unavailable|no history|no .*candles|unsupported|delisted/i.test(e.message)?'missing':'temporary');
 return {message:e.message,kind,code:e.code??kind,retryable:e.retryable??['temporary','rate'].includes(kind),retry_after:Math.max(0,e.retry_after??0),http_status:e.http_status};
}
export function failureTitle(value:ChartFailure){
 if(value.kind==='rate')return 'Provider rate limited';
 if(value.code==='connection'||value.code==='dns'||value.code==='tls')return 'Connection interrupted';
 if(value.code==='no_history'||value.kind==='missing')return 'No available historical candles';
 if(['range','policy','access'].includes(value.kind)||value.code==='invalid_symbol')return 'Unsupported instrument or history range';
 return 'Temporarily unavailable';
}
