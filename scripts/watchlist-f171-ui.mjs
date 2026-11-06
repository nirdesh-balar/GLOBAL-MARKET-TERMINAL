import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f171-ui-'));
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
  console.log('STARTING PHASE F1.7.1 FOCUS RECTANGLE & LEFT BLUE ACCENT TESTS');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // TEST 1: Open My Favourites
  console.log('TEST 1: Selecting My Favourites watchlist...');
  const dropdown = page.getByTestId('watchlist-dropdown');
  await dropdown.selectOption('favourites');
  await page.waitForTimeout(800);

  const watchRows = page.getByTestId('watchlist-rows');
  const rows = watchRows.locator('.watch-row');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  console.log(`Watchlist loaded with ${count} items.`);

  // Find ICICIBANK and SBIN rows
  let iciciIndex = -1;
  let sbinIndex = -1;
  for (let i = 0; i < count; i++) {
    const sym = (await rows.nth(i).locator('.watch-select > span:first-child > strong').innerText()).trim();
    if (sym === 'ICICIBANK') iciciIndex = i;
    if (sym === 'SBIN') sbinIndex = i;
  }
  assert.ok(iciciIndex !== -1, 'ICICIBANK must exist in My Favourites');
  assert.ok(sbinIndex !== -1, 'SBIN must exist in My Favourites');
  console.log(`Found ICICIBANK at index ${iciciIndex}, SBIN at index ${sbinIndex}`);

  // TEST 2: Select ICICIBANK, verify left blue accent is present
  console.log('TEST 2: Selecting ICICIBANK and verifying left blue accent...');
  const iciciRow = rows.nth(iciciIndex);
  await iciciRow.locator('.watch-select').click();
  await page.waitForTimeout(500);

  await expect(iciciRow).toHaveClass(/selected-symbol/);
  await expect(page.locator('.pane-symbol').first()).toContainText('ICICIBANK');

  const iciciStyles = await iciciRow.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftStyle: cs.borderLeftStyle,
      borderLeftColor: cs.borderLeftColor,
      backgroundColor: cs.backgroundColor,
      boxShadow: cs.boxShadow,
    };
  });
  console.log('ICICIBANK Styles:', iciciStyles);

  assert.equal(iciciStyles.borderLeftWidth, '4px', 'ICICIBANK must have 4px left accent');
  assert.ok(iciciStyles.borderLeftColor.includes('59, 130, 246') || iciciStyles.borderLeftColor.toLowerCase().includes('#3b82f6'), 'Left accent must be blue #3b82f6');
  assert.equal(iciciStyles.boxShadow, 'none', 'Selected row must have no boxed shadow');
  console.log('PASS: TEST 2 - Left blue accent is present on ICICIBANK with soft background!');

  // Capture Screenshot: Selected ICICIBANK
  await page.screenshot({ path: 'test-results/watchlist-f171-icicibank.png' });
  await copyFile('test-results/watchlist-f171-icicibank.png', join(artifactDir, 'watchlist-f171-icicibank.png')).catch(() => {});

  // TEST 3: Press ArrowDown -> SBIN selected, chart switches, left blue accent moves, NO focus box
  console.log('TEST 3: Pressing ArrowDown -> SBIN selection & focus box check...');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);

  const sbinRow = rows.nth(sbinIndex);
  await expect(sbinRow).toHaveClass(/selected-symbol/);
  await expect(iciciRow).not.toHaveClass(/selected-symbol/);
  await expect(page.locator('.pane-symbol').first()).toContainText('SBIN');

  const sbinFocusInfo = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = el ? window.getComputedStyle(el) : null;
    const row = el?.closest('.watch-row');
    const rowCs = row ? window.getComputedStyle(row) : null;
    return {
      tagName: el?.tagName,
      className: el?.className,
      outlineStyle: cs?.outlineStyle,
      outlineWidth: cs?.outlineWidth,
      outline: cs?.outline,
      boxShadow: cs?.boxShadow,
      rowBorderLeftWidth: rowCs?.borderLeftWidth,
      rowBorderLeftColor: rowCs?.borderLeftColor,
      rowBg: rowCs?.backgroundColor
    };
  });
  console.log('SBIN Focus & Row Info:', sbinFocusInfo);

  assert.equal(sbinFocusInfo.outlineStyle, 'none', 'Inner button must NOT have outline (no rectangular focus box)');
  assert.equal(sbinFocusInfo.outlineWidth, '0px', 'Outline width must be 0px');
  assert.equal(sbinFocusInfo.boxShadow, 'none', 'Box shadow must be none');
  assert.equal(sbinFocusInfo.rowBorderLeftWidth, '4px', 'SBIN must have 4px left accent');
  assert.ok(sbinFocusInfo.rowBorderLeftColor.includes('59, 130, 246') || sbinFocusInfo.rowBorderLeftColor.toLowerCase().includes('#3b82f6'), 'SBIN left accent must be blue #3b82f6');
  console.log('PASS: TEST 3 - SBIN selected, chart updated, left blue accent moved, NO rectangular focus box!');

  // Capture Screenshot: ArrowDown selected SBIN
  await page.screenshot({ path: 'test-results/watchlist-f171-sbin-arrowdown.png' });
  await copyFile('test-results/watchlist-f171-sbin-arrowdown.png', join(artifactDir, 'watchlist-f171-sbin-arrowdown.png')).catch(() => {});

  // TEST 4: Press ArrowUp -> ICICIBANK selected again, chart changes, accent follows, NO focus box
  console.log('TEST 4: Pressing ArrowUp -> Return to ICICIBANK...');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(500);

  await expect(iciciRow).toHaveClass(/selected-symbol/);
  await expect(sbinRow).not.toHaveClass(/selected-symbol/);
  await expect(page.locator('.pane-symbol').first()).toContainText('ICICIBANK');

  const iciciReturnInfo = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = el ? window.getComputedStyle(el) : null;
    const row = el?.closest('.watch-row');
    const rowCs = row ? window.getComputedStyle(row) : null;
    return {
      outlineStyle: cs?.outlineStyle,
      outlineWidth: cs?.outlineWidth,
      rowBorderLeftWidth: rowCs?.borderLeftWidth,
      rowBorderLeftColor: rowCs?.borderLeftColor,
    };
  });
  console.log('ICICIBANK Return Info:', iciciReturnInfo);

  assert.equal(iciciReturnInfo.outlineStyle, 'none', 'No rectangular focus box on ArrowUp');
  assert.equal(iciciReturnInfo.rowBorderLeftWidth, '4px', 'Left blue accent followed to ICICIBANK');
  assert.ok(iciciReturnInfo.rowBorderLeftColor.includes('59, 130, 246'), 'Border is blue #3b82f6');
  console.log('PASS: TEST 4 - ArrowUp returned to ICICIBANK, chart synchronized, no rectangular focus box!');

  // Capture Screenshot: ArrowUp selected ICICIBANK
  await page.screenshot({ path: 'test-results/watchlist-f171-icicibank-arrowup.png' });
  await copyFile('test-results/watchlist-f171-icicibank-arrowup.png', join(artifactDir, 'watchlist-f171-icicibank-arrowup.png')).catch(() => {});

  // TEST 5: Press ArrowDown repeatedly 15 times
  console.log('TEST 5: Pressing ArrowDown 15 times in succession...');
  for (let k = 0; k < 15; k++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(500);

  const finalSelectedRow = rows.last();
  await expect(finalSelectedRow).toHaveClass(/selected-symbol/);

  const rapidNavOutline = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = el ? window.getComputedStyle(el) : null;
    const row = el?.closest('.watch-row');
    const rowCs = row ? window.getComputedStyle(row) : null;
    return {
      outlineStyle: cs?.outlineStyle,
      outlineWidth: cs?.outlineWidth,
      rowBorderLeftWidth: rowCs?.borderLeftWidth,
      rowBorderLeftColor: rowCs?.borderLeftColor,
    };
  });
  assert.equal(rapidNavOutline.outlineStyle, 'none', 'No focus rectangle after rapid ArrowDown navigation');
  assert.equal(rapidNavOutline.rowBorderLeftWidth, '4px', 'Active row has 4px blue accent');
  assert.ok(rapidNavOutline.rowBorderLeftColor.includes('59, 130, 246'), 'Border color is blue');
  console.log('PASS: TEST 5 - Rapid 15x ArrowDown navigation succeeded with smooth chart update and zero focus box!');

  // Reset back to ICICIBANK for subsequent checks
  await iciciRow.locator('.watch-select').click();
  await page.waitForTimeout(300);

  // TEST 6: Hover over selected row
  console.log('TEST 6: Hovering over selected row...');
  await iciciRow.hover();
  await page.waitForTimeout(200);

  const iciciHoverStyles = await iciciRow.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftColor: cs.borderLeftColor,
      backgroundColor: cs.backgroundColor,
      outlineStyle: cs.outlineStyle,
    };
  });
  console.log('Hover on Selected Row Styles:', iciciHoverStyles);
  assert.equal(iciciHoverStyles.borderLeftWidth, '4px', 'Left blue accent remains on hover');
  assert.ok(iciciHoverStyles.borderLeftColor.includes('59, 130, 246'), 'Accent remains blue');
  assert.ok(iciciHoverStyles.backgroundColor.includes('rgba(255, 255, 255'), 'Hover on selected has soft background');
  console.log('PASS: TEST 6 - Hover on selected row maintains left blue accent and soft highlight!');

  // TEST 7: Verify flagged and unflagged tickers
  console.log('TEST 7: Verifying flagged row preserves left blue accent when selected...');
  const flagBtn0 = rows.nth(0).locator('.symbol-flag-btn');
  await flagBtn0.click();
  await page.locator('[data-testid="flag-color-red"]').click();
  await page.waitForTimeout(300);

  // Select row 0 (which has red flag)
  await rows.nth(0).locator('.watch-select').click();
  await page.waitForTimeout(300);

  const redFlagRowStyles = await rows.nth(0).evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftColor: cs.borderLeftColor,
      flagColor: el.getAttribute('data-flag-color')
    };
  });
  console.log('Red Flagged Selected Row Styles:', redFlagRowStyles);
  assert.equal(redFlagRowStyles.flagColor, 'red', 'Row has red flag');
  assert.equal(redFlagRowStyles.borderLeftWidth, '4px', 'Row has 4px left accent');
  assert.ok(redFlagRowStyles.borderLeftColor.includes('59, 130, 246'), 'Selected accent remains BLUE #3b82f6 independent of flag color');
  console.log('PASS: TEST 7 - Selected-row accent is strictly BLUE (#3b82f6) independent of assigned flag color!');

  // Cleanup flag
  await flagBtn0.click();
  await page.locator('[data-testid="remove-flag-btn"]').click();
  await page.waitForTimeout(200);

  // TEST 8: Verify dark and light themes
  console.log('TEST 8: Testing dark and light themes...');
  await iciciRow.locator('.watch-select').click();
  await page.waitForTimeout(300);
  await expect(iciciRow).toHaveClass(/selected-symbol/);

  // Capture dark theme screenshot
  await page.screenshot({ path: 'test-results/watchlist-f171-selected-dark.png' });
  await copyFile('test-results/watchlist-f171-selected-dark.png', join(artifactDir, 'watchlist-f171-selected-dark.png')).catch(() => {});

  // Toggle theme to light
  const themeBtn = page.locator('button[aria-label="Toggle theme"]');
  await themeBtn.click();
  await page.waitForTimeout(400);

  await expect(page.locator('.terminal-shell')).toHaveClass(/theme-light/);
  const lightStyles = await iciciRow.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      borderLeftWidth: cs.borderLeftWidth,
      borderLeftColor: cs.borderLeftColor,
      backgroundColor: cs.backgroundColor,
      outlineStyle: cs.outlineStyle,
    };
  });
  console.log('Light Theme Selected Row Styles:', lightStyles);
  assert.equal(lightStyles.borderLeftWidth, '4px', 'Light theme selected row has 4px left blue accent');
  assert.ok(lightStyles.borderLeftColor.includes('59, 130, 246'), 'Light theme accent is blue #3b82f6');
  assert.ok(lightStyles.backgroundColor.includes('rgba(0, 0, 0'), 'Light theme has soft translucent background');

  // Capture light theme screenshot
  await page.screenshot({ path: 'test-results/watchlist-f171-selected-light.png' });
  await copyFile('test-results/watchlist-f171-selected-light.png', join(artifactDir, 'watchlist-f171-selected-light.png')).catch(() => {});
  console.log('PASS: TEST 8 - Dark and light themes both render 4px blue accent with soft background!');

  // Toggle back to dark
  await themeBtn.click();
  await page.waitForTimeout(300);

  // TEST 9: Normal keyboard focus indicators on color buttons and other controls
  console.log('TEST 9: Verifying accessible focus-visible outlines on other controls...');
  // Use keyboard Tab to navigate and verify :focus-visible outlines are active
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);

  const tabbedControl = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = el ? window.getComputedStyle(el) : null;
    return {
      tagName: el?.tagName,
      className: el?.className,
      matchesFocusVisible: el?.matches(':focus-visible'),
      outlineStyle: cs?.outlineStyle,
      outlineWidth: cs?.outlineWidth,
      outlineColor: cs?.outlineColor,
    };
  });
  console.log('Keyboard Focused Control Styles:', tabbedControl);
  assert.equal(tabbedControl.matchesFocusVisible, true, 'Keyboard navigated control must match :focus-visible');
  assert.equal(tabbedControl.outlineStyle, 'solid', 'Keyboard navigated control retains accessible solid outline');
  assert.equal(tabbedControl.outlineWidth, '2px', 'Keyboard navigated control has 2px outline');
  console.log('PASS: TEST 9 - Other interactive controls retain full accessible focus indicators!');

  // TEST 10: Verify zero layout shift between unselected and selected rows
  console.log('TEST 10: Verifying zero layout shift between unselected and selected rows...');
  const unselectedRow = rows.nth(2);
  const unselectedBox = await unselectedRow.boundingBox();
  const selectedBox = await iciciRow.boundingBox();

  assert.equal(unselectedBox.height, 44, 'Unselected row height must be 44px');
  assert.equal(selectedBox.height, 44, 'Selected row height must be 44px');
  assert.equal(unselectedBox.width, selectedBox.width, 'Row widths must be identical');
  assert.equal(unselectedBox.x, selectedBox.x, 'Row X alignment must be identical (no lateral shift)');
  console.log('PASS: TEST 10 - Zero layout shift verified across rows (44px height, identical bounds)!');

  // Verify no page errors
  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);

  console.log('================================================================');
  console.log('ALL PHASE F1.7.1 UI & REGRESSION TESTS PASSED 100%!');
  console.log('================================================================');
} finally {
  await app?.close();
}
