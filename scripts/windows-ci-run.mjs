// Built-ins only: this must work before npm ci and preserve the command's failure.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runStage(id, command, args, cwd=process.cwd()) {
  if (!/^[a-z_]+$/.test(id)) throw Error('Invalid CI stage identifier');
  await mkdir(resolve(cwd,'test-results'),{recursive:true});
  const log=createWriteStream(resolve(cwd,`test-results/ci-${id}.log`));
  const logFinished=finished(log);
  const start=new Date().toISOString(); let error=null;
  const code=await new Promise(done=>{
    const child=spawn(command,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    for(const [stream,target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])
      stream.on('data',b=>{target.write(b);log.write(b);});
    child.once('error',e=>{error=e.message;});
    child.once('close',code=>done(Number.isInteger(code)&&code>=0?code:1));
  });
  log.end();
  await logFinished;
  await writeFile(resolve(cwd,`test-results/ci-${id}.json`),JSON.stringify({stage:id,command,args,started_at:start,finished_at:new Date().toISOString(),exit_code:code,error,log:`ci-${id}.log`},null,2));
  return code;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [id,command,...args]=process.argv.slice(2);
  process.exitCode=await runStage(id,command,args);
}
