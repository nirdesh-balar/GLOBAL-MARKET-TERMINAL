import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectReport,REQUIRED_STAGES,pythonResult} from './windows-ci-report.mjs';
import {runStage} from './windows-ci-run.mjs';
import {WINDOWS_PYTHON,WINDOWS_PYTHON_CHECK} from './windows-python.mjs';

// Synthetic fixtures only. These checks never claim native Windows acceptance.
const fixture=async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'gmt-ci-report-'));
  const put=async(name,value)=>{const p=join(cwd,'test-results',name);await mkdir(join(cwd,'test-results'),{recursive:true});await writeFile(p,typeof value==='string'?value:JSON.stringify(value));};
  const options={cwd,platform:'win32',architecture:'x64',sourceRevision:'a'.repeat(40),steps:{},runUrl:'https://github.com/example/repo/actions/runs/1'};
  return {cwd,put,options};
};
const successfulSteps=()=>Object.fromEntries(Object.keys(REQUIRED_STAGES).map(k=>[k,{outcome:'success'}]));
async function completeFixture() {
  const f=await fixture();f.options.steps=successfulSteps();
  await f.put('windows-python.xml','<testsuites><testsuite tests="2403" failures="0" errors="0"></testsuite></testsuites>');
  const output=join(f.cwd,'release-v1.0.0-global-market-terminal-windows/build');await mkdir(output,{recursive:true});
  await writeFile(join(output,'GLOBAL-MARKET-TERMINAL-win-x64-Setup.exe'),'SYNTHETIC UNIT FIXTURE, NOT AN EXECUTABLE');
  await f.put('windows-package.json',{platform:'win32',architecture:'x64',output});
  await f.put('windows-frozen-backend.json',{platform:'win32',architecture:'x64',exit_code:0,readiness:true});
  await f.put('windows-port-all.json',{host_platform:'win32',results:Array.from({length:49},()=>({exit_code:0}))});
  await f.put('windows-packaged.json',{host_platform:'win32',results:Array.from({length:5},()=>({exit_code:0}))});
  await f.put('windows-window-controls.json',{host_platform:'win32',f11:true,escape:true,renderer_errors:[]});
  await f.put('windows-scaling.json',{host_platform:'win32',rows:Array.from({length:12},()=>({})),renderer_errors:[]});
  await f.put('windows-installer.json',{platform:'win32',nsis_silent_install:true,uninstall_preserves_existing_user_data:true});
  return f;
}
test('early Python provisioning failure is retained and later tests are NOT EXECUTED',async()=>{
  const f=await fixture();f.options.steps.python={outcome:'failure'};
  const {summary,hashes}=await collectReport(f.options);
  assert.equal(summary.first_failure.id,'python');assert.equal(summary.first_failure.status,'INFRASTRUCTURE FAILURE');
  assert.equal(summary.first_failure.original_log,f.options.runUrl);
  assert.match(summary.first_failure.original_diagnostic,/original Actions step log/);
  assert.equal(summary.python_status,'NOT EXECUTED');assert.equal(summary.executed_windows_python,null);
  assert.equal(summary.installer_status,'NOT BUILT');assert.equal(summary.decision,'BLOCKED');assert.equal(summary.stable,false);
  assert.ok(hashes.some(h=>h.path==='WINDOWS-VERIFICATION.json'));
});
test('absent results directory produces reports and a verified partial manifest',async()=>{
  const f=await fixture();const {hashes}=await collectReport(f.options);
  assert.ok((await stat(join(f.cwd,'release-v1.0.0-global-market-terminal-windows/evidence'))).isDirectory());
  assert.equal(hashes.length,2);assert.match(await readFile(join(f.cwd,'release-v1.0.0-global-market-terminal-windows/SHA256SUMS.txt'),'utf8'),/WINDOWS-VERIFICATION.json/);
});
test('npm failure records original stderr and exit status without dependencies',async()=>{
  const f=await fixture();const code=await runStage('npm',process.execPath,['-e','console.error("fixture: dependency install failed");process.exit(7)'],f.cwd);
  assert.equal(code,7);f.options.steps.npm={outcome:'failure'};
  const {summary}=await collectReport(f.options);assert.equal(summary.first_failure.id,'npm');assert.equal(summary.first_failure.command.exit_code,7);
  assert.match(await readFile(join(f.cwd,'release-v1.0.0-global-market-terminal-windows/evidence/ci-npm.log'),'utf8'),/fixture: dependency install failed/);
});
test('spawn failure remains infrastructure failure',async()=>{
  const f=await fixture();assert.equal(await runStage('dependencies',join(f.cwd,'missing-command'),[],f.cwd),1);
  const {summary}=await collectReport(f.options);assert.equal(summary.first_failure.id,'dependencies');assert.match(summary.first_failure.command.error,/ENOENT/);
});
test('partial build metadata does not invent a missing installer',async()=>{
  const f=await fixture();await f.put('windows-package.json',{platform:'win32',architecture:'x64',output:join(f.cwd,'release-v1.0.0-global-market-terminal-windows/build')});
  f.options.steps.package={outcome:'failure'};const {summary}=await collectReport(f.options);
  assert.equal(summary.installer,null);assert.equal(summary.installer_status,'NOT BUILT');assert.equal(summary.first_failure.status,'BUILD FAILURE');
});
test('failed tests are distinct from infrastructure failures',async()=>{
  const f=await fixture();f.options.steps.python_tests={outcome:'failure'};await f.put('windows-python.xml','<testsuite tests="25" failures="1" errors="2"></testsuite>');
  const {summary}=await collectReport(f.options);assert.equal(summary.first_failure.status,'TEST FAILURE');assert.equal(summary.executed_windows_python.tests,25);assert.equal(summary.python_status,'INCOMPLETE OR FAILED');
});
test('malformed JUnit is not interpreted as zero passing tests',()=>{
  assert.equal(pythonResult('<broken>'),null);assert.equal(pythonResult('<testsuite tests="2403">'),null);assert.deepEqual(pythonResult('<testsuite tests="3" failures="1" errors="0">'),{tests:3,failures:1,errors:0,skipped:0});
});
test('malformed JSON is copied as evidence and blocks acceptance',async()=>{
  const f=await fixture();await f.put('windows-package.json','{invalid');const {summary}=await collectReport(f.options);
  assert.deepEqual(summary.evidence_issues,['windows-package.json: invalid JSON']);assert.equal(summary.decision,'BLOCKED');
});
test('complete synthetic build evidence can reach validation, never stable acceptance',async()=>{
  const f=await completeFixture();const {summary}=await collectReport(f.options);assert.equal(summary.decision,'READY FOR WINDOWS VALIDATION');assert.equal(summary.stable,false);assert.equal(summary.manual_windows11_desktop,'NOT VERIFIED');
});
test('empty packaged result array is not a pass',async()=>{
  const f=await completeFixture();await f.put('windows-packaged.json',{host_platform:'win32',results:[]});const {summary}=await collectReport(f.options);assert.equal(summary.checks.packaged,false);assert.equal(summary.decision,'BLOCKED');
});
test('null result rows and skipped Python tests cannot pass',async()=>{
  const f=await completeFixture();await f.put('windows-packaged.json',{host_platform:'win32',results:[null,null,null,null,null]});
  await f.put('windows-python.xml','<testsuite tests="2403" failures="0" errors="0" skipped="2403">');
  const {summary}=await collectReport(f.options);assert.equal(summary.checks.packaged,false);assert.equal(summary.checks.python,false);assert.equal(summary.decision,'BLOCKED');
});
test('invalid step metadata still produces blocked evidence',async()=>{
  const f=await fixture();f.options.steps=null;const {summary}=await collectReport(f.options);assert.equal(summary.decision,'BLOCKED');assert.ok(summary.evidence_issues.includes('Invalid CI step metadata'));
});
test('skipped stages cannot borrow successful evidence',async()=>{
  const f=await completeFixture();f.options.steps.python_tests={outcome:'skipped'};const {summary}=await collectReport(f.options);assert.equal(summary.checks.python,false);assert.equal(summary.stages.python_tests.status,'NOT EXECUTED');assert.equal(summary.decision,'BLOCKED');
});
test('non-Windows evidence and hosts cannot satisfy Windows validation',async()=>{
  const f=await completeFixture();f.options.platform='darwin';await f.put('windows-port-all.json',{host_platform:'darwin',results:Array.from({length:49},()=>({exit_code:0}))});
  const {summary}=await collectReport(f.options);assert.equal(summary.checks.host,false);assert.equal(summary.checks.regressions,false);assert.equal(summary.decision,'BLOCKED');
});
test('installer paths outside candidate directory cannot pass',async()=>{
  const f=await completeFixture();await f.put('windows-package.json',{platform:'win32',architecture:'x64',output:f.cwd});const {summary}=await collectReport(f.options);assert.equal(summary.installer,null);assert.equal(summary.checks.build,false);
});
test('metadata errors block otherwise complete evidence',async()=>{
  const f=await completeFixture();f.options.sourceError='Source revision mismatch';const {summary}=await collectReport(f.options);assert.equal(summary.decision,'BLOCKED');assert.equal(summary.checks.source,false);
});
test('runtime pin and workflow security boundaries remain explicit',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/windows-x64.yml',import.meta.url),'utf8');
  assert.match(workflow,new RegExp('python-version: '+WINDOWS_PYTHON.replaceAll('.','\\.')));assert.match(WINDOWS_PYTHON_CHECK,/3,13,16/);assert.match(WINDOWS_PYTHON_CHECK,/Py_GIL_DISABLED/);
  assert.match(workflow,/permissions:\s+contents: read\s+jobs:/);assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/ref: \$\{\{ inputs.source_ref \}\}/);
  assert.equal([...workflow.matchAll(/uses: (\S+)/g)].every(m=>/@[a-f0-9]{40}$/.test(m[1])),true);
  assert.doesNotMatch(workflow,/continue-on-error|secrets\.|contents: write|workflow_run:/);
  for(const id of Object.keys(REQUIRED_STAGES))assert.match(workflow,new RegExp('- id: '+id+'\\s'));
});
