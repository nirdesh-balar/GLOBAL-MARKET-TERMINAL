import { _electron as electron } from './isolated-electron.mjs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const exe = '/tmp/gmt-r1-verified-install-test/GLOBAL MARKET TERMINAL.app/Contents/MacOS/GLOBAL MARKET TERMINAL';
const profile = join(tmpdir(), 'gmt-r1-final-profile');
await rm(profile, { recursive: true, force: true });
await mkdir(profile, { recursive: true });

console.log('Launching final acceptance application at:', exe);

const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: {
    ...process.env,
    GMT_MAC_TEST_EXE: exe,
    IMT_EXPECT_PREVIEW: 'stable-v1.0.0',
    IMT_TEST_DATA_DIR: profile,
    IMT_UI_FIXTURE: '1'
  }
});

const page = await app.firstWindow();
await page.waitForTimeout(3000);

// 1. Switch to Single chart layout
await page.getByLabel('Chart layout', { exact: true }).click();
await page.getByLabel('Layout 1', { exact: true }).click();
await page.waitForTimeout(500);

// 2. Switch to Indian Indices watchlist
await page.getByLabel('Active watchlist', { exact: true }).selectOption('indices');
await page.waitForTimeout(500);

// 3. Click SENSEX in watchlist
const sensexRow = page.locator('.watch-row').filter({ hasText: /SENSEX|\^BSESN/i }).first();
await sensexRow.click();
await page.waitForTimeout(1000);

// 4. Select 15m timeframe in header
const tf15m = page.getByLabel('Active timeframe 15m', { exact: true });
if (await tf15m.isVisible()) {
  await tf15m.click();
} else {
  // If in dropdown or toolbar
  await page.getByLabel('Active timeframe 15m').click();
}
await page.waitForTimeout(1000);

// 5. Ensure Cursor tool is active
await page.getByLabel('Cursor / crosshair', { exact: true }).click();

// 6. Ensure LOG and AUTO are ON in pane 0
const pane0 = page.getByTestId('pane-0');
const canvas0 = pane0.locator('.chart-canvas');
const mode = await canvas0.getAttribute('data-price-mode');
if (mode !== '1') {
  await pane0.getByLabel('LOG pane 0', { exact: true }).click();
}
const autoBtn = pane0.getByLabel('AUTO pane 0', { exact: true });
if (!((await autoBtn.getAttribute('class')) || '').includes('active')) {
  await autoBtn.click();
}

const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
await page.screenshot({ path: join(artifactDir, 'r1-acc-final-open-state.png') });
await page.screenshot({ path: join(artifactDir, 'r1-1-desktop-live.png') });
console.log('Final screenshots captured: r1-acc-final-open-state.png and r1-1-desktop-live.png');

// App is now configured and open with SENSEX 15m, LOG ON, AUTO ON, Cursor selected
console.log('App is remaining open and visible on desktop.');
setInterval(() => {}, 60000);
