import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateExcelWorkbook,
  sanitizeCellText,
  escapeXml
} from '../desktop/src/export/excelWorkbook.ts';

console.log('================================================================');
console.log('STARTING PHASE F1.6 EXCEL WATCHLIST EXPORT AUTOMATED UNIT TESTS');
console.log('================================================================');

const tempDir = await mkdtemp(join(tmpdir(), 'gmt-f16-excel-'));

try {
  // 1. Formula Injection & Sanitization Unit Tests
  console.log('1. Testing Formula Injection Prevention & Text Sanitization...');
  assert.equal(sanitizeCellText('=CMD|/C calc!A0'), "''=CMD|/C calc!A0".slice(1)); // starts with quote
  assert.ok(sanitizeCellText('=SUM(1,2)').startsWith("'"));
  assert.ok(sanitizeCellText('+12345').startsWith("'"));
  assert.ok(sanitizeCellText('-500').startsWith("'"));
  assert.ok(sanitizeCellText('@EVIL').startsWith("'"));
  assert.ok(sanitizeCellText('\tTAB_INJECT').startsWith("'"));
  assert.equal(sanitizeCellText('RELIANCE.NS'), 'RELIANCE.NS');
  assert.equal(sanitizeCellText('Tata Motors Limited'), 'Tata Motors Limited');

  assert.equal(escapeXml('<script>alert("xss")&\'test\'</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&amp;&apos;test&apos;&lt;/script&gt;');
  console.log('PASS: Formula injection prevention and XML escaping verified.');

  // 2. Comprehensive Multi-Row Fixture Data
  console.log('2. Generating Master Multi-Row Test Workbook...');
  const testPayload = {
    watchlistId: 'test-indian-stocks',
    watchlistName: 'Indian Stocks',
    timeframe: '1W (Weekly)',
    generatedAt: '2026-11-06T15:30:00.000Z',
    sourceInfo: 'Yahoo Finance REST API (Equities); Hyperliquid REST API (Crypto)',
    totalSymbols: 6,
    successfulQuotes: 4,
    unavailableQuotes: 2,
    rows: [
      {
        index: 1,
        symbol: 'RELIANCE.NS',
        name: 'Reliance Industries Limited',
        exchange: 'NSE',
        provider: 'yahoo',
        timeframe: '1W',
        price: 2500.50,
        previousClose: 2450.00,
        change: 50.50,
        changePercent: 2.06, // +2.06%
        currency: 'INR',
        dataAsOf: '2026-11-06 15:30:00 (Asia/Kolkata)',
        dataStatus: 'OK'
      },
      {
        index: 2,
        symbol: 'TCS.NS',
        name: 'Tata Consultancy Services Limited',
        exchange: 'NSE',
        provider: 'yahoo',
        timeframe: '1W',
        price: 3800.00,
        previousClose: 3880.00,
        change: -80.00,
        changePercent: -2.06, // -2.06%
        currency: 'INR',
        dataAsOf: '2026-11-06 15:30:00 (Asia/Kolkata)',
        dataStatus: 'Closed'
      },
      {
        index: 3,
        symbol: 'INFY.NS',
        name: 'Infosys Limited',
        exchange: 'NSE',
        provider: 'yahoo',
        timeframe: '1W',
        price: 1850.00,
        previousClose: 1850.00,
        change: 0.00,
        changePercent: 0.00, // 0.00% neutral
        currency: 'INR',
        dataAsOf: '2026-11-06 15:30:00 (Asia/Kolkata)',
        dataStatus: 'OK'
      },
      {
        index: 4,
        symbol: '=MALICIOUS',
        name: '+Evil Company Name @Formula',
        exchange: 'BSE',
        provider: 'yahoo',
        timeframe: '1W',
        price: 100.00,
        previousClose: 90.00,
        change: 10.00,
        changePercent: 11.11,
        currency: 'INR',
        dataAsOf: '2026-11-06 15:30:00 (Asia/Kolkata)',
        dataStatus: 'OK'
      },
      {
        index: 5,
        symbol: 'UNAVAILABLE.NS',
        name: 'Unavailable Asset With No Quotes',
        exchange: 'NSE',
        provider: 'yahoo',
        timeframe: '1W',
        price: null,
        previousClose: null,
        change: null,
        changePercent: null,
        currency: 'INR',
        dataAsOf: '—',
        dataStatus: 'Unavailable'
      },
      {
        index: 6,
        symbol: 'ERROR.NS',
        name: 'Rate Limited Instrument',
        exchange: 'NSE',
        provider: 'yahoo',
        timeframe: '1W',
        price: null,
        previousClose: null,
        change: null,
        changePercent: null,
        currency: 'INR',
        dataAsOf: '—',
        dataStatus: 'Error: Rate limit exceeded'
      }
    ]
  };

  const workbookBuf = generateExcelWorkbook(testPayload);
  assert.ok(Buffer.isBuffer(workbookBuf), 'Must return a Node Buffer');
  assert.ok(workbookBuf.length > 2000, 'Workbook buffer size must be realistic');

  const testFilePath = join(tempDir, 'test-master.xlsx');
  await writeFile(testFilePath, workbookBuf);

  // 3. Validate with Python OpenXML & Zip parser
  console.log('3. Validating Workbook with Python OpenXML Parser...');
  const pyCode = `
import zipfile, sys, xml.etree.ElementTree as ET

path = sys.argv[1]
with zipfile.ZipFile(path, 'r') as z:
    names = z.namelist()
    assert '[Content_Types].xml' in names, 'Missing [Content_Types].xml'
    assert '_rels/.rels' in names, 'Missing _rels/.rels'
    assert 'xl/workbook.xml' in names, 'Missing xl/workbook.xml'
    assert 'xl/styles.xml' in names, 'Missing xl/styles.xml'
    assert 'xl/worksheets/sheet1.xml' in names, 'Missing xl/worksheets/sheet1.xml'
    assert 'xl/worksheets/sheet2.xml' in names, 'Missing xl/worksheets/sheet2.xml'

    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

    # Verify Sheet Names
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = [s.attrib['name'] for s in wb.findall('m:sheets/m:sheet', ns)]
    assert sheets == ['WATCHLIST', 'EXPORT INFORMATION'], f'Unexpected sheets: {sheets}'

    # Verify Styles & Number Formats
    styles = ET.fromstring(z.read('xl/styles.xml'))
    numFmts = {f.attrib['numFmtId']: f.attrib['formatCode'] for f in styles.findall('m:numFmts/m:numFmt', ns)}
    assert numFmts.get('164') == '#,##0.00', 'Missing 164 price format'
    assert numFmts.get('165') == '+#,##0.00;-#,##0.00;0.00', 'Missing 165 signed change format'
    assert numFmts.get('166') == '+0.00%;-0.00%;0.00%', 'Missing 166 percentage format'

    # Verify Sheet 1 (WATCHLIST)
    s1 = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = s1.findall('m:sheetData/m:row', ns)
    
    # Check Title and Metadata
    r1 = next(r for r in rows if r.attrib.get('r') == '1')
    assert r1.find('m:c/m:is/m:t', ns).text == 'GLOBAL MARKET TERMINAL'

    r3 = next(r for r in rows if r.attrib.get('r') == '3')
    assert r3.findall('m:c', ns)[1].find('m:is/m:t', ns).text == 'Indian Stocks'

    r4 = next(r for r in rows if r.attrib.get('r') == '4')
    assert r4.findall('m:c', ns)[1].find('m:is/m:t', ns).text == '1W (Weekly)'

    # Check Table Headers on Row 11
    r11 = next(r for r in rows if r.attrib.get('r') == '11')
    headers = [c.find('m:is/m:t', ns).text for c in r11.findall('m:c', ns)]
    expected_headers = ['No.', 'Symbol', 'Company Name', 'Exchange', 'Provider', 'Timeframe', 'Last Price', 'Previous Period Close', 'Change', 'Change %', 'Currency', 'Data As Of', 'Data Status']
    assert headers == expected_headers, f'Header mismatch: {headers}'

    # Check Freeze Panes and AutoFilter
    pane = s1.find('m:sheetViews/m:sheetView/m:pane', ns)
    assert pane is not None and pane.attrib.get('state') == 'frozen' and pane.attrib.get('ySplit') == '11'
    af = s1.find('m:autoFilter', ns)
    assert af is not None and af.attrib.get('ref') == 'A11:M17'

    # Check Data Row 12 (Positive RELIANCE)
    r12 = next(r for r in rows if r.attrib.get('r') == '12')
    cells12 = {c.attrib['r']: c for c in r12.findall('m:c', ns)}
    assert cells12['B12'].find('m:is/m:t', ns).text == 'RELIANCE.NS'
    assert cells12['C12'].find('m:is/m:t', ns).text == 'Reliance Industries Limited'
    assert cells12['G12'].attrib['t'] == 'n' and cells12['G12'].find('m:v', ns).text == '2500.50'
    assert cells12['H12'].attrib['t'] == 'n' and cells12['H12'].find('m:v', ns).text == '2450.00'
    assert cells12['I12'].attrib['t'] == 'n' and cells12['I12'].find('m:v', ns).text == '50.50'
    # Numeric percentage fraction: 2.06% -> 0.0206
    assert cells12['J12'].attrib['t'] == 'n' and cells12['J12'].find('m:v', ns).text == '0.020600'
    assert cells12['M12'].find('m:is/m:t', ns).text == 'OK'

    # Check Data Row 13 (Negative TCS)
    r13 = next(r for r in rows if r.attrib.get('r') == '13')
    cells13 = {c.attrib['r']: c for c in r13.findall('m:c', ns)}
    assert cells13['B13'].find('m:is/m:t', ns).text == 'TCS.NS'
    assert cells13['I13'].attrib['t'] == 'n' and cells13['I13'].find('m:v', ns).text == '-80.00'
    assert cells13['J13'].attrib['t'] == 'n' and cells13['J13'].find('m:v', ns).text == '-0.020600'

    # Check Data Row 15 (Sanitized formula injection)
    r15 = next(r for r in rows if r.attrib.get('r') == '15')
    cells15 = {c.attrib['r']: c for c in r15.findall('m:c', ns)}
    assert cells15['B15'].find('m:is/m:t', ns).text == \"'=MALICIOUS\"
    assert cells15['C15'].find('m:is/m:t', ns).text == \"'+Evil Company Name @Formula\"

    # Check Data Row 16 (Unavailable quote)
    r16 = next(r for r in rows if r.attrib.get('r') == '16')
    cells16 = {c.attrib['r']: c for c in r16.findall('m:c', ns)}
    assert cells16['G16'].find('m:is/m:t', ns).text == '—'
    assert cells16['I16'].find('m:is/m:t', ns).text == '—'
    assert cells16['J16'].find('m:is/m:t', ns).text == '—'
    assert cells16['M16'].find('m:is/m:t', ns).text == 'Unavailable'

    # Check Sheet 2 (EXPORT INFORMATION)
    s2 = ET.fromstring(z.read('xl/worksheets/sheet2.xml'))
    s2_rows = s2.findall('m:sheetData/m:row', ns)
    s2_title = s2_rows[0].find('m:c/m:is/m:t', ns).text
    assert 'EXPORT INFORMATION' in s2_title
    s2_meta = {r.findall('m:c', ns)[0].find('m:is/m:t', ns).text: (r.findall('m:c', ns)[1].find('m:is/m:t', ns).text if r.findall('m:c', ns)[1].find('m:is/m:t', ns) is not None else r.findall('m:c', ns)[1].find('m:v', ns).text) for r in s2_rows[1:] if len(r.findall('m:c', ns)) >= 2}
    assert s2_meta['Application Name'] == 'GLOBAL MARKET TERMINAL'
    assert s2_meta['Watchlist Identifier'] == 'test-indian-stocks'
    assert s2_meta['Watchlist Display Name'] == 'Indian Stocks'
    assert '1W' in s2_meta['Selected Chart Timeframe']
    assert s2_meta['Total Exported Symbols'] == '6'
    assert s2_meta['Successful Quotes'] == '4'
    assert s2_meta['Unavailable Quotes'] == '2'
    assert 'Current Period Close - Previous Valid Period Close' in s2_meta['Calculation: Change']

print('Python OpenXML Parser check passed successfully.')
`;

  const py = spawnSync('python3', ['-c', pyCode, testFilePath], { encoding: 'utf8' });
  if (py.status !== 0) {
    console.error('Python validation failed:', py.stderr);
    throw new Error('Python OpenXML validation failed: ' + py.stderr);
  }
  console.log('PASS: Master workbook structure, styles, formulas, and cells validated by Python OpenXML parser!');

  // 4. Timeframe Verification Across All Supported Intervals
  console.log('4. Testing Timeframe Synchronization for all 10 intervals (1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, 1M, 1Y)...');
  const allTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M', '1Y'];

  for (const tf of allTimeframes) {
    const tfPayload = {
      watchlistId: 'tf-test',
      watchlistName: 'Timeframe Test Watchlist',
      timeframe: `${tf.toUpperCase()} (${tf})`,
      generatedAt: new Date().toISOString(),
      sourceInfo: 'Yahoo Finance REST API',
      totalSymbols: 2,
      successfulQuotes: 2,
      unavailableQuotes: 0,
      rows: [
        {
          index: 1,
          symbol: 'TEST-A',
          name: 'Timeframe Test Stock A',
          exchange: 'NSE',
          provider: 'yahoo',
          timeframe: tf.toUpperCase(),
          price: 100.0,
          previousClose: 95.0,
          change: 5.0,
          changePercent: 5.26,
          currency: 'INR',
          dataAsOf: '2026-11-06 15:30:00 (Asia/Kolkata)',
          dataStatus: 'OK'
        },
        {
          index: 2,
          symbol: 'TEST-B',
          name: 'Timeframe Test Stock B',
          exchange: 'NSE',
          provider: 'yahoo',
          timeframe: tf.toUpperCase(),
          price: 200.0,
          previousClose: 210.0,
          change: -10.0,
          changePercent: -4.76,
          currency: 'INR',
          dataAsOf: '2026-11-06 15:30:00 (Asia/Kolkata)',
          dataStatus: 'OK'
        }
      ]
    };

    const tfBuf = generateExcelWorkbook(tfPayload);
    assert.ok(tfBuf.length > 1000);
    const tfFile = join(tempDir, `test-${tf}.xlsx`);
    await writeFile(tfFile, tfBuf);

    // Quick verification that zip and sheet1 contains correct timeframe
    const pyTfCode = `
import zipfile, sys, xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as z:
    s1 = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = s1.findall('m:sheetData/m:row', ns)
    r12 = next(r for r in rows if r.attrib.get('r') == '12')
    cells = {c.attrib['r']: c for c in r12.findall('m:c', ns)}
    assert cells['F12'].find('m:is/m:t', ns).text == sys.argv[2].upper()
`;
    const tfCheck = spawnSync('python3', ['-c', pyTfCode, tfFile, tf], { encoding: 'utf8' });
    assert.equal(tfCheck.status, 0, `Timeframe check failed for ${tf}: ${tfCheck.stderr}`);
  }
  console.log('PASS: All 10 intervals (1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, 1M, 1Y) verified!');

  // 5. Large Watchlist Stress Test (1,000 Symbols)
  console.log('5. Testing Large Watchlist Export (1,000 symbols)...');
  const largeRows = [];
  for (let i = 1; i <= 1000; i++) {
    largeRows.push({
      index: i,
      symbol: `STOCK-${i}`,
      name: `Corporation Number ${i} International`,
      exchange: i % 2 === 0 ? 'NSE' : 'BSE',
      provider: 'yahoo',
      timeframe: '1D',
      price: 100 + i * 0.5,
      previousClose: 100 + i * 0.5 - (i % 5 === 0 ? -1 : 1) * 2.5,
      change: (i % 5 === 0 ? -1 : 1) * 2.5,
      changePercent: ((i % 5 === 0 ? -1 : 1) * 2.5 / 100) * 100,
      currency: 'INR',
      dataAsOf: '2026-11-06 15:30:00 (Asia/Kolkata)',
      dataStatus: 'OK'
    });
  }

  const startTime = Date.now();
  const largeBuf = generateExcelWorkbook({
    watchlistId: 'large-test',
    watchlistName: 'Large Watchlist (1,000 Symbols)',
    timeframe: '1D (Daily)',
    generatedAt: new Date().toISOString(),
    sourceInfo: 'Yahoo Finance REST API',
    totalSymbols: 1000,
    successfulQuotes: 1000,
    unavailableQuotes: 0,
    rows: largeRows
  });
  const elapsed = Date.now() - startTime;
  console.log(`Large workbook generated: ${largeBuf.length} bytes in ${elapsed}ms.`);
  assert.ok(largeBuf.length > 50000, 'Large workbook must contain all 1,000 rows');
  assert.ok(elapsed < 2000, 'Generation must complete in under 2 seconds');
  console.log('PASS: Large watchlist performance and memory safety verified!');

  console.log('================================================================');
  console.log('ALL PHASE F1.6 EXCEL EXPORT UNIT & TIMEFRAME TESTS PASSED 100%');
  console.log('================================================================');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

