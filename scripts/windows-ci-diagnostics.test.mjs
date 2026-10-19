import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertDiagnostics,projectDiagnostics,diagnosticMarkdown} from './windows-ci-diagnostics.mjs';
import {projectSummary,prepareEvidence,ALLOWLIST,STAGING} from './windows-ci-public.mjs';
const catalog=JSON.parse(await readFile(new URL('./windows-pytest-nodes.json',import.meta.url)));
const node='backend/tests/test_windows_platform.py::test_private_profile_directory';
const hash=s=>createHash('sha256').update(s).digest('hex');
const py=resolve(process.platform==='win32'?'backend/.venv/Scripts/python.exe':'backend/.venv/bin/python');
function diagnostic(){return {
  schema_version:1,status:'RECORDED',runtime:{platform:'win32',architecture:'x64',python:'3.13.16',windows_version:'10.0.20348'},exit_code:1,
  counts:{passed:2,failed:1,error:0,skipped:0},rejected_identifiers:0,omitted_failures:0,
  environment:{any_value_over_limit:false,path_over_limit:false,pytest_current_test_over_limit:false,current_test_assignment_over_limit:false},
  failures:[{test:node,case_index:0,node_sha256:hash(node),node_id:node,phase:'call',outcome:'failed',exception:'ValueError',code:'ENV_VAR_LENGTH_LIMIT'}],
};}
test('reviewed public collection is bounded and has all 2403 IDs and 461 AST functions',()=>{
  assert.equal(Object.keys(catalog.nodes).length,461);assert.equal(Object.values(catalog.nodes).flat().length,2403);
  for(const [name,digests]of Object.entries(catalog.nodes)){
    assert.ok(name.startsWith('backend/tests/test_'));assert.equal(new Set(digests).size,digests.length);
    assert.ok(digests.every(s=>/^[a-f0-9]{64}$/.test(s)));
  }
});
test('known full node ID and controlled failure code are retained',()=>{
  const d=diagnostic();assert.deepEqual(projectDiagnostics(d),d);assert.ok(diagnosticMarkdown(d).join('\n').includes(node));
});
for(const [name,change]of [
  ['private node ID',d=>d.failures[0].node_id+='[PRIVATE_SENTINEL]'],
  ['unknown test function',d=>d.failures[0].test+='PRIVATE_SENTINEL'],
  ['unreviewed digest',d=>d.failures[0].node_sha256='a'.repeat(64)],
  ['wrong case index',d=>d.failures[0].case_index=1],
  ['arbitrary exception',d=>d.failures[0].exception='PRIVATE_SENTINEL'],
  ['raw error message',d=>d.failures[0].message='PRIVATE_SENTINEL'],
  ['unknown failure code',d=>d.failures[0].code='PRIVATE_SENTINEL'],
  ['runtime path',d=>d.runtime.python='C:/Users/PRIVATE_SENTINEL'],
  ['runtime array',d=>d.runtime.python=['3.13.16']],
  ['Windows version array',d=>d.runtime.windows_version=['10.0.20348']],
  ['raw environment',d=>d.environment.PATH='PRIVATE_SENTINEL'],
  ['wrong failure phase',d=>d.failures[0].phase='setup'],
  ['concealed failure counts',d=>d.counts.failed=9],
  ['duplicate failure',d=>d.failures.push({...d.failures[0]})],
  ['false success',d=>d.exit_code=0],
])test(name+' fails closed',()=>{const d=diagnostic();change(d);assert.throws(()=>projectDiagnostics(d));});
test('oversize IDs use a reviewed hash and source selector, not parameter text',()=>{
  const d=diagnostic(),base='backend/tests/test_watchlists.py::test_bounded_csv_parser';
  d.failures[0]={...d.failures[0],test:base,node_id:null,case_index:0,node_sha256:catalog.nodes[base][0]};
  assertDiagnostics(d);assert.ok(diagnosticMarkdown(d).join('\n').includes('oversize ID withheld'));
});
test('missing diagnostics are explicitly NOT RECORDED',()=>{
  assert.equal(projectDiagnostics(null),null);assert.match(diagnosticMarkdown(null)[0],/NOT RECORDED/);
});
test('source-reviewed assertion checkpoint v2 is canonical while legacy diagnostics remain valid',()=>{
  const d=diagnostic();d.schema_version=2;Object.assign(d.failures[0],{exception:'AssertionError',code:'ASSERTION_FAILED',checkpoint:'PROFILE_DACL_PRESENT'});
  assertDiagnostics(d);assert.deepEqual(projectDiagnostics(d),d);assert.match(diagnosticMarkdown(d).join('\n'),/checkpoint PROFILE_DACL_PRESENT/);
  assertDiagnostics(diagnostic());
  for(const change of [
    r=>r.checkpoint='PRIVATE_SENTINEL',r=>r.checkpoint='MIGRATION_DACL_PRESENT',r=>r.checkpoint=['PROFILE_DACL_PRESENT'],
    r=>r.exception='ValueError',r=>r.code='OTHER_FAILURE',r=>{r.phase='setup';r.outcome='error';},r=>r.runtime_value='PRIVATE_SENTINEL',
  ]){const bad=structuredClone(d);change(bad.failures[0]);assert.throws(()=>assertDiagnostics(bad));}
  const legacy=diagnostic();legacy.failures[0].checkpoint=null;assert.throws(()=>assertDiagnostics(legacy));
});
test('checkpoint diagnostics survive canonical four-file privacy staging without raw values',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gmt-checkpoint-evidence-')),sha='a'.repeat(40);
  await mkdir(join(dir,'release-v1.0.0-global-market-terminal-windows'));await mkdir(join(dir,'test-results'));
  const raw={source_revision:sha,host_platform:'win32',architecture:'x64',executed_windows_python:{tests:3,failures:1,errors:0,skipped:0},stages:{python_tests:{status:'TEST FAILURE',command:{exit_code:1}}}};
  const d=diagnostic();d.schema_version=2;Object.assign(d.failures[0],{exception:'AssertionError',code:'ASSERTION_FAILED',checkpoint:'PROFILE_DACL_PRESENT'});
  await writeFile(join(dir,'release-v1.0.0-global-market-terminal-windows/WINDOWS-VERIFICATION.json'),JSON.stringify(raw));
  await writeFile(join(dir,'test-results/windows-python-diagnostics.json'),JSON.stringify(d));
  await writeFile(join(dir,'test-results/private.log'),'PRIVATE_SENTINEL raw ACL SID environment traceback');
  const result=await prepareEvidence(dir,{expectedSha:sha,privateReportOutcome:'failure'});
  assert.equal(result.model.decision,'BLOCKED');assert.equal(result.model.python_diagnostics.failures[0].checkpoint,'PROFILE_DACL_PRESENT');
  assert.deepEqual(result.files.sort(),Object.keys(ALLOWLIST).sort());
  for(const name of result.files){const bytes=await readFile(join(dir,STAGING,name));assert.ok(bytes.length<=ALLOWLIST[name].maxBytes);assert.ok(!bytes.includes(Buffer.from('PRIVATE_SENTINEL')));}
});
test('real pytest rewritten assertion is identified by its approved source line without copying values',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gmt-checkpoint-'));await mkdir(join(dir,'scripts'));await mkdir(join(dir,'backend/tests'),{recursive:true});
  await copyFile('scripts/windows_pytest_diagnostics.py',join(dir,'scripts/windows_pytest_diagnostics.py'));
  await writeFile(join(dir,'backend/tests/test_windows_platform.py'),`def test_private_profile_directory():
    value = 'PRIVATE_SENTINEL'
    assert value == 'expected', 'PROFILE_DACL_PRESENT'
`);
  const run=args=>spawnSync(py,args,{cwd:dir,encoding:'utf8',shell:false});
  assert.equal(spawnSync('git',['init','--quiet'],{cwd:dir}).status,0);
  assert.equal(spawnSync('git',['add','backend/tests'],{cwd:dir}).status,0);
  assert.equal(run(['scripts/windows_pytest_diagnostics.py','--catalog']).status,0);
  const r=run(['scripts/windows_pytest_diagnostics.py','backend/tests','-q']);assert.equal(r.status,1);
  const raw=await readFile(join(dir,'test-results/windows-python-diagnostics.json'),'utf8'),d=JSON.parse(raw);
  const reviewed=JSON.parse(await readFile(join(dir,'scripts/windows-pytest-nodes.json'),'utf8'));
  assertDiagnostics(d,reviewed);assert.equal(d.schema_version,2);assert.equal(d.failures[0].checkpoint,'PROFILE_DACL_PRESENT');
  assert.equal(d.failures[0].code,'ASSERTION_FAILED');assert.ok(!raw.includes('PRIVATE_SENTINEL'));assert.ok(!raw.includes(dir));
  reviewed.checkpoints[node]=[];assert.throws(()=>assertDiagnostics(d,reviewed));
});
test('private observer unit checks',()=>{
  const r=spawnSync(py,['scripts/test_windows_pytest_diagnostics.py'],{encoding:'utf8',shell:false});
  assert.equal(r.status,0,r.stderr);assert.match(r.stderr,/OK/);
});
async function probeObserver(simulateWindowsLimit){
  const dir=await mkdtemp(join(tmpdir(),'gmt-pytest-diagnostics-'));
  await mkdir(join(dir,'scripts'));await mkdir(join(dir,'backend/tests'),{recursive:true});
  await copyFile('scripts/windows_pytest_diagnostics.py',join(dir,'scripts/windows_pytest_diagnostics.py'));
  await writeFile(join(dir,'backend/tests/test_probe.py'),`import pytest
@pytest.fixture
def fixture_error():
    yield
    raise PermissionError('PRIVATE_SENTINEL_123')
def test_pass(): assert True
def test_env(): raise ValueError('the environment variable is longer than 32767 characters')
def test_teardown(fixture_error): assert True
@pytest.mark.parametrize('x', ['a'*40000])
def test_long(x): assert False, 'PRIVATE_SENTINEL_123'
`);
  if(simulateWindowsLimit)await writeFile(join(dir,'backend/tests/conftest.py'),`# Test-only emulation in this disposable child, never the Mac parent environment.
import _pytest.runner as runner
original = runner._update_current_test_var
def bounded_current_test(item, when):
    value = (item.nodeid + ' (' + when + ')').replace('\\0', '(null)') if when else ''
    if len(value.encode('utf-16-le')) // 2 >= 32767:
        raise ValueError('the environment variable is longer than 32767 characters')
    return original(item, when)
runner._update_current_test_var = bounded_current_test
`);
  const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:dir,encoding:'utf8',shell:false});return r;};
  assert.equal(run('git',['init','--quiet']).status,0);
  assert.equal(run('git',['add','backend/tests']).status,0);
  const collect=run(py,['scripts/windows_pytest_diagnostics.py','--catalog']);assert.equal(collect.status,0,collect.stderr);
  const r=run(py,['scripts/windows_pytest_diagnostics.py','backend/tests','-q','--junitxml=test-results/windows-python.xml']);
  assert.equal(r.status,1);const raw=await readFile(join(dir,'test-results/windows-python-diagnostics.json'),'utf8'),d=JSON.parse(raw);
  assert.ok(!raw.includes('PRIVATE_SENTINEL_123'));assert.ok(!raw.includes('a'.repeat(1000)));
  const windowsLimit=simulateWindowsLimit||process.platform==='win32';
  assert.ok(['win32','darwin','linux'].includes(process.platform));
  assert.equal(d.status,'RECORDED');assert.equal(d.exit_code,1);
  assert.deepEqual(d.counts,windowsLimit?{passed:1,failed:1,error:2,skipped:0}:{passed:1,failed:2,error:1,skipped:0});
  assert.equal(Object.values(d.counts).reduce((a,b)=>a+b,0),4);
  const phases=d.failures.map(r=>[r.test.split('::').at(-1),r.phase,r.outcome,r.exception,r.code]).sort();
  const expected=[['test_env','call','failed','ValueError','ENV_VAR_LENGTH_LIMIT'],['test_teardown','teardown','error','PermissionError','ACCESS_DENIED'],
    ...(windowsLimit?[['test_long','setup','error','ValueError','ENV_VAR_LENGTH_LIMIT'],['test_long','teardown','error','ValueError','ENV_VAR_LENGTH_LIMIT']]:[['test_long','call','failed','AssertionError','ASSERTION_FAILED']])].sort();
  assert.deepEqual(phases,expected);
  assert.equal(d.rejected_identifiers,0);assert.equal(d.omitted_failures,0);
  const probeCatalog=JSON.parse(await readFile(join(dir,'scripts/windows-pytest-nodes.json'),'utf8'));
  assertDiagnostics(d,probeCatalog);
  for(const row of d.failures.filter(r=>r.test.endsWith('test_long')))assert.equal(row.node_id,null);
  assert.equal(d.environment.current_test_assignment_over_limit,true);
  await writeFile(join(dir,'backend/tests/test_probe.py'),'def test_changed(): assert True\n');
  const stale=run(py,['scripts/windows_pytest_diagnostics.py','backend/tests','-q']);
  assert.equal(stale.status,1);assert.match(stale.stderr,/Reviewed test catalogue differs/);
}
test('real pytest observer integration preserves failures, teardown errors and exit status without exporting secrets',async()=>{
  await probeObserver(false);
});
test('child-only Windows environment limit simulation verifies exact setup and teardown errors',async()=>{
  await probeObserver(true);
});
test('four-report staging includes only validated structured diagnostics and consistent checksums',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gmt-diagnostic-evidence-')),sha='a'.repeat(40);
  await mkdir(join(dir,'release-v1.0.0-global-market-terminal-windows'));
  const raw={source_revision:sha,host_platform:'win32',architecture:'x64',executed_windows_python:{tests:3,failures:1,errors:0,skipped:0},
    stages:{python_tests:{status:'TEST FAILURE',command:{exit_code:1}}}};
  await writeFile(join(dir,'release-v1.0.0-global-market-terminal-windows/WINDOWS-VERIFICATION.json'),JSON.stringify(raw));
  await mkdir(join(dir,'test-results'));await writeFile(join(dir,'test-results/windows-python-diagnostics.json'),JSON.stringify(diagnostic()));
  const r=await prepareEvidence(dir,{expectedSha:sha,privateReportOutcome:'failure'});
  assert.equal(r.files.length,4);assert.equal(r.model.decision,'BLOCKED');assert.equal(r.model.python_diagnostics.failures[0].node_id,node);
  for(const name of Object.keys(ALLOWLIST))assert.ok((await readFile(join(dir,STAGING,name))).length<=ALLOWLIST[name].maxBytes);
  assert.throws(()=>projectSummary(raw,{expectedSha:sha,diagnostics:{...diagnostic(),exit_code:2}}));
  const bad=diagnostic();bad.failures[0].message='PRIVATE_SENTINEL_456';
  await writeFile(join(dir,'test-results/windows-python-diagnostics.json'),JSON.stringify(bad));
  await assert.rejects(prepareEvidence(dir,{expectedSha:sha}));
});
