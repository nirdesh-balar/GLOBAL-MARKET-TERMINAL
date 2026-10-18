import{spawnSync}from'node:child_process';import{existsSync,mkdirSync}from'node:fs';import{resolve}from'node:path';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 is required. Use the original Mac setup on macOS.');
mkdirSync('test-results',{recursive:true});
const run=(c,a)=>{const r=spawnSync(c,a,{stdio:'inherit',shell:false,windowsHide:true});if(r.status!==0)throw Error('Windows setup failed: '+c);};
// Python is a build-time tool only. The distributed app embeds its own interpreter.
if(!existsSync('backend/.venv/Scripts/python.exe'))run(process.env.GMT_BUILD_PYTHON||'python',['-m','venv','backend/.venv']);
run(resolve('backend/.venv/Scripts/python.exe'),['-m','pip','install','--requirement','backend/requirements-windows-lock.txt']);
run(resolve('backend/.venv/Scripts/python.exe'),['-m','pip','check']);
