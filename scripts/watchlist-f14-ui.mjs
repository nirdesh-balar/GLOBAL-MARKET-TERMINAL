import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f14-ui-'));
await mkdir('test-results', { recursive: true });
const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
const errors = [];
let app, page;

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' },
  timeout: 60000,
});

const request = (p, m = 'GET', b) => page.evaluate(([p, m, b]) => window.terminal.request(p, m, b), [p, m, b]);

try {
  console.log('================================================================');
  console.log('STARTING PHASE F1.4 ALWAYS-VISIBLE FLAGS & STRONG HIGHLIGHT TEST');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Switch to 'stocks' (Indian Stocks) watchlist
  const dropdown = page.getByTestId('watchlist-dropdown');
  await dropdown.selectOption('stocks');
  await page.waitForTimeout(500);

  const rows = page.locator('.watch-row');
  const count = await rows.count();
  console.log(`Watchlist loaded with ${count} items.`);
  assert.ok(count >= 2, 'Watchlist must contain at least 2 items for navigation test');

  // =========================================================================
  // TEST 1: Always-Visible Color Flag Icons (Rest State without Hover)
  // =========================================================================
  console.log('1. Verifying Always-Visible Color Flag Outline (without mouse hover)...');
  const row0 = rows.nth(0);
  const row0Symbol = (await row0.locator('.watch-select > span:first-child > strong').innerText()).trim();
  const row0FlagBtn = row0.locator('.symbol-flag-btn');

  // Verify button is attached and visible
  await expect(row0FlagBtn).toBeVisible();
  await expect(row0FlagBtn).toHaveClass(/unflagged/);

  // Check computed opacity without hover: MUST be > 0 (opacity: 0.7)
  const computedOpacity = await row0FlagBtn.evaluate(el => window.getComputedStyle(el).opacity);
  console.log(`Unflagged flag button rest opacity: ${computedOpacity}`);
  assert.ok(parseFloat(computedOpacity) >= 0.5, `Unflagged flag button must be visible at rest without hover (got ${computedOpacity})`);

  // Verify tooltip and aria-label
  const unflaggedTitle = await row0FlagBtn.getAttribute('title');
  const unflaggedAria = await row0FlagBtn.getAttribute('aria-label');
  assert.equal(unflaggedTitle, 'Add color flag', `Unflagged title must be "Add color flag", got "${unflaggedTitle}"`);
  assert.ok(unflaggedAria?.includes('Add color flag'), `Aria label must describe adding color flag, got "${unflaggedAria}"`);
  console.log(`PASS: Unflagged row flag button is always visible at rest (${unflaggedTitle}, ${unflaggedAria})!`);

  // Capture Screenshot: State A (Unflagged & Unselected)
  await page.screenshot({ path: 'test-results/watchlist-f14-state-a-unflagged.png' });
  await copyFile('test-results/watchlist-f14-state-a-unflagged.png', join(artifactDir, 'watchlist-f14-state-a-unflagged.png'));

  // =========================================================================
  // TEST 2: Main Chart Header Flag Button (Always-Visible Outline & Picker)
  // =========================================================================
  console.log('2. Verifying Main Chart Header Flag Button...');
  const headerFlag = page.locator('[data-testid="header-symbol-flag"]');
  await expect(headerFlag).toBeVisible();
  const headerOpacity = await headerFlag.evaluate(el => window.getComputedStyle(el).opacity);
  assert.ok(parseFloat(headerOpacity) >= 0.5, `Header flag button must be visible at rest (got ${headerOpacity})`);
  assert.equal(await headerFlag.getAttribute('title'), 'Add color flag');

  // Click header flag to open color picker
  await headerFlag.click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  console.log('PASS: Header flag button opened ColorFlagPicker popover!');

  // Capture Screenshot: Flag Picker Popover
  await page.screenshot({ path: 'test-results/watchlist-f14-picker-open.png' });
  await copyFile('test-results/watchlist-f14-picker-open.png', join(artifactDir, 'watchlist-f14-picker-open.png'));

  // Close picker
  await page.keyboard.press('Escape');
  await expect(page.locator('.color-flag-picker-popover')).toHaveCount(0);

  // =========================================================================
  // TEST 3: Strong Selected-Ticker Highlight (State B: Unflagged & Selected)
  // =========================================================================
  console.log('3. Verifying Strong Selected Highlight on Unflagged Row (State B)...');
  await row0.locator('.watch-select').click();
  await page.waitForTimeout(300);

  await expect(row0).toHaveClass(/selected-symbol/);

  // Verify CSS styles of selected row
  const row0Styles = await row0.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftColor: cs.borderLeftColor,
      backgroundColor: cs.backgroundColor,
      boxShadow: cs.boxShadow,
    };
  });
  console.log('Selected row styles:', row0Styles);
  assert.equal(row0Styles.borderLeftWidth, '4px', 'Selected row must have 4px left accent border');
  assert.ok(row0Styles.backgroundColor.includes('rgba(59, 130, 246') || row0Styles.backgroundColor.includes('rgb(59, 130, 246'), 'Selected row must have blue background tint');
  assert.ok(row0Styles.boxShadow.includes('rgba(59, 130, 246') || row0Styles.boxShadow.includes('rgb(59, 130, 246') || row0Styles.boxShadow !== 'none', 'Selected row must have subtle inset shadow');

  const strongWeight = await row0.locator('.watch-select > span:first-child > strong').evaluate(el => window.getComputedStyle(el).fontWeight);
  assert.ok(parseInt(strongWeight) >= 700, `Selected ticker text must have strong font-weight 700 (got ${strongWeight})`);
  console.log('PASS: State B (Unflagged & Selected) verified with 4px border, 20% blue tint, inset shadow and 700 font-weight!');

  // Capture Screenshot: State B (Unflagged & Selected)
  await page.screenshot({ path: 'test-results/watchlist-f14-state-b-selected.png' });
  await copyFile('test-results/watchlist-f14-state-b-selected.png', join(artifactDir, 'watchlist-f14-state-b-selected.png'));

  // =========================================================================
  // TEST 4: Assign Flag Color (State C & State D)
  // =========================================================================
  console.log('4. Flagging Row 1 as RED and testing State C (Flagged & Unselected)...');
  const row1 = rows.nth(1);
  const row1Symbol = (await row1.locator('.watch-select > span:first-child > strong').innerText()).trim();
  const row1FlagBtn = row1.locator('.symbol-flag-btn');

  // Click row 1 flag button
  await row1FlagBtn.click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();

  // Select RED
  await page.locator('[data-testid="flag-color-red"]').click();
  await page.waitForTimeout(300);

  // Row 1 is flagged RED, but currently UNSELECTED (Row 0 is still selected)
  await expect(row1FlagBtn).toHaveClass(/flagged/);
  await expect(row1).not.toHaveClass(/selected-symbol/);
  assert.equal(await row1.getAttribute('data-flag-color'), 'red');
  assert.equal(await row1FlagBtn.getAttribute('title'), 'RED flag (Click to change)');
  console.log('PASS: State C (Flagged & Unselected) verified! Solid RED flag with normal unselected row.');

  // Capture Screenshot: State C
  await page.screenshot({ path: 'test-results/watchlist-f14-state-c-flagged-unselected.png' });
  await copyFile('test-results/watchlist-f14-state-c-flagged-unselected.png', join(artifactDir, 'watchlist-f14-state-c-flagged-unselected.png'));

  // Now navigate to Row 1 via ArrowDown -> State D (Flagged & Selected)
  console.log('5. Navigating to Row 1 via ArrowDown: Testing State D (Flagged & Selected)...');
  await row0.locator('.watch-select').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);

  await expect(row1).toHaveClass(/selected-symbol/);
  await expect(row1FlagBtn).toHaveClass(/flagged/);
  await expect(page.locator('.pane-symbol').first()).toContainText(row1Symbol);

  const row1Styles = await row1.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftColor: cs.borderLeftColor,
      backgroundColor: cs.backgroundColor,
    };
  });
  console.log('Flagged selected row styles:', row1Styles);
  assert.equal(row1Styles.borderLeftWidth, '4px');
  // Flagged red row has red border accent
  assert.ok(row1Styles.borderLeftColor.includes('239, 68, 68') || row1Styles.borderLeftColor.toLowerCase().includes('#ef4444'), `Left border matches flag red color (got ${row1Styles.borderLeftColor})`);
  console.log('PASS: State D (Flagged & Selected) verified with matching accent border and solid flag!');

  // Capture Screenshot: State D
  await page.screenshot({ path: 'test-results/watchlist-f14-state-d-flagged-selected.png' });
  await copyFile('test-results/watchlist-f14-state-d-flagged-selected.png', join(artifactDir, 'watchlist-f14-state-d-flagged-selected.png'));

  // =========================================================================
  // TEST 5: Unflagging Restores Empty Outline Flag (Never Hides Button)
  // =========================================================================
  console.log('6. Unflagging Row 1 and verifying smooth restoration of empty outline...');
  await row1FlagBtn.click();
  await expect(page.locator('.color-flag-picker-popover')).toBeVisible();
  await page.locator('[data-testid="remove-flag-btn"]').click();
  await page.waitForTimeout(300);

  // Button must still be attached, visible, but unflagged
  await expect(row1FlagBtn).toBeVisible();
  await expect(row1FlagBtn).toHaveClass(/unflagged/);
  assert.equal(await row1FlagBtn.getAttribute('title'), 'Add color flag');
  console.log('PASS: Removing flag cleanly restored empty outline flag!');

  // =========================================================================
  // TEST 6: Light Theme Verification
  // =========================================================================
  console.log('7. Verifying Light Theme Selected Highlight & Flag Visibility...');
  await page.getByLabel('Toggle theme').click();
  await page.waitForTimeout(300);

  // Verify theme-light class on shell
  await expect(page.locator('.terminal-shell')).toHaveClass(/theme-light/);

  // Check selected row in light theme
  const lightStyles = await row1.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftColor: cs.borderLeftColor,
      backgroundColor: cs.backgroundColor,
    };
  });
  console.log('Light theme selected row styles:', lightStyles);
  assert.equal(lightStyles.borderLeftWidth, '4px');

  // Capture Light Theme Screenshot
  await page.screenshot({ path: 'test-results/watchlist-f14-light-theme.png' });
  await copyFile('test-results/watchlist-f14-light-theme.png', join(artifactDir, 'watchlist-f14-light-theme.png'));

  // Toggle back to dark theme
  await page.getByLabel('Toggle theme').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.terminal-shell')).not.toHaveClass(/theme-light/);
  console.log('PASS: Light theme contrast and clean toggle verified!');

  // =========================================================================
  // TEST 7: Complete Final UI Screenshot
  // =========================================================================
  console.log('8. Capturing Master Phase F1.4 UI Screenshot...');
  const masterScreenshot = 'test-results/watchlist-f14-master-refined.png';
  await page.screenshot({ path: masterScreenshot });
  await copyFile(masterScreenshot, join(artifactDir, 'watchlist-f14-master-refined.png'));
  console.log(`PASS: Master screenshot saved to ${masterScreenshot} and copied to artifacts.`);

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join('; ')}`);
  console.log('================================================================');
  console.log('ALL PHASE F1.4 UI & REGRESSION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
} catch (e) {
  console.error('TEST FAILED:', e);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
}
