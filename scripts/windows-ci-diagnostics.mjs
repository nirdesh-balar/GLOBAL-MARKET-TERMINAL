// Public node IDs must match a separately reviewed collection of tracked test sources.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(readFileSync(new URL('./windows-pytest-nodes.json',import.meta.url),'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const BASE=/^backend\/tests\/test_[A-Za-z0-9_]+\.py::(?:Test[A-Za-z0-9_]+::)?test_[A-Za-z0-9_]+$/;
const EXCEPTIONS=['AssertionError','ValueError','TypeError','RuntimeError','OSError','PermissionError','FileNotFoundError','TimeoutError','UnicodeEncodeError','UnicodeDecodeError','OperationalError','IntegrityError','ImportError','ModuleNotFoundError','KeyError','IndexError','UNKNOWN'];
const CODES=['OTHER_FAILURE','ENV_VAR_LENGTH_LIMIT','ACCESS_DENIED','FILE_NOT_FOUND','FILE_LOCKED','ENCODING_ERROR','SQLITE_OPERATIONAL_ERROR','ASSERTION_FAILED'];
const integer=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
function keys(x,names){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join('|')!==names.sort().join('|'))throw Error('Diagnostic schema rejected');}
export function assertDiagnostics(d,reviewed=catalog){
  if(d===null)return;
  keys(d,['schema_version','status','runtime','exit_code','counts','rejected_identifiers','omitted_failures','environment','failures']);
  if(![1,2].includes(d.schema_version)||!['RECORDED','INTERNAL_ERROR'].includes(d.status)||!integer(d.exit_code)||d.exit_code>255)throw Error('Invalid diagnostic status');
  keys(d.runtime,['platform','architecture','python','windows_version']);
  if(!['win32','darwin','linux'].includes(d.runtime.platform)||!['x64','arm64','ia32'].includes(d.runtime.architecture)||typeof d.runtime.python!=='string'||!/^3\.\d{1,2}\.\d{1,2}$/.test(d.runtime.python))throw Error('Invalid runtime');
  if(d.runtime.platform==='win32'?(typeof d.runtime.windows_version!=='string'||!/^\d{1,2}\.\d{1,2}\.\d{4,6}$/.test(d.runtime.windows_version)):d.runtime.windows_version!==null)throw Error('Invalid Windows version');
  keys(d.counts,['passed','failed','error','skipped']);
  keys(d.environment,['any_value_over_limit','path_over_limit','pytest_current_test_over_limit','current_test_assignment_over_limit']);
  if(!Object.values(d.counts).every(integer)||!Object.values(d.environment).every(x=>typeof x==='boolean')||!integer(d.rejected_identifiers)||!integer(d.omitted_failures)||!Array.isArray(d.failures)||d.failures.length>32)throw Error('Invalid diagnostic counts');
  if(d.failures.length+d.rejected_identifiers+d.omitted_failures<d.counts.failed+d.counts.error)throw Error('Missing failure diagnostics');
  const unique=new Set();
  for(const row of d.failures){
    keys(row,['test','case_index','node_sha256','node_id','phase','outcome','exception','code',...(d.schema_version===2?['checkpoint']:[])]);
    if(typeof row.test!=='string'||!BASE.test(row.test)||!integer(row.case_index)||reviewed.nodes[row.test]?.[row.case_index]!==row.node_sha256)throw Error('Test absent from reviewed public collection');
    if(row.node_id!==null&&(typeof row.node_id!=='string'||row.node_id.length>512||/[^\x20-\x7e]/.test(row.node_id)||row.node_id.split('[',1)[0]!==row.test||hash(row.node_id)!==row.node_sha256))throw Error('Unreviewed node ID rejected');
    if(!['setup','call','teardown'].includes(row.phase)||row.outcome!==(row.phase==='call'?'failed':'error')||!EXCEPTIONS.includes(row.exception)||!CODES.includes(row.code))throw Error('Uncontrolled failure classification');
    if(row.code==='ENV_VAR_LENGTH_LIMIT'&&row.exception!=='ValueError')throw Error('Invalid environment diagnostic');
    if(d.schema_version===2&&row.checkpoint!==null){
      if(typeof row.checkpoint!=='string'||!/^[A-Z][A-Z0-9_]{1,63}$/.test(row.checkpoint)||row.phase!=='call'||row.exception!=='AssertionError'||row.code!=='ASSERTION_FAILED'||
        !reviewed.checkpoints?.[row.test]?.some(label=>label.code===row.checkpoint))throw Error('Unreviewed assertion checkpoint');
    }
    const key=row.node_sha256+':'+row.phase;if(unique.has(key))throw Error('Duplicate failure diagnostic');unique.add(key);
  }
  if(d.exit_code===0&&(d.status!=='RECORDED'||d.counts.failed||d.counts.error||d.failures.length||d.rejected_identifiers||d.omitted_failures))throw Error('Failures cannot pass');
}
export function projectDiagnostics(raw){
  if(raw===null||raw===undefined)return null;
  // Strict validation rather than dropping unknown nested fields or copying free text.
  assertDiagnostics(raw);return structuredClone(raw);
}
export function diagnosticMarkdown(d){
  if(d===null)return ['Python failure diagnostics: NOT RECORDED.'];
  return ['Python observer: '+d.status+'; actual '+d.runtime.platform+' '+d.runtime.architecture+' CPython '+d.runtime.python+'; Windows version '+(d.runtime.windows_version??'NOT APPLICABLE')+'.',
    'Unique pytest items: '+Object.entries(d.counts).map(([k,v])=>k+'='+v).join(', ')+'. JUnit cases may count teardown separately.',
    'Environment limit flags: '+Object.entries(d.environment).map(([k,v])=>k+'='+v).join(', ')+'.',
    'Withheld unknown identifiers: '+d.rejected_identifiers+'; additional failures beyond cap: '+d.omitted_failures+'.',
    ...d.failures.map(r=>'- `'+(r.node_id??r.test+' [oversize ID withheld; case '+r.case_index+'; SHA256 '+r.node_sha256+']').replace(/[&<>`]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','`':'&#96;'}[c]))+'` | '+r.phase+' | '+r.outcome+' | '+r.exception+' | '+r.code+(d.schema_version===2?' | checkpoint '+(r.checkpoint??'NOT RECORDED'):''))];
}
