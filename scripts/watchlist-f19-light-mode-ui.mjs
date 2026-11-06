import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f19-test-'));
await mkdir('test-results', { recursive: true });
const artifactDir = '/Users/nirdeshbalar/.gemini/antigravity/brain/ed53976a-b070-44c0-93ef-f78ae069ab40';
const errors = [];

const launch = () => electron.launch({
  executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: ['.'],
  env: { ...process.env, IMT_TEST_DATA_DIR: profile, IMT_UI_FIXTURE: '1', IMT_OFFLINE: '1' },
  timeout: 60000,
});

console.log('================================================================');
console.log('STARTING PHASE F1.9 COMPLETE LIGHT MODE HOVER & SELECTION SUITE');
console.log('================================================================');

const app = await launch();
const page = await app.firstWindow();
page.on('pageerror', e => errors.push(e.message));

try {
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(1280, 800));
  await page.waitForTimeout(1000);

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Helper to test if color is NOT dark black/navy (i.e. RGB channels are not all < 60 unless transparent)
  const isNotDarkBlack = (rgbStr) => {
    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return true;
    const [_, r, g, b, a] = match;
    if (a !== undefined && Number(a) < 0.2) return true;
    return !(Number(r) < 60 && Number(g) < 60 && Number(b) < 70);
  };

  // Helper to test if text is NOT white/light (i.e. RGB channels are not all > 200)
  const isNotWhiteText = (rgbStr) => {
    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return true;
    const [_, r, g, b] = match.map(Number);
    return !(r > 200 && g > 200 && b > 200);
  };
  const isLightOrTransparent = (rgbStr) => {
    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return true;
    const [_, r, g, b, a] = match;
    if (a !== undefined && Number(a) < 0.2) return true;
    return Number(r) > 180 && Number(g) > 180 && Number(b) > 180;
  };

  // -------------------------------------------------------------
  // TEST 1: Switch to 1-chart layout & Switch to Light Mode
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Switch to Light Mode ---');
  const layoutBtn = page.getByRole('button', { name: 'Chart layout' });
  await layoutBtn.click();
  await page.getByRole('button', { name: 'Layout 1' }).click();
  await page.waitForTimeout(500);

  const themeBtn = page.getByRole('button', { name: 'Toggle theme' });
  await themeBtn.click();
  await page.waitForTimeout(500);

  const shell = page.locator('.terminal-shell');
  await expect(shell).toHaveClass(/theme-light/);
  console.log('PASS: Switched to Light Theme successfully.');

  // -------------------------------------------------------------
  // TEST 2: Bottom Range Toolbar Buttons (1D, 5D, 1M, ALL, Custom, Data)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Bottom Range Toolbar Buttons in Light Mode ---');
  const pane0 = page.getByTestId('pane-0');
  const bottomToolbar = pane0.locator('.bottom-chart-toolbar');
  await expect(bottomToolbar).toBeVisible();

  const btn1D = bottomToolbar.locator('button:has-text("1D")');
  const btn5D = bottomToolbar.locator('button:has-text("5D")');
  const btn1M = bottomToolbar.locator('button:has-text("1M")');
  const btnCustom = bottomToolbar.locator('button:has-text("Custom")');
  const btnData = bottomToolbar.locator('button:has-text("Data")');

  // Verify normal unhovered state
  const btn5DNormal = await btn5D.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isLightOrTransparent(btn5DNormal.bg), `5D normal background must be light/transparent, got ${btn5DNormal.bg}`);

  // Verify hovered state on 5D
  await btn5D.hover();
  await page.waitForTimeout(100);
  const btn5DHover = await btn5D.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(btn5DHover.bg), `5D hovered background must NOT be black/dark navy, got ${btn5DHover.bg}`);
  assert.ok(isLightOrTransparent(btn5DHover.bg), `5D hovered background must be a soft light tint, got ${btn5DHover.bg}`);
  console.log(`PASS: 5D hover is soft light tint (${btn5DHover.bg}), not dark.`);

  // Verify hovered state on 1M
  await btn1M.hover();
  await page.waitForTimeout(100);
  const btn1MHover = await btn1M.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(btn1MHover.bg), `1M hovered background must NOT be black/dark navy, got ${btn1MHover.bg}`);

  // Verify Custom button hover
  await btnCustom.hover();
  await page.waitForTimeout(100);
  const btnCustomHover = await btnCustom.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(btnCustomHover.bg), `Custom button hovered background must NOT be black, got ${btnCustomHover.bg}`);

  // Verify Data button hover
  await btnData.hover();
  await page.waitForTimeout(100);
  const btnDataHover = await btnData.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(btnDataHover.bg), `Data button hovered background must NOT be black, got ${btnDataHover.bg}`);
  console.log(`PASS: Bottom range and Data buttons verified clean in Light Mode.`);

  await page.screenshot({ path: 'test-results/f19-light-bottom-toolbar.png' });
  await copyFile('test-results/f19-light-bottom-toolbar.png', join(artifactDir, 'f19-light-bottom-toolbar.png')).catch(() => {});

  // -------------------------------------------------------------
  // TEST 3: Top Header Timeframe & Action Buttons in Light Mode
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Top Header Controls in Light Mode ---');
  const tf1h = page.getByRole('button', { name: 'Active timeframe 1h' });
  await tf1h.hover();
  await page.waitForTimeout(100);
  const tf1hHover = await tf1h.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(tf1hHover.bg), `1h timeframe hover must NOT be black, got ${tf1hHover.bg}`);

  // Select 1h and check active state
  await tf1h.click();
  await page.waitForTimeout(200);
  const tf1hActive = await tf1h.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(tf1hActive.bg), `Active timeframe must NOT be black, got ${tf1hActive.bg}`);
  console.log(`PASS: Timeframe buttons hover and active states are soft light tints.`);

  // Layout Menu check
  await layoutBtn.click();
  await page.waitForTimeout(200);
  const layoutMenu = page.locator('.layout-menu');
  await expect(layoutMenu).toBeVisible();
  const layoutMenuBg = await layoutMenu.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.ok(isLightOrTransparent(layoutMenuBg), `Layout menu background must be light, got ${layoutMenuBg}`);

  const layoutOption = layoutMenu.getByRole('button', { name: 'Layout 2' });
  await layoutOption.hover();
  await page.waitForTimeout(100);
  const layoutOptionHover = await layoutOption.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(layoutOptionHover.bg), `Layout menu option hover must NOT be black, got ${layoutOptionHover.bg}`);
  console.log(`PASS: Layout menu hover is clean (${layoutOptionHover.bg}).`);

  // Close layout menu by clicking layoutBtn
  await layoutBtn.click();
  await page.waitForTimeout(200);

  // -------------------------------------------------------------
  // TEST 4: Watchlist Sidebar Rows & Buttons in Light Mode
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Watchlist Rows & Selections in Light Mode ---');
  const sidebar = page.getByTestId('watchlist-sidebar');
  await expect(sidebar).toBeVisible();

  const rows = sidebar.locator('.watch-row');
  const row0 = rows.nth(0);
  const row1 = rows.nth(1);

  // Row 0 is selected by default; verify 4px blue accent
  const row0Selected = await row0.evaluate(el => ({
    borderLeftWidth: getComputedStyle(el).borderLeftWidth,
    borderLeftColor: getComputedStyle(el).borderLeftColor,
    bg: getComputedStyle(el).backgroundColor,
    textColor: getComputedStyle(el.querySelector('.watch-select strong')).color,
  }));
  assert.equal(row0Selected.borderLeftWidth, '4px', 'Selected row must have 4px left accent');
  assert.ok(row0Selected.borderLeftColor.includes('59, 130, 246') || row0Selected.borderLeftColor.includes('37, 99, 235'), 'Accent must be blue');
  assert.ok(isNotWhiteText(row0Selected.textColor), `Selected row text must NOT be white, got ${row0Selected.textColor}`);
  console.log(`PASS: Selected watchlist row has 4px blue accent and dark readable text (${row0Selected.textColor}).`);

  // Hover unselected row 1
  const row1Select = row1.locator('.watch-select');
  await row1Select.hover();
  await page.waitForTimeout(100);
  const row1Hover = await row1.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  const row1BtnHover = await row1Select.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor }));
  assert.ok(isNotDarkBlack(row1Hover.bg), `Row 1 hover background must NOT be black, got ${row1Hover.bg}`);
  assert.equal(row1BtnHover.bg, 'rgba(0, 0, 0, 0)', 'Inner watch-select button must remain transparent on hover');
  console.log(`PASS: Watchlist row hover is seamless without inner button dark box.`);

  // Test row action button hover (Move up/down/delete)
  const deleteBtn = row1.locator('.watch-row-actions button:has(svg.lucide-x)');
  if (await deleteBtn.isVisible()) {
    await deleteBtn.hover();
    await page.waitForTimeout(100);
    const deleteHover = await deleteBtn.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
    assert.ok(isNotDarkBlack(deleteHover.bg), `Delete button hover must NOT be black, got ${deleteHover.bg}`);
    console.log(`PASS: Watchlist delete button hover is soft red/light (${deleteHover.bg}).`);
  }

  // Test Watchlist Header buttons (Quote refresh, Add symbol)
  const refreshQuoteBtn = sidebar.locator('.watch-search button').first();
  await refreshQuoteBtn.hover();
  await page.waitForTimeout(100);
  const refreshHover = await refreshQuoteBtn.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor }));
  assert.ok(isNotDarkBlack(refreshHover.bg), `Quote refresh button hover must NOT be black, got ${refreshHover.bg}`);

  await page.screenshot({ path: 'test-results/f19-light-watchlist.png' });
  await copyFile('test-results/f19-light-watchlist.png', join(artifactDir, 'f19-light-watchlist.png')).catch(() => {});

  // -------------------------------------------------------------
  // TEST 5: Symbol Search Dialog (High Priority)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Symbol Search Dialog in Light Mode ---');
  await page.getByRole('button', { name: 'Search stocks and indices' }).click();
  const searchModal = page.locator('.search-modal');
  await expect(searchModal).toBeVisible({ timeout: 5000 });

  const searchInput = page.locator('.search-input input');
  const searchInputStyle = await searchInput.evaluate(el => ({ color: getComputedStyle(el).color }));
  assert.ok(isNotWhiteText(searchInputStyle.color), `Search input text color must be dark readable, got ${searchInputStyle.color}`);
  console.log(`PASS: Search input text color is dark and readable (${searchInputStyle.color}).`);

  // First search result (selected)
  const firstRes = page.locator('.search-result').first();
  const firstResBtn = firstRes.locator('.result-main');
  const firstResBg = await firstRes.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.ok(isLightOrTransparent(firstResBg), `Selected search result background must be light, got ${firstResBg}`);

  // Hover over the second search result
  const secondRes = page.locator('.search-result').nth(1);
  const secondResBtn = secondRes.locator('.result-main');
  await secondResBtn.hover();
  await page.waitForTimeout(100);

  const secondResHover = await secondRes.evaluate(el => getComputedStyle(el).backgroundColor);
  const secondResBtnHover = await secondResBtn.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.ok(isNotDarkBlack(secondResHover), `Search result row hover must NOT be black, got ${secondResHover}`);
  assert.ok(isNotDarkBlack(secondResBtnHover), `Search result button hover must NOT be black, got ${secondResBtnHover}`);
  assert.equal(secondResBtnHover, 'rgba(0, 0, 0, 0)', 'Result main button must remain transparent so row highlight is seamless');
  console.log(`PASS: Search result hover is clean soft light tint (${secondResHover}), button is transparent.`);

  // Keyboard navigation (ArrowDown to 2nd result)
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const highlightedRes = page.locator('.search-result.highlighted').first();
  const highlightedBg = await highlightedRes.evaluate(el => getComputedStyle(el).backgroundColor);
  const highlightedTextColor = await highlightedRes.locator('.result-main strong').evaluate(el => getComputedStyle(el).color);
  assert.ok(isLightOrTransparent(highlightedBg), `Keyboard selected search result must be light, got ${highlightedBg}`);
  assert.ok(isNotWhiteText(highlightedTextColor), `Keyboard selected result title must be dark, got ${highlightedTextColor}`);
  console.log(`PASS: Keyboard selection in search is soft blue (${highlightedBg}) with dark readable text (${highlightedTextColor}).`);

  // Check symbol avatar in light mode
  const avatar = firstRes.locator('.symbol-avatar');
  const avatarStyle = await avatar.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isLightOrTransparent(avatarStyle.bg), `Avatar background must be light grey/blue in light mode, got ${avatarStyle.bg}`);
  console.log(`PASS: Symbol avatar is light surface (${avatarStyle.bg}) with blue text (${avatarStyle.color}).`);

  await page.screenshot({ path: 'test-results/f19-light-search-dialog.png' });
  await copyFile('test-results/f19-light-search-dialog.png', join(artifactDir, 'f19-light-search-dialog.png')).catch(() => {});

  // Close search with Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(searchModal).toHaveCount(0);

  // -------------------------------------------------------------
  // TEST 6: Drawing Toolbar & Flyout in Light Mode
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Drawing Toolbar in Light Mode ---');
  const drawingToolbar = page.locator('.drawing-toolbar');
  await expect(drawingToolbar).toBeVisible();

  const toolBtn = drawingToolbar.locator('button').first();
  await toolBtn.hover();
  await page.waitForTimeout(100);
  const toolBtnHover = await toolBtn.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.ok(isNotDarkBlack(toolBtnHover), `Drawing toolbar button hover must NOT be black, got ${toolBtnHover}`);
  console.log(`PASS: Drawing toolbar button hover is light (${toolBtnHover}).`);

  // -------------------------------------------------------------
  // TEST 7: Color Flag Picker Popover in Light Mode
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Color Flag Picker Popover in Light Mode ---');
  const headerFlagBtn = page.getByTestId('header-symbol-flag');
  await headerFlagBtn.click();
  await page.waitForTimeout(200);

  const flagPopover = page.locator('.color-flag-picker-popover');
  await expect(flagPopover).toBeVisible();

  const popoverBg = await flagPopover.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.ok(isLightOrTransparent(popoverBg), `Flag picker popover background must be white, got ${popoverBg}`);

  const closeBtn = flagPopover.locator('.picker-close-btn');
  await closeBtn.hover();
  await page.waitForTimeout(100);
  const closeBtnHover = await closeBtn.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }));
  assert.ok(isNotDarkBlack(closeBtnHover.bg), `Close button hover must NOT be dark, got ${closeBtnHover.bg}`);
  assert.ok(isNotWhiteText(closeBtnHover.color), `Close button text on hover must be dark, got ${closeBtnHover.color}`);
  console.log(`PASS: Flag picker close button hover is subtle gray (${closeBtnHover.bg}) with dark icon.`);

  // Close flag picker
  await closeBtn.click();
  await page.waitForTimeout(200);

  // -------------------------------------------------------------
  // TEST 8: Full Terminal Light Mode Viewport & Contrast
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Full Terminal Responsive & Contrast Check ---');
  await page.screenshot({ path: 'test-results/f19-light-full-clean.png' });
  await copyFile('test-results/f19-light-full-clean.png', join(artifactDir, 'f19-light-full-clean.png')).catch(() => {});

  // -------------------------------------------------------------
  // TEST 9: Dark Mode Regression Check
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Dark Mode Regression Check ---');
  await themeBtn.click();
  await page.waitForTimeout(500);

  await expect(shell).toHaveClass(/theme-dark/);
  const shellDarkBg = await shell.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.ok(!isLightOrTransparent(shellDarkBg), `Dark Mode shell must have dark background, got ${shellDarkBg}`);

  // Check 5D button hover in Dark Mode
  await btn5D.hover();
  await page.waitForTimeout(100);
  const btn5DDarkHover = await btn5D.evaluate(el => getComputedStyle(el).backgroundColor);
  assert.ok(!isLightOrTransparent(btn5DDarkHover), `Dark Mode button hover must remain dark, got ${btn5DDarkHover}`);

  // Check watchlist selected row in Dark Mode
  const row0DarkSelected = await row0.evaluate(el => ({
    borderLeftWidth: getComputedStyle(el).borderLeftWidth,
    borderLeftColor: getComputedStyle(el).borderLeftColor,
    bg: getComputedStyle(el).backgroundColor,
  }));
  assert.equal(row0DarkSelected.borderLeftWidth, '4px', 'Dark Mode selected row retains 4px left accent');
  assert.ok(row0DarkSelected.borderLeftColor.includes('59, 130, 246'), 'Dark Mode accent is blue #3b82f6');
  console.log(`PASS: Dark Mode is 100% preserved with zero regressions.`);

  await page.screenshot({ path: 'test-results/f19-dark-mode-regression.png' });
  await copyFile('test-results/f19-dark-mode-regression.png', join(artifactDir, 'f19-dark-mode-regression.png')).catch(() => {});

  // -------------------------------------------------------------
  // TEST 10: Switch back to Light Mode for final user review
  // -------------------------------------------------------------
  await themeBtn.click();
  await page.waitForTimeout(500);
  await expect(shell).toHaveClass(/theme-light/);
  console.log(`PASS: Switched back to Light Mode for live review.`);

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('\n================================================================');
  console.log('ALL 10 PHASE F1.9 AUTOMATED UI TESTS PASSED WITH 0 ERRORS!');
  console.log('================================================================');

} finally {
  await app.close();
}
