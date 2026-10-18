import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
export const marker='phase6-stage6.7-G';
export const applicationRoot=resolve(process.argv.includes('--extracted')?'../../work/phase6-stage6.7-G/final-archive-extracted/Indian Market Terminal.app':'release-stage67g/mac-arm64/Indian Market Terminal.app');
export async function session(existing){
 const profile=existing??await mkdtemp(join(tmpdir(),'imt67g-session-'));
 assert.ok(profile.startsWith(join(tmpdir(),'imt67g-')),'Only this milestone’s explicit temporary profiles are allowed');
 const sidecar=join(dirname(applicationRoot),'.imt-stage67g-test-session.json');
 const guard={version:1,profiles:[profile],owner:process.pid,created_at:new Date().toISOString()};
 await writeFile(sidecar,JSON.stringify(guard),{mode:0o600});
 const env={...process.env,IMT_EXPECT_PREVIEW:marker,IMT_TEST_DATA_DIR:profile,IMT_OFFLINE:'1'};
 for(const key of ['IMT_UI_FIXTURE','IMT_F_UI','IMT_HYPERLIQUID_UI','IMT_STREAM_UI','IMT_E3B_UI','IMT_FAST_SCREENER_UI','IMT_PREVIEW_SEED_DB','IMT_DEV'])delete env[key];
 return {profile,env,sidecar,applicationRoot,executable:join(applicationRoot,'Contents/MacOS/Indian Market Terminal'),async release(){const own=JSON.parse(await readFile(sidecar,'utf8'));assert.equal(own.owner,process.pid);await writeFile(sidecar,JSON.stringify({...own,profiles:[],session_closed:true}),{mode:0o600});}};
}
