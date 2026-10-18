import {STABLE_MARKER} from '../src/brand';
import {containedProfile,leaseDirectory} from './platform';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {tmpdir}from'node:os';

// A temporary sidecar guard is created by the G verification launcher. It is
// outside the signed bundle and does not affect normal release launches.
export function previewTestGuard(marker:unknown,resourcesPath:string,env:NodeJS.ProcessEnv):string|undefined {
 const automated=!!(env.IMT_AUTOMATED_TEST||env.IMT_EXPECT_PREVIEW||env.IMT_UI_FIXTURE||env.IMT_TEST_DATA_DIR||env.GMT_TEST_APP_DATA_ROOT);
 if(env.GMT_TEST_APP_DATA_ROOT){try{if(!isAbsolute(env.GMT_TEST_APP_DATA_ROOT)||!containedProfile(realpathSync(env.GMT_TEST_APP_DATA_ROOT),realpathSync(tmpdir())))return 'Invalid temporary appData root';}catch{return 'Invalid temporary appData root';}}
 if(automated){try{const p=env.IMT_TEST_DATA_DIR;if(!p||!isAbsolute(p)||!containedProfile(realpathSync(p),realpathSync(tmpdir())))return 'Automated launch requires an existing unique temporary profile; no normal-profile fallback';}catch{return 'Invalid temporary profile; no profile opened';}}
 if(marker==='phase6-stage6.7-G1'||marker===STABLE_MARKER){
  const dir=marker===STABLE_MARKER?leaseDirectory(resourcesPath):resolve(resourcesPath,'../../..','.imt-stage67g1-test-sessions');
  if(!existsSync(dir)&&!automated)return;
  try{
   const token=env.IMT_TEST_LEASE;
   if(env.IMT_EXPECT_PREVIEW!==marker||!token||!/^[a-f0-9-]{36}$/.test(token))return 'Application verification requires an explicit identity and test lease';
   const lease=JSON.parse(readFileSync(resolve(dir,token+'.json'),'utf8'));
   if(lease.version!==1||lease.marker!==marker||lease.token!==token||!env.IMT_TEST_DATA_DIR||realpathSync(lease.profile)!==realpathSync(env.IMT_TEST_DATA_DIR))return 'Application test lease/profile mismatch';
  }catch{return 'Invalid application test lease; no profile opened';}
  return;
 }
 if(marker!=='phase6-stage6.7-G')return;
 const file=resolve(resourcesPath,'../../..','.imt-stage67g-test-session.json');
 if(!existsSync(file))return;
 try {
  const guard=JSON.parse(readFileSync(file,'utf8'));
  const profile=env.IMT_TEST_DATA_DIR;
  if(guard.version!==1||!Array.isArray(guard.profiles)||guard.profiles.length>8||env.IMT_EXPECT_PREVIEW!==marker||!profile||!isAbsolute(profile))return 'G verification session requires an explicitly approved temporary profile';
  const actual=realpathSync(profile);
  if(!guard.profiles.some((p:unknown)=>typeof p==='string'&&isAbsolute(p)&&realpathSync(p)===actual))return 'G temporary profile is not approved for this verification session';
 }catch{return 'Invalid G verification guard; no profile opened';}
}
