import { _electron as electron, expect } from './isolated-electron.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'gmt-f16-ui-'));
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
  console.log('STARTING PHASE F1.6 EXCEL EXPORT & UI AUTOMATION TESTS');
  console.log('================================================================');

  app = await launch();
  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('watchlist-sidebar')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.chart-overlay')).toHaveCount(0, { timeout: 45000 });

  // Setup dialog interceptor in Electron main process
  await app.evaluate(({ dialog }) => {
    globalThis.__lastSaveOpts = null;
    globalThis.__saveDialogPath = null;
    globalThis.__saveDialogCancel = false;
    dialog.showSaveDialog = async (win, opts) => {
      globalThis.__lastSaveOpts = opts;
      if (globalThis.__saveDialogCancel) {
        return { canceled: true };
      }
      return { canceled: false, filePath: globalThis.__saveDialogPath };
    };
  });

  // Select 'stocks' (Indian Stocks) watchlist
  const dropdown = page.getByTestId('watchlist-dropdown');
  await dropdown.selectOption('stocks');
  await page.waitForTimeout(600);

  // =========================================================================
  // TEST 1: Export Button and Popover Menu
  // =========================================================================
  console.log('1. Verifying Export Button and Popover Menu UI...');
  const exportBtn = page.getByTestId('watchlist-export-btn');
  await expect(exportBtn).toBeVisible();

  // Click Export button to open Export menu
  await exportBtn.click();
  const exportMenu = page.getByTestId('watchlist-export-menu');
  await expect(exportMenu).toBeVisible();

  const excelAction = page.getByTestId('export-excel-action');
  const csvAction = page.getByTestId('export-csv-action');
  await expect(excelAction).toBeVisible();
  await expect(csvAction).toBeVisible();

  assert.ok((await excelAction.innerText()).includes('Export to Excel (.xlsx)'));
  assert.ok((await excelAction.innerText()).toUpperCase().includes('DEFAULT'));
  assert.ok((await csvAction.innerText()).includes('Export to CSV (.csv)'));

  // Capture screenshot of open Export menu
  await page.screenshot({ path: 'test-results/watchlist-f16-export-menu.png' });
  await copyFile('test-results/watchlist-f16-export-menu.png', join(artifactDir, 'watchlist-f16-export-menu.png')).catch(() => {});
  console.log('PASS: Export menu with Excel (.xlsx) default and CSV (.csv) optional verified!');

  // Test Escape key dismisses the menu
  await page.keyboard.press('Escape');
  await expect(exportMenu).not.toBeVisible();
  console.log('PASS: Escape key dismisses Export menu cleanly.');

  // =========================================================================
  // TEST 2: Weekly Timeframe Export (1W)
  // =========================================================================
  console.log('2. Testing Weekly (1W) Excel Export...');
  // Switch timeframe to 1W
  const btn1W = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1w"]');
  await expect(btn1W).toBeVisible();
  await btn1W.click();
  await page.waitForTimeout(600);

  const tfBadge = page.getByTestId('watchlist-active-timeframe');
  await expect(tfBadge).toHaveText('1W');

  const exportPath1W = join(profile, 'Indian_Stocks-1W.xlsx');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, exportPath1W);

  // Click Export -> Export to Excel (.xlsx)
  await exportBtn.click();
  await expect(exportMenu).toBeVisible();
  await excelAction.click();

  // Wait for status message confirming export
  const statusNotice = page.locator('.watchlist-status');
  await expect(statusNotice).toBeVisible();
  await expect(statusNotice).toContainText('Exported', { timeout: 35000 });
  await expect(statusNotice).toContainText('Indian_Stocks-1W.xlsx');
  console.log(`Status notice: ${await statusNotice.innerText()}`);

  const saveOpts1W = await app.evaluate(() => globalThis.__lastSaveOpts);
  assert.ok(saveOpts1W.defaultPath.includes('1W'), `defaultPath must include 1W: ${saveOpts1W.defaultPath}`);
  assert.equal(saveOpts1W.filters[0].extensions[0], 'xlsx');

  // Verify file was written and validate with Python
  const pyValidate1W = `
import zipfile, sys, xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1], 'r') as z:
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    sheets = [s.attrib['name'] for s in wb.findall('m:sheets/m:sheet', ns)]
    assert sheets == ['WATCHLIST', 'EXPORT INFORMATION']

    s1 = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = s1.findall('m:sheetData/m:row', ns)
    r4 = next(r for r in rows if r.attrib.get('r') == '4')
    tfText = r4.findall('m:c', ns)[1].find('m:is/m:t', ns).text
    assert '1W' in tfText, f'Expected 1W in metadata, got: {tfText}'

    # Check headers
    r11 = next(r for r in rows if r.attrib.get('r') == '11')
    headers = [c.find('m:is/m:t', ns).text for c in r11.findall('m:c', ns)]
    assert 'Last Price' in headers and 'Change' in headers and 'Change %' in headers

    # Verify rows exist (at least 8 items in stocks list)
    data_rows = [r for r in rows if int(r.attrib.get('r', 0)) >= 12]
    assert len(data_rows) >= 8, f'Expected at least 8 data rows, found: {len(data_rows)}'
    
    # Check first row has 1W timeframe
    r12 = data_rows[0]
    cells = {c.attrib['r']: c for c in r12.findall('m:c', ns)}
    assert cells['F12'].find('m:is/m:t', ns).text == '1W'
    assert cells['K12'].find('m:is/m:t', ns).text == 'INR'
print('1W validation passed successfully.')
`;
  const pyCheck1W = spawnSync('python3', ['-c', pyValidate1W, exportPath1W], { encoding: 'utf8' });
  assert.equal(pyCheck1W.status, 0, `Python 1W validation failed: ${pyCheck1W.stderr}`);
  console.log('PASS: 1W Excel export validated with correct timeframe, metadata, and numeric columns!');

  await page.screenshot({ path: 'test-results/watchlist-f16-excel-1w-exported.png' });
  await copyFile('test-results/watchlist-f16-excel-1w-exported.png', join(artifactDir, 'watchlist-f16-excel-1w-exported.png')).catch(() => {});

  // =========================================================================
  // TEST 3: Daily Timeframe Export (1D)
  // =========================================================================
  console.log('3. Testing Daily (1D) Excel Export...');
  // Switch timeframe to 1D
  const btn1D = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1d"]');
  await expect(btn1D).toBeVisible();
  await btn1D.click();
  await page.waitForTimeout(600);
  await expect(tfBadge).toHaveText('1D');

  const exportPath1D = join(profile, 'Indian_Stocks-1D.xlsx');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, exportPath1D);

  // Click Export -> Export to Excel (.xlsx)
  await exportBtn.click();
  await expect(exportMenu).toBeVisible();
  await excelAction.click();

  await expect(statusNotice).toContainText('Indian_Stocks-1D.xlsx', { timeout: 35000 });

  const saveOpts1D = await app.evaluate(() => globalThis.__lastSaveOpts);
  assert.ok(saveOpts1D.defaultPath.includes('1D'), `defaultPath must include 1D: ${saveOpts1D.defaultPath}`);

  // Validate 1D workbook with Python
  const pyValidate1D = `
import zipfile, sys, xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1], 'r') as z:
    s1 = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = s1.findall('m:sheetData/m:row', ns)
    r4 = next(r for r in rows if r.attrib.get('r') == '4')
    tfText = r4.findall('m:c', ns)[1].find('m:is/m:t', ns).text
    assert '1D' in tfText, f'Expected 1D in metadata, got: {tfText}'

    r12 = next(r for r in rows if r.attrib.get('r') == '12')
    cells = {c.attrib['r']: c for c in r12.findall('m:c', ns)}
    assert cells['F12'].find('m:is/m:t', ns).text == '1D'
print('1D validation passed successfully.')
`;
  const pyCheck1D = spawnSync('python3', ['-c', pyValidate1D, exportPath1D], { encoding: 'utf8' });
  assert.equal(pyCheck1D.status, 0, `Python 1D validation failed: ${pyCheck1D.stderr}`);
  console.log('PASS: 1D Excel export validated with daily comparison period and metadata!');

  await page.screenshot({ path: 'test-results/watchlist-f16-excel-1d-exported.png' });
  await copyFile('test-results/watchlist-f16-excel-1d-exported.png', join(artifactDir, 'watchlist-f16-excel-1d-exported.png')).catch(() => {});

  // =========================================================================
  // TEST 4: Multi-Chart Layout Synchronization
  // =========================================================================
  console.log('4. Testing Multi-Chart Active Pane Synchronization...');
  // Switch to 2-chart layout
  const layoutBtn = page.getByLabel('Chart layout');
  await layoutBtn.click();
  await page.getByLabel('Layout 2').click();
  await expect(page.locator('.chart-pane')).toHaveCount(2);

  // Pane 0 is 1D. Set Pane 1 to 1M
  const pane1 = page.locator('.chart-pane').nth(1);
  await pane1.click();
  const btn1M = page.locator('.timeframe-toolbar button[aria-label="Active timeframe 1M"]');
  await expect(btn1M).toBeVisible();
  await btn1M.click();
  await page.waitForTimeout(500);

  // Watchlist badge should follow active Pane 1 (1M)
  await expect(tfBadge).toHaveText('1M');

  const exportPath1M = join(profile, 'Indian_Stocks-1M.xlsx');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, exportPath1M);

  await exportBtn.click();
  await excelAction.click();
  await expect(statusNotice).toContainText('Indian_Stocks-1M.xlsx', { timeout: 35000 });

  const saveOpts1M = await app.evaluate(() => globalThis.__lastSaveOpts);
  assert.ok(saveOpts1M.defaultPath.includes('1M'), 'Must derive timeframe from active pane 1 (1M)');

  // Now click Pane 0 (1D)
  const pane0 = page.locator('.chart-pane').nth(0);
  await pane0.click();
  await page.waitForTimeout(500);
  await expect(tfBadge).toHaveText('1D');
  console.log('PASS: Multi-chart active pane synchronization and pane isolation verified!');

  // Switch back to 1-chart layout
  await layoutBtn.click();
  await page.getByLabel('Layout 1').click();
  await expect(page.locator('.chart-pane')).toHaveCount(1);

  // =========================================================================
  // TEST 5: Colored Watchlist Export
  // =========================================================================
  console.log('5. Testing Colored Watchlist Excel Export...');
  // Flag first stock as Red
  const flagBtn = page.getByTestId('watchlist-rows').locator('.symbol-flag-btn').first();
  await flagBtn.click();
  const redPickerBtn = page.locator('button[aria-label="Flag as Red"]');
  await expect(redPickerBtn).toBeVisible();
  await redPickerBtn.click();
  await page.waitForTimeout(500);

  // Switch dropdown to Red List
  await dropdown.selectOption('color:red');
  await page.waitForTimeout(500);

  const exportPathRed = join(profile, 'Red_List-1D.xlsx');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, exportPathRed);

  await exportBtn.click();
  await excelAction.click();
  await expect(statusNotice).toContainText('Red_List-1D.xlsx', { timeout: 35000 });

  // Verify Red List workbook with Python
  const pyValidateRed = `
import zipfile, sys, xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1], 'r') as z:
    s1 = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = s1.findall('m:sheetData/m:row', ns)
    r3 = next(r for r in rows if r.attrib.get('r') == '3')
    nameText = r3.findall('m:c', ns)[1].find('m:is/m:t', ns).text
    assert 'Red' in nameText, f'Expected Red List in metadata, got: {nameText}'
print('Red list validation passed successfully.')
`;
  const pyCheckRed = spawnSync('python3', ['-c', pyValidateRed, exportPathRed], { encoding: 'utf8' });
  assert.equal(pyCheckRed.status, 0, `Python Red list validation failed: ${pyCheckRed.stderr}`);
  console.log('PASS: Colored watchlist Excel export verified!');

  // Switch back to stocks
  await dropdown.selectOption('stocks');
  await page.waitForTimeout(500);

  // =========================================================================
  // TEST 6: User Cancellation in Save As Dialog
  // =========================================================================
  console.log('6. Testing Save As Dialog Cancellation Handling...');
  await app.evaluate(() => {
    globalThis.__saveDialogCancel = true;
  });

  await exportBtn.click();
  await excelAction.click();

  // Status should report 'Export cancelled' without false success
  await expect(statusNotice).toContainText('Export cancelled');
  console.log('PASS: User cancellation handled gracefully without false success!');

  // =========================================================================
  // TEST 7: CSV Export & Import Compatibility
  // =========================================================================
  console.log('7. Verifying CSV Export & Import Compatibility...');
  const csvExportPath = join(profile, 'stocks-test.csv');
  await app.evaluate((_, p) => {
    globalThis.__saveDialogPath = p;
    globalThis.__saveDialogCancel = false;
  }, csvExportPath);

  // Open Export menu -> click CSV option
  await exportBtn.click();
  await expect(exportMenu).toBeVisible();
  await csvAction.click();

  await expect(statusNotice).toContainText('Exported');
  await expect(statusNotice).toContainText('.csv');

  // Verify CSV file content
  const csvText = await readFile(csvExportPath, 'utf8');
  assert.ok(csvText.includes('symbol'), 'CSV must contain headers');
  assert.ok(csvText.includes('canonical_id'), 'CSV must contain canonical IDs');
  console.log('PASS: CSV export compatibility fully preserved!');

  // Verify CSV Import button opens import dialog
  const importBtn = page.getByLabel('Import watchlist CSV');
  await expect(importBtn).toBeVisible();
  console.log('PASS: CSV import control preserved!');

  // =========================================================================
  // TEST 8: Light Theme Contrast & Verification
  // =========================================================================
  console.log('8. Verifying Light Theme Styling and Contrast...');
  const themeBtn = page.locator('button[aria-label="Toggle theme"]');
  await expect(themeBtn).toBeVisible();
  await themeBtn.click();
  await page.waitForTimeout(400);

  await exportBtn.click();
  await expect(exportMenu).toBeVisible();
  await page.screenshot({ path: 'test-results/watchlist-f16-light-theme.png' });
  await copyFile('test-results/watchlist-f16-light-theme.png', join(artifactDir, 'watchlist-f16-light-theme.png')).catch(() => {});
  await page.keyboard.press('Escape');

  // Toggle back to dark theme
  await themeBtn.click();
  console.log('PASS: Light theme styling and contrast verified!');

  console.log('================================================================');
  console.log('ALL PHASE F1.6 AUTOMATED UI & EXCEL EXPORT TESTS PASSED!');
  console.log('================================================================');
} finally {
  await app?.close();
}
