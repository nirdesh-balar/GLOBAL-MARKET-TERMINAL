import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
const server = await createServer({ configFile: 'desktop/vite.config.ts' });
await server.listen();
await build({ entryPoints: ['desktop/electron/main.ts', 'desktop/electron/preload.ts'], outdir: 'desktop/dist-electron', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', external: ['electron', 'ws'] });
const electron = spawn('node_modules/.bin/electron', ['.'], { stdio: 'inherit', env: { ...process.env, IMT_DEV: '1' } });
let stopped = false;
async function stop() { if (stopped) return; stopped = true; electron.kill('SIGTERM'); await server.close(); }
electron.on('exit', async code => { await stop(); process.exit(code || 0); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
console.log('Development terminal running. React hot reload is enabled.');
