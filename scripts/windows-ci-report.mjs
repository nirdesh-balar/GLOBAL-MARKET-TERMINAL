// Built-ins only: evidence collection must not depend on Python or npm installation.
import {readFile,writeFile,mkdir,copyFile,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {release} from 'node:os';
import {pathToFileURL} from 'node:url';
import {artifactManifest} from './windows-artifacts.mjs';
import {WINDOWS_PYTHON} from './windows-python.mjs';

export const REQUIRED_STAGES = {
  validate:'INFRASTRUCTURE FAILURE', checkout:'INFRASTRUCTURE FAILURE',
  revision:'INFRASTRUCTURE FAILURE', node:'INFRASTRUCTURE FAILURE',
  python:'INFRASTRUCTURE FAILURE', npm:'INFRASTRUCTURE FAILURE',
  dependencies:'INFRASTRUCTURE FAILURE', directory:'INFRASTRUCTURE FAILURE',
  reporting_tests:'TEST FAILURE', python_tests:'TEST FAILURE', package:'BUILD FAILURE',
  regressions:'TEST FAILURE', controls:'TEST FAILURE', scaling:'TEST FAILURE', installer:'TEST FAILURE',
};
const sha256=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>{try{return (await stat(p)).isFile();}catch{return false;}};
export function pythonResult(xml) {
  const suites=[...xml.matchAll(/<testsuite\s([^>]+)>/g)];
  if(!suites.length) return null;
  if(suites.some(m=>['tests','failures','errors'].some(k=>!new RegExp('(?:^|\\s)'+k+'="\\d+"(?:\\s|$)').test(m[1]))))return null;
  const count=k=>suites.reduce((n,m)=>n+Number(new RegExp(k+'="(\\d+)"').exec(m[1])?.[1]??0),0);
  return {tests:count('tests'),failures:count('failures'),errors:count('errors'),skipped:count('skipped')};
}
export async function collectReport({cwd=process.cwd(),platform=process.platform,architecture=process.arch,
  steps={},runUrl=null,sourceRevision=null,sourceHashes={},sourceError=null,sign=null}={}) {
  const root=resolve(cwd,'release-v1.0.0-global-market-terminal-windows'),evidence=join(root,'evidence'),results=resolve(cwd,'test-results');
  await mkdir(evidence,{recursive:true});
  const issues=[];
  if(!steps||typeof steps!=='object'||Array.isArray(steps)){steps={};issues.push('Invalid CI step metadata');}
  const read=async name=>{try{return await readFile(join(results,name),'utf8');}catch(e){if(e.code!=='ENOENT')issues.push(name+': '+e.message);return null;}};
  const json=async name=>{const text=await read(name);if(text===null)return null;try{return JSON.parse(text);}catch(e){issues.push(name+': invalid JSON');return null;}};
  const stages={};
  for(const [id,kind] of Object.entries(REQUIRED_STAGES)) {
    const step=steps[id],command=await json('ci-'+id+'.json'),failed=step?.outcome==='failure'||(command&&command.exit_code!==0);
    stages[id]={status:failed?kind:step?.outcome==='success'?'COMPLETED':'NOT EXECUTED',
      outcome:step?.outcome??'unknown',command,
      original_diagnostic:failed?(command?.error??(command?'Original stdout/stderr retained in evidence/'+command.log:
        'Managed Action diagnostic retained in the original Actions step log; it is not reproduced or replaced by this collector.')):null,
      original_log:failed?runUrl:null};
  }
  const python=pythonResult(await read('windows-python.xml')??'');
  const build=await json('windows-package.json'),frozen=await json('windows-frozen-backend.json'),
    regressions=await json('windows-port-all.json'),controls=await json('windows-window-controls.json'),
    scaling=await json('windows-scaling.json'),native=await json('windows-installer.json'),packaged=await json('windows-packaged.json');
  const expectedInstaller=typeof build?.output==='string'?resolve(cwd,build.output,'GLOBAL-MARKET-TERMINAL-win-x64-Setup.exe'):null;
  // Refuse evidence pointing outside this candidate directory.
  const contained=expectedInstaller&&!relative(root,expectedInstaller).startsWith('..')&&!isAbsolute(relative(root,expectedInstaller));
  const installer=contained&&await exists(expectedInstaller)?expectedInstaller:null;
  const signing=installer&&sign?await sign(installer):null;
  const allPass=rows=>Array.isArray(rows)&&rows.length>0&&rows.every(r=>r?.exit_code===0);
  const windows=r=>r?.host_platform==='win32'||r?.platform==='win32';
  const completed=id=>stages[id].status==='COMPLETED';
  const checks={
    mandatory_stages:Object.values(stages).every(s=>s.status==='COMPLETED'),
    source:!!sourceRevision&&!sourceError,
    host:platform==='win32'&&architecture==='x64',
    python:completed('python_tests')&&!!python&&python.tests-python.skipped>=2403&&python.failures===0&&python.errors===0,
    build:completed('package')&&windows(build)&&build.architecture==='x64'&&!!installer,
    frozen:windows(frozen)&&frozen.architecture==='x64'&&frozen.exit_code===0&&frozen.readiness===true,
    regressions:windows(regressions)&&regressions?.results?.length===49&&allPass(regressions.results),
    controls:windows(controls)&&controls.f11===true&&controls.escape===true&&controls.renderer_errors?.length===0,
    scaling:windows(scaling)&&scaling?.rows?.length===12&&scaling.renderer_errors?.length===0,
    packaged:windows(packaged)&&packaged?.results?.length===5&&allPass(packaged.results),
    installer:windows(native)&&native.nsis_silent_install===true&&native.uninstall_preserves_existing_user_data===true,
    evidence:issues.length===0,
  };
  const passed=Object.values(checks).every(Boolean);
  const failedStages=Object.entries(stages).filter(([,s])=>s.status.endsWith('FAILURE')).map(([id,s])=>({id,...s}));
  const summary={product:'GLOBAL MARKET TERMINAL',version:'1.0.0',architecture,host_platform:platform,os:release(),
    source_revision:sourceRevision,source_sha256:sourceHashes,source_error:sourceError,
    requested_python:WINDOWS_PYTHON,run_url:runUrl,stages,failures:failedStages,first_failure:failedStages[0]??null,
    executed_windows_python:python,python_status:!completed('python_tests')&&!python?'NOT EXECUTED':checks.python?'PASSED':'INCOMPLETE OR FAILED',
    build,frozen_backend:frozen,regressions,packaged,window_controls:controls,scaling,native_installer:native,
    signing,installer,installer_status:!installer?'NOT BUILT':checks.build?'BUILT':'PARTIAL BUILD',
    checks,evidence_issues:issues,counts:{indicators:69,drawings:86,screener_conditions:59},
    manual_windows11_desktop:'NOT VERIFIED',native_toast_receipt_click:'NOT VERIFIED',native_dialog_selection:'NOT VERIFIED',
    windows10:'NOT VERIFIED',arm64:'NOT SUPPORTED',decision:passed?'READY FOR WINDOWS VALIDATION':'BLOCKED',stable:false};
  await writeFile(join(root,'WINDOWS-VERIFICATION.json'),JSON.stringify(summary,null,2));
  await writeFile(join(root,'WINDOWS-VERIFICATION.md'),[
    '# GLOBAL MARKET TERMINAL v1.0.0 — Windows candidate','',
    'Decision: **'+summary.decision+'**. Stable release acceptance: **NOT VERIFIED**.',
    'Source: '+sourceRevision+'. Host: '+platform+' '+architecture+'. Requested CPython: '+WINDOWS_PYTHON+'.',
    'Python: '+summary.python_status+'; actual result: '+JSON.stringify(python)+'.',
    'Installer: '+summary.installer_status+'. Signing: '+JSON.stringify(signing)+'.','',
    ...Object.entries(stages).map(([id,s])=>'- '+id+': '+s.status+(s.original_diagnostic?' — '+s.original_diagnostic:'')),
    '', 'Original Actions logs: '+(runUrl??'not supplied')+'. The first failed stage is retained above; missing test evidence is not a pass.',
    'Hosted Windows automation does not verify Windows 11 interactive installation, native dialogs/toasts, physical caption controls, OS DPI, signing or native version-to-version updates.',
    'Windows 10 and ARM64 acceptance are not claimed. No normal Mac profiles are used.',
  ].join('\n')+'\n');
  let entries=[];
  try{entries=await readdir(results,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const entry of entries)if(entry.isFile()&&/\.(json|jsonl|xml|png|log)$/.test(entry.name))
    await copyFile(join(results,entry.name),join(evidence,entry.name));
  const hashes=await artifactManifest(root);
  for(const h of hashes)if(sha256(await readFile(join(root,h.path)))!==h.sha256)throw Error('Final artifact hash mismatch');
  return {summary,hashes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows CI evidence must be generated on Windows x64.');
  let steps={},sourceRevision=null,sourceError=null;const sourceHashes={};
  try{steps=JSON.parse(process.env.GMT_CI_STEPS??'{}');}catch{sourceError='Invalid CI step metadata';}
  try{
    sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(sourceRevision!==process.env.SOURCE_REF)throw Error('Checked-out SHA differs from requested SHA');
    for(const p of execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))
      sourceHashes[p]=sha256(await readFile(p));
  }catch(e){sourceError=e.message;}
  const runUrl=process.env.GITHUB_SERVER_URL+'/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID;
  const sign=async installer=>{try{return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve('scripts/windows-signature.ps1'),'-File',installer],{encoding:'utf8',windowsHide:true,shell:false}));}catch{return {status:'UNKNOWN'};}};
  const {summary,hashes}=await collectReport({steps,sourceRevision,sourceHashes,sourceError,runUrl,sign});
  console.log(summary.decision+'; '+hashes.length+' actual artifact hashes verified; interactive acceptance is not claimed.');
  if(summary.decision==='BLOCKED')process.exitCode=1;
}
