import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-responsive-audit-'));
await cp(backupDir, profile, { recursive: true });
await mkdir('test-results', { recursive: true });

console.log('===============================================================');
console.log('GLOBAL MARKET TERMINAL — COMPREHENSIVE RESPONSIVE UI AUDIT');
console.log('Phase UI-4A: Testing 7 Viewports across Desktop and Responsive Nav');
console.log('Viewports: 768px, 1024px, 1280px, 1300px, 1301px, 1440px, 1600px');
console.log('===============================================================\n');

let app, page;
const viewports = [
  { width: 1600, height: 1000, name: '1600px (Desktop Wide)' },
  { width: 1440, height: 900,  name: '1440px (Desktop Standard)' },
  { width: 1301, height: 800,  name: '1301px (Desktop Boundary)' },
  { width: 1300, height: 800,  name: '1300px (Responsive Threshold)' },
  { width: 1280, height: 800,  name: '1280px (Narrow Laptop)' },
  { width: 1024, height: 768,  name: '1024px (Small Display)' },
  { width: 768,  height: 650,  name: '768px (Minimum Width)' }
];

const auditResults = {};
let allPassed = true;

try {
  app = await electron.launch({
    executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    env: { ...process.env, IMT_TEST_DATA_DIR: profile },
    timeout: 60000,
  });

  page = await app.firstWindow();
  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2000);

  // 1. Audit each viewport in the matrix
  for (const vp of viewports) {
    console.log(`\n--- Auditing Viewport: ${vp.width} x ${vp.height} [${vp.name}] ---`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(600);

    const isDesktopNav = vp.width > 1300;
    const desktopNavLocator = page.locator('.desktop-workspace-nav');
    const responsiveNavLocator = page.locator('.responsive-workspace-nav');
    const workspaceMenuBtn = page.getByLabel('Workspaces menu', { exact: true });

    const checks = {
      viewport: `${vp.width}x${vp.height}`,
      isDesktopNavExpected: isDesktopNav,
      desktopNavVisible: await desktopNavLocator.isVisible(),
      responsiveNavVisible: await responsiveNavLocator.isVisible(),
      chartsAccessible: false,
      screenerAccessible: false,
      alertsAccessible: false,
      navigationRoundTrip: false,
    };

    if (isDesktopNav) {
      // Direct desktop buttons must be visible
      const directScreener = page.getByLabel('Screener workspace', { exact: true });
      const directAlerts = page.getByLabel('Alerts workspace', { exact: true });
      checks.screenerAccessible = await directScreener.isVisible();
      checks.alertsAccessible = await directAlerts.isVisible();
      checks.chartsAccessible = true; // currently on charts

      assert.ok(checks.desktopNavVisible, `Desktop nav must be visible at ${vp.width}px`);
      assert.ok(!checks.responsiveNavVisible, `Responsive nav must be hidden at ${vp.width}px`);
      assert.ok(checks.screenerAccessible, `Direct Screener button must be visible at ${vp.width}px`);
      assert.ok(checks.alertsAccessible, `Direct Alerts button must be visible at ${vp.width}px`);

      // Test functional navigation to Screener and back
      await directScreener.click();
      await expect(page.getByTestId('screener-page')).toBeVisible({ timeout: 10000 });
      // Return to charts via onBack or titlebar
      await directScreener.click(); // clicks "Charts" button
      await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 10000 });

      // Test functional navigation to Alerts and back
      await directAlerts.click();
      await expect(page.getByTestId('alerts-page')).toBeVisible({ timeout: 10000 });
      await directAlerts.click(); // clicks "Charts" button
      await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 10000 });

      checks.navigationRoundTrip = true;
    } else {
      // Responsive dropdown menu must be active
      assert.ok(!checks.desktopNavVisible, `Desktop nav must be hidden at ${vp.width}px`);
      assert.ok(checks.responsiveNavVisible, `Responsive nav must be visible at ${vp.width}px`);
      assert.ok(await workspaceMenuBtn.isVisible(), `Workspaces menu button must be visible at ${vp.width}px`);

      // Open menu
      await workspaceMenuBtn.click();
      const menu = page.getByRole('menu', { name: 'Workspaces' });
      await expect(menu).toBeVisible();

      const itemCharts = page.getByRole('menuitem', { name: /Charts/i });
      const itemScreener = page.getByRole('menuitem', { name: /Screener/i });
      const itemAlerts = page.getByRole('menuitem', { name: /Alerts/i });

      assert.ok(await itemCharts.isVisible(), 'Charts item must be visible in menu');
      assert.ok(await itemScreener.isVisible(), 'Screener item must be visible in menu');
      assert.ok(await itemAlerts.isVisible(), 'Alerts item must be visible in menu');

      // Verify active indicator on Charts
      assert.equal(await itemCharts.getAttribute('aria-current'), 'page');
      assert.equal(await itemScreener.getAttribute('aria-current'), null);
      assert.equal(await itemAlerts.getAttribute('aria-current'), null);

      checks.chartsAccessible = true;

      // Navigate to Screener
      await itemScreener.click();
      await expect(menu).not.toBeVisible();
      await expect(page.getByTestId('screener-page')).toBeVisible({ timeout: 10000 });
      checks.screenerAccessible = true;

      // While on Screener, open Workspaces menu in titlebar
      await workspaceMenuBtn.click();
      await expect(menu).toBeVisible();
      assert.equal(await itemScreener.getAttribute('aria-current'), 'page');

      // Navigate directly to Alerts from Screener
      await itemAlerts.click();
      await expect(menu).not.toBeVisible();
      await expect(page.getByTestId('alerts-page')).toBeVisible({ timeout: 10000 });
      checks.alertsAccessible = true;

      // While on Alerts, open Workspaces menu in titlebar
      await workspaceMenuBtn.click();
      await expect(menu).toBeVisible();
      assert.equal(await itemAlerts.getAttribute('aria-current'), 'page');

      // Return to Charts
      await itemCharts.click();
      await expect(menu).not.toBeVisible();
      await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 10000 });

      // Verify chart canvas and layout restored
      const canvas = page.getByTestId('pane-0').locator('.chart-canvas');
      await expect(canvas).toBeVisible();

      checks.navigationRoundTrip = true;
    }

    auditResults[`${vp.width}x${vp.height}`] = checks;
    console.log(`PASS for ${vp.width}x${vp.height}: Round trip verified`);
  }

  // 2. Keyboard accessibility and dismissal test at 1024px
  console.log('\n--- Auditing Keyboard Navigation & Dismissal (1024px) ---');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(500);

  const menuBtn = page.getByLabel('Workspaces menu', { exact: true });
  const menu = page.getByRole('menu', { name: 'Workspaces' });

  // Focus button and press Enter to open
  await menuBtn.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();

  // Test ArrowDown and ArrowUp navigation
  await page.keyboard.press('ArrowDown');
  const focusedLabel1 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  console.log('Focused after ArrowDown:', focusedLabel1);
  assert.ok(focusedLabel1?.includes('Screener'), 'ArrowDown should move focus to Screener');

  await page.keyboard.press('ArrowDown');
  const focusedLabel2 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  console.log('Focused after second ArrowDown:', focusedLabel2);
  assert.ok(focusedLabel2?.includes('Alerts'), 'ArrowDown should move focus to Alerts');

  await page.keyboard.press('ArrowUp');
  const focusedLabel3 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  console.log('Focused after ArrowUp:', focusedLabel3);
  assert.ok(focusedLabel3?.includes('Screener'), 'ArrowUp should move focus back to Screener');

  // Test Escape key closes menu and restores focus to button
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  const focusedAfterEscape = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  assert.equal(focusedAfterEscape, 'Workspaces menu', 'Focus must return to Workspaces menu button on Escape');
  console.log('PASS: Escape closed menu and restored focus to Workspaces menu button');

  // Test click outside closes menu without blocking target
  await menuBtn.click();
  await expect(menu).toBeVisible();
  // Click on chart canvas outside menu
  await page.getByTestId('pane-0').locator('.chart-canvas').click({ position: { x: 50, y: 50 } });
  await expect(menu).not.toBeVisible();
  console.log('PASS: Click outside closed menu immediately without blocking');

  // 3. Theme Test (Dark Mode vs Light Mode)
  console.log('\n--- Auditing Light Mode vs Dark Mode Styling ---');
  // Toggle theme to Light Mode
  await page.getByLabel('Toggle theme', { exact: true }).click();
  await page.waitForTimeout(500);
  assert.ok(await page.locator('.terminal-shell.theme-light').isVisible(), 'Shell must have theme-light class');

  // Open menu in Light Mode
  await menuBtn.click();
  await expect(menu).toBeVisible();
  await page.screenshot({ path: 'test-results/responsive-menu-light-mode.png' });
  await menuBtn.click(); // close menu

  // Toggle theme back to Dark Mode
  await page.getByLabel('Toggle theme', { exact: true }).click();
  await page.waitForTimeout(500);
  assert.ok(!await page.locator('.terminal-shell.theme-light').isVisible(), 'Shell must return to dark mode');

  // Capture screenshot of Dark Mode responsive menu at 1024px
  await menuBtn.click();
  await expect(menu).toBeVisible();
  await page.screenshot({ path: 'test-results/responsive-menu-dark-mode-1024.png' });
  await menuBtn.click(); // close menu

  // Capture screenshot at 768px minimum width
  await page.setViewportSize({ width: 768, height: 650 });
  await page.waitForTimeout(500);
  await menuBtn.click();
  await expect(menu).toBeVisible();
  await page.screenshot({ path: 'test-results/responsive-menu-768px.png' });
  await menuBtn.click();

  // Return to standard 1440px viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/responsive-desktop-1440px.png' });

  console.log('\n===============================================================');
  console.log('RESPONSIVE AUDIT SUMMARY MATRIX');
  console.log('===============================================================');
  console.table(auditResults);

  console.log('\nALL 7 VIEWPORT MATRIX AUDITS AND FUNCTIONAL INTERACTION TESTS PASSED!');
} catch (err) {
  console.error('Audit failed with error:', err);
  allPassed = false;
  throw err;
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
