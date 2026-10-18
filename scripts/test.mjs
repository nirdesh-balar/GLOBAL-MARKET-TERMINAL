import { spawnSync } from 'node:child_process';
const p = spawnSync(process.platform==='win32'?'backend/.venv/Scripts/python.exe':'backend/.venv/bin/python', ['-m', 'pytest', 'backend/tests', '-q'], { stdio: 'inherit', env: { ...process.env, IMT_OFFLINE: '1' } });
process.exit(p.status || 0);
