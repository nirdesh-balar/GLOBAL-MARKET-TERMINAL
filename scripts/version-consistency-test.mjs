import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const EXPECTED_VERSION = '1.1.0-rc.4';
const EXPECTED_API_VERSION = '1.0.0';

console.log('=== Running Automated Version Consistency Test ===');
console.log(`Target Release Version: ${EXPECTED_VERSION}`);
console.log(`Target API Version:     ${EXPECTED_API_VERSION}`);

// 1. Check package.json
const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
assert.equal(pkg.version, EXPECTED_VERSION, `package.json version must be ${EXPECTED_VERSION}`);
console.log('✔ package.json version matches:', pkg.version);

// 2. Check desktop/src/brand.ts
const brandSource = await readFile(resolve('desktop/src/brand.ts'), 'utf8');
const brandMatch = brandSource.match(/export const RELEASE_VERSION\s*=\s*'([^']+)'/);
assert.ok(brandMatch, 'RELEASE_VERSION must be defined in desktop/src/brand.ts');
assert.equal(brandMatch[1], EXPECTED_VERSION, `desktop/src/brand.ts RELEASE_VERSION must be ${EXPECTED_VERSION}`);
console.log('✔ desktop/src/brand.ts RELEASE_VERSION matches:', brandMatch[1]);

// 3. Check backend/app/main.py health return
const backendMain = await readFile(resolve('backend/app/main.py'), 'utf8');
assert.ok(backendMain.includes(`version='${EXPECTED_VERSION}'`), `backend/app/main.py must contain version='${EXPECTED_VERSION}'`);
assert.ok(backendMain.includes(`api_version='${EXPECTED_API_VERSION}'`), `backend/app/main.py must contain api_version='${EXPECTED_API_VERSION}'`);
console.log('✔ backend/app/main.py health endpoint exposes matching version and api_version');

// 4. Check macOS build config artifact naming
const macConfig = require(resolve('build/public-mac.config.cjs'));
const macZipTemplate = macConfig.mac.artifactName;
const macZipResolved = macZipTemplate.replace('${version}', pkg.version).replace('${ext}', 'zip');
assert.equal(macZipResolved, `GLOBAL-MARKET-TERMINAL-${EXPECTED_VERSION}-mac-arm64.zip`);
console.log('✔ macOS zip artifact pattern resolves to:', macZipResolved);

// 5. Check Windows build config artifact naming
const winConfig = require(resolve('build/personal-win.config.cjs'));
const winExeTemplate = winConfig.win.artifactName;
const winExeResolved = winExeTemplate.replace('${version}', pkg.version).replace('${ext}', 'exe');
assert.equal(winExeResolved, `GLOBAL-MARKET-TERMINAL-Setup-${EXPECTED_VERSION}-win-x64.exe`);
console.log('✔ Windows setup artifact pattern resolves to:', winExeResolved);

// 6. Check package-lock.json
const lock = JSON.parse(await readFile(resolve('package-lock.json'), 'utf8'));
assert.equal(lock.version, EXPECTED_VERSION, `package-lock.json version must be ${EXPECTED_VERSION}`);
assert.equal(lock.packages[''].version, EXPECTED_VERSION, `package-lock.json packages[""].version must be ${EXPECTED_VERSION}`);
console.log('✔ package-lock.json version and packages[""].version match:', lock.version);

console.log('=== All Version Consistency Checks Passed Successfully ===');

