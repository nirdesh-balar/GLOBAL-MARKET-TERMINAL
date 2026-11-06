import { dialog, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { safeExportStem } from './platform';
import { generateExcelWorkbook, type ExcelExportPayload } from '../src/export/excelWorkbook';

export async function exportWatchlistExcel(
  window: BrowserWindow,
  id: unknown,
  payloadData?: unknown
): Promise<string | null> {
  if (typeof id !== 'string' || id.length > 80) throw Error('Invalid watchlist identifier');
  if (!payloadData || typeof payloadData !== 'object') throw Error('Invalid export payload');

  const payload = payloadData as ExcelExportPayload;
  if (!Array.isArray(payload.rows)) throw Error('Invalid export rows');

  const buffer = generateExcelWorkbook(payload);

  const defaultStem = safeExportStem(payload.watchlistName || 'Watchlist') + '-' + (payload.timeframe || '1D').toUpperCase();
  const result = await dialog.showSaveDialog(window, {
    title: 'Export Watchlist to Excel (.xlsx)',
    defaultPath: defaultStem + '.xlsx',
    filters: [
      { name: 'Microsoft Excel Workbook (*.xlsx)', extensions: ['xlsx'] }
    ]
  });

  if (result.canceled || !result.filePath) return null;

  await writeFile(result.filePath, buffer);
  return basename(result.filePath);
}

