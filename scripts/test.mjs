import { spawnSync } from 'node:child_process';
import { pythonExecutable } from './platform-paths.mjs';

const p = spawnSync(pythonExecutable, ['-m', 'pytest', 'backend/tests', '-q'], { stdio: 'inherit', env: { ...process.env, IMT_OFFLINE: '1' } });
process.exit(p.status || 0);
