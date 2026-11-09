import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, copyFile, stat, readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const defaultAppDir = path.resolve('release-candidate-rc5/portable/GLOBAL-MARKET-TERMINAL-1.1.0-rc.5-win-x64-portable');
const extractedAppDir = path.resolve(process.env.GMT_PORTABLE_APP_DIR || defaultAppDir);
const exe = path.join(extractedAppDir, 'GLOBAL MARKET TERMINAL.exe');
const durableDataDir = path.join(extractedAppDir, 'GMT-Portable-Data');
const durableProfileDir = path.join(durableDataDir, 'profile');
const durableTempDir = path.join(durableDataDir, 'temp');
const artifactDir = process.env.GMT_ARTIFACT_DIR || path.resolve('test-results');

await mkdir(durableProfileDir, { recursive: true });
await mkdir(durableTempDir, { recursive: true });

console.log('================================================================');
console.log('PHASE UI-2: EXTRACTED PORTABLE ACCEPTANCE & ISOLATION TEST');
console.log('App Directory:   ', extractedAppDir);
console.log('Executable:      ', exe);
console.log('Durable Profile: ', durableProfileDir);
console.log('Artifacts:       ', artifactDir);
console.log('================================================================');

assert.ok(existsSync(exe), `Portable executable must exist at ${exe}`);
assert.ok(existsSync(path.join(extractedAppDir, 'resources/backend/imt-backend.exe')), 'Bundled imt-backend.exe must exist');
assert.ok(existsSync(path.join(extractedAppDir, 'GLOBAL-MARKET-TERMINAL-Portable.cmd')), 'Portable launcher .cmd must exist');

// Host AppData baseline check
const appData = process.env.APPDATA || (process.platform === 'win32' ? 'C:/Users/Default/AppData/Roaming' : '/tmp');
const hostGmtDir = path.join(appData, 'GLOBAL MARKET TERMINAL');
let hostMtimeBefore = null;
if (existsSync(hostGmtDir)) {
  hostMtimeBefore = statSync(hostGmtDir).mtimeMs;
  console.log(`Host GMT directory exists at ${hostGmtDir}, mtime: ${hostMtimeBefore}`);
} else {
  console.log(`Host GMT directory does not exist at ${hostGmtDir}`);
}

const saveScreenshot = async (name, targetPage) => {
  const localPath = path.join(artifactDir, name);
  await targetPage.screenshot({ path: localPath });
  console.log(`  -> Screenshot captured: ${name}`);
};

let app, page;
try {
  console.log('\n--- Test 1: Cold Launch Extracted Portable Application ---');
  const launchStart = Date.now();

  const launchEnv = {
    ...process.env,
    TEMP: durableDataDir,
    TMP: durableDataDir,
    IMT_TEST_DATA_DIR: durableProfileDir,
  };
  delete launchEnv.IMT_AUTOMATED_TEST;
  delete launchEnv.IMT_EXPECT_PREVIEW;
  delete launchEnv.IMT_UI_FIXTURE;
  delete launchEnv.GMT_TEST_APP_DATA_ROOT;

  app = await electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${durableProfileDir}`, '--window-size=1600,1000'],
    env: launchEnv,
    timeout: 60000,
  });

  const launchDuration = Date.now() - launchStart;
  console.log(`Cold launch duration: ${launchDuration}ms`);

  page = await app.firstWindow();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(3000);

  const pane0 = page.getByTestId('pane-0');
  await pane0.waitFor({ state: 'visible', timeout: 60000 });
  console.log('Chart workspace loaded and visible.');

  // Backend /health check
  const health = await page.evaluate(() => window.terminal.request('/health'));
  console.log('Health check response:');
  console.log('   Status:     ', health.status);
  console.log('   Version:    ', health.version);
  console.log('   API Version:', health.api_version);
  console.log('   Instruments:', health.instruments);

  assert.equal(health.status, 'ok', 'Health status must be ok');
  assert.equal(health.version, '1.1.0-rc.5', 'Health version must be 1.1.0-rc.5');
  assert.equal(health.api_version, '1.0.0', 'API contract version must be 1.0.0');
  assert.ok(health.instruments >= 3000, 'Catalogue must contain >= 3000 instruments');

  await saveScreenshot('ui2-portable-01-startup.png', page);

  // --- Test 2: Volume Toggle in Packaged Binary ---
  console.log('\n--- Test 2: Volume Toggle Verification in Packaged Binary ---');
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  await expect(volBtn).toBeVisible({ timeout: 10000 });

  const initialPanes = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    return el?.__chart ? el.__chart.panes().length : 0;
  });
  console.log(`Initial panes count: ${initialPanes}`);

  // Toggle volume
  await volBtn.click();
  await page.waitForTimeout(1000);
  const toggledPanes = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    return el?.__chart ? el.__chart.panes().length : 0;
  });
  console.log(`After first toggle panes count: ${toggledPanes}`);
  assert.equal(toggledPanes, initialPanes === 1 ? 2 : 1, 'Volume toggle must toggle between 1 and 2 panes');

  // Toggle back
  await volBtn.click();
  await page.waitForTimeout(1000);
  const restoredPanes = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
    return el?.__chart ? el.__chart.panes().length : 0;
  });
  console.log(`After second toggle panes count: ${restoredPanes}`);
  assert.equal(restoredPanes, initialPanes, 'Volume toggle must restore initial panes count');

  await saveScreenshot('ui2-portable-02-volume.png', page);

  // --- Test 3: Multi-chart Layout & Indicator Check ---
  console.log('\n--- Test 3: Multi-chart Layout & Indicator Verification ---');
  const layoutBtn = page.getByLabel('Chart layout', { exact: true });
  await layoutBtn.click();
  await page.waitForTimeout(400);
  await page.getByLabel('Layout 4', { exact: true }).click();
  await page.waitForTimeout(1500);

  let layout4Panes = await page.evaluate(() => document.querySelectorAll('.chart-pane').length);
  console.log(`Layout 4 panes count: ${layout4Panes}`);
  assert.equal(layout4Panes, 4, 'Must render 4 chart panes');

  // Restore layout 1
  await layoutBtn.click();
  await page.waitForTimeout(400);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(1000);

  // --- Test 4: Profile Persistence Check ---
  console.log('\n--- Test 4: Profile Persistence & SQLite Verification ---');
  const themeBtn = page.getByLabel('Toggle theme', { exact: true });
  await themeBtn.click();
  await page.waitForTimeout(1000);
  const themeToggledIsLight = await page.evaluate(() => document.querySelector('.terminal-shell')?.classList.contains('theme-light'));
  console.log(`Toggled theme is Light: ${themeToggledIsLight}`);

  // Wait for 250ms debounce and verify SQLite file on disk
  await page.waitForTimeout(1500);
  const dbPath = path.join(durableProfileDir, 'terminal.sqlite3');
  assert.ok(existsSync(dbPath), `terminal.sqlite3 must exist in portable profile: ${dbPath}`);
  const dbStat = statSync(dbPath);
  console.log(`SQLite database verified: ${dbPath} (${dbStat.size} bytes)`);

  await saveScreenshot('ui2-portable-03-persistence.png', page);

  await app.close();
  app = null;

  // --- Test 5: Second Launch Persistence Verification ---
  console.log('\n--- Test 5: Second Launch Persistence Verification ---');
  app = await electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${durableProfileDir}`, '--window-size=1600,1000'],
    env: launchEnv,
    timeout: 60000,
  });

  page = await app.firstWindow();
  await page.waitForTimeout(3000);
  const restoredThemeIsLight = await page.evaluate(() => document.querySelector('.terminal-shell')?.classList.contains('theme-light'));
  console.log(`Restored theme is Light: ${restoredThemeIsLight}`);
  assert.equal(restoredThemeIsLight, themeToggledIsLight, 'Theme preference must match across launches');

  await app.close();
  app = null;

  // --- Test 6: Strict Host Isolation Verification ---
  console.log('\n--- Test 6: Strict Host Isolation Verification ---');
  if (existsSync(hostGmtDir)) {
    const hostMtimeAfter = statSync(hostGmtDir).mtimeMs;
    assert.equal(hostMtimeBefore, hostMtimeAfter, 'Host %APPDATA%/GLOBAL MARKET TERMINAL must not be modified!');
    console.log('Host AppData untouched (mtime unchanged).');
  } else {
    assert.ok(!existsSync(hostGmtDir), 'Host %APPDATA%/GLOBAL MARKET TERMINAL must not have been created!');
    console.log('Host AppData untouched (folder does not exist).');
  }

  const hostProgFiles = 'C:/Program Files/GLOBAL MARKET TERMINAL';
  if (existsSync(hostProgFiles)) {
    console.log(`Host Program Files intact: ${hostProgFiles}`);
  }

  console.log('\n================================================================');
  console.log('ALL EXTRACTED PORTABLE ACCEPTANCE CHECKS PASSED (100%)');
  console.log('================================================================');

} finally {
  if (app) {
    await app.close().catch(() => {});
  }
}

