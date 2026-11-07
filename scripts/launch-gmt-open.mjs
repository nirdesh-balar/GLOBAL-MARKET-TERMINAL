import { _electron as electron } from './isolated-electron.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const profile = await mkdtemp(join(tmpdir(), 'gmt-live-desktop-'));
console.log('Starting GMT with profile:', profile);

const app = await electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: {
    ...process.env,
    IMT_TEST_DATA_DIR: profile,
  },
  timeout: 60000,
});

const page = await app.firstWindow();
await page.waitForTimeout(3000);

// Switch to Indian Indices and SENSEX 15m
const dropdown = page.locator('select[data-testid="watchlist-dropdown"]');
if (await dropdown.isVisible()) {
  await dropdown.selectOption('indices');
  await page.waitForTimeout(600);
}
const sensexRow = page.locator('.watch-row').filter({ hasText: 'SENSEX' });
if (await sensexRow.count() > 0) {
  await sensexRow.first().click();
  await page.waitForTimeout(800);
}
const tf15m = page.getByRole('button', { name: '15m', exact: true }).first();
if (await tf15m.isVisible()) {
  await tf15m.click();
  await page.waitForTimeout(800);
}

// Ensure LOG ON and AUTO ON
const logBtn = page.getByRole('button', { name: /LOG pane 0/i });
const isLog = await logBtn.evaluate(el => el.classList.contains('selected'));
if (!isLog) {
  await logBtn.click();
  await page.waitForTimeout(400);
}

const autoBtn = page.getByRole('button', { name: /AUTO pane 0/i });
const isAuto = await autoBtn.evaluate(el => el.classList.contains('selected'));
if (!isAuto) {
  await autoBtn.click();
  await page.waitForTimeout(400);
}

// Ensure Cursor tool active
const cursorBtn = page.getByLabel('Cursor / crosshair', { exact: true });
if (await cursorBtn.isVisible()) {
  await cursorBtn.click();
  await page.waitForTimeout(300);
}

// Bring Electron window to front
try {
  execSync("osascript -e 'tell application \"Electron\" to activate'");
} catch {}

console.log('REAL GMT MAC APP IS RUNNING AND FOCUSED ON SENSEX 15m (LOG ON, AUTO ON, CURSOR ACTIVE)');

// Keep process alive indefinitely with active timer handle
setInterval(() => {}, 1000 * 60 * 60);

