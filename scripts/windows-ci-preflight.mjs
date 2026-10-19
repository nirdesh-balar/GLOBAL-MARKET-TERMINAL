// Typed public evidence only. Source locations are checked against these reviewed files.
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const PREFLIGHTS=Object.freeze({
  privacy_tests:['scripts/windows-ci-public.test.mjs'],
  reporting_tests:['scripts/windows-ci-report.test.mjs','scripts/windows-ci-diagnostics.test.mjs','scripts/windows-ci-preflight.test.mjs'],
});
const PHASES=['ASSERTION','SETUP','TEARDOWN','TEST','INFRASTRUCTURE','UNKNOWN'];
const CODES=['ASSERTION_FAILED','HOOK_FAILED','TEST_ERROR','TIMEOUT','CANCELLED','RUNNER_FAILURE','REPORT_UNAVAILABLE','REPORTER_NO_OUTPUT'];
const integer=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
const hash=x=>createHash('sha256').update(x).digest('hex');
function keys(x,names){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join('|')!==names.sort().join('|'))throw Error('Preflight fields rejected');}
export function sourceLocation(stage,file,line,column,root=ROOT,revision=root===ROOT?process.env.SOURCE_REF:undefined){
  const name=PREFLIGHTS[stage]?.find(n=>resolve(root,n)===file);
  if(!name)return null;
  const st=lstatSync(resolve(root,name));if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>262144)throw Error('Invalid preflight source');
  const bytes=readFileSync(resolve(root,name));
  if(revision!==undefined){
    if(typeof revision!=='string'||!/^[a-f0-9]{40}$/.test(revision))throw Error('Exact preflight source revision required');
    let approved;
    try{approved=execFileSync('git',['show',revision+':'+name],{cwd:root,stdio:['ignore','pipe','pipe'],maxBuffer:262144});}
    catch{throw Error('Preflight source absent from approved Git revision');}
    if(!bytes.equals(approved))throw Error('Preflight source differs from approved Git revision');
  }
  if(!integer(line)||!line||!integer(column)||!column)return null;
  const expression=bytes.toString('utf8').split(/\r?\n/)[line-1]?.slice(column-1);
  if(!expression?.startsWith('test('))return null;
  // Literal title only. Computed/escaped/runtime titles are withheld, never copied.
  const literal=/^test\(\s*(['"])([^\\\r\n]*?)\1\s*,/.exec(expression)?.[2];
  const title=literal&&literal.length<=512&&!/[^\x20-\x7e]/.test(literal)?literal:null;
  return {file:name,line,column,source_sha256:hash(bytes),name:title};
}
function classify(error){
  const type=error?.failureType,cause=error?.cause;
  if(type==='hookFailed'){
    const phase=/^failed running (before|beforeEach) hook$/.test(error.message)?'SETUP':/^failed running (after|afterEach) hook$/.test(error.message)?'TEARDOWN':'UNKNOWN';
    return {phase,code:'HOOK_FAILED'};
  }
  if(type==='testCodeFailure')return cause?.code==='ERR_ASSERTION'?{phase:'ASSERTION',code:'ASSERTION_FAILED'}:{phase:'TEST',code:'TEST_ERROR'};
  if(type==='testTimeoutFailure')return {phase:'UNKNOWN',code:'TIMEOUT'};
  if(['cancelledByParent','testAborted','parentAlreadyFinished'].includes(type))return {phase:'UNKNOWN',code:'CANCELLED'};
  return {phase:'INFRASTRUCTURE',code:'RUNNER_FAILURE'};
}
export class PreflightObserver{
  constructor(stage,root=ROOT){if(!Object.hasOwn(PREFLIGHTS,stage))throw Error('Unknown preflight');this.stage=stage;this.root=root;this.failures=[];this.omitted=0;this.positions=new Map();this.summary=null;}
  event({type,data}){
    if(type==='test:summary'&&!data.file){
      const names=['tests','passed','failed','cancelled','skipped','todo'];
      if(names.every(k=>integer(data.counts?.[k]))&&typeof data.success==='boolean')this.summary={counts:Object.fromEntries(names.map(k=>[k,data.counts[k]])),success:data.success};
    }
    if(!['test:pass','test:fail'].includes(type))return;
    const loc=sourceLocation(this.stage,data.file,data.line,data.column,this.root);
    let index=null;
    if(loc){const key=loc.file+':'+loc.line+':'+loc.column;index=this.positions.get(key)??0;this.positions.set(key,index+1);}
    if(type!=='test:fail')return;
    if(this.failures.length===8){this.omitted++;return;}
    const fileFailure=!loc&&typeof data.file==='string'&&typeof data.name==='string'&&resolve(this.root,data.name)===data.file;
    const classification=fileFailure?{phase:'INFRASTRUCTURE',code:'RUNNER_FAILURE'}:classify(data.details?.error);
    this.failures.push({identifier:loc?'SOURCE':'WITHHELD',file:loc?.file??null,line:loc?.line??null,column:loc?.column??null,
      case_index:index,source_sha256:loc?.source_sha256??null,name:loc?.name??null,...classification});
  }
  result(){return {schema_version:1,stage:this.stage,status:this.summary?'RECORDED':'UNAVAILABLE',
    counts:this.summary?.counts??null,summary_success:this.summary?.success??null,failures:this.failures,omitted_failures:this.omitted};}
}
export function unavailable(stage,exitCode,code='REPORT_UNAVAILABLE'){
  return {schema_version:1,stage,status:'UNAVAILABLE',counts:null,summary_success:null,exit_code:exitCode,wrapper_exit_code:exitCode||1,
    failures:[{identifier:'WITHHELD',file:null,line:null,column:null,case_index:null,source_sha256:null,name:null,phase:'INFRASTRUCTURE',code}],omitted_failures:0};
}
export function assertPreflight(p,stage,root=ROOT,revision=root===ROOT?process.env.SOURCE_REF:undefined){
  if(p===null)return;
  keys(p,['schema_version','stage','status','counts','summary_success','exit_code','wrapper_exit_code','failures','omitted_failures']);
  if(!Object.hasOwn(PREFLIGHTS,stage)||p.stage!==stage||p.schema_version!==1||!['RECORDED','UNAVAILABLE'].includes(p.status)||
    !(p.exit_code===null||integer(p.exit_code)&&p.exit_code<=65535)||!integer(p.wrapper_exit_code)||p.wrapper_exit_code>65535||!integer(p.omitted_failures)||!Array.isArray(p.failures)||p.failures.length>8)throw Error('Invalid preflight result');
  if(p.counts!==null){
    keys(p.counts,['tests','passed','failed','cancelled','skipped','todo']);
    if(!Object.values(p.counts).every(integer)||p.counts.tests!==p.counts.passed+p.counts.failed+p.counts.cancelled+p.counts.skipped+p.counts.todo||typeof p.summary_success!=='boolean')throw Error('Invalid preflight counts');
  }
  if((p.status==='RECORDED')!==(p.counts!==null)||p.status==='UNAVAILABLE'&&p.summary_success!==null)throw Error('Invalid preflight completeness');
  const seen=new Set();
  for(const r of p.failures){
    keys(r,['identifier','file','line','column','case_index','source_sha256','name','phase','code']);
    if(!PHASES.includes(r.phase)||!CODES.includes(r.code))throw Error('Uncontrolled preflight failure');
    const phases={ASSERTION_FAILED:['ASSERTION'],HOOK_FAILED:['SETUP','TEARDOWN','UNKNOWN'],TEST_ERROR:['TEST'],TIMEOUT:['UNKNOWN'],CANCELLED:['UNKNOWN'],RUNNER_FAILURE:['INFRASTRUCTURE'],REPORT_UNAVAILABLE:['INFRASTRUCTURE'],REPORTER_NO_OUTPUT:['INFRASTRUCTURE']};
    if(!phases[r.code].includes(r.phase))throw Error('Contradictory preflight classification');
    if(r.code==='REPORTER_NO_OUTPUT'&&(p.status!=='UNAVAILABLE'||p.exit_code===null||p.exit_code===0||r.identifier!=='WITHHELD'))throw Error('Contradictory reporter bootstrap classification');
    if(r.identifier==='SOURCE'){
      if(!PREFLIGHTS[stage].includes(r.file)||!integer(r.case_index))throw Error('Unknown preflight identifier');
      const loc=sourceLocation(stage,resolve(root,r.file),r.line,r.column,root,revision);
      if(!loc||loc.source_sha256!==r.source_sha256||loc.name!==r.name)throw Error('Preflight source differs');
      const key=r.file+':'+r.line+':'+r.column+':'+r.case_index;if(seen.has(key))throw Error('Duplicate preflight failure');seen.add(key);
    }else if(r.identifier!=='WITHHELD'||['file','line','column','case_index','source_sha256','name'].some(k=>r[k]!==null))throw Error('Private preflight identifier rejected');
  }
  if(p.status==='RECORDED'&&(p.counts.failed+p.counts.cancelled>p.failures.length+p.omitted_failures))throw Error('Missing preflight failures');
  if(p.wrapper_exit_code===0&&(p.exit_code!==0||p.status!=='RECORDED'||p.summary_success!==true||p.counts.tests===0||p.counts.failed||p.counts.cancelled||p.counts.skipped||p.counts.todo||p.failures.length||p.omitted_failures))throw Error('Incomplete preflight cannot pass');
  if(p.exit_code!==null&&p.exit_code!==0&&p.wrapper_exit_code!==p.exit_code)throw Error('Original exit status changed');
}
export function preflightMarkdown(p,stage){
  if(p===null)return ['Preflight '+stage+': NOT RECORDED.'];
  return ['Preflight '+stage+': '+p.status+'; Node exit '+(p.exit_code??'NOT STARTED')+'; wrapper exit '+p.wrapper_exit_code+'; counts '+(p.counts?JSON.stringify(p.counts):'NOT RECORDED')+'; omitted '+p.omitted_failures+'.',
    ...p.failures.map(r=>'- '+(r.identifier==='SOURCE'?'`'+r.file+':'+r.line+':'+r.column+'` case '+r.case_index+(r.name?' - `'+r.name.replace(/[&<>`]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','`':'&#96;'}[c]))+'`':' - computed title WITHHELD'):'identifier WITHHELD')+' | '+r.phase+' | '+r.code)];
}
