import {spawnSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,PREFLIGHTS,assertPreflight,unavailable} from './windows-ci-preflight.mjs';
// Custom reporters are ESM specifiers; raw Windows drive paths are not file URLs.
export const REPORTER_URL=pathToFileURL(resolve(ROOT,'scripts/windows-ci-preflight-reporter.mjs')).href;
export async function runPreflight(stage){
  if(!Object.hasOwn(PREFLIGHTS,stage))throw Error('Unknown preflight stage');
  await mkdir(resolve(ROOT,'test-results'),{recursive:true});
  const result=spawnSync(process.execPath,['--test','--test-reporter='+REPORTER_URL,...PREFLIGHTS[stage]],
    {cwd:ROOT,shell:false,windowsHide:true,encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,GMT_PREFLIGHT_STAGE:stage}});
  const exit=Number.isInteger(result.status)&&result.status>=0?result.status:null;
  let report;
  try{
    if(result.error||result.stdout.length>65536)throw Error('No bounded report');
    report={...JSON.parse(result.stdout),exit_code:exit,wrapper_exit_code:exit??1};
    if(exit===0&&(report.status!=='RECORDED'||report.summary_success!==true||report.counts?.tests===0||report.counts?.skipped||report.counts?.todo))report.wrapper_exit_code=1;
    assertPreflight(report,stage);
  }catch{
    // Absence of reporter output is observable; its underlying exception is not.
    // Never classify by, or copy, arbitrary child stderr (including forged codes).
    const code=!result.error&&exit!==null&&exit!==0&&typeof result.stdout==='string'&&result.stdout.trim()===''?'REPORTER_NO_OUTPUT':'REPORT_UNAVAILABLE';
    report=unavailable(stage,exit,code);
  }
  const prefix=resolve(ROOT,'test-results/windows-preflight-'+stage);
  // Private raw child output is never written to the four-file staging directory.
  await writeFile(prefix+'.log',(result.stdout??'')+'\n'+(result.stderr??''),{flag:'wx',mode:0o600});
  await writeFile(prefix+'.json',JSON.stringify(report),{flag:'wx',mode:0o600});
  console.log('Preflight '+stage+': '+report.status+'; exit '+report.wrapper_exit_code+'.');
  return report.wrapper_exit_code;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href){
  try{process.exitCode=await runPreflight(process.argv[2]);}
  catch{console.error('BLOCKED: preflight execution/evidence unavailable.');process.exitCode=1;}
}
