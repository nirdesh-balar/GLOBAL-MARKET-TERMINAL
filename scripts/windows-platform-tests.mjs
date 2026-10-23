import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPythonExecutable, getBackendExecutable } from './platform-paths.mjs';

await mkdir('test-results', { recursive: true });
let checks = 0;

const load = async (p) => {
  const b = await build({ entryPoints: [p], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64'));
};

const platform = await load('desktop/electron/platform.ts');

// 1. Packaged Windows backend executable path
const winPackaged = platform.backendExecutable('C:\\Program Files\\GLOBAL MARKET TERMINAL\\resources', true, 'win32');
assert.ok(winPackaged.endsWith(path.join('backend', 'imt-backend.exe')), 'Windows packaged backend must point to imt-backend.exe');
checks++;

// 2. Unpackaged Windows Python executable path
const winDevPython = platform.backendExecutable('C:\\GMT', false, 'win32');
assert.ok(winDevPython.endsWith(path.join('backend', '.venv', 'Scripts', 'python.exe')), 'Windows unpackaged python must point to Scripts\\python.exe');
checks++;

// 3. macOS backend executable paths preserved
const macPackaged = platform.backendExecutable('/app/Contents/Resources', true, 'darwin');
assert.equal(macPackaged, '/app/Contents/Resources/backend/imt-backend');
const macDevPython = platform.backendExecutable('/workspace', false, 'darwin');
assert.equal(macDevPython, '/workspace/backend/.venv/bin/python');
checks += 2;

// 4. Fullscreen accelerators
assert.equal(platform.fullscreenAccelerator('win32'), 'F11', 'Windows fullscreen accelerator must be F11');
assert.equal(platform.fullscreenAccelerator('darwin'), 'Control+Command+F', 'macOS fullscreen accelerator must be Control+Command+F');
checks += 2;

// 5. Supported platforms
assert.equal(platform.isSupportedPlatform('win32', 'x64'), true, 'Windows x64 must be supported');
assert.equal(platform.isSupportedPlatform('darwin', 'arm64'), true, 'macOS arm64 must be supported');
assert.equal(platform.isSupportedPlatform('win32', 'ia32'), false, '32-bit Windows must be rejected');
assert.equal(platform.isSupportedPlatform('darwin', 'x64'), false, 'Intel macOS must be rejected');
assert.equal(platform.isSupportedPlatform('linux', 'x64'), false, 'Linux must be rejected');
checks += 5;

// 6. Cross-platform path helpers in scripts/platform-paths.mjs
const winScriptPython = getPythonExecutable('C:\\project', 'win32');
assert.ok(winScriptPython.endsWith(path.join('backend', '.venv', 'Scripts', 'python.exe')));
const winScriptBackend = getBackendExecutable('C:\\project\\resources', true, 'win32');
assert.ok(winScriptBackend.endsWith(path.join('backend', 'imt-backend.exe')));
const macScriptPython = getPythonExecutable('/project', 'darwin');
assert.ok(macScriptPython.endsWith('backend/.venv/bin/python'));
checks += 3;

// 7. Profile containment validation
assert.equal(platform.containedProfile('profile', '.', path.posix), true);
assert.equal(platform.containedProfile('../escape', '.', path.posix), false);
assert.equal(platform.containedProfile('profile', '.', path.win32), true);
assert.equal(platform.containedProfile('..\\escape', '.', path.win32), false);
checks += 4;

// 8. Safe export stem cross-platform sanitization
assert.equal(platform.safeExportStem('CON'), 'CON');
assert.equal(platform.safeExportStem('Analysis_2026-10-23'), 'Analysis_2026-10-23');
assert.equal(platform.safeExportStem('bad/name\\with:chars*?'), 'bad_name_with_chars__');
checks += 3;

// 9. AlertNotifications status on Windows isolation (mocking Notification.isSupported)
import vm from 'node:vm';
const bundle = await build({ entryPoints: ['desktop/electron/alertNotifications.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['electron'] });
const mockElectron = {
  Notification: {
    isSupported: () => true,
  },
};
const ctx = {
  module: { exports: {} },
  exports: {},
  require: (name) => name === 'electron' ? mockElectron : name === 'node:path' ? path : null,
  process: { platform: 'win32' },
  Buffer,
  setInterval,
  clearInterval,
  Date,
};
vm.runInNewContext(bundle.outputFiles[0].text, ctx);
const { AlertNotifications } = ctx.module.exports;
const alerts = new AlertNotifications(async () => [], () => undefined);
const status = await alerts.status();
assert.equal(status.supported, true);
assert.equal(status.authorization, 'authorized');
assert.equal(status.alerts, 'enabled');
assert.equal(status.notification_center, 'enabled');
assert.equal(status.error, '');
checks++;

// Also test when Notification.isSupported() returns false on win32
mockElectron.Notification.isSupported = () => false;
const statusUnsupported = await alerts.status();
assert.equal(statusUnsupported.supported, false);
assert.equal(statusUnsupported.authorization, 'unsupported');
checks++;

await writeFile('test-results/windows-platform.json', JSON.stringify({
  host_platform: process.platform,
  checks,
  windows_win32_x64_supported: true,
  python_scripts_exe_supported: true,
  packaged_exe_supported: true,
  f11_fullscreen_accelerator: true,
  notification_bridge_isolated: true,
}, null, 2));

console.log('PASS ' + checks + ' Windows platform/security checks');
