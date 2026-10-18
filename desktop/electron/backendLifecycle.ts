import type {ChildProcess} from 'node:child_process';
export interface BackendJob {close:()=>void;}
/** Own the exact process handle/job only; never look up a process by executable name. */
export async function stopOwnedBackend(child:ChildProcess|undefined,token:string,job?:BackendJob,graceMs=7000):Promise<void>{
 if(!child){job?.close();return;}
 const exited=()=>child.exitCode!==null||child.signalCode!==null;
 if(exited()){job?.close();return;}
 await new Promise<void>(resolve=>{
  let timer:ReturnType<typeof setTimeout>;const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};
  child.once('exit',done);timer=setTimeout(done,graceMs);
  try{child.stdin?.on('error',()=>{});child.stdin?.end(JSON.stringify({command:'shutdown',token})+'\n');}catch{/* Fall back to the owned handle/job after the bounded grace period. */}
 });
 if(!exited()){
  if(job)job.close();else child.kill('SIGTERM');
  await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};const timer=setTimeout(done,2000);child.once('exit',done);if(exited())done();});
 }
 job?.close();
 if(!exited())throw Error('Owned backend did not terminate within the shutdown deadline');
}
