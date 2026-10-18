import type {DrawingAnchor,FibLevel,Candle} from '../types';
export const retracementLevels=[0,.236,.382,.5,.618,.786,1].map(ratio=>({ratio}));
export const extensionLevels=[0,.618,1,1.618,2,2.618].map(ratio=>({ratio}));
/** Ratios interpolate original financial prices, never pixels or log prices. */
export function fibonacci(anchors:DrawingAnchor[],extension:boolean,levels:FibLevel[],reverse=false){
 const [a,b,c]=anchors,base=extension?c.price:reverse?b.price:a.price,delta=(b.price-a.price)*(reverse?-1:1);
 return levels.filter(l=>l.visible!==false).map(l=>({...l,price:base+l.ratio*delta}));
}
export function measurements(a:DrawingAnchor,b:DrawingAnchor,rows:Candle[]){
 const low=Math.min(a.time,b.time),high=Math.max(a.time,b.time),change=b.price-a.price;
 return {start:a.price,end:b.price,change,absolute:Math.abs(change),percent:a.price===0?null:change/Math.abs(a.price)*100,seconds:Math.abs(b.time-a.time),bars:rows.filter(r=>r.time>=low&&r.time<=high).length};
}
export function marketDate(time:number,zone:string,interval:string){return new Intl.DateTimeFormat('en-GB',{timeZone:['1d','1w','1M'].includes(interval)?'UTC':zone,year:'numeric',month:'short',day:'2-digit',...(!['1d','1w','1M'].includes(interval)?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(time*1000));}
export function elapsed(seconds:number){const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);return `${days}d ${hours}h ${minutes}m ${seconds%60}s`;}
