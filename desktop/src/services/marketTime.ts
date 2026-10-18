// IANA conversion for user-entered dates; DST is resolved for the selected date.
const dayFormatters=new Map<string,Intl.DateTimeFormat>();
export function marketDay(time:number,zone:string){let formatter=dayFormatters.get(zone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});dayFormatters.set(zone,formatter);}return formatter.format(new Date(time*1000));}
export function marketMidnight(day:string,zone:string){
 const target=Date.parse(day+'T00:00:00Z');if(!Number.isFinite(target))return NaN;
 let instant=target;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<4;i++){const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);instant+=target-local;}
 return instant/1000;
}
export function nextDay(day:string){return new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);}

// Resolve a wall-clock session anchor on DST transition dates, not midnight + elapsed seconds.
export function marketLocalMinute(day:string,zone:string,minute:number){const target=Date.parse(day+'T00:00:00Z')+minute*60000;let instant=target;const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});for(let i=0;i<4;i++){const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));instant+=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}return instant/1000;}
