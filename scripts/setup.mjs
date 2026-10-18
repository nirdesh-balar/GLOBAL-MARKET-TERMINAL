import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const run = (cmd, args, env = {}) => { const p = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } }); if (p.status !== 0) process.exit(p.status || 1); };
mkdirSync('.runtime', { recursive: true });
if (!existsSync('backend/.venv/bin/python')) {
  // uv provides signed upstream Python distributions, independent of Homebrew/Conda.
  const uv = process.env.IMT_UV || resolve('.runtime/uv/bin/uv');
  if (!existsSync(uv)) run('python3', ['-m', 'pip', 'install', '--target', '.runtime/uv', 'uv']);
  const env = { UV_PYTHON_INSTALL_DIR: resolve('.runtime/python'), UV_CACHE_DIR: resolve('.runtime/cache') };
  run(uv, ['python', 'install', '3.11'], env);
  run(uv, ['venv', 'backend/.venv', '--python', '3.11', '--seed'], env);
}
run(resolve('backend/.venv/bin/python'), ['-m', 'pip', 'install', '-r', existsSync('backend/requirements-lock.txt') ? 'backend/requirements-lock.txt' : 'backend/requirements.txt']);
console.log('Python backend ready. Run npm install, then npm run dev.');
