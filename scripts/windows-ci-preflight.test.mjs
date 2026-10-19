import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,copyFile,readFile,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {REPORTER_URL} from './windows-ci-preflight-run.mjs';
import {PREFLIGHTS,ROOT,PreflightObserver,sourceLocation,assertPreflight,unavailable,preflightMarkdown} from './windows-ci-preflight.mjs';
import {prepareEvidence,verifyEvidence,ALLOWLIST,STAGING,projectSummary} from './windows-ci-public.mjs';
const stage='reporting_tests',file=PREFLIGHTS[stage][0],SHA=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const source=(await readFile(resolve(ROOT,file),'utf8')).split(/\r?\n/);
const line=source.findIndex(s=>s.startsWith("test('failed tests are distinct"))+1;
const name='failed tests are distinct from infrastructure failures';
const location=sourceLocation(stage,resolve(ROOT,file),line,1);
function failure(error={failureType:'testCodeFailure',cause:{code:'ERR_ASSERTION',message:'PRIVATE_SENTINEL'}}){return {type:'test:fail',data:{file:resolve(ROOT,file),line,column:1,name,details:{error}}};}
function finish(observer,counts={tests:1,passed:0,failed:1,cancelled:0,skipped:0,todo:0},exit=1){
  observer.event({type:'test:summary',data:{counts,success:exit===0}});
  return {...observer.result(),exit_code:exit,wrapper_exit_code:exit};
}
function failed(){const o=new PreflightObserver(stage);o.event(failure());return finish(o);}
test('preflight literal identity is independently derived from reviewed source',()=>{
  const p=failed();assertPreflight(p,stage);assert.equal(p.failures[0].name,name);assert.equal(p.failures[0].file,file);
  assert.equal(p.failures[0].phase,'ASSERTION');assert.equal(p.failures[0].code,'ASSERTION_FAILED');
  assert.ok(!JSON.stringify(p).includes('PRIVATE_SENTINEL'));
  assert.match(preflightMarkdown(p,stage).join('\n'),/ASSERTION_FAILED/);
});
test('runtime names and diagnostics cannot enter public preflight evidence',()=>{
  const o=new PreflightObserver(stage),e=failure();e.data.name='PRIVATE_SENTINEL';o.event(e);
  o.event({type:'test:stdout',data:{message:'PRIVATE_SENTINEL'}});o.event({type:'test:stderr',data:{message:'PRIVATE_SENTINEL'}});
  o.event({type:'test:diagnostic',data:{message:'PRIVATE_SENTINEL'}});
  assert.ok(!JSON.stringify(finish(o)).includes('PRIVATE_SENTINEL'));
});
test('unrecognized locations are withheld instead of copying paths or test names',()=>{
  const o=new PreflightObserver(stage),e=failure();e.data.file='/Users/PRIVATE_SENTINEL/test.mjs';e.data.name='PRIVATE_SENTINEL';o.event(e);
  const p=finish(o);assertPreflight(p,stage);assert.equal(p.failures[0].identifier,'WITHHELD');assert.equal(p.failures[0].name,null);
  assert.ok(!JSON.stringify(p).includes('PRIVATE_SENTINEL'));
});
test('computed titles retain source position and case index with the title withheld',async()=>{
  const text=await readFile(resolve(ROOT,'scripts/windows-ci-diagnostics.test.mjs'),'utf8'),lines=text.split('\n');
  const n=lines.findIndex(s=>s.includes('])test(name+'))+1,c=lines[n-1].indexOf('test(')+1;
  const o=new PreflightObserver(stage);
  const data={file:resolve(ROOT,'scripts/windows-ci-diagnostics.test.mjs'),line:n,column:c,name:'PRIVATE_SENTINEL',details:{error:{failureType:'testCodeFailure',cause:{code:'ERR_ASSERTION'}}}};
  o.event({type:'test:pass',data});o.event({type:'test:fail',data});const p=finish(o,{tests:2,passed:1,failed:1,cancelled:0,skipped:0,todo:0});
  assertPreflight(p,stage);assert.equal(p.failures[0].name,null);assert.equal(p.failures[0].case_index,1);assert.equal(p.failures[0].identifier,'SOURCE');
});
test('setup and teardown classifications use only fixed Node hook wrapper messages',()=>{
  for(const [message,phase]of [['failed running before hook','SETUP'],['failed running beforeEach hook','SETUP'],['failed running after hook','TEARDOWN'],['failed running afterEach hook','TEARDOWN'],['PRIVATE_SENTINEL','UNKNOWN']]){
    const o=new PreflightObserver(stage);o.event(failure({failureType:'hookFailed',message,cause:{message:'PRIVATE_SENTINEL'}}));
    const p=finish(o);assertPreflight(p,stage);assert.equal(p.failures[0].phase,phase);assert.equal(p.failures[0].code,'HOOK_FAILED');assert.ok(!JSON.stringify(p).includes('PRIVATE_SENTINEL'));
  }
});
test('failure cap and omission counts cannot silently discard failures',()=>{
  const o=new PreflightObserver(stage);for(let i=0;i<10;i++)o.event(failure());
  const p=finish(o,{tests:10,passed:0,failed:10,cancelled:0,skipped:0,todo:0});assertPreflight(p,stage);assert.equal(p.failures.length,8);assert.equal(p.omitted_failures,2);
});
for(const [title,change]of [
  ['raw text',p=>p.failures[0].message='PRIVATE_SENTINEL'],
  ['unknown phase',p=>p.failures[0].phase='PRIVATE_SENTINEL'],
  ['unknown code',p=>p.failures[0].code='PRIVATE_SENTINEL'],
  ['forged name',p=>p.failures[0].name='PRIVATE_SENTINEL'],
  ['forged source hash',p=>p.failures[0].source_sha256='a'.repeat(64)],
  ['forged source line',p=>p.failures[0].line=1],
  ['hidden withheld name',p=>p.failures[0]={...p.failures[0],identifier:'WITHHELD'}],
  ['wrong phase for assertion',p=>p.failures[0].phase='SETUP'],
  ['inconsistent counts',p=>p.counts.tests=9],
  ['changed exit status',p=>p.wrapper_exit_code=2],
  ['false success',p=>{p.wrapper_exit_code=0;p.exit_code=0;}],
])test(title+' fails the preflight schema guard',()=>{const p=failed();change(p);assert.throws(()=>assertPreflight(p,stage));});
test('missing runtime report is explicit infrastructure failure without private fields',()=>{
  const p=unavailable(stage,null);assertPreflight(p,stage);assert.equal(p.counts,null);assert.equal(p.failures[0].code,'REPORT_UNAVAILABLE');assert.equal(p.wrapper_exit_code,1);
});
test('source identity must exist in the exact approved Git revision',()=>{
  assert.throws(()=>assertPreflight(failed(),stage,ROOT,'a'.repeat(40)),/approved Git revision/);
  assert.throws(()=>sourceLocation(stage,resolve(ROOT,file),line,1,ROOT,'not-a-revision'),/Exact preflight source revision/);
});
test('preflight failures survive four-file staging and independent verification',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gmt-preflight-evidence-'));await mkdir(join(dir,'test-results'));await mkdir(join(dir,'release-v1.0.0-global-market-terminal-windows'));
  const s={source_revision:SHA,host_platform:'win32',architecture:'x64',stages:{reporting_tests:{status:'TEST FAILURE',command:{exit_code:1}}}};
  await writeFile(join(dir,'release-v1.0.0-global-market-terminal-windows/WINDOWS-VERIFICATION.json'),JSON.stringify(s));
  await writeFile(join(dir,'test-results/windows-preflight-reporting_tests.json'),JSON.stringify(failed()));
  const r=await prepareEvidence(dir,{expectedSha:SHA,privateReportOutcome:'failure'});assert.equal(r.model.preflight.reporting_tests.failures[0].name,name);assert.equal(r.model.decision,'BLOCKED');
  assert.deepEqual((await readdir(join(dir,STAGING))).sort(),Object.keys(ALLOWLIST).sort());await verifyEvidence(dir,{expectedSha:SHA});
  assert.throws(()=>projectSummary(s,{expectedSha:SHA,preflight:{reporting_tests:{...failed(),wrapper_exit_code:2}}}));
  const modelPath=join(dir,STAGING,'WINDOWS-VERIFICATION.json'),model=JSON.parse(await readFile(modelPath));model.preflight.reporting_tests.failures[0].message='PRIVATE_SENTINEL';
  await writeFile(modelPath,JSON.stringify(model));await assert.rejects(verifyEvidence(dir,{expectedSha:SHA}));
});
async function fixture(startupFailure=false){
  const dir=await mkdtemp(join(tmpdir(),'gmt-preflight-child-'));await mkdir(join(dir,'scripts'));
  for(const f of ['windows-ci-preflight.mjs','windows-ci-preflight-run.mjs','windows-ci-preflight-reporter.mjs'])await copyFile(resolve(ROOT,'scripts',f),join(dir,'scripts',f));
  await writeFile(join(dir,file),startupFailure?"throw Error('PRIVATE_SENTINEL');\n":`import test from 'node:test';import assert from 'node:assert/strict';
test('controlled assertion',()=>assert.fail('PRIVATE_SENTINEL'));
test('controlled pass',()=>console.log('PRIVATE_SENTINEL'));
`);
  await writeFile(join(dir,'scripts/windows-ci-diagnostics.test.mjs'),`import test,{beforeEach} from 'node:test';
beforeEach(()=>{throw Error('PRIVATE_SENTINEL')});
test('controlled setup',()=>{});
`);
  await writeFile(join(dir,'scripts/windows-ci-preflight.test.mjs'),`import test,{afterEach} from 'node:test';
afterEach(()=>{throw Error('PRIVATE_SENTINEL')});
test('controlled teardown',()=>{});
`);
  // Exercise a standalone CLI, not a child attached to the enclosing Node test runner.
  const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;delete childEnv.SOURCE_REF;
  const r=spawnSync(process.execPath,[join(dir,'scripts/windows-ci-preflight-run.mjs'),stage],{cwd:dir,encoding:'utf8',shell:false,env:childEnv});
  assert.equal(r.status,1);assert.ok(!(r.stdout+r.stderr).includes('PRIVATE_SENTINEL'));assert.ok(!(r.stdout+r.stderr).includes(dir));
  const raw=await readFile(join(dir,'test-results/windows-preflight-reporting_tests.json'),'utf8');assert.ok(!raw.includes('PRIVATE_SENTINEL'));assert.ok(!raw.includes(dir));
  return {dir,r,p:JSON.parse(raw)};
}
test('real Node assertion and beforeEach afterEach hooks preserve exact counts and exit',async()=>{
  const {dir,p}=await fixture();assertPreflight(p,stage,dir);assert.equal(p.exit_code,1);assert.equal(p.wrapper_exit_code,1);
  assert.deepEqual(p.counts,{tests:4,passed:1,failed:3,cancelled:0,skipped:0,todo:0});
  assert.deepEqual(p.failures.map(r=>r.phase).sort(),['ASSERTION','SETUP','TEARDOWN']);
  assert.ok(p.failures.every(r=>r.identifier==='SOURCE'));
  assert.throws(()=>assertPreflight(p,stage)); // Disposable fixture source is not the public source.
});
test('real Node file startup failure withholds its runtime identifier',async()=>{
  const {dir,p}=await fixture(true);assertPreflight(p,stage,dir);assert.equal(p.exit_code,1);
  assert.ok(p.failures.some(r=>r.identifier==='WITHHELD'&&r.phase==='INFRASTRUCTURE'));
});
test('the actual reporter argument is a file URL for the fixed original module',async()=>{
  assert.equal(new URL(REPORTER_URL).protocol,'file:');
  assert.equal(fileURLToPath(REPORTER_URL),resolve(ROOT,'scripts/windows-ci-preflight-reporter.mjs'));
  const launcher=await readFile(resolve(ROOT,'scripts/windows-ci-preflight-run.mjs'),'utf8');
  assert.match(launcher,/'--test-reporter='\+REPORTER_URL/);
  assert.match(launcher,/pathToFileURL\(resolve\(ROOT,'scripts\/windows-ci-preflight-reporter\.mjs'\)\)\.href/);
});
test('Windows drive paths require file URL specifiers, including spaces and Unicode',async()=>{
  // Node URL conversion and ESM rejection on this host, not native Windows execution.
  const path='C:\\GMT workspace\\\u65e5\u672c\\reporter.mjs',url=pathToFileURL(path,{windows:true}).href;
  assert.equal(url,'file:///C:/GMT%20workspace/%E6%97%A5%E6%9C%AC/reporter.mjs');
  assert.equal(fileURLToPath(url,{windows:true}),path);
  assert.equal(new URL(path).protocol,'c:');
  await assert.rejects(import(path),{code:'ERR_UNSUPPORTED_ESM_URL_SCHEME'});
});
test('macOS file URLs preserve spaces, Unicode and URL-significant characters',()=>{
  const path='/tmp/GMT workspace/\u65e5\u672c/#reporter%.mjs',url=pathToFileURL(path,{windows:false}).href;
  assert.equal(url,'file:///tmp/GMT%20workspace/%E6%97%A5%E6%9C%AC/%23reporter%25.mjs');
  assert.equal(fileURLToPath(url,{windows:false}),path);
});
async function reporterFixture(mode){
  const parent=await mkdtemp(join(tmpdir(),'gmt-reporter-')),dir=join(parent,'space \u65e5\u672c');
  await mkdir(join(dir,'scripts'),{recursive:true});
  for(const f of ['windows-ci-preflight.mjs','windows-ci-preflight-run.mjs','windows-ci-preflight-reporter.mjs']){
    if(mode==='missing'&&f==='windows-ci-preflight-reporter.mjs')continue;
    await copyFile(resolve(ROOT,'scripts',f),join(dir,'scripts',f));
  }
  if(mode==='throws')await writeFile(join(dir,'scripts/windows-ci-preflight-reporter.mjs'),"throw Error(process.env.GMT_PRIVATE_BOOTSTRAP_SENTINEL+' ghp_PRIVATE_SENTINEL C:/Users/PRIVATE_SENTINEL');\n");
  if(mode==='silent7')await writeFile(join(dir,'scripts/windows-ci-preflight-reporter.mjs'),"process.stderr.write(process.env.GMT_PRIVATE_BOOTSTRAP_SENTINEL+' ERR_MODULE_NOT_FOUND');process.exit(7);\n");
  if(mode==='malformed')await writeFile(join(dir,'scripts/windows-ci-preflight-reporter.mjs'),"export default async function* reporter(events){for await(const event of events){}yield 'PRIVATE_SENTINEL';}\n");
  await writeFile(join(dir,'scripts/windows-ci-public.test.mjs'),"import test from 'node:test';test('controlled pass',()=>console.log('PRIVATE_SENTINEL'));\n");
  const env={...process.env,GMT_PREFLIGHT_STAGE:'privacy_tests',GMT_PRIVATE_BOOTSTRAP_SENTINEL:'PRIVATE_SENTINEL_ENV'};delete env.NODE_TEST_CONTEXT;delete env.SOURCE_REF;
  const args=['--test','--test-reporter='+pathToFileURL(join(dir,'scripts/windows-ci-preflight-reporter.mjs')).href,'scripts/windows-ci-public.test.mjs'];
  const direct=spawnSync(process.execPath,args,{cwd:dir,shell:false,encoding:'utf8',env});
  const wrapped=spawnSync(process.execPath,[join(dir,'scripts/windows-ci-preflight-run.mjs'),'privacy_tests'],{cwd:dir,shell:false,encoding:'utf8',env});
  assert.ok(!(wrapped.stdout+wrapped.stderr).includes('PRIVATE_SENTINEL'));
  assert.ok(!(wrapped.stdout+wrapped.stderr).includes(dir));
  const raw=await readFile(join(dir,'test-results/windows-preflight-privacy_tests.json'),'utf8'),p=JSON.parse(raw);
  assertPreflight(p,'privacy_tests',dir);
  assert.ok(!raw.includes('PRIVATE_SENTINEL'));assert.ok(!raw.includes(dir));assert.ok(!raw.includes('ERR_MODULE_NOT_FOUND'));
  return {dir,direct,wrapped,p};
}
test('Node loads the actual custom reporter through a file URL from a Unicode space path',async()=>{
  const {direct,wrapped,p}=await reporterFixture('actual');
  assert.equal(direct.status,0);assert.equal(wrapped.status,0);assert.equal(p.exit_code,0);
  assert.deepEqual(p.counts,{tests:1,passed:1,failed:0,cancelled:0,skipped:0,todo:0});
  assert.equal(p.status,'RECORDED');assert.equal(p.summary_success,true);
});
for(const mode of ['missing','throws','silent7'])test('reporter bootstrap '+mode+' preserves the real nonzero exit and withholds private output',async()=>{
  const {direct,wrapped,p}=await reporterFixture(mode);
  assert.ok(Number.isInteger(direct.status)&&direct.status>0);
  assert.equal(wrapped.status,direct.status);assert.equal(p.exit_code,direct.status);assert.equal(p.wrapper_exit_code,direct.status);
  if(mode==='silent7')assert.equal(p.exit_code,7);
  assert.equal(p.status,'UNAVAILABLE');assert.equal(p.counts,null);
  assert.deepEqual(p.failures,[{identifier:'WITHHELD',file:null,line:null,column:null,case_index:null,source_sha256:null,name:null,phase:'INFRASTRUCTURE',code:'REPORTER_NO_OUTPUT'}]);
});
test('malformed reporter output remains unavailable and cannot pass even if Node exits zero',async()=>{
  const {direct,wrapped,p}=await reporterFixture('malformed');
  assert.equal(direct.status,0);assert.equal(p.exit_code,0);assert.equal(wrapped.status,1);assert.equal(p.wrapper_exit_code,1);
  assert.equal(p.failures[0].code,'REPORT_UNAVAILABLE');assert.equal(p.counts,null);
});
test('reporter no-output code rejects success, source identity and a fabricated completed report',()=>{
  const p=unavailable('privacy_tests',7,'REPORTER_NO_OUTPUT');assertPreflight(p,'privacy_tests');
  for(const change of [q=>q.exit_code=0,q=>q.exit_code=null,q=>q.wrapper_exit_code=0,q=>q.failures[0].phase='ASSERTION',q=>q.failures[0].identifier='SOURCE',q=>q.status='RECORDED']){
    const q=structuredClone(p);change(q);assert.throws(()=>assertPreflight(q,'privacy_tests'));
  }
});
test('bootstrap evidence stays canonical, private and blocked in exactly four bounded text files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gmt-bootstrap-evidence-'));await mkdir(join(dir,'test-results'));await mkdir(join(dir,'release-v1.0.0-global-market-terminal-windows'));
  const p=unavailable('privacy_tests',7,'REPORTER_NO_OUTPUT');
  const s={source_revision:SHA,host_platform:'win32',architecture:'x64',decision:'READY FOR WINDOWS VALIDATION',stages:{privacy_tests:{status:'TEST FAILURE',command:{exit_code:7}}}};
  await writeFile(join(dir,'release-v1.0.0-global-market-terminal-windows/WINDOWS-VERIFICATION.json'),JSON.stringify(s));
  await writeFile(join(dir,'test-results/windows-preflight-privacy_tests.json'),JSON.stringify(p));
  // Neither raw local diagnostics nor environment values are enumerated by staging.
  await writeFile(join(dir,'test-results/windows-preflight-privacy_tests.log'),'PRIVATE_SENTINEL Error: stack trace C:/Users/PRIVATE_SENTINEL ghp_PRIVATE_SENTINEL');
  const r=await prepareEvidence(dir,{expectedSha:SHA,privateReportOutcome:'failure'});
  assert.equal(r.model.decision,'BLOCKED');assert.equal(r.model.preflight.privacy_tests.exit_code,7);
  assert.equal(r.model.preflight.privacy_tests.failures[0].code,'REPORTER_NO_OUTPUT');
  assert.equal(r.model.python.status,'NOT EXECUTED');assert.equal(r.model.preflight.reporting_tests,null);
  assert.deepEqual((await readdir(join(dir,STAGING))).sort(),Object.keys(ALLOWLIST).sort());
  for(const [name,{maxBytes}]of Object.entries(ALLOWLIST)){
    const data=await readFile(join(dir,STAGING,name));assert.ok(data.length<=maxBytes);assert.ok(!data.toString().includes('PRIVATE_SENTINEL'));
  }
  await verifyEvidence(dir,{expectedSha:SHA});
  assert.equal(projectSummary(s,{expectedSha:SHA,privateReportOutcome:'success'}).decision,'BLOCKED');
});
