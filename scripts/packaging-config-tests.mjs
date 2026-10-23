import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
let checks = 0;

console.log('=== Running Windows Packaging Infrastructure Validation ===');

// 1. Load Windows Personal Packaging Configuration
const winConfigPath = resolve('build/personal-win.config.cjs');
const config = require(winConfigPath);
assert.ok(config, 'build/personal-win.config.cjs must export a valid configuration');
checks++;

// 2. Validate App & Product Identification
assert.equal(config.productName, 'GLOBAL MARKET TERMINAL', 'Product name must match original');
assert.equal(config.appId, 'local.globalmarket.terminal.personal', 'Personal appId must be set');
checks += 2;

// 3. Validate Target Platform and Architecture
assert.ok(config.win, 'Windows configuration block must be present');
assert.equal(Array.isArray(config.win.target), true);
const nsisTarget = config.win.target.find(t => t.target === 'nsis');
assert.ok(nsisTarget, 'NSIS target must be configured');
assert.ok(nsisTarget.arch.includes('x64'), 'x64 architecture must be targeted');
assert.equal(config.win.requestedExecutionLevel, 'asInvoker', 'No forced administrator privileges');
checks += 5;

// 4. Validate NSIS Installer Behavior
assert.ok(config.nsis, 'NSIS configuration block must be present');
assert.equal(config.nsis.oneClick, false, 'oneClick must be false for user-guided install');
assert.equal(config.nsis.perMachine, false, 'perMachine must be false for per-user installation');
assert.equal(config.nsis.deleteAppDataOnUninstall, false, 'UserData must not be deleted on uninstall');
assert.ok(config.nsis.artifactName.includes('x64'), 'Installer artifact name must include x64');
assert.ok(config.nsis.artifactName.includes('.exe'), 'Installer artifact must be .exe');
checks += 6;

// 5. Validate Exclusion of macOS Native Addon
const excludedNodes = config.files.find(f => f.includes('!desktop/dist-electron/*.node'));
assert.ok(excludedNodes, 'macOS notification-status.node must be explicitly excluded from Windows packaging');
assert.equal(config.asarUnpack.length, 0, 'No .node files should be unpacked on Windows');
checks += 2;

// 6. Validate Update and Publishing Restrictions
assert.equal(config.publish, null, 'Publishing must be disabled for personal edition');
assert.equal(config.extraMetadata.releaseChannel, 'personal-windows', 'Release channel must be personal-windows');
assert.equal(config.extraMetadata.updateReadiness, 'disabled-personal', 'Updates must be disabled in metadata');
assert.equal(config.extraMetadata.isPersonalBuild, true, 'isPersonalBuild must be set');
checks += 4;

// 7. Validate Backend ExtraResources Mapping
assert.ok(Array.isArray(config.extraResources), 'extraResources must be an array');
const backendResource = config.extraResources.find(r => r.to === 'backend');
assert.ok(backendResource, 'Backend resource mapping must exist');
assert.equal(backendResource.from, 'backend/dist-windows/imt-backend', 'Must map from backend/dist-windows/imt-backend');
checks += 3;

// 8. Validate Windows Multi-Resolution Icon File
const icoPath = resolve('desktop/assets/icon.ico');
const icoStat = await stat(icoPath);
assert.ok(icoStat.isFile(), 'icon.ico must exist as a file');
assert.ok(icoStat.size > 20000, 'icon.ico must contain multi-resolution image data');

const icoBuffer = await readFile(icoPath);
assert.equal(icoBuffer.readUInt16LE(0), 0, 'ICO reserved header must be 0');
assert.equal(icoBuffer.readUInt16LE(2), 1, 'ICO type must be 1 (icon)');
const imageCount = icoBuffer.readUInt16LE(4);
assert.ok(imageCount >= 5, `ICO must contain multiple resolutions (found: ${imageCount})`);
checks += 5;

// 9. Validate PyInstaller Windows Spec File
const specPath = resolve('backend/windows-backend.spec');
const specContent = await readFile(specPath, 'utf8');
assert.ok(specContent.includes('backend/launcher.py'), 'Spec must target backend/launcher.py');
assert.ok(specContent.includes('imt-backend'), 'Spec must name binary imt-backend');
assert.ok(specContent.includes('index-verification.json'), 'Spec must bundle index-verification.json');
assert.ok(specContent.includes('yfinance'), 'Spec must collect yfinance');
assert.ok(specContent.includes('websockets'), 'Spec must collect websockets');
assert.ok(specContent.includes('tzdata'), 'Spec must collect tzdata');
assert.ok(specContent.includes('exchange_calendars'), 'Spec must collect exchange_calendars');
assert.ok(specContent.includes('uvicorn'), 'Spec must collect uvicorn');
assert.ok(specContent.includes('target_arch=\'x86_64\''), 'Spec must target x86_64');
checks += 9;

// 10. Validate PowerShell Scripts Exist and Are Well-Formed
const buildScript = await readFile(resolve('scripts/build-windows-backend.ps1'), 'utf8');
assert.ok(buildScript.includes('windows-backend.spec'), 'Build script must invoke windows-backend.spec');
assert.ok(buildScript.includes('requirements-lock.txt'), 'Build script must check requirements-lock.txt');

const packageScript = await readFile(resolve('scripts/package-personal-win.ps1'), 'utf8');
assert.ok(packageScript.includes('personal-win.config.cjs'), 'Package script must reference personal-win.config.cjs');
assert.ok(packageScript.includes('--publish never'), 'Package script must specify --publish never');
assert.ok(packageScript.includes('Get-FileHash'), 'Package script must generate checksum');

const prereqScript = await readFile(resolve('scripts/check-windows-prereqs.ps1'), 'utf8');
assert.ok(prereqScript.includes('Operating System: Windows x64'), 'Prereq script must check Windows x64');
checks += 6;

// 11. Validate macOS public packaging remains completely unaffected
const macConfig = require(resolve('build/public-mac.config.cjs'));
assert.equal(macConfig.appId, 'local.globalmarket.terminal', 'macOS appId must remain unchanged');
assert.equal(macConfig.mac.icon, 'desktop/assets/icon.icns', 'macOS icon must remain icon.icns');
checks += 2;

console.log(`PASS ${checks} Windows packaging infrastructure and configuration checks`);
