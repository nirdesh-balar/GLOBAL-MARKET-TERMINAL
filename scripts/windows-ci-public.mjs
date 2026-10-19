// Public evidence is regenerated from typed scalars, never copied from raw reports/logs.
import {lstat,realpath,open,mkdir,writeFile,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {REQUIRED_STAGES} from './windows-ci-report.mjs';
import {WINDOWS_PYTHON} from './windows-python.mjs';
import {peInfo} from './windows-artifacts.mjs';

export const STAGING='ci-evidence-public';
export const INSTALLER='GLOBAL-MARKET-TERMINAL-win-x64-Setup.exe';
export const ALLOWLIST=Object.freeze({
  'WINDOWS-VERIFICATION.json':{type:'application/json',maxBytes:65536},
  'WINDOWS-VERIFICATION.md':{type:'text/markdown',maxBytes:16384},
  'INSTALLER-SHA256.txt':{type:'text/plain',maxBytes:256},
  'EVIDENCE-SHA256SUMS.txt':{type:'text/plain',maxBytes:1024},
});
const PRIVATE_ROOT='release-v1.0.0-global-market-terminal-windows';
const CHECKS=['mandatory_stages','source','host','python','build','frozen','regressions','controls','scaling','packaged','installer','evidence'];
const STATUSES=['COMPLETED','NOT EXECUTED','INFRASTRUCTURE FAILURE','TEST FAILURE','BUILD FAILURE'];
const DIAGNOSTICS=['ENOENT','EACCES','ENOSPC','ETIMEDOUT','ECONNRESET'];
const MANAGED_STAGES=new Set(['validate','checkout','revision','node','python']);
const signatures=['NOT VERIFIED','Valid','NotSigned','HashMismatch','NotTrusted','UnknownError','UNKNOWN'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const integer=(v,max=1000000)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const sha=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const oneOf=(v,choices,fallback)=>choices.includes(v)?v:fallback;
const numberOrNull=(v,max)=>integer(v,max)?v:null;
const literal=x=>v=>v===x;
const enumeration=xs=>v=>xs.includes(v);
const nullable=pred=>v=>v===null||pred(v);
const counter=v=>integer(v);

// Check each component under a canonical checkout; reject junctions, symlinks and hardlinks.
async function fileHandle(root,name,maxBytes) {
  if(isAbsolute(name)||relative(root,resolve(root,name)).startsWith('..'))throw Error('Evidence path escapes checkout');
  const parts=relative(root,resolve(root,name)).split(/[\\/]/);
  let path=root;
  for(let i=0;i<parts.length;i++){
    path=join(path,parts[i]);const st=await lstat(path);
    if(st.isSymbolicLink()||(i<parts.length-1&&!st.isDirectory()))throw Error('Evidence symlink or invalid parent rejected');
    if(i===parts.length-1&&(!st.isFile()||st.nlink!==1||st.size>maxBytes))throw Error('Evidence type, hardlink or size rejected');
  }
  const before=await lstat(path),handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0)),after=await handle.stat();
  if(!after.isFile()||after.nlink!==1||before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||after.size>maxBytes){
    await handle.close();throw Error('Evidence changed while opening');
  }
  return handle;
}
async function safeRead(root,name,maxBytes){
  const f=await fileHandle(root,name,maxBytes);
  try{const bytes=await f.readFile();if(bytes.length>maxBytes)throw Error('Evidence size limit');return bytes;}finally{await f.close();}
}
function textBytes(bytes) {
  // Public formats are intentionally ASCII with fixed schemas: no opaque blobs/encoding.
  if(bytes.some(b=>!(b===9||b===10||b===13||(b>=32&&b<=126))))throw Error('Binary or non-ASCII evidence rejected');
  const text=bytes.toString('ascii');
  if(/^(MZ|PK|#!)|-----BEGIN .*PRIVATE KEY-----|github_pat_|gh[pousr]_/.test(text))throw Error('Executable or credential content rejected');
  return text;
}
async function installerDigest(root){
  let f;
  try{f=await fileHandle(root,PRIVATE_ROOT+'/build/'+INSTALLER,2*1024**3);}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
  try{
    const st=await f.stat(),header=Buffer.alloc(Math.min(st.size,512*1024));
    await f.read(header,0,header.length,0);peInfo(header); // NSIS may have an x86 launcher.
    const digest=createHash('sha256');let bytes=0;
    for await(const chunk of f.createReadStream({start:0,autoClose:false})){digest.update(chunk);bytes+=chunk.length;}
    const end=await f.stat();
    if(bytes!==st.size||end.size!==st.size||end.mtimeMs!==st.mtimeMs)throw Error('Installer changed during integrity check');
    return {sha256:digest.digest('hex'),bytes};
  }finally{await f.close();}
}
function suiteRows(raw,max) {
  if(!Array.isArray(raw))return {recorded:0,passed:0,failed:0,invalid:0};
  if(raw.length>max)throw Error('Unexpected regression count');
  return {recorded:raw.length,passed:raw.filter(r=>r?.exit_code===0).length,
    failed:raw.filter(r=>integer(r?.exit_code,65535)&&r.exit_code!==0).length,
    invalid:raw.filter(r=>!integer(r?.exit_code,65535)).length};
}
function ready(m){
  return m.private_report_outcome==='success'&&m.source_revision===m.expected_source_revision&&
    m.host_platform==='win32'&&m.host_architecture==='x64'&&Object.values(m.checks).every(v=>v===true)&&
    Object.entries(m.stages).every(([id,s])=>s.status==='COMPLETED'&&(s.exit_code===0||(MANAGED_STAGES.has(id)&&s.exit_code===null)))&&
    m.python.status==='PASSED'&&m.python.tests-m.python.skipped>=2403&&m.python.failures===0&&m.python.errors===0&&
    m.regressions.recorded===49&&m.regressions.passed===49&&m.regressions.invalid===0&&
    m.packaged.recorded===5&&m.packaged.passed===5&&m.packaged.invalid===0&&
    m.installer.status==='BUILT'&&sha(m.installer.sha256,64)&&m.installer.bytes>0;
}
export function projectSummary(s,{expectedSha,privateReportOutcome='unknown',installer=null}={}){
  if(!s||typeof s!=='object'||Array.isArray(s)||!sha(expectedSha,40))throw Error('Invalid private evidence or expected source SHA');
  const stages=Object.fromEntries(Object.keys(REQUIRED_STAGES).map(id=>{
    const raw=s.stages?.[id],status=oneOf(raw?.status,STATUSES,'NOT EXECUTED'),c=raw?.command;
    const start=Date.parse(c?.started_at),end=Date.parse(c?.finished_at);
    return [id,{status,exit_code:numberOrNull(c?.exit_code,65535),elapsed_ms:numberOrNull(end-start,7200000),
      diagnostic_codes:DIAGNOSTICS.filter(code=>new RegExp('\\b'+code+'\\b').test(typeof c?.error==='string'?c.error.slice(0,4096):''))}];
  }));
  const rawPython=s.executed_windows_python;
  const pythonRecorded=stages.python_tests.status!=='NOT EXECUTED'&&rawPython&&
    ['tests','failures','errors','skipped'].every(k=>integer(rawPython[k]))&&
    rawPython.failures+rawPython.errors+rawPython.skipped<=rawPython.tests;
  const py={status:stages.python_tests.status==='NOT EXECUTED'?'NOT EXECUTED':'INCOMPLETE OR FAILED',
    tests:pythonRecorded?rawPython.tests:null,failures:pythonRecorded?rawPython.failures:null,
    errors:pythonRecorded?rawPython.errors:null,skipped:pythonRecorded?rawPython.skipped:null};
  if(stages.python_tests.status==='COMPLETED'&&pythonRecorded&&py.tests-py.skipped>=2403&&py.failures===0&&py.errors===0&&s.checks?.python===true)py.status='PASSED';
  const checks=Object.fromEntries(CHECKS.map(k=>[k,s.checks?.[k]===true]));
  if(s.source_error!=null)checks.source=false;
  if(!installer)checks.build=false;
  const m={schema_version:1,product:'GLOBAL MARKET TERMINAL',version:'1.0.0',
    expected_source_revision:expectedSha,source_revision:sha(s.source_revision,40)?s.source_revision:null,
    host_platform:oneOf(s.host_platform,['win32','darwin','linux'],'unknown'),
    host_architecture:oneOf(s.architecture,['x64','arm64','ia32'],'unknown'),
    requested_python:WINDOWS_PYTHON,private_report_outcome:oneOf(privateReportOutcome,['success','failure','cancelled'],'unknown'),
    decision:'BLOCKED',stable:false,stages,checks,python:py,
    regressions:suiteRows(s.regressions?.results,49),packaged:suiteRows(s.packaged?.results,5),
    installer:{status:!installer?'NOT BUILT':s.installer_status==='BUILT'&&checks.build&&stages.package.status==='COMPLETED'?'BUILT':'PARTIAL BUILD',
      sha256:installer?.sha256??null,bytes:installer?.bytes??null,
      authenticode:installer?oneOf(s.signing?.status,signatures,'NOT VERIFIED'):'NOT VERIFIED'},
    manual_windows11_acceptance:'NOT VERIFIED',native_version_updates:'NOT VERIFIED'};
  // Never upgrade a blocked private report.
  if(s.decision==='READY FOR WINDOWS VALIDATION'&&ready(m))m.decision='READY FOR WINDOWS VALIDATION';
  assertModel(m);return m;
}
const rowsShape={recorded:counter,passed:counter,failed:counter,invalid:counter};
const stageShape={status:enumeration(STATUSES),exit_code:nullable(v=>integer(v,65535)),
  elapsed_ms:nullable(v=>integer(v,7200000)),diagnostic_codes:v=>Array.isArray(v)&&v.length<=DIAGNOSTICS.length&&new Set(v).size===v.length&&v.every(x=>DIAGNOSTICS.includes(x))};
const MODEL={
  schema_version:literal(1),product:literal('GLOBAL MARKET TERMINAL'),version:literal('1.0.0'),
  expected_source_revision:v=>sha(v,40),source_revision:nullable(v=>sha(v,40)),
  host_platform:enumeration(['win32','darwin','linux','unknown']),host_architecture:enumeration(['x64','arm64','ia32','unknown']),
  requested_python:literal(WINDOWS_PYTHON),private_report_outcome:enumeration(['success','failure','cancelled','unknown']),
  decision:enumeration(['BLOCKED','READY FOR WINDOWS VALIDATION']),stable:literal(false),
  stages:Object.fromEntries(Object.keys(REQUIRED_STAGES).map(k=>[k,stageShape])),
  checks:Object.fromEntries(CHECKS.map(k=>[k,v=>typeof v==='boolean'])),
  python:{status:enumeration(['NOT EXECUTED','INCOMPLETE OR FAILED','PASSED']),
    tests:nullable(counter),failures:nullable(counter),errors:nullable(counter),skipped:nullable(counter)},
  regressions:rowsShape,packaged:rowsShape,
  installer:{status:enumeration(['NOT BUILT','PARTIAL BUILD','BUILT']),sha256:nullable(v=>sha(v,64)),
    bytes:nullable(v=>integer(v,2*1024**3)),authenticode:enumeration(signatures)},
  manual_windows11_acceptance:literal('NOT VERIFIED'),native_version_updates:literal('NOT VERIFIED'),
};
function shape(v,s){
  if(typeof s==='function'){if(!s(v))throw Error('Evidence schema value rejected');return;}
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==Object.keys(s).sort().join('|'))throw Error('Evidence schema fields rejected');
  for(const k of Object.keys(s))shape(v[k],s[k]);
}
export function assertModel(m){
  shape(m,MODEL);
  for(const r of [m.regressions,m.packaged])if(r.passed+r.failed+r.invalid!==r.recorded)throw Error('Inconsistent regression counts');
  if(m.regressions.recorded>49||m.packaged.recorded>5)throw Error('Unexpected suite size');
  if(m.installer.status==='NOT BUILT'&&(m.installer.sha256!==null||m.installer.bytes!==null))throw Error('Missing installer cannot have a checksum');
  if(m.installer.status!=='NOT BUILT'&&(!sha(m.installer.sha256,64)||!m.installer.bytes))throw Error('Built installer requires verified digest');
  if(m.decision==='READY FOR WINDOWS VALIDATION'&&!ready(m))throw Error('Failure cannot produce READY');
}
export function reportFiles(m){
  assertModel(m);
  const md=['# GLOBAL MARKET TERMINAL - Windows verification','',
    'Decision: '+m.decision+'. Stable release acceptance: NOT VERIFIED.',
    'Expected source: '+m.expected_source_revision+'. Actual source: '+(m.source_revision??'NOT VERIFIED')+'.',
    'Host: '+m.host_platform+' '+m.host_architecture+'. Requested Python: '+m.requested_python+'.',
    'Python: '+m.python.status+'. Tests: '+(m.python.tests??'NOT EXECUTED')+'.',
    'Regressions: '+m.regressions.passed+'/'+m.regressions.recorded+' reported passing.',
    'Packaged checks: '+m.packaged.passed+'/'+m.packaged.recorded+' reported passing.',
    'Installer: '+m.installer.status+'. Authenticode: '+m.installer.authenticode+'.','',
    ...Object.entries(m.stages).map(([id,s])=>'- '+id+': '+s.status+'; exit '+(s.exit_code??'not recorded')+'; codes '+(s.diagnostic_codes.join(',')||'none recorded')),
    '', 'Only typed outcomes, counters and installer SHA-256 are public.',
    'Raw commands, output, paths, environment, screenshots, market data and binaries remain runner-local.',
    'Original detailed failures are not reprinted here. Windows 11 interactive acceptance and native updates remain NOT VERIFIED.',''].join('\n');
  const files={
    'WINDOWS-VERIFICATION.json':Buffer.from(JSON.stringify(m,null,2)+'\n'),
    'WINDOWS-VERIFICATION.md':Buffer.from(md),
    'INSTALLER-SHA256.txt':Buffer.from(m.installer.sha256?m.installer.sha256+'  '+INSTALLER+'\n':'NOT BUILT\n'),
  };
  files['EVIDENCE-SHA256SUMS.txt']=Buffer.from(Object.keys(files).sort().map(n=>hash(files[n])+'  '+n+'\n').join(''));
  return files;
}
export async function verifyEvidence(cwd,{expectedSha}={}){
  const root=await realpath(cwd),stage=join(root,STAGING),st=await lstat(stage);
  if(st.isSymbolicLink()||!st.isDirectory())throw Error('Staging directory must be real');
  const entries=await readdir(stage,{withFileTypes:true});
  if(entries.some(e=>!e.isFile()||e.isSymbolicLink())||entries.map(e=>e.name).sort().join('|')!==Object.keys(ALLOWLIST).sort().join('|'))throw Error('Exact evidence allowlist mismatch');
  const files={};
  for(const [name,rule] of Object.entries(ALLOWLIST))files[name]=await safeRead(root,STAGING+'/'+name,rule.maxBytes);
  const m=JSON.parse(textBytes(files['WINDOWS-VERIFICATION.json']));assertModel(m);
  if(expectedSha!==undefined&&m.expected_source_revision!==expectedSha)throw Error('Evidence source mismatch');
  const canonical=reportFiles(m);
  for(const [name,bytes] of Object.entries(files)){
    textBytes(bytes);
    if(!bytes.equals(canonical[name]))throw Error('Noncanonical or modified public evidence rejected');
  }
  return {model:m,files:Object.keys(files),hashes:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,hash(b)]))};
}
export async function prepareEvidence(cwd,{expectedSha,privateReportOutcome='unknown'}={}){
  const root=await realpath(cwd);
  // No recursive copy. One known private JSON source and one known hash-only installer.
  const bytes=await safeRead(root,PRIVATE_ROOT+'/WINDOWS-VERIFICATION.json',16*1024**2);
  const s=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const installer=await installerDigest(root);
  const m=projectSummary(s,{expectedSha,privateReportOutcome,installer}),files=reportFiles(m);
  // Refuse an existing directory, including injected files/junctions. Never delete to make it pass.
  await mkdir(join(root,STAGING),{recursive:false,mode:0o700});
  for(const [name,contents] of Object.entries(files)){
    if(contents.length>ALLOWLIST[name].maxBytes)throw Error('Public evidence exceeds reviewed size');
    await writeFile(join(root,STAGING,name),contents,{flag:'wx',mode:0o600});
  }
  return verifyEvidence(root,{expectedSha});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const mode=process.argv[2];
    if(!sha(process.env.SOURCE_REF,40))throw Error('An exact expected source SHA is required');
    if(mode==='prepare'){
      if(process.platform!=='win32')throw Error('Native Windows evidence preparation requires Windows');
      await prepareEvidence(process.cwd(),{expectedSha:process.env.SOURCE_REF,privateReportOutcome:process.env.GMT_PRIVATE_REPORT_OUTCOME});
    }else if(mode==='verify')await verifyEvidence(process.cwd(),{expectedSha:process.env.SOURCE_REF});
    else throw Error('Choose prepare or verify');
    console.log('PASS evidence-only '+mode+': exactly four schema-validated text reports; binary payload upload forbidden.');
  }catch{
    // Parser and filesystem exceptions can echo offending data or private paths.
    console.error('BLOCKED: public evidence preparation/validation failed. No artifact upload is permitted.');
    process.exitCode=1;
  }
}
