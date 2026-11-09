import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const appPath = '/Users/nirdeshbalar/Documents/GMT-Private-Release-1.1.0-rc.6/macOS/mac-arm64/GLOBAL MARKET TERMINAL.app';
const exe = join(appPath, 'Contents/MacOS/GLOBAL MARKET TERMINAL');
const backupDb = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL/terminal.sqlite3';

// 1. Create isolated profile in tmpdir
const profileDir = join(tmpdir(), 'gmt-rc6-live-desktop');
mkdirSync(profileDir, { recursive: true, mode: 0o700 });
copyFileSync(backupDb, join(profileDir, 'terminal.sqlite3'));

// 2. Create test lease so previewTestGuard allows isolated run
const sessionDir = join(dirname(appPath), '.gmt-stage7-test-sessions');
mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
const token = randomUUID();
const leaseFile = join(sessionDir, token + '.json');
writeFileSync(leaseFile, JSON.stringify({
  version: 1,
  marker: 'stable-v1.0.0',
  profile: profileDir,
  token,
  owner: process.pid
}), { mode: 0o600 });

console.log('Created lease:', leaseFile);
console.log('Profile Dir:  ', profileDir);
console.log('Launching REAL packaged rc.6 app on macOS desktop...');

const env = {
  ...process.env,
  IMT_TEST_DATA_DIR: profileDir,
  IMT_EXPECT_PREVIEW: 'stable-v1.0.0',
  IMT_TEST_LEASE: token,
  GMT_MAC_TEST_EXE: exe,
  IMT_AUTOMATED_TEST: '1'
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(exe, [], {
  env,
  detached: true,
  stdio: 'ignore'
});
child.unref();

console.log('Spawned PID:', child.pid);
