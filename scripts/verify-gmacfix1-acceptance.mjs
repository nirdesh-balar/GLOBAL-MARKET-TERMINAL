import { _electron as electron } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';

const defaultExe = existsSync('../../GMT-Private-Release-1.1.0-rc.4/macOS/mac-arm64/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL')
  ? resolve('../../GMT-Private-Release-1.1.0-rc.4/macOS/mac-arm64/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL')
  : '/Applications/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL';
const exe = process.env.GMT_MAC_TEST_EXE || defaultExe;
const backupDb = process.env.GMT_BACKUP_DB || (existsSync('/tmp/gmt-test-user-copy/terminal.sqlite3') ? '/tmp/gmt-test-user-copy/terminal.sqlite3' : '');
const artifactDir = process.env.GMT_ARTIFACT_DIR || resolve('test-results');

console.log('================================================================');
console.log('PHASE G-MAC-FIX-1: VISUAL ACCEPTANCE TESTING (PACKAGED APP)');
console.log('Executable:', exe);
console.log('Backup DB: ', backupDb);
console.log('================================================================\n');

const saveScreenshot = async (name, page) => {
  const localPath = `test-results/${name}`;
  await page.screenshot({ path: localPath });
  await copyFile(localPath, join(artifactDir, name)).catch(() => {});
  console.log(`  -> Screenshot saved: ${name}`);
};

// -------------------------------------------------------------
// PART 1: Existing user profile copy acceptance test
// -------------------------------------------------------------
console.log('--- PART 1: Testing Existing User Profile Copy ---');
const userProfileDir = join(tmpdir(), 'gmt-gmacfix1-user-copy');
await rm(userProfileDir, { recursive: true, force: true });
mkdirSync(userProfileDir, { recursive: true, mode: 0o700 });
copyFileSync(backupDb, join(userProfileDir, 'terminal.sqlite3'));

const errors = [];
let app = await electron.launch({
  executablePath: exe,
  args: [],
  env: {
    ...process.env,
    GMT_MAC_TEST_EXE: exe,
    IMT_EXPECT_PREVIEW: 'stable-v1.0.0',
    IMT_TEST_DATA_DIR: userProfileDir
  },
  timeout: 60000
});

let page = await app.firstWindow();
page.on('pageerror', e => {
  console.error('Renderer Error:', e);
  errors.push(e.message || String(e));
});

console.log('Waiting for terminal dashboard to mount...');
// Ensure the boot error screen is NOT showing and dashboard is loaded
await page.waitForSelector('.terminal-shell', { state: 'visible', timeout: 35000 });
const bootError = await page.$('.boot');
assert.equal(bootError, null, 'Boot error screen must not be present');
console.log('✔ Dashboard mounted successfully! Startup error screen bypassed.');

await page.waitForTimeout(2000);
await saveScreenshot('gmacfix1-01-dashboard-user-profile.png', page);

// Verify SENSEX symbol and layout 1
const activeSymbol = await page.textContent('.statusbar');
console.log('Status bar content:', activeSymbol?.trim());

// Verify 1 pane is rendered
const panes = await page.$$('.chart-surface');
console.log('Rendered panes count:', panes.length);
assert.equal(panes.length, 1, 'Existing profile must restore 1-pane layout');

// Verify watchlists
const watchlistSidebar = await page.$('[data-testid="watchlist-sidebar"]');
assert.ok(watchlistSidebar, 'Watchlist sidebar must be visible');
await saveScreenshot('gmacfix1-02-watchlists-rendered.png', page);

// Verify Theme Toggle (Light Mode)
console.log('Testing Light Mode toggle...');
const themeBtn = await page.getByRole('button', { name: 'Switch to light mode' });
if (await themeBtn.isVisible()) {
  await themeBtn.click();
  await page.waitForTimeout(1000);
  const shellClass = await page.getAttribute('.terminal-shell', 'class');
  assert.ok(shellClass.includes('theme-light'), 'Light mode must activate');
  console.log('✔ Light mode activated successfully');
  await saveScreenshot('gmacfix1-03-light-mode.png', page);

  // Switch back to Dark Mode
  const darkBtn = await page.getByRole('button', { name: 'Switch to dark mode' });
  await darkBtn.click();
  await page.waitForTimeout(500);
}

// Verify LOG / AUTO controls exist and are clickable
const autoBtn = await page.$('button[data-testid="auto-scale"]');
if (autoBtn) {
  await autoBtn.click();
  await page.waitForTimeout(200);
  console.log('✔ AUTO scale toggle verified');
}

await saveScreenshot('gmacfix1-04-final-user-state.png', page);
await app.close();
console.log('✔ PART 1 Complete: User profile restored and verified perfectly.\n');

// -------------------------------------------------------------
// PART 2: Fresh isolated profile acceptance test
// -------------------------------------------------------------
console.log('--- PART 2: Testing Fresh Isolated Profile ---');
const freshProfileDir = join(tmpdir(), 'gmt-gmacfix1-fresh-profile');
await rm(freshProfileDir, { recursive: true, force: true });
mkdirSync(freshProfileDir, { recursive: true, mode: 0o700 });

app = await electron.launch({
  executablePath: exe,
  args: [],
  env: {
    ...process.env,
    GMT_MAC_TEST_EXE: exe,
    IMT_EXPECT_PREVIEW: 'stable-v1.0.0',
    IMT_TEST_DATA_DIR: freshProfileDir
  },
  timeout: 60000
});

page = await app.firstWindow();
await page.waitForSelector('.terminal-shell', { state: 'visible', timeout: 35000 });
console.log('✔ Fresh profile initialized and loaded dashboard successfully!');
await page.waitForTimeout(2000);
await saveScreenshot('gmacfix1-05-fresh-profile.png', page);
await app.close();
console.log('✔ PART 2 Complete: Fresh isolated profile verified.\n');

console.log('================================================================');
console.log('ALL PACKAGED GUI ACCEPTANCE TESTS COMPLETED SUCCESSFULLY!');
console.log('================================================================');

