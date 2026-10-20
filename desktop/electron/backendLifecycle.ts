import type {ChildProcess} from 'node:child_process';
/** Own the exact process handle only; never look up a process by executable name. */
export async function stopOwnedBackend(child:ChildProcess|undefined,token:string,graceMs=7000):Promise<void>{
 if(!child){return;}
 const exited=()=>child.exitCode!==null||child.signalCode!==null;
 if(exited()){return;}
 await new Promise<void>(resolve=>{
  let timer:ReturnType<typeof setTimeout>;const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};
  child.once('exit',done);timer=setTimeout(done,graceMs);
  try{child.stdin?.on('error',()=>{});child.stdin?.end(JSON.stringify({command:'shutdown',token})+'\n');}catch{/* Fall back to the owned handle after the bounded grace period. */}
 });
 if(!exited()){
  child.kill('SIGTERM');
  await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};const timer=setTimeout(done,2000);child.once('exit',done);if(exited())done();});
 }

 if(!exited())throw Error('Owned backend did not terminate within the shutdown deadline');
}
