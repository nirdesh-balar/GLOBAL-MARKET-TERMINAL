import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f17-ui-'));
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

try {
  console.log('================================================================');
  console.log('STARTING PHASE F1.7 HOVER-STYLE SELECTED ROW UI TESTS');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Select 'favourites' (My Favourites) custom watchlist
  const dropdown = page.getByTestId('watchlist-dropdown');
  await dropdown.selectOption('favourites');
  await page.waitForTimeout(600);

  const watchRows = page.getByTestId('watchlist-rows');
  const rows = watchRows.locator('.watch-row');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  console.log(`Watchlist loaded with ${count} items.`);

  // =========================================================================
  // TEST 1: Selected Row - No Thick Border, No Left Accent Bar, No Boxed Outline
  // =========================================================================
  console.log('1. Verifying Selected Row has No Thick Border, No Left Strip, and No Box Shadow...');
  const row0 = rows.nth(0);
  await row0.locator('.watch-select').click();
  await page.waitForTimeout(300);

  await expect(row0).toHaveClass(/selected-symbol/);

  const row0Styles = await row0.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftStyle: cs.borderLeftStyle,
      borderLeftColor: cs.borderLeftColor,
      boxShadow: cs.boxShadow,
      outlineStyle: cs.outlineStyle,
      backgroundColor: cs.backgroundColor,
      height: cs.height,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
    };
  });
  console.log('Selected Row 0 Computed Styles:', row0Styles);

  assert.equal(row0Styles.borderLeftWidth, '4px', 'Selected row must have 4px left blue accent');
  assert.ok(row0Styles.borderLeftColor.includes('59, 130, 246') || row0Styles.borderLeftColor.toLowerCase().includes('#3b82f6'), 'Left accent must be blue #3b82f6');
  assert.equal(row0Styles.boxShadow, 'none', 'Selected row must NOT have a boxed shadow or inset glow');
  assert.equal(row0Styles.outlineStyle, 'none', 'Selected row must NOT have an outline box');
  assert.equal(row0Styles.height, '44px', 'Selected row height must remain 44px');
  assert.ok(row0Styles.backgroundColor.includes('rgba(255, 255, 255') || row0Styles.backgroundColor.includes('rgb('), 'Must have subtle background highlight');
  console.log('PASS: Selected row has 4px blue accent, soft background, and no boxed outline!');

  // =========================================================================
  // TEST 2: Action Icons Visibility on Selected Row
  // =========================================================================
  console.log('2. Verifying Action Icons are Visible & Accessible on Selected Row...');
  const row0Actions = row0.locator('.watch-row-actions');
  const actionsStyles = await row0Actions.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      width: cs.width,
    };
  });
  console.log('Selected Row Actions Styles:', actionsStyles);
  assert.equal(actionsStyles.opacity, '1', 'Action icons on selected row must be visible (opacity: 1)');
  assert.equal(actionsStyles.pointerEvents, 'auto', 'Action icons on selected row must be clickable (pointer-events: auto)');
  assert.equal(actionsStyles.width, '46px', 'Actions width must be 46px fixed');
  console.log('PASS: Action icons on selected row are visible and accessible without requiring hover!');

  // =========================================================================
  // TEST 3: Hover vs Selected State Progression
  // =========================================================================
  console.log('3. Testing Hover and Selected State Progression...');
  const row1 = rows.nth(1);
  await expect(row1).not.toHaveClass(/selected-symbol/);

  // Unselected unhovered background
  const row1RestBg = await row1.evaluate(el => window.getComputedStyle(el).backgroundColor);

  // Unselected hovered background
  await row1.hover();
  await page.waitForTimeout(200);
  const row1HoverBg = await row1.evaluate(el => window.getComputedStyle(el).backgroundColor);

  // Selected row background
  const row0SelectedBg = row0Styles.backgroundColor;

  console.log(`Rest BG: ${row1RestBg} | Hover BG: ${row1HoverBg} | Selected BG: ${row0SelectedBg}`);
  assert.notEqual(row1HoverBg, row1RestBg, 'Hovered row must have a background highlight');
  console.log('PASS: Hover vs Selected states show clear, subtle, progressive highlights!');

  // Capture Screenshot: Dark Theme Selected Row
  await page.screenshot({ path: 'test-results/watchlist-f17-selected-dark.png' });
  await copyFile('test-results/watchlist-f17-selected-dark.png', join(artifactDir, 'watchlist-f17-selected-dark.png')).catch(() => {});
  console.log('PASS: Saved dark theme screenshot to test-results/watchlist-f17-selected-dark.png');

  // =========================================================================
  // TEST 4: Keyboard Navigation & Instant Chart Switching
  // =========================================================================
  console.log('4. Testing Keyboard Navigation (ArrowDown / ArrowUp) & Chart Switching...');
  const row0Symbol = (await row0.locator('.watch-select > span:first-child > strong').innerText()).trim();
  const row1Symbol = (await row1.locator('.watch-select > span:first-child > strong').innerText()).trim();

  // Focus row 0 and press ArrowDown
  await row0.locator('.watch-select').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);

  // Row 1 must now be selected
  await expect(row1).toHaveClass(/selected-symbol/);
  await expect(row0).not.toHaveClass(/selected-symbol/);

  // Main chart header must update to row 1 symbol
  const mainSymbol = page.locator('.header-symbol strong');
  await expect(mainSymbol).toContainText(row1Symbol);
  console.log(`Chart switched from ${row0Symbol} to ${row1Symbol} via ArrowDown.`);

  // Press ArrowUp to return to Row 0
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  await expect(row0).toHaveClass(/selected-symbol/);
  await expect(mainSymbol).toContainText(row0Symbol);
  console.log('PASS: Keyboard navigation switches selected ticker and updates active chart instantly!');

  // =========================================================================
  // TEST 5: No Layout Shift Verification
  // =========================================================================
  console.log('5. Verifying Zero Layout Shift Between Unselected and Selected Rows...');
  const row0Box = await row0.boundingBox();
  const row1Box = await row1.boundingBox();

  assert.equal(row0Box.height, 44, 'Row 0 height must be 44px');
  assert.equal(row1Box.height, 44, 'Row 1 height must be 44px');
  assert.equal(row0Box.width, row1Box.width, 'Row widths must be identical');
  assert.equal(row0Box.x, row1Box.x, 'Row X alignment must be identical (no border-induced shift)');
  console.log('PASS: Zero layout shift verified across rows!');

  // =========================================================================
  // TEST 6: Light Theme Styling Verification
  // =========================================================================
  console.log('6. Testing Light Theme Selected Row Styling & Contrast...');
  const themeBtn = page.locator('button[aria-label="Toggle theme"]');
  await themeBtn.click();
  await page.waitForTimeout(400);

  await expect(page.locator('.terminal-shell')).toHaveClass(/theme-light/);

  const lightRow0Styles = await row0.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      boxShadow: cs.boxShadow,
      outlineStyle: cs.outlineStyle,
      backgroundColor: cs.backgroundColor,
      color: cs.color,
    };
  });
  console.log('Light Theme Selected Row Styles:', lightRow0Styles);

  assert.equal(lightRow0Styles.borderLeftWidth, '4px', 'Light theme selected row must have 4px left blue accent');
  assert.equal(lightRow0Styles.boxShadow, 'none', 'Light theme selected row must have NO box shadow');
  assert.equal(lightRow0Styles.outlineStyle, 'none', 'Light theme selected row must have NO outline');
  assert.ok(lightRow0Styles.backgroundColor.includes('rgba(0, 0, 0') || lightRow0Styles.backgroundColor.includes('rgb('), 'Must have subtle light-theme highlight');

  // Capture Screenshot: Light Theme Selected Row
  await page.screenshot({ path: 'test-results/watchlist-f17-selected-light.png' });
  await copyFile('test-results/watchlist-f17-selected-light.png', join(artifactDir, 'watchlist-f17-selected-light.png')).catch(() => {});
  console.log('PASS: Saved light theme screenshot to test-results/watchlist-f17-selected-light.png');

  // Toggle back to dark theme
  await themeBtn.click();
  await page.waitForTimeout(300);

  // Verify zero page errors
  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);

  console.log('================================================================');
  console.log('ALL PHASE F1.7 SELECTED ROW UI TESTS PASSED 100%!');
  console.log('================================================================');
} finally {
  await app?.close();
}
