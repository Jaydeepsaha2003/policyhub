import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { getRawSqlite } from './db';

const RUPEE_TO_PAISE = (rupees: number) => Math.round(rupees * 100);

const PAYMENT_SOURCES = [
  'Bank',
  'Credit Card',
  'UPI',
  'Cheque',
  'Cash',
  'Other',
];

type Row = {
  id: string;
  policyNo: string | null;
  policyHolder: string | null;
  title: string;
  installmentNo: number;
  frequency: string;
  expectedDate: string;
  amountPaise: number;
  status: string;
};

const collectPending = (): Row[] => {
  const sqlite = getRawSqlite();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Flip to overdue first so it reflects in the export.
  sqlite
    .prepare(
      `UPDATE repayments SET status='overdue', updated_at=CURRENT_TIMESTAMP
        WHERE status='pending' AND expected_date < ?`,
    )
    .run(today);

  return sqlite
    .prepare(
      `SELECT r.id, r.title,
              r.installment_no AS installmentNo,
              r.frequency,
              r.expected_date AS expectedDate,
              r.amount AS amountPaise,
              r.status,
              p.policy_no AS policyNo,
              p.policy_holder AS policyHolder
         FROM repayments r
         LEFT JOIN policies p ON p.id = r.policy_id
        WHERE r.status IN ('pending','overdue')
        ORDER BY r.expected_date ASC`,
    )
    .all() as Row[];
};

export const generateRepaymentTemplate = async (): Promise<{
  saved: boolean;
  path?: string;
  rowCount?: number;
}> => {
  const rows = collectPending();

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save repayments template',
    defaultPath: `repayments-template-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();
  const ws = wb.addWorksheet('Repayments', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 1 }],
  });

  ws.mergeCells('A1:N1');
  ws.getCell('A1').value =
    'Bulk repayment receipts — fill in the YELLOW columns, then upload this file. Do NOT edit the "Repayment ID" column.';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FF6D28D9' } };
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 36;

  const headers = [
    'Repayment ID',       // A
    'Policy No',          // B
    'Holder',             // C
    'Title',              // D
    'Installment #',      // E
    'Frequency',          // F
    'Expected Date',      // G
    'Expected Amount (₹)',// H
    'Status',             // I
    // Editable:
    'Received Date',      // J
    'Received Amount (₹)',// K
    'Source',             // L
    'Source Name',        // M
    'Ref No',             // N
    'Notes',              // O
  ];
  ws.getRow(2).values = headers;
  ws.getRow(2).font = { bold: true };

  const grey: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  const yellow: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF9C3' },
  };
  for (let c = 1; c <= 9; c++) ws.getCell(2, c).fill = grey;
  for (let c = 10; c <= 15; c++) ws.getCell(2, c).fill = yellow;

  ws.columns = [
    { width: 36 },
    { width: 18 },
    { width: 22 },
    { width: 28 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 22 },
    { width: 18 },
    { width: 32 },
  ];

  rows.forEach((r, i) => {
    const idx = i + 3;
    const row = ws.getRow(idx);
    row.values = [
      r.id,
      r.policyNo ?? '—',
      r.policyHolder ?? '—',
      r.title,
      r.installmentNo,
      r.frequency,
      r.expectedDate,
      Number((r.amountPaise / 100).toFixed(2)),
      r.status,
      '', // received date
      Number((r.amountPaise / 100).toFixed(2)), // pre-fill received amount = expected
      '',
      '',
      '',
      '',
    ];
    for (let c = 1; c <= 9; c++) {
      row.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
    }
    row.getCell(7).numFmt = 'yyyy-mm-dd';
    row.getCell(8).numFmt = '#,##0.00';
    row.getCell(10).numFmt = 'yyyy-mm-dd';
    row.getCell(11).numFmt = '#,##0.00';
  });

  if (rows.length > 0) {
    const lastRow = rows.length + 2;
    (ws as any).dataValidations.add(`L3:L${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${PAYMENT_SOURCES.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid value',
      error: `Pick one of: ${PAYMENT_SOURCES.join(', ')}`,
    });
  }

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath, rowCount: rows.length };
};

// ---- import ----

const cellString = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return format(v, 'yyyy-MM-dd');
  if (typeof v === 'object' && 'text' in v) return String((v as any).text ?? '').trim();
  if (typeof v === 'object' && 'result' in v) return String((v as any).result ?? '').trim();
  return String(v).trim();
};

const cellDateIso = (cell: ExcelJS.Cell): string | null => {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return format(v, 'yyyy-MM-dd');
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    const iso = parseISO(s);
    if (!Number.isNaN(iso.getTime())) return format(iso, 'yyyy-MM-dd');
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return null;
  }
  return null;
};

const cellNumber = (cell: ExcelJS.Cell): number | null => {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object' && 'result' in v) {
    const n = Number((v as any).result);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export type RepaymentImportResult = {
  picked: boolean;
  file?: string;
  totalRows: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

export const importRepaymentTemplate = async (): Promise<RepaymentImportResult> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Pick the filled repayments template',
    properties: ['openFile'],
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || filePaths.length === 0) {
    return { picked: false, totalRows: 0, updated: 0, skipped: 0, errors: [] };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePaths[0]);
  const ws = wb.getWorksheet('Repayments') ?? wb.worksheets[0];
  if (!ws) {
    return {
      picked: true,
      file: filePaths[0],
      totalRows: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 0, reason: 'Could not find a "Repayments" worksheet' }],
    };
  }

  const sqlite = getRawSqlite();
  const stmt = sqlite.prepare(`
    UPDATE repayments
       SET status = 'received',
           received_date = @received_date,
           received_amount = @received_amount,
           received_source = @received_source,
           received_source_name = @received_source_name,
           ref_no = @ref_no,
           notes = COALESCE(@notes, notes),
           updated_at = CURRENT_TIMESTAMP
     WHERE id = @id
  `);

  const lookup = sqlite.prepare(`SELECT status, amount FROM repayments WHERE id = ?`);

  const result: RepaymentImportResult = {
    picked: true,
    file: filePaths[0],
    totalRows: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (let r = 3; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r);
    const id = cellString(row.getCell(1));
    if (!id) continue;

    const receivedDate = cellDateIso(row.getCell(10));
    const receivedAmt = cellNumber(row.getCell(11));
    const source = cellString(row.getCell(12)) || null;
    const sourceName = cellString(row.getCell(13)) || null;
    const refNo = cellString(row.getCell(14)) || null;
    const notes = cellString(row.getCell(15)) || null;

    // Skip rows the user didn't touch.
    if (!receivedDate && receivedAmt === null && !source && !sourceName && !refNo && !notes) {
      result.skipped++;
      continue;
    }
    result.totalRows++;

    if (!receivedDate) {
      result.errors.push({ row: r, reason: 'Received Date is required' });
      continue;
    }

    const existing = lookup.get(id) as { status: string; amount: number } | undefined;
    if (!existing) {
      result.errors.push({ row: r, reason: `No matching repayment for id ${id.slice(0, 8)}…` });
      continue;
    }
    if (existing.status === 'received') {
      result.skipped++;
      continue;
    }
    if (existing.status === 'cancelled') {
      result.errors.push({ row: r, reason: 'This repayment is cancelled — un-cancel it first' });
      continue;
    }

    const amountPaise = RUPEE_TO_PAISE(
      receivedAmt !== null ? receivedAmt : existing.amount / 100,
    );

    try {
      stmt.run({
        id,
        received_date: receivedDate,
        received_amount: amountPaise,
        received_source: source,
        received_source_name: sourceName,
        ref_no: refNo,
        notes,
      });
      result.updated++;
    } catch (err) {
      result.errors.push({ row: r, reason: (err as Error).message });
    }
  }

  return result;
};
