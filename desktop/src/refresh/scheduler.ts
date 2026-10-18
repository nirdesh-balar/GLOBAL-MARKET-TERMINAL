/** One refresh timer per renderer. Network work still uses the backend budget. */
export class RefreshScheduler {
  private tasks=new Map<string,{run:()=>Promise<void>;interval:number;due:number;running:boolean;failures:number}>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private active=true;
  constructor(private now=()=>Date.now(),private schedule=(fn:()=>void,delay:number)=>setTimeout(fn,delay),private cancel=(id:ReturnType<typeof setTimeout>)=>clearTimeout(id)){}
  register(key:string,interval:number,run:()=>Promise<void>){
    const task={run,interval,due:this.now()+interval,running:false,failures:0};
    this.tasks.set(key,task);this.arm();
    return()=>{if(this.tasks.get(key)===task)this.tasks.delete(key);this.arm();};
  }
  setActive(active:boolean){
    const resumed=active&&!this.active;this.active=active;
    if(resumed)for(const task of this.tasks.values())task.due=this.now();
    this.arm();
  }
  private arm(){
    if(this.timer!==undefined)this.cancel(this.timer);this.timer=undefined;
    if(!this.active)return;
    const idle=[...this.tasks.values()].filter(t=>!t.running);
    if(!idle.length)return;
    this.timer=this.schedule(()=>this.tick(),Math.max(25,Math.min(...idle.map(t=>t.due-this.now()))));
  }
  private tick(){
    this.timer=undefined;if(!this.active)return;
    for(const task of this.tasks.values())if(!task.running&&task.due<=this.now()){
      task.running=true;
      Promise.resolve().then(task.run).then(()=>{task.failures=0;},()=>{task.failures=Math.min(4,task.failures+1);}).finally(()=>{
        task.running=false;task.due=this.now()+Math.min(900000,task.interval*2**task.failures);this.arm();
      });
    }
    this.arm();
  }
  inspect(){return {tasks:this.tasks.size,timers:this.timer===undefined?0:1,active:this.active,running:[...this.tasks.values()].filter(t=>t.running).length};}
}

export function updatedView(range:{from:number;to:number}|null,oldLength:number,newLength:number,follow:boolean){
  if(!range)return null;
  const added=Math.max(0,newLength-oldLength);
  return follow&&oldLength>0&&range.to>=oldLength-1?{from:range.from+added,to:range.to+added}:range;
}

export function mergeCandles<T extends {time:number}>(old:T[],incoming:T[]){const byTime=new Map(old.map(r=>[r.time,r]));for(const row of incoming)byTime.set(row.time,row);return [...byTime.values()].sort((a,b)=>a.time-b.time);}
