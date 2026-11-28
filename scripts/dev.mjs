import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
const server = await createServer({ configFile: 'desktop/vite.config.ts' });
await server.listen();
await import('./build-electron.mjs');
const electronBin = process.platform === 'win32' ? path.join('node_modules', '.bin', 'electron.cmd') : 'node_modules/.bin/electron';
const childEnv = { ...process.env, IMT_DEV: '1' };
delete childEnv.ELECTRON_RUN_AS_NODE;
const electron = spawn(electronBin, ['.'], { stdio: 'inherit', env: childEnv, shell: process.platform === 'win32' });
let stopped = false;
async function stop() { if (stopped) return; stopped = true; electron.kill('SIGTERM'); await server.close(); }
electron.on('exit', async code => { await stop(); process.exit(code || 0); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
console.log('Development terminal running. React hot reload is enabled.');
