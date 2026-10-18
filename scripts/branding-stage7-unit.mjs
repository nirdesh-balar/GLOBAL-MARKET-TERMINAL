import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,symlink} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {validateLaunch} from './isolated-electron.mjs';
const output=await build({entryPoints:['desktop/electron/previewTestGuard.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {previewTestGuard:guard}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const root=await mkdtemp(join(tmpdir(),'gmt-stage7-unit-')),resources=join(root,'GLOBAL MARKET TERMINAL.app/Contents/Resources'),profile=join(root,'GLOBAL MARKET TERMINAL'),dir=join(root,'.gmt-stage7-test-sessions'),marker='stable-v1.0.0',token=crypto.randomUUID();
await mkdir(resources,{recursive:true});await mkdir(profile);await mkdir(dir);let checks=0;
for(const env of [{},{IMT_AUTOMATED_TEST:'1'},{IMT_EXPECT_PREVIEW:'wrong',IMT_TEST_DATA_DIR:profile},{IMT_EXPECT_PREVIEW:marker,IMT_TEST_DATA_DIR:profile,IMT_TEST_LEASE:token}]){assert.ok(guard(marker,resources,env));checks++;}
await writeFile(join(dir,token+'.json'),JSON.stringify({version:1,marker,profile,token}));const env={IMT_EXPECT_PREVIEW:marker,IMT_TEST_DATA_DIR:profile,IMT_TEST_LEASE:token,GMT_TEST_APP_DATA_ROOT:root};assert.equal(guard(marker,resources,env),undefined);checks++;
assert.ok(guard(marker,resources,{...env,GMT_TEST_APP_DATA_ROOT:homedir()}));checks++;
await symlink(homedir(),join(root,'escape'));assert.ok(guard(marker,resources,{...env,IMT_TEST_DATA_DIR:join(root,'escape')}));checks++;
await assert.rejects(validateLaunch({env,executablePath:'release-stage67g1/mac-arm64/Indian Market Terminal.app/Contents/MacOS/Indian Market Terminal',args:[]}));checks++;
const main=await readFile('desktop/electron/main.ts','utf8');assert.ok(main.includes("if(stable&&(!process.env.IMT_TEST_DATA_DIR||process.env.GMT_TEST_APP_DATA_ROOT))"));assert.ok(main.includes("app.setName(PRODUCT_NAME)"));checks+=2;
await writeFile('test-results/stage7-branding-unit.json',JSON.stringify({checks,stable_guards:true,old_preview_rejected:true,temporary_default_profile_path:true},null,2));console.log('PASS stable branding/guard checks',checks);
