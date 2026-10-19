import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,symlink,unlink,link,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {prepareEvidence,verifyEvidence,projectSummary,ALLOWLIST,STAGING,INSTALLER} from './windows-ci-public.mjs';
import {REQUIRED_STAGES,collectReport} from './windows-ci-report.mjs';

const SHA='a'.repeat(40),PRIVATE='release-v1.0.0-global-market-terminal-windows';
const opts={expectedSha:SHA,privateReportOutcome:'success'};
const root=()=>mkdtemp(join(tmpdir(),'gmt-evidence-privacy-'));
function privateSummary(){return {
  source_revision:SHA,host_platform:'win32',architecture:'x64',source_error:null,
  decision:'READY FOR WINDOWS VALIDATION',installer_status:'BUILT',signing:{status:'NotSigned'},
  stages:Object.fromEntries(Object.keys(REQUIRED_STAGES).map(k=>[k,{status:'COMPLETED',command:{exit_code:0}}])),
  checks:Object.fromEntries(['mandatory_stages','source','host','python','build','frozen','regressions','controls','scaling','packaged','installer','evidence'].map(k=>[k,true])),
  executed_windows_python:{tests:2403,failures:0,errors:0,skipped:0},
  regressions:{results:Array.from({length:49},()=>({exit_code:0}))},packaged:{results:Array.from({length:5},()=>({exit_code:0}))},
};}
async function putPrivate(cwd,s){await mkdir(join(cwd,PRIVATE),{recursive:true});await writeFile(join(cwd,PRIVATE,'WINDOWS-VERIFICATION.json'),JSON.stringify(s));}
function syntheticPE(){const b=Buffer.alloc(256);b.writeUInt16LE(0x5a4d);b.writeUInt32LE(128,0x3c);b.writeUInt32LE(0x4550,128);b.writeUInt16LE(0x14c,132);b.writeUInt16LE(0x10b,152);return b;}
async function fixture({binary=true,summary=privateSummary()}={}){
  const cwd=await root();await putPrivate(cwd,summary);
  if(summary.stages?.python_tests?.status==='COMPLETED'&&summary.executed_windows_python?.failures===0&&summary.executed_windows_python?.errors===0){
    await mkdir(join(cwd,'test-results'));
    await writeFile(join(cwd,'test-results/windows-python-diagnostics.json'),JSON.stringify({schema_version:1,status:'RECORDED',runtime:{platform:'win32',architecture:'x64',python:'3.13.16',windows_version:'10.0.20348'},exit_code:0,
      counts:{passed:summary.executed_windows_python.tests,failed:0,error:0,skipped:0},rejected_identifiers:0,omitted_failures:0,
      environment:{any_value_over_limit:false,path_over_limit:false,pytest_current_test_over_limit:false,current_test_assignment_over_limit:false},failures:[]}));
  }
  if(binary){await mkdir(join(cwd,PRIVATE,'build'));await writeFile(join(cwd,PRIVATE,'build',INSTALLER),syntheticPE());}
  return cwd;
}
const publicBytes=async cwd=>Buffer.concat(await Promise.all(Object.keys(ALLOWLIST).map(n=>readFile(join(cwd,STAGING,n)))));

test('synthetic packaged payload stays runner-local; exactly four text reports are staged',async()=>{
  const cwd=await fixture();const result=await prepareEvidence(cwd,opts);
  assert.deepEqual(result.files.sort(),Object.keys(ALLOWLIST).sort());assert.equal(result.model.decision,'READY FOR WINDOWS VALIDATION');assert.equal(result.model.stable,false);
  const binary=await readFile(join(cwd,PRIVATE,'build',INSTALLER));assert.ok(binary.equals(syntheticPE()));
  assert.equal(result.model.installer.sha256,createHash('sha256').update(binary).digest('hex'));
  assert.equal((await publicBytes(cwd)).includes(binary),false);
  assert.ok((await readFile(join(cwd,STAGING,'INSTALLER-SHA256.txt'),'utf8')).endsWith('  '+INSTALLER+'\n'));
});
test('arbitrary private fields, paths, credentials, market data and raw logs are omitted',async()=>{
  const secret='DO_NOT_EXPORT_PRIVATE_SENTINEL',s=privateSummary();s.source_error=null;s.profile='C:\\Users\\private-person\\'+secret;
  s.environment={TOKEN:secret};s.watchlists=[{name:secret}];s.candles=[{symbol:secret,close:125}];s.regressions.results[0].output=secret;s.signing.subject=secret;
  s.stages.package.command={exit_code:0,command:'C:\\Users\\'+secret,args:[secret],error:secret};
  const cwd=await fixture({summary:s});await mkdir(join(cwd,'test-results'),{recursive:true});await writeFile(join(cwd,'test-results','raw.log'),secret);
  await writeFile(join(cwd,PRIVATE,'private-report.json'),JSON.stringify({secret}));await prepareEvidence(cwd,opts);
  const text=(await publicBytes(cwd)).toString();assert.ok(!text.includes(secret));assert.ok(!text.includes('private-person'));assert.ok(!text.includes('watchlists'));
});
test('real stage/exit/error-code failure survives without copying sensitive diagnostics',async()=>{
  const s=privateSummary();s.stages.dependencies={status:'INFRASTRUCTURE FAILURE',command:{exit_code:17,error:'spawn ENOENT C:\\Users\\PRIVATE_TOKEN_123'}};
  const cwd=await fixture({summary:s});const {model}=await prepareEvidence(cwd,opts);
  assert.equal(model.decision,'BLOCKED');assert.equal(model.stages.dependencies.exit_code,17);assert.deepEqual(model.stages.dependencies.diagnostic_codes,['ENOENT']);assert.ok(!(await publicBytes(cwd)).includes(Buffer.from('PRIVATE_TOKEN_123')));
});
test('early provisioning failure with no test results generates safe BLOCKED evidence',async()=>{
  const cwd=await root();await collectReport({cwd,platform:'win32',architecture:'x64',sourceRevision:SHA,steps:{python:{outcome:'failure'}}});
  const {model}=await prepareEvidence(cwd,{...opts,privateReportOutcome:'failure'});
  assert.equal(model.decision,'BLOCKED');assert.equal(model.python.status,'NOT EXECUTED');assert.equal(model.python.tests,null);assert.equal(model.installer.status,'NOT BUILT');assert.equal(model.installer.sha256,null);
});
test('missing private report fails closed without creating an upload directory',async()=>{
  const cwd=await root();await assert.rejects(prepareEvidence(cwd,opts),/ENOENT/);await assert.rejects(lstat(join(cwd,STAGING)),/ENOENT/);
});
test('missing EXE is NOT BUILT even when private JSON claims success',async()=>{
  const cwd=await fixture({binary:false});const {model}=await prepareEvidence(cwd,opts);assert.equal(model.installer.status,'NOT BUILT');assert.equal(model.decision,'BLOCKED');
});
test('missing observer results prevent READY even when the old aggregate summary claims success',()=>{
  const model=projectSummary(privateSummary(),{...opts,installer:{sha256:'b'.repeat(64),bytes:256}});
  assert.equal(model.decision,'BLOCKED');assert.equal(model.python_diagnostics,null);
});
test('partial build has checksum-only evidence and cannot become READY',async()=>{
  const s=privateSummary();s.stages.package.status='BUILD FAILURE';s.installer_status='PARTIAL BUILD';const cwd=await fixture({summary:s});const {model}=await prepareEvidence(cwd,opts);assert.equal(model.installer.status,'PARTIAL BUILD');assert.equal(model.decision,'BLOCKED');assert.ok(model.installer.sha256);
});
test('failed Python or regression tests cannot inherit a false READY claim',async()=>{
  const s=privateSummary();s.executed_windows_python.failures=1;s.regressions.results[0].exit_code=1;
  const cwd=await fixture({summary:s});const {model}=await prepareEvidence(cwd,opts);assert.equal(model.decision,'BLOCKED');assert.equal(model.python.status,'INCOMPLETE OR FAILED');assert.equal(model.regressions.failed,1);
});
test('private collector failure cannot be promoted to READY',async()=>{
  const cwd=await fixture();assert.equal((await prepareEvidence(cwd,{...opts,privateReportOutcome:'failure'})).model.decision,'BLOCKED');
});
test('missing command exit evidence cannot masquerade as a successful wrapped stage',async()=>{
  const s=privateSummary();delete s.stages.python_tests.command;const cwd=await fixture({summary:s});assert.equal((await prepareEvidence(cwd,opts)).model.decision,'BLOCKED');
});
for(const [name,payload] of [['renamed EXE',syntheticPE()],['nested ZIP',Buffer.from([0x50,0x4b,3,4,0,0,0,0])],['script',Buffer.from('#!/bin/sh\necho forbidden\n')]]){
  test(name+' content under an allowed .md name is rejected',async()=>{
    const cwd=await fixture();await prepareEvidence(cwd,opts);await writeFile(join(cwd,STAGING,'WINDOWS-VERIFICATION.md'),payload);await assert.rejects(verifyEvidence(cwd,opts));
  });
}
for(const name of ['extra.exe','installer.zip','unknown.json','renamed.txt','private.sqlite3']){
  test('unexpected '+name+' is rejected regardless of extension/content',async()=>{
    const cwd=await fixture();await prepareEvidence(cwd,opts);await writeFile(join(cwd,STAGING,name),'apparently harmless');await assert.rejects(verifyEvidence(cwd,opts),/allowlist/);
  });
}
test('extra nested directories and archives cannot be traversed for upload',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);await mkdir(join(cwd,STAGING,'nested'));await writeFile(join(cwd,STAGING,'nested','payload.zip'),syntheticPE());await assert.rejects(verifyEvidence(cwd,opts),/allowlist/);
});
test('oversized allowed report is rejected',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);await writeFile(join(cwd,STAGING,'WINDOWS-VERIFICATION.json'),Buffer.alloc(ALLOWLIST['WINDOWS-VERIFICATION.json'].maxBytes+1,32));await assert.rejects(verifyEvidence(cwd,opts),/size/);
});
test('additional JSON fields and encoded private payloads fail the strict schema',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);const name=join(cwd,STAGING,'WINDOWS-VERIFICATION.json'),m=JSON.parse(await readFile(name));m.encoded_payload=syntheticPE().toString('base64');await writeFile(name,JSON.stringify(m));await assert.rejects(verifyEvidence(cwd,opts),/schema/);
});
test('credentials cannot be hidden in an approved string field',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);const name=join(cwd,STAGING,'WINDOWS-VERIFICATION.json'),m=JSON.parse(await readFile(name));m.installer.authenticode='Bearer PRIVATE_TOKEN';await writeFile(name,JSON.stringify(m));await assert.rejects(verifyEvidence(cwd,opts),/schema/);
});
test('manifest tampering is rejected',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);await writeFile(join(cwd,STAGING,'EVIDENCE-SHA256SUMS.txt'),'0'.repeat(64)+'  installer.zip\n');await assert.rejects(verifyEvidence(cwd,opts),/modified/);
});
test('missing public report prevents upload',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);await unlink(join(cwd,STAGING,'INSTALLER-SHA256.txt'));await assert.rejects(verifyEvidence(cwd,opts),/allowlist/);
});
test('symlinked staging root cannot expose another directory',async()=>{
  const cwd=await fixture(),outside=await root();await symlink(outside,join(cwd,STAGING),process.platform==='win32'?'junction':'dir');await assert.rejects(prepareEvidence(cwd,opts));await assert.rejects(verifyEvidence(cwd,opts));assert.deepEqual(await readdir(outside),[]);
});
test('symlinked allowed file cannot expose private content',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);const name=join(cwd,STAGING,'WINDOWS-VERIFICATION.json');await unlink(name);await symlink(join(cwd,PRIVATE,'WINDOWS-VERIFICATION.json'),name,'file');await assert.rejects(verifyEvidence(cwd,opts),/allowlist/);
});
test('symlinked private report parent is rejected before staging',async()=>{
  const cwd=await root(),outside=await root();await writeFile(join(outside,'WINDOWS-VERIFICATION.json'),JSON.stringify(privateSummary()));await symlink(outside,join(cwd,PRIVATE),process.platform==='win32'?'junction':'dir');await assert.rejects(prepareEvidence(cwd,opts),/symlink/);
});
test('symlinked installer cannot hash files outside the runner build output',async()=>{
  const cwd=await fixture({binary:false}),outside=await root();await mkdir(join(cwd,PRIVATE,'build'));await writeFile(join(outside,'private.exe'),syntheticPE());await symlink(join(outside,'private.exe'),join(cwd,PRIVATE,'build',INSTALLER),'file');await assert.rejects(prepareEvidence(cwd,opts),/symlink/);
});
test('hardlinked allowed file is rejected',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);const name=join(cwd,STAGING,'WINDOWS-VERIFICATION.md');await link(name,join(cwd,'second-link'));await assert.rejects(verifyEvidence(cwd,opts),/hardlink/);
});
test('pre-existing staging is never recursively cleaned or copied',async()=>{
  const cwd=await fixture();await mkdir(join(cwd,STAGING));await writeFile(join(cwd,STAGING,'sentinel'),'preserve');await assert.rejects(prepareEvidence(cwd,opts),/EEXIST/);assert.equal(await readFile(join(cwd,STAGING,'sentinel'),'utf8'),'preserve');
});
test('source mismatch at final verification blocks upload',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);await assert.rejects(verifyEvidence(cwd,{expectedSha:'b'.repeat(40)}),/source mismatch/);
});
test('child binary/secret output is runner-local and absent from public console',async()=>{
  const cwd=await root(),runner=resolve('scripts/windows-ci-run.mjs');const p=spawnSync(process.execPath,[runner,'npm',process.execPath,'-e','process.stdout.write(Buffer.from([77,90,0,1]));console.error("PRIVATE_SENTINEL");process.exit(7)'],{cwd,encoding:'utf8'});
  assert.equal(p.status,7);assert.ok(!(p.stdout+p.stderr).includes('PRIVATE_SENTINEL'));assert.ok(!(p.stdout+p.stderr).includes('MZ'));assert.match(p.stdout,/FAILED/);
  assert.ok((await readFile(join(cwd,'test-results/ci-npm.log'))).includes(Buffer.from('PRIVATE_SENTINEL')));
});
test('public guard CLI failures never print offending payloads or private parser diagnostics',async()=>{
  const cwd=await fixture();await prepareEvidence(cwd,opts);await writeFile(join(cwd,STAGING,'WINDOWS-VERIFICATION.json'),'PRIVATE_PARSER_SENTINEL invalid JSON');
  const p=spawnSync(process.execPath,[resolve('scripts/windows-ci-public.mjs'),'verify'],{cwd,encoding:'utf8',env:{...process.env,SOURCE_REF:SHA}});
  assert.equal(p.status,1);assert.match(p.stderr,/BLOCKED/);assert.ok(!(p.stdout+p.stderr).includes('PRIVATE_PARSER_SENTINEL'));assert.ok(!(p.stdout+p.stderr).includes(cwd));
});
test('public workflow upload is gated, exact-path only and all build/test stages remain',async()=>{
  const cwd=resolve('.github/workflows'),files=(await readdir(cwd)).filter(n=>/\.ya?ml$/.test(n));let uploads=0;
  for(const name of files){const text=await readFile(join(cwd,name),'utf8');const count=[...text.matchAll(/uses: actions\/upload-artifact@/g)].length;uploads+=count;if(name!=='windows-x64.yml')assert.equal(count,0);}
  assert.equal(uploads,1);const w=await readFile(join(cwd,'windows-x64.yml'),'utf8');
  assert.match(w,/github.actor == 'nirdesh-balar'/);assert.match(w,/github.event_name == 'workflow_dispatch'/);assert.doesNotMatch(w,/cache:|continue-on-error|secrets\.|contents: write/);
  const upload=w.slice(w.indexOf('      - name: Upload reviewed'));assert.match(upload,/steps.public_evidence.outcome == 'success'.*steps.evidence_guard.outcome == 'success'/);assert.doesNotMatch(upload,/test-results|release-v1|\*\*/);
  const paths=/path: \|\n((?:            [^\n]+\n)+)/.exec(upload)?.[1].trim().split('\n').map(s=>s.trim());assert.deepEqual(paths,Object.keys(ALLOWLIST).map(n=>STAGING+'/'+n));
  for(const id of Object.keys(REQUIRED_STAGES))assert.match(w,new RegExp('- id: '+id+'\\s'));
  assert.ok(w.includes('node scripts/windows-ci-run.mjs private_report node scripts/windows-ci-report.mjs'));
  for(const command of ['scripts/package-windows.mjs','scripts/verify-windows.mjs','scripts/windows-installer-smoke.mjs --ci-disposable','scripts/windows-window-controls-ui.mjs','scripts/windows-scaling-ui.mjs','--junitxml=test-results/windows-python.xml'])assert.ok(w.includes(command));
  const pkg=await readFile('scripts/package-windows.mjs','utf8');assert.ok(pkg.includes("'--publish','never'"));assert.ok(pkg.includes('windows-backend-smoke.mjs'));
});
