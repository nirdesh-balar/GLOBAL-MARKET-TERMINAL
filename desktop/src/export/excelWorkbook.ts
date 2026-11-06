/**
 * Professional Office Open XML (.xlsx) workbook generator for GLOBAL MARKET TERMINAL.
 * Pure TypeScript, zero external dependencies, uses Node.js built-in zlib for standard ZIP packaging.
 */
import zlib from 'node:zlib';

export interface ExcelWatchlistRow {
  index: number;
  symbol: string;
  name: string;
  exchange: string;
  provider: string;
  timeframe: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null; // e.g. 1.25 for +1.25%
  currency: string;
  dataAsOf: string;
  dataStatus: string;
}

export interface ExcelExportPayload {
  watchlistId: string;
  watchlistName: string;
  timeframe: string;
  generatedAt: string;
  sourceInfo: string;
  totalSymbols: number;
  successfulQuotes: number;
  unavailableQuotes: number;
  rows: ExcelWatchlistRow[];
}

export function escapeXml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Formula injection prevention:
 * Prepend a single quote if the text begins with formula-significant characters (=, +, -, @, tab, CR).
 */
export function sanitizeCellText(val: unknown): string {
  const raw = String(val ?? '');
  let text = raw.trim();
  if (/^[\s]*[=+@\-\t\r]/.test(raw) || /^[\s]*[=+@\-]/.test(text)) {
    text = "'" + text;
  }
  return text;
}

/**
 * Packaging files into a standard ZIP archive (Office Open XML container).
 */
export function createZipBuffer(files: { name: string; content: string | Buffer }[]): Buffer {
  const fileEntries: {
    nameBuf: Buffer;
    offset: number;
    crc: number;
    compressedSize: number;
    uncompressedSize: number;
  }[] = [];
  let offset = 0;
  const parts: Buffer[] = [];

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const contentBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const crc = zlib.crc32(contentBuf);
    const compressed = zlib.deflateRawSync(contentBuf);

    // Local file header (30 bytes + name length)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // flags: UTF-8 bit 11
    localHeader.writeUInt16LE(8, 8);          // compression: deflate
    localHeader.writeUInt16LE(0, 10);         // time
    localHeader.writeUInt16LE(0, 12);         // date
    localHeader.writeUInt32LE(crc, 14);       // crc32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(contentBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);    // name length
    localHeader.writeUInt16LE(0, 28);                 // extra field length

    parts.push(localHeader, nameBuf, compressed);

    fileEntries.push({
      nameBuf,
      offset,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: contentBuf.length
    });

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirStart = offset;
  for (const entry of fileEntries) {
    // Central directory file header (46 bytes + name length)
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // signature
    cdHeader.writeUInt16LE(20, 4);         // version made by
    cdHeader.writeUInt16LE(20, 6);         // version needed
    cdHeader.writeUInt16LE(0x0800, 8);     // flags: UTF-8
    cdHeader.writeUInt16LE(8, 10);         // compression: deflate
    cdHeader.writeUInt16LE(0, 12);         // time
    cdHeader.writeUInt16LE(0, 14);         // date
    cdHeader.writeUInt32LE(entry.crc, 16); // crc32
    cdHeader.writeUInt32LE(entry.compressedSize, 20); // compressed size
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24); // uncompressed size
    cdHeader.writeUInt16LE(entry.nameBuf.length, 28);   // name length
    cdHeader.writeUInt16LE(0, 30);                      // extra field length
    cdHeader.writeUInt16LE(0, 32);                      // file comment length
    cdHeader.writeUInt16LE(0, 34);                      // disk number start
    cdHeader.writeUInt16LE(0, 36);                      // internal file attributes
    cdHeader.writeUInt32LE(0, 38);                      // external file attributes
    cdHeader.writeUInt32LE(entry.offset, 42);           // relative offset of local header

    parts.push(cdHeader, entry.nameBuf);
    offset += cdHeader.length + entry.nameBuf.length;
  }

  const centralDirSize = offset - centralDirStart;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // start disk
  eocd.writeUInt16LE(fileEntries.length, 8);  // entries on this disk
  eocd.writeUInt16LE(fileEntries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);     // size of central directory
  eocd.writeUInt32LE(centralDirStart, 16);    // offset of central directory
  eocd.writeUInt16LE(0, 20);                  // comment length

  parts.push(eocd);
  return Buffer.concat(parts);
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="WATCHLIST" sheetId="1" r:id="rId1"/>
    <sheet name="EXPORT INFORMATION" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
    <numFmt numFmtId="165" formatCode="+#,##0.00;-#,##0.00;0.00"/>
    <numFmt numFmtId="166" formatCode="+0.00%;-0.00%;0.00%"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="15"/><color rgb="FF0F172A"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF16A34A"/><name val="Segoe UI"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFDC2626"/><name val="Segoe UI"/><family val="2"/></font>
    <font><sz val="9"/><color rgb="FF64748B"/><name val="Segoe UI"/><family val="2"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0FDF4"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF2F2"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="21">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
    <!-- 1: Title -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
    <!-- 2: Metadata label -->
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <!-- 3: Metadata value -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <!-- 4: Table header left -->
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0"><alignment horizontal="left" vertical="center"/></xf>
    <!-- 5: Table header right -->
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 6: Table header center -->
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 7: Data left plain -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <!-- 8: Data left zebra -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <!-- 9: Data center plain -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 10: Data center zebra -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 11: Price plain -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 12: Price zebra -->
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 13: Numeric change positive -->
    <xf numFmtId="165" fontId="4" fillId="5" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 14: Numeric change negative -->
    <xf numFmtId="165" fontId="5" fillId="6" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 15: Numeric change neutral -->
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 16: Pct change positive -->
    <xf numFmtId="166" fontId="4" fillId="5" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 17: Pct change negative -->
    <xf numFmtId="166" fontId="5" fillId="6" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 18: Pct change neutral -->
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 19: Unavailable center plain -->
    <xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 20: Unavailable center zebra -->
    <xf numFmtId="0" fontId="6" fillId="3" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;

export function generateExcelWorkbook(payload: ExcelExportPayload): Buffer {
  const {
    watchlistName,
    timeframe,
    generatedAt,
    sourceInfo,
    totalSymbols,
    successfulQuotes,
    unavailableQuotes,
    rows
  } = payload;

  const lastRowIndex = 11 + rows.length;

  // Build Sheet 1 (WATCHLIST)
  let sheet1Rows = '';
  // Row 1: App Title
  sheet1Rows += `<row r="1" ht="28" customHeight="1"><c r="A1" t="inlineStr" s="1"><is><t>GLOBAL MARKET TERMINAL</t></is></c></row>\n`;
  // Metadata rows
  sheet1Rows += `<row r="3"><c r="A3" t="inlineStr" s="2"><is><t>Watchlist Name</t></is></c><c r="B3" t="inlineStr" s="3"><is><t>${escapeXml(sanitizeCellText(watchlistName))}</t></is></c></row>\n`;
  sheet1Rows += `<row r="4"><c r="A4" t="inlineStr" s="2"><is><t>Selected Timeframe</t></is></c><c r="B4" t="inlineStr" s="3"><is><t>${escapeXml(sanitizeCellText(timeframe))}</t></is></c></row>\n`;
  sheet1Rows += `<row r="5"><c r="A5" t="inlineStr" s="2"><is><t>Export Generated At</t></is></c><c r="B5" t="inlineStr" s="3"><is><t>${escapeXml(generatedAt)}</t></is></c></row>\n`;
  sheet1Rows += `<row r="6"><c r="A6" t="inlineStr" s="2"><is><t>Price Data As Of / Source</t></is></c><c r="B6" t="inlineStr" s="3"><is><t>${escapeXml(sanitizeCellText(sourceInfo))}</t></is></c></row>\n`;
  sheet1Rows += `<row r="7"><c r="A7" t="inlineStr" s="2"><is><t>Total Symbols</t></is></c><c r="B7" t="n" s="3"><v>${totalSymbols}</v></c></row>\n`;
  sheet1Rows += `<row r="8"><c r="A8" t="inlineStr" s="2"><is><t>Successful Quotes</t></is></c><c r="B8" t="n" s="3"><v>${successfulQuotes}</v></c></row>\n`;
  sheet1Rows += `<row r="9"><c r="A9" t="inlineStr" s="2"><is><t>Unavailable Quotes</t></is></c><c r="B9" t="n" s="3"><v>${unavailableQuotes}</v></c></row>\n`;

  // Row 11: Table Header
  sheet1Rows += `<row r="11" ht="26" customHeight="1">
    <c r="A11" t="inlineStr" s="6"><is><t>No.</t></is></c>
    <c r="B11" t="inlineStr" s="4"><is><t>Symbol</t></is></c>
    <c r="C11" t="inlineStr" s="4"><is><t>Company Name</t></is></c>
    <c r="D11" t="inlineStr" s="6"><is><t>Exchange</t></is></c>
    <c r="E11" t="inlineStr" s="6"><is><t>Provider</t></is></c>
    <c r="F11" t="inlineStr" s="6"><is><t>Timeframe</t></is></c>
    <c r="G11" t="inlineStr" s="5"><is><t>Last Price</t></is></c>
    <c r="H11" t="inlineStr" s="5"><is><t>Previous Period Close</t></is></c>
    <c r="I11" t="inlineStr" s="5"><is><t>Change</t></is></c>
    <c r="J11" t="inlineStr" s="5"><is><t>Change %</t></is></c>
    <c r="K11" t="inlineStr" s="6"><is><t>Currency</t></is></c>
    <c r="L11" t="inlineStr" s="4"><is><t>Data As Of</t></is></c>
    <c r="M11" t="inlineStr" s="6"><is><t>Data Status</t></is></c>
  </row>\n`;

  // Data rows
  rows.forEach((row, i) => {
    const rIdx = 12 + i;
    const isZebra = i % 2 === 1;

    // Determine styles
    const textStyle = isZebra ? 8 : 7;
    const centerStyle = isZebra ? 10 : 9;
    const priceStyle = isZebra ? 12 : 11;

    let changeStyle = 15;
    let pctStyle = 18;
    if (typeof row.change === 'number') {
      if (row.change > 0) {
        changeStyle = 13;
        pctStyle = 16;
      } else if (row.change < 0) {
        changeStyle = 14;
        pctStyle = 17;
      }
    }

    const unavailStyle = isZebra ? 20 : 19;

    // Price cell
    let priceCell = `<c r="G${rIdx}" t="inlineStr" s="${unavailStyle}"><is><t>—</t></is></c>`;
    if (typeof row.price === 'number' && Number.isFinite(row.price)) {
      priceCell = `<c r="G${rIdx}" t="n" s="${priceStyle}"><v>${row.price.toFixed(2)}</v></c>`;
    }

    // Prev close cell
    let prevCloseCell = `<c r="H${rIdx}" t="inlineStr" s="${unavailStyle}"><is><t>—</t></is></c>`;
    if (typeof row.previousClose === 'number' && Number.isFinite(row.previousClose)) {
      prevCloseCell = `<c r="H${rIdx}" t="n" s="${priceStyle}"><v>${row.previousClose.toFixed(2)}</v></c>`;
    }

    // Change cell
    let changeCell = `<c r="I${rIdx}" t="inlineStr" s="${unavailStyle}"><is><t>—</t></is></c>`;
    if (typeof row.change === 'number' && Number.isFinite(row.change)) {
      changeCell = `<c r="I${rIdx}" t="n" s="${changeStyle}"><v>${row.change.toFixed(2)}</v></c>`;
    }

    // Change % cell: Excel percentage format requires fractional value (e.g. 0.0125 for +1.25%)
    let pctCell = `<c r="J${rIdx}" t="inlineStr" s="${unavailStyle}"><is><t>—</t></is></c>`;
    if (typeof row.changePercent === 'number' && Number.isFinite(row.changePercent)) {
      const fractional = row.changePercent / 100;
      pctCell = `<c r="J${rIdx}" t="n" s="${pctStyle}"><v>${fractional.toFixed(6)}</v></c>`;
    }

    sheet1Rows += `<row r="${rIdx}" ht="20" customHeight="1">
      <c r="A${rIdx}" t="n" s="${centerStyle}"><v>${row.index}</v></c>
      <c r="B${rIdx}" t="inlineStr" s="${textStyle}"><is><t>${escapeXml(sanitizeCellText(row.symbol))}</t></is></c>
      <c r="C${rIdx}" t="inlineStr" s="${textStyle}"><is><t>${escapeXml(sanitizeCellText(row.name))}</t></is></c>
      <c r="D${rIdx}" t="inlineStr" s="${centerStyle}"><is><t>${escapeXml(sanitizeCellText(row.exchange))}</t></is></c>
      <c r="E${rIdx}" t="inlineStr" s="${centerStyle}"><is><t>${escapeXml(sanitizeCellText(row.provider))}</t></is></c>
      <c r="F${rIdx}" t="inlineStr" s="${centerStyle}"><is><t>${escapeXml(sanitizeCellText(row.timeframe))}</t></is></c>
      ${priceCell}
      ${prevCloseCell}
      ${changeCell}
      ${pctCell}
      <c r="K${rIdx}" t="inlineStr" s="${centerStyle}"><is><t>${escapeXml(sanitizeCellText(row.currency))}</t></is></c>
      <c r="L${rIdx}" t="inlineStr" s="${textStyle}"><is><t>${escapeXml(sanitizeCellText(row.dataAsOf))}</t></is></c>
      <c r="M${rIdx}" t="inlineStr" s="${centerStyle}"><is><t>${escapeXml(sanitizeCellText(row.dataStatus))}</t></is></c>
    </row>\n`;
  });

  const autoFilterRef = `A11:M${Math.max(11, lastRowIndex)}`;
  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="11" topLeftCell="A12" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="6" customWidth="1"/>
    <col min="2" max="2" width="16" customWidth="1"/>
    <col min="3" max="3" width="34" customWidth="1"/>
    <col min="4" max="4" width="12" customWidth="1"/>
    <col min="5" max="5" width="12" customWidth="1"/>
    <col min="6" max="6" width="12" customWidth="1"/>
    <col min="7" max="7" width="16" customWidth="1"/>
    <col min="8" max="8" width="22" customWidth="1"/>
    <col min="9" max="9" width="16" customWidth="1"/>
    <col min="10" max="10" width="14" customWidth="1"/>
    <col min="11" max="11" width="10" customWidth="1"/>
    <col min="12" max="12" width="24" customWidth="1"/>
    <col min="13" max="13" width="16" customWidth="1"/>
  </cols>
  <sheetData>
    ${sheet1Rows}
  </sheetData>
  <autoFilter ref="${autoFilterRef}"/>
</worksheet>`;

  // Build Sheet 2 (EXPORT INFORMATION)
  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="30" customWidth="1"/>
    <col min="2" max="2" width="70" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1" ht="28" customHeight="1"><c r="A1" t="inlineStr" s="1"><is><t>GLOBAL MARKET TERMINAL — EXPORT INFORMATION</t></is></c></row>
    <row r="3"><c r="A3" t="inlineStr" s="2"><is><t>Application Name</t></is></c><c r="B3" t="inlineStr" s="3"><is><t>GLOBAL MARKET TERMINAL</t></is></c></row>
    <row r="4"><c r="A4" t="inlineStr" s="2"><is><t>Watchlist Identifier</t></is></c><c r="B4" t="inlineStr" s="3"><is><t>${escapeXml(sanitizeCellText(payload.watchlistId))}</t></is></c></row>
    <row r="5"><c r="A5" t="inlineStr" s="2"><is><t>Watchlist Display Name</t></is></c><c r="B5" t="inlineStr" s="3"><is><t>${escapeXml(sanitizeCellText(watchlistName))}</t></is></c></row>
    <row r="6"><c r="A6" t="inlineStr" s="2"><is><t>Selected Chart Timeframe</t></is></c><c r="B6" t="inlineStr" s="3"><is><t>${escapeXml(sanitizeCellText(timeframe))} (Synchronized with active chart pane)</t></is></c></row>
    <row r="7"><c r="A7" t="inlineStr" s="2"><is><t>Export Timestamp</t></is></c><c r="B7" t="inlineStr" s="3"><is><t>${escapeXml(generatedAt)}</t></is></c></row>
    <row r="8"><c r="A8" t="inlineStr" s="2"><is><t>Total Exported Symbols</t></is></c><c r="B8" t="n" s="3"><v>${totalSymbols}</v></c></row>
    <row r="9"><c r="A9" t="inlineStr" s="2"><is><t>Successful Quotes</t></is></c><c r="B9" t="n" s="3"><v>${successfulQuotes}</v></c></row>
    <row r="10"><c r="A10" t="inlineStr" s="2"><is><t>Unavailable Quotes</t></is></c><c r="B10" t="n" s="3"><v>${unavailableQuotes}</v></c></row>
    <row r="12"><c r="A12" t="inlineStr" s="2"><is><t>Calculation: Change</t></is></c><c r="B12" t="inlineStr" s="3"><is><t>Current Period Close - Previous Valid Period Close (Never High-Low or Close-Open)</t></is></c></row>
    <row r="13"><c r="A13" t="inlineStr" s="2"><is><t>Calculation: Change %</t></is></c><c r="B13" t="inlineStr" s="3"><is><t>100 * (Change / Previous Valid Period Close); stored as fractional numeric value</t></is></c></row>
    <row r="14"><c r="A14" t="inlineStr" s="2"><is><t>Current Period Close</t></is></c><c r="B14" t="inlineStr" s="3"><is><t>Latest available historical bar close for the active chart pane timeframe</t></is></c></row>
    <row r="15"><c r="A15" t="inlineStr" s="2"><is><t>Previous Period Reference</t></is></c><c r="B15" t="inlineStr" s="3"><is><t>Immediate chronological completed historical bar close for the same timeframe</t></is></c></row>
    <row r="16"><c r="A16" t="inlineStr" s="2"><is><t>Data Providers</t></is></c><c r="B16" t="inlineStr" s="3"><is><t>Yahoo Finance REST API (Equities, FX, Indices); Hyperliquid REST API (Crypto)</t></is></c></row>
    <row r="17"><c r="A17" t="inlineStr" s="2"><is><t>Delays and Limitations</t></is></c><c r="B17" t="inlineStr" s="3"><is><t>Exchange feeds may be delayed up to 15 minutes. Data provided for personal analysis.</t></is></c></row>
    <row r="18"><c r="A18" t="inlineStr" s="2"><is><t>Missing Data Handling</t></is></c><c r="B18" t="inlineStr" s="3"><is><t>Tickers with missing or insufficient historical bars show 'Unavailable' without fabricated numbers.</t></is></c></row>
    <row r="19"><c r="A19" t="inlineStr" s="2"><is><t>Formula Security</t></is></c><c r="B19" t="inlineStr" s="3"><is><t>Text fields are stored as literal inline strings with formula injection prevention.</t></is></c></row>
  </sheetData>
</worksheet>`;

  return createZipBuffer([
    { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
    { name: '_rels/.rels', content: RELS_XML },
    { name: 'xl/_rels/workbook.xml.rels', content: WORKBOOK_RELS_XML },
    { name: 'xl/workbook.xml', content: WORKBOOK_XML },
    { name: 'xl/styles.xml', content: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1Xml },
    { name: 'xl/worksheets/sheet2.xml', content: sheet2Xml }
  ]);
}

