import{createRequire}from'node:module';import{spawnSync}from'node:child_process';import{mkdirSync,copyFileSync,rmSync,readFileSync}from'node:fs';import{resolve}from'node:path';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build the Windows helper on Windows x64; cross-compilation is not supported.');
const require=createRequire(import.meta.url),electron=JSON.parse(readFileSync('node_modules/electron/package.json','utf8')).version;
const result=spawnSync(process.execPath,[require.resolve('node-gyp/bin/node-gyp.js'),'rebuild','--directory='+resolve('desktop/native/windows'),'--target='+electron,'--arch=x64','--dist-url=https://electronjs.org/headers'],{stdio:'inherit',shell:false,windowsHide:true});
if(result.status!==0)throw Error('Windows native integration build failed; install Visual Studio2022 C++ tools and the Windows10/11 SDK.');
mkdirSync('desktop/dist-electron',{recursive:true});copyFileSync('desktop/native/windows/build/Release/windows-integration.node','desktop/dist-electron/windows-integration.node');rmSync('desktop/dist-electron/notification-status.node',{force:true});
