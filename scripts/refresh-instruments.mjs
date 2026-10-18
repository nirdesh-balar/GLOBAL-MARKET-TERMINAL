import{pythonExecutable}from'./platform-paths.mjs';
import { spawnSync } from 'node:child_process';
const p = spawnSync(pythonExecutable, ['scripts/download_master.py'], { stdio: 'inherit' }); process.exit(p.status || 0);
