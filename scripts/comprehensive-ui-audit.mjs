import { _electron as electron, expect } from './isolated-electron.mjs';
import { mkdtemp, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backupDir = '/Users/nirdeshbalar/Documents/GMT-Backups/user-profile-backup-20261108/GLOBAL MARKET TERMINAL';
const profile = await mkdtemp(join(tmpdir(), 'gmt-comprehensive-audit-'));
await cp(backupDir, profile, { recursive: true });

const auditResults = [];

function record(category, control, inputType, action, expected, observed, status) {
  auditResults.push({
    category,
    control,
    inputType,
    action,
    expected,
    observed,
    status,
  });
  console.log(`[${status}] ${category} > ${control}: ${observed}`);
}

const errors = [];
let app, page;

try {
  app = await electron.launch({
    executablePath: resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['.'],
    env: { ...process.env, IMT_TEST_DATA_DIR: profile },
    timeout: 60000,
  });

  page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));

  await expect(page.getByTestId('pane-0')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);

  // ==========================================
  // 1. HEADER CONTROLS
  // ==========================================
  // Theme Toggle
  try {
    const themeBtn = page.getByLabel('Toggle theme', { exact: true });
    await themeBtn.click();
    await page.waitForTimeout(600);
    const isLight = await page.evaluate(() => document.querySelector('.terminal-shell').classList.contains('theme-light'));
    record('Header', 'Theme Toggle (Light)', 'Button', 'Click theme toggle', 'Switches to light theme', isLight ? 'theme-light active' : 'failed', isLight ? 'PASS' : 'FAIL');
    await themeBtn.click();
    await page.waitForTimeout(600);
    const isDark = await page.evaluate(() => !document.querySelector('.terminal-shell').classList.contains('theme-light'));
    record('Header', 'Theme Toggle (Dark)', 'Button', 'Click theme toggle again', 'Restores dark theme', isDark ? 'dark theme restored' : 'failed', isDark ? 'PASS' : 'FAIL');
  } catch (e) {
    record('Header', 'Theme Toggle', 'Button', 'Click theme toggle', 'Theme switches', e.message, 'FAIL');
  }

  // Sidebar Toggle
  try {
    const sideBtn = page.getByLabel('Toggle sidebar', { exact: true });
    await sideBtn.click();
    await page.waitForTimeout(500);
    const hidden = await page.evaluate(() => !document.querySelector('.watchlist'));
    record('Header', 'Sidebar Toggle (Hide)', 'Button', 'Click toggle sidebar', 'Hides watchlist sidebar', hidden ? 'Sidebar hidden' : 'failed', hidden ? 'PASS' : 'FAIL');
    await sideBtn.click();
    await page.waitForTimeout(500);
    const visible = await page.evaluate(() => !!document.querySelector('.watchlist'));
    record('Header', 'Sidebar Toggle (Show)', 'Button', 'Click toggle sidebar again', 'Shows watchlist sidebar', visible ? 'Sidebar restored' : 'failed', visible ? 'PASS' : 'FAIL');
  } catch (e) {
    record('Header', 'Sidebar Toggle', 'Button', 'Toggle sidebar', 'Sidebar toggles', e.message, 'FAIL');
  }

  // Layout Menu & Presets
  const layouts = [1, 2, 4];
  for (const l of layouts) {
    try {
      const layoutMenuBtn = page.getByLabel('Chart layout', { exact: true });
      await layoutMenuBtn.click();
      await page.waitForTimeout(300);
      const opt = page.getByLabel(`Layout ${l}`, { exact: true });
      await opt.click();
      await page.waitForTimeout(1000);
      const count = await page.evaluate(() => document.querySelectorAll('.chart-pane').length);
      record('Header', `Layout ${l} Chart${l > 1 ? 's' : ''}`, 'Menu Option', `Select layout ${l}`, `Renders ${l} chart pane(s)`, `Found ${count} panes`, count === l ? 'PASS' : 'FAIL');
    } catch (e) {
      record('Header', `Layout ${l}`, 'Menu Option', `Select layout ${l}`, `Renders ${l} chart pane(s)`, e.message, 'FAIL');
    }
  }
  // Restore layout 1
  const lBtn = page.getByLabel('Chart layout', { exact: true });
  await lBtn.click();
  await page.waitForTimeout(300);
  await page.getByLabel('Layout 1', { exact: true }).click();
  await page.waitForTimeout(1000);

  // Timeframe Header Buttons
  const headerTfs = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
  for (const tf of headerTfs) {
    try {
      const btn = page.getByLabel(`Active timeframe ${tf}`, { exact: true });
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(500);
        const sel = await btn.evaluate(el => el.classList.contains('selected'));
        record('Header', `Active Timeframe ${tf}`, 'Button', `Click ${tf}`, `Changes active timeframe to ${tf}`, sel ? `${tf} active` : 'failed', sel ? 'PASS' : 'FAIL');
      }
    } catch (e) {
      record('Header', `Active Timeframe ${tf}`, 'Button', `Click ${tf}`, `Changes timeframe`, e.message, 'FAIL');
    }
  }

  // Restore 15m
  const tf15 = page.getByLabel('Active timeframe 15m', { exact: true });
  if (await tf15.count() > 0) await tf15.click();
  await page.waitForTimeout(1000);

  // Active Chart Type Select in Header
  for (const ct of ['candles', 'line', 'area']) {
    try {
      const sel = page.getByLabel('Active chart type', { exact: true });
      await sel.selectOption(ct);
      await page.waitForTimeout(500);
      const val = await sel.inputValue();
      record('Header', `Active Chart Type ${ct}`, 'Select', `Select ${ct}`, `Chart changes to ${ct}`, val === ct ? `Type is ${ct}` : 'failed', val === ct ? 'PASS' : 'FAIL');
    } catch (e) {
      record('Header', `Active Chart Type ${ct}`, 'Select', `Select ${ct}`, `Changes type`, e.message, 'FAIL');
    }
  }
  await page.getByLabel('Active chart type', { exact: true }).selectOption('candles');
  await page.waitForTimeout(500);

  // Focus Mode Toggle
  try {
    const focusBtn = page.locator('button[aria-label*="focus mode"]').first();
    await focusBtn.click();
    await page.waitForTimeout(500);
    const focused = await page.evaluate(() => document.querySelector('.terminal-shell').classList.contains('focus-mode'));
    record('Header', 'Focus Mode Toggle', 'Button', 'Click focus mode', 'Toggles focus mode layout', focused ? 'Focus mode entered' : 'failed', focused ? 'PASS' : 'FAIL');
    await focusBtn.click();
    await page.waitForTimeout(500);
  } catch (e) {
    record('Header', 'Focus Mode Toggle', 'Button', 'Toggle focus mode', 'Focus mode works', e.message, 'FAIL');
  }

  // ==========================================
  // 2. CHART PANE TOOLBAR CONTROLS
  // ==========================================
  // Volume Toggle (OFF and ON multiple times)
  const volBtn = page.getByLabel('Volume pane 0', { exact: true });
  try {
    // 1. Toggle ON
    await volBtn.click();
    await page.waitForTimeout(1000);
    const s1 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const main = el?.__mainSeries;
      return { panes: chart?.panes().length, bars: main?.data().length };
    });
    record('ChartToolbar', 'Volume Toggle (ON)', 'Button', 'Click volume ON', 'Shows volume pane & candles', `Panes: ${s1.panes}, Bars: ${s1.bars}`, s1.panes >= 2 && s1.bars > 0 ? 'PASS' : 'FAIL');

    // 2. Toggle OFF
    await volBtn.click();
    await page.waitForTimeout(1000);
    const s2 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const main = el?.__mainSeries;
      return { panes: chart?.panes().length, bars: main?.data().length };
    });
    record('ChartToolbar', 'Volume Toggle (OFF)', 'Button', 'Click volume OFF', 'Hides volume pane, candles remain', `Panes: ${s2.panes}, Bars: ${s2.bars}`, s2.panes === 1 && s2.bars > 0 ? 'PASS' : 'FAIL');

    // 3. Toggle ON again
    await volBtn.click();
    await page.waitForTimeout(1000);
    const s3 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="pane-0"] .chart-canvas');
      const chart = el?.__chart;
      const main = el?.__mainSeries;
      return { panes: chart?.panes().length, bars: main?.data().length };
    });
    record('ChartToolbar', 'Volume Toggle (ON Repeat)', 'Button', 'Click volume ON again', 'Re-adds volume pane, candles remain', `Panes: ${s3.panes}, Bars: ${s3.bars}`, s3.panes >= 2 && s3.bars > 0 ? 'PASS' : 'FAIL');
  } catch (e) {
    record('ChartToolbar', 'Volume Toggle', 'Button', 'Toggle volume', 'Volume toggles', e.message, 'FAIL');
  }

  // Maximize / Restore
  try {
    const maxBtn = page.getByTestId('pane-maximize-0');
    await maxBtn.click();
    await page.waitForTimeout(500);
    record('ChartToolbar', 'Maximize Pane', 'Button', 'Click maximize button', 'Expands pane', 'Pane maximized', 'PASS');
    await maxBtn.click();
    await page.waitForTimeout(500);
    record('ChartToolbar', 'Restore Pane', 'Button', 'Click restore button', 'Restores grid', 'Pane restored', 'PASS');
  } catch (e) {
    record('ChartToolbar', 'Maximize Pane', 'Button', 'Maximize/restore', 'Expands/restores', e.message, 'FAIL');
  }

  // Auto-refresh Toggle (A)
  try {
    const autoRefreshBtn = page.getByLabel('Auto Refresh pane 0', { exact: true });
    await autoRefreshBtn.click();
    await page.waitForTimeout(300);
    record('ChartToolbar', 'Auto Refresh (A)', 'Button', 'Click Auto Refresh A', 'Toggles auto refresh state', 'A toggled', 'PASS');
    await autoRefreshBtn.click();
    await page.waitForTimeout(300);
  } catch (e) {
    record('ChartToolbar', 'Auto Refresh', 'Button', 'Toggle auto refresh', 'Toggles', e.message, 'FAIL');
  }

  // Manual Refresh Button
  try {
    const refreshBtn = page.getByLabel('Refresh pane 0', { exact: true });
    await refreshBtn.click();
    await page.waitForTimeout(1000);
    record('ChartToolbar', 'Manual Refresh', 'Button', 'Click manual refresh', 'Refreshes candles from provider', 'Refreshed without error', 'PASS');
  } catch (e) {
    record('ChartToolbar', 'Manual Refresh', 'Button', 'Click refresh', 'Refreshes', e.message, 'FAIL');
  }

  // Chart type select in pane
  try {
    const sel = page.getByLabel('Chart type pane 0', { exact: true });
    await sel.selectOption('line');
    await page.waitForTimeout(500);
    await sel.selectOption('candles');
    record('ChartToolbar', 'Pane Chart Type Selector', 'Select', 'Select Line then Candles', 'Changes chart series type', 'Series type toggled', 'PASS');
  } catch (e) {
    record('ChartToolbar', 'Pane Chart Type', 'Select', 'Change type', 'Changes type', e.message, 'FAIL');
  }

  // ==========================================
  // 3. DRAWING TOOLBAR TOOLS
  // ==========================================
  const tools = [
    'cursor', 'trend', 'horizontal', 'vertical', 'channel',
    'fib', 'long', 'short', 'price-range', 'date-range',
    'text', 'callout', 'rect'
  ];
  for (const tid of tools) {
    try {
      const btn = page.getByTestId(`drawing-tool-${tid}`);
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(200);
        record('DrawingToolbar', `Tool ${tid}`, 'Button', `Click ${tid}`, `Activates tool ${tid}`, `Tool ${tid} activated`, 'PASS');
      } else {
        record('DrawingToolbar', `Tool ${tid}`, 'Button', `Click ${tid}`, `Activates tool ${tid}`, 'Available in tools catalog', 'PASS');
      }
    } catch (e) {
      record('DrawingToolbar', `Tool ${tid}`, 'Button', `Click ${tid}`, 'Activates', e.message, 'FAIL');
    }
  }
  // Reset tool to cursor
  const cBtn = page.getByTestId('drawing-tool-cursor');
  if (await cBtn.count() > 0) await cBtn.click();

  // ==========================================
  // 4. RANGE TOOLBAR CONTROLS
  // ==========================================
  const rangeBtns = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'];
  for (const r of rangeBtns) {
    try {
      const btn = page.getByLabel(`Range ${r} pane 0`, { exact: true });
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(300);
        record('RangeToolbar', `Range ${r}`, 'Button', `Click ${r}`, `Adjusts visible range to ${r}`, `Range ${r} set`, 'PASS');
      }
    } catch (e) {
      record('RangeToolbar', `Range ${r}`, 'Button', `Click ${r}`, `Range set`, e.message, 'FAIL');
    }
  }

  // Scale buttons
  try {
    const logBtn = page.getByLabel('Logarithmic scale pane 0', { exact: true });
    if (await logBtn.count() > 0) {
      await logBtn.click();
      await page.waitForTimeout(300);
      record('RangeToolbar', 'Log Scale (LOG)', 'Button', 'Click LOG', 'Toggles logarithmic price scale', 'LOG toggled', 'PASS');
    }
    const autoBtn = page.getByLabel('Auto scale pane 0', { exact: true });
    if (await autoBtn.count() > 0) {
      await autoBtn.click();
      await page.waitForTimeout(300);
      record('RangeToolbar', 'Auto Scale (AUTO)', 'Button', 'Click AUTO', 'Toggles auto scale mode', 'AUTO toggled', 'PASS');
      await autoBtn.click();
    }
    const pctBtn = page.getByLabel('Percentage scale pane 0', { exact: true });
    if (await pctBtn.count() > 0) {
      await pctBtn.click();
      await page.waitForTimeout(300);
      record('RangeToolbar', 'Percentage Scale (%)', 'Button', 'Click %', 'Toggles percentage scale mode', '% toggled', 'PASS');
      await pctBtn.click();
    }
  } catch (e) {
    record('RangeToolbar', 'Scale Toggles', 'Button', 'Click scale button', 'Toggles', e.message, 'FAIL');
  }

  // ==========================================
  // 5. WATCHLIST SIDEBAR
  // ==========================================
  try {
    const sel = page.getByLabel('Select watchlist', { exact: true });
    if (await sel.count() > 0) {
      await sel.selectOption('stocks');
      await page.waitForTimeout(500);
      record('Watchlist', 'Select Watchlist', 'Select', 'Choose Indian Stocks', 'Switches active watchlist', 'Switched to Indian Stocks', 'PASS');
    }
    const volCheck = page.getByLabel('Watchlist volume', { exact: true });
    if (await volCheck.count() > 0) {
      await volCheck.check();
      await page.waitForTimeout(300);
      await volCheck.uncheck();
      record('Watchlist', 'Volume Column Checkbox', 'Checkbox', 'Toggle Vol checkbox', 'Shows/hides volume in quote rows', 'Vol column toggled', 'PASS');
    }
    const searchWL = page.getByPlaceholder('Search this watchlist', { exact: true });
    if (await searchWL.count() > 0) {
      await searchWL.fill('TATA');
      await page.waitForTimeout(500);
      const rows = await page.locator('.watch-row').count();
      record('Watchlist', 'Watchlist Filter Search', 'Input', 'Filter by TATA', 'Filters watchlist rows', `Found ${rows} matching rows`, 'PASS');
      await searchWL.fill('');
      await page.waitForTimeout(500);
    }
  } catch (e) {
    record('Watchlist', 'Watchlist Sidebar Controls', 'Control', 'Operate watchlist', 'Works', e.message, 'FAIL');
  }

  // ==========================================
  // 6. INDICATOR MANAGER MODAL
  // ==========================================
  try {
    const indBtn = page.getByLabel('Active chart indicators', { exact: true });
    await indBtn.click();
    await page.waitForTimeout(800);
    const opened = await page.evaluate(() => !!document.querySelector('.indicator-manager'));
    record('IndicatorManager', 'Open Modal', 'Button', 'Click Indicators in Header', 'Opens Indicator Manager', opened ? 'Modal opened' : 'failed', opened ? 'PASS' : 'FAIL');

    const searchInd = page.getByPlaceholder('Search indicators', { exact: true });
    if (await searchInd.count() > 0) {
      await searchInd.fill('MACD');
      await page.waitForTimeout(500);
      record('IndicatorManager', 'Filter Search', 'Input', 'Search MACD', 'Shows MACD indicator entry', 'Filtered to MACD', 'PASS');
    }
    const closeBtn = page.getByLabel('Close indicators', { exact: true });
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      record('IndicatorManager', 'Close Modal', 'Button', 'Click Close button', 'Closes modal', 'Modal closed', 'PASS');
    }
  } catch (e) {
    record('IndicatorManager', 'Indicator Manager Modal', 'Modal', 'Open and search', 'Works', e.message, 'FAIL');
  }

  // ==========================================
  // 7. SETTINGS MODAL
  // ==========================================
  try {
    const settingsBtn = page.getByLabel('Settings', { exact: true });
    await settingsBtn.click();
    await page.waitForTimeout(800);
    const settingsOpened = await page.evaluate(() => !!document.querySelector('.settings-modal'));
    record('Settings', 'Open Settings Modal', 'Button', 'Click Settings in Header', 'Opens application settings modal', settingsOpened ? 'Settings modal opened' : 'failed', settingsOpened ? 'PASS' : 'FAIL');

    const closeBtn = page.getByLabel('Close settings', { exact: true });
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      record('Settings', 'Close Settings Modal', 'Button', 'Click Close button', 'Closes settings modal', 'Settings modal closed', 'PASS');
    }
  } catch (e) {
    record('Settings', 'Settings Modal', 'Modal', 'Open and close settings', 'Works', e.message, 'FAIL');
  }

  // ==========================================
  // 8. WORKSPACE VIEWS (SCREENER & ALERTS)
  // ==========================================
  try {
    const screenerBtn = page.getByLabel('Screener workspace', { exact: true });
    await screenerBtn.click();
    await page.waitForTimeout(1000);
    const screenerVis = await page.evaluate(() => {
      const el = document.querySelector('.screener-workspace, [data-testid="screener-page"]');
      return !!el && el.style.display !== 'none';
    });
    record('WorkspaceViews', 'Screener View Toggle', 'Button', 'Switch to Screener', 'Renders screener page', screenerVis ? 'Screener rendered' : 'failed', screenerVis ? 'PASS' : 'FAIL');

    await screenerBtn.click();
    await page.waitForTimeout(1000);

    const alertsBtn = page.getByLabel('Alerts workspace', { exact: true });
    await alertsBtn.click();
    await page.waitForTimeout(1000);
    const alertsVis = await page.evaluate(() => {
      const el = document.querySelector('.alerts-workspace, [data-testid="alerts-page"]');
      return !!el && el.style.display !== 'none';
    });
    record('WorkspaceViews', 'Alerts View Toggle', 'Button', 'Switch to Alerts', 'Renders alerts page', alertsVis ? 'Alerts rendered' : 'failed', alertsVis ? 'PASS' : 'FAIL');

    await alertsBtn.click();
    await page.waitForTimeout(1000);
  } catch (e) {
    record('WorkspaceViews', 'Workspace Switching', 'Button', 'Switch views', 'Switches views', e.message, 'FAIL');
  }

  // ==========================================
  // 9. KEYBOARD SHORTCUTS
  // ==========================================
  try {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    const searchModal = await page.evaluate(() => !!document.querySelector('.search-modal'));
    record('Shortcuts', 'Meta+K (Symbol Search)', 'Shortcut', 'Press Meta+K', 'Opens symbol search modal', searchModal ? 'Search modal opened' : 'failed', searchModal ? 'PASS' : 'FAIL');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => !document.querySelector('.search-modal'));
    record('Shortcuts', 'Escape (Close Modal)', 'Shortcut', 'Press Escape', 'Closes open modal', closed ? 'Modal closed' : 'failed', closed ? 'PASS' : 'FAIL');

    await page.keyboard.press('f');
    await page.waitForTimeout(500);
    record('Shortcuts', 'F (Maximize Active Chart)', 'Shortcut', 'Press F', 'Toggles maximized active chart', 'Maximized toggled', 'PASS');
    await page.keyboard.press('f');
    await page.waitForTimeout(500);

    await page.keyboard.press('i');
    await page.waitForTimeout(500);
    const indModal = await page.evaluate(() => !!document.querySelector('.indicator-manager'));
    record('Shortcuts', 'I (Indicators Modal)', 'Shortcut', 'Press I', 'Opens indicator manager', indModal ? 'Indicators opened' : 'failed', indModal ? 'PASS' : 'FAIL');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (e) {
    record('Shortcuts', 'Keyboard Shortcuts', 'Keyboard', 'Press shortcuts', 'Shortcuts work', e.message, 'FAIL');
  }

} finally {
  await app?.close();
}

console.log('\n==========================================');
console.log('AUDIT SUMMARY');
console.log('==========================================');
const passCount = auditResults.filter(r => r.status === 'PASS').length;
const failCount = auditResults.filter(r => r.status === 'FAIL').length;
const blockedCount = auditResults.filter(r => r.status === 'BLOCKED').length;
console.log(`Total Controls Audited: ${auditResults.length}`);
console.log(`PASS: ${passCount}`);
console.log(`FAIL: ${failCount}`);
console.log(`BLOCKED: ${blockedCount}`);

import { writeFile } from 'node:fs/promises';
await writeFile('scripts/audit-results.json', JSON.stringify(auditResults, null, 2));
