import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { eq, sql } from 'drizzle-orm';
import { getDb, getRawSqlite } from './db';
import { premiumPayments, policies } from '../shared/db/schema';

// ---- Template generation ----

type TemplateRow = {
  paymentId: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  planName: string;
  installmentNo: number;
  dueDate: string;
  expectedAmountPaise: number;
  status: string;
};

const collectPending = (): TemplateRow[] => {
  const sqlite = getRawSqlite();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Flip overdue first so the template reflects current state.
  sqlite
    .prepare(
      `UPDATE premium_payments SET status='overdue', updated_at=CURRENT_TIMESTAMP
        WHERE status='pending' AND due_date < ?`,
    )
    .run(today);

  return sqlite
    .prepare(
      `SELECT pp.id AS paymentId,
              p.policy_no AS policyNo,
              p.policy_holder AS policyHolder,
              p.company_name AS companyName,
              p.plan_name AS planName,
              pp.installment_no AS installmentNo,
              pp.due_date AS dueDate,
              pp.expected_amount AS expectedAmountPaise,
              pp.status AS status
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE pp.status IN ('pending', 'overdue')
        ORDER BY pp.due_date ASC, p.policy_no ASC`,
    )
    .all() as TemplateRow[];
};

const PAYMENT_SOURCES = [
  'Bank',
  'Credit Card',
  'UPI',
  'Cheque',
  'Cash',
  'Auto-debit',
  'Other',
];

export const generateTemplate = async (): Promise<{
  saved: boolean;
  path?: string;
  rowCount?: number;
}> => {
  const rows = collectPending();

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save bulk payment template',
    defaultPath: `payments-template-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();

  const ws = wb.addWorksheet('Payments', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 1 }],
  });

  // Header rows.
  ws.mergeCells('A1:N1');
  ws.getCell('A1').value =
    'Bulk payment update — fill in the YELLOW columns below, then upload this file into PolicyHub. Do NOT edit the "Payment ID" column.';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FF6D28D9' } };
  ws.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 36;

  const headers = [
    'Payment ID',         // A — locked / hidden-meaning column
    'Policy No',          // B
    'Holder',             // C
    'Company',            // D
    'Plan',               // E
    'Installment #',      // F
    'Due Date',           // G
    'Expected Amount (₹)',// H
    'Status',             // I
    // Editable from here on:
    'Paid Date',          // J — yyyy-mm-dd or excel date
    'Paid Amount (₹)',    // K
    'GST (₹)',            // L (DB column: penalty_amount)
    'Late Fee (₹)',       // M
    'Payment Source',     // N
    'Name of Source',     // O
    'Ref No',             // P
    'Notes',              // Q
  ];
  ws.getRow(2).values = headers;
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).alignment = { vertical: 'middle' };

  // Style fixed columns (A–I) grey; editable (J–O) light yellow.
  const fillGrey: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  const fillYellow: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF9C3' },
  };
  for (let c = 1; c <= 9; c++) {
    ws.getCell(2, c).fill = fillGrey;
  }
  for (let c = 10; c <= 17; c++) {
    ws.getCell(2, c).fill = fillYellow;
  }

  // Widths.
  ws.columns = [
    { width: 36 }, // A payment id
    { width: 18 }, // B policy no
    { width: 22 }, // C holder
    { width: 18 }, // D company
    { width: 22 }, // E plan
    { width: 12 }, // F installment
    { width: 12 }, // G due date
    { width: 18 }, // H expected amount
    { width: 12 }, // I status
    { width: 14 }, // J paid date
    { width: 16 }, // K paid amount
    { width: 12 }, // L GST
    { width: 12 }, // M late fee
    { width: 16 }, // N payment source
    { width: 22 }, // O name of source
    { width: 18 }, // P ref no
    { width: 32 }, // Q notes
  ];

  // Data rows.
  rows.forEach((r, i) => {
    const rowIndex = i + 3; // 1 = banner, 2 = headers
    const row = ws.getRow(rowIndex);
    row.values = [
      r.paymentId,
      r.policyNo,
      r.policyHolder,
      r.companyName,
      r.planName,
      r.installmentNo,
      r.dueDate,
      Number((r.expectedAmountPaise / 100).toFixed(2)),
      r.status,
      // editable blanks:
      '',                                                  // J paid date
      Number((r.expectedAmountPaise / 100).toFixed(2)),    // K paid amount = expected
      0,                                                   // L GST
      0,                                                   // M late fee
      '',                                                  // N payment source
      '',                                                  // O name of source
      '',                                                  // P ref no
      '',                                                  // Q notes
    ];

    // Read-only styling on locked cells.
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      cell.protection = { locked: true };
    }
    for (let c = 10; c <= 17; c++) {
      row.getCell(c).protection = { locked: false };
    }

    // Number formats.
    row.getCell(8).numFmt = '#,##0.00';  // expected amount
    row.getCell(11).numFmt = '#,##0.00'; // paid amount
    row.getCell(12).numFmt = '#,##0.00'; // GST
    row.getCell(13).numFmt = '#,##0.00'; // late fee
    row.getCell(7).numFmt = 'yyyy-mm-dd';  // due date
    row.getCell(10).numFmt = 'yyyy-mm-dd'; // paid date
  });

  // Dropdown for Payment Source column (L = col 12) across data rows.
  if (rows.length > 0) {
    const lastRow = rows.length + 2;
    (ws as any).dataValidations.add(`N3:N${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${PAYMENT_SOURCES.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid value',
      error: `Pick one of: ${PAYMENT_SOURCES.join(', ')}`,
    });
  }

  // Optional: protect locked cells (user can still edit yellow ones).
  // Disabled for now to keep things simple. Uncomment to enable:
  // await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });

  // Instructions sheet.
  const help = wb.addWorksheet('Instructions');
  help.columns = [{ width: 100 }];
  help.getRow(1).values = ['PolicyHub bulk payment update — how to use this file'];
  help.getRow(1).font = { bold: true, size: 14 };
  const lines = [
    '',
    '1. Each row in "Payments" is a premium installment that is currently pending or overdue.',
    '2. Fill in the YELLOW columns to record a payment:',
    '     • Paid Date (yyyy-mm-dd format works best; Excel dates also work)',
    '     • Paid Amount (₹)  — pre-filled to the expected amount; change if different',
    '     • GST (₹) — leave 0 if none',
    '     • Late Fee (₹) — leave 0 if none',
    '     • Payment Source (Bank / Credit Card / UPI / Cheque / Cash / Auto-debit / Other)',
    '     • Name of Source (e.g. HDFC Bank, HDFC Infinia, ...)',
    '     • Ref No (transaction id / cheque no / receipt no)',
    '     • Notes (optional)',
    '3. Leave a row\'s yellow cells blank if you don\'t want to update that row.',
    '4. Do NOT edit the "Payment ID" column — PolicyHub uses it to match the row back to the database.',
    '5. When done, in PolicyHub go to Payments → "Upload filled template" and pick this file.',
  ];
  lines.forEach((l, i) => {
    help.getCell(i + 2, 1).value = l;
    help.getCell(i + 2, 1).alignment = { wrapText: true, vertical: 'top' };
  });

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath, rowCount: rows.length };
};

// ---- Import ----

const RUPEE_TO_PAISE = (rupees: number) => Math.round(rupees * 100);

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
    // Try ISO first.
    const iso = parseISO(s);
    if (!Number.isNaN(iso.getTime())) return format(iso, 'yyyy-MM-dd');
    // Fallback: dd-mm-yyyy / dd/mm/yyyy
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

export type ImportResult = {
  picked: boolean;
  file?: string;
  totalRows: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string; policyNo?: string; installmentNo?: number }[];
};

export const importTemplate = async (): Promise<ImportResult> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Pick the filled payment template',
    properties: ['openFile'],
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || filePaths.length === 0) {
    return { picked: false, totalRows: 0, updated: 0, skipped: 0, errors: [] };
  }
  const filePath = filePaths[0];

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet('Payments') ?? wb.worksheets[0];
  if (!ws) {
    return {
      picked: true,
      file: filePath,
      totalRows: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 0, reason: 'Could not find a "Payments" worksheet in the file' }],
    };
  }

  const result: ImportResult = {
    picked: true,
    file: filePath,
    totalRows: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const db = getDb();
  const sqlite = getRawSqlite();

  const updateStmt = sqlite.prepare(`
    UPDATE premium_payments
       SET status = 'paid',
           paid_date = @paid_date,
           paid_amount = @paid_amount,
           penalty_amount = @penalty,
           late_fee = @late_fee,
           payment_source = @payment_source,
           payment_source_name = @payment_source_name,
           receipt_no = @receipt_no,
           notes = COALESCE(@notes, notes),
           updated_at = CURRENT_TIMESTAMP
     WHERE id = @id
  `);

  // Data starts on row 3 (row 1 banner, row 2 headers).
  const lastRow = ws.actualRowCount;
  for (let r = 3; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const paymentId = cellString(row.getCell(1));
    const policyNo = cellString(row.getCell(2));
    const installmentNoRaw = cellNumber(row.getCell(6));

    if (!paymentId) continue; // blank line

    const paidDate = cellDateIso(row.getCell(10));
    const paidAmount = cellNumber(row.getCell(11));
    const penalty = cellNumber(row.getCell(12));
    const lateFee = cellNumber(row.getCell(13));
    const paymentSource = cellString(row.getCell(14)) || null;
    const sourceName = cellString(row.getCell(15)) || null;
    const refNo = cellString(row.getCell(16)) || null;
    const notes = cellString(row.getCell(17)) || null;

    // Skip rows where the user did not enter anything actionable.
    if (
      !paidDate &&
      paidAmount === null &&
      (penalty === null || penalty === 0) &&
      (lateFee === null || lateFee === 0) &&
      !paymentSource &&
      !sourceName &&
      !refNo &&
      !notes
    ) {
      result.skipped++;
      continue;
    }
    result.totalRows++;

    // Need at least a paid date to record a payment.
    if (!paidDate) {
      result.errors.push({
        row: r,
        reason: 'Paid Date is required',
        policyNo,
        installmentNo: installmentNoRaw ?? undefined,
      });
      continue;
    }

    const todayIso = format(new Date(), 'yyyy-MM-dd');
    if (paidDate > todayIso) {
      result.errors.push({
        row: r,
        reason: "Paid Date can't be in the future",
        policyNo,
        installmentNo: installmentNoRaw ?? undefined,
      });
      continue;
    }
    if (paidAmount !== null && paidAmount <= 0) {
      result.errors.push({
        row: r,
        reason: 'Paid Amount must be greater than zero',
        policyNo,
        installmentNo: installmentNoRaw ?? undefined,
      });
      continue;
    }
    if (penalty !== null && penalty < 0) {
      result.errors.push({
        row: r,
        reason: 'GST cannot be negative',
        policyNo,
        installmentNo: installmentNoRaw ?? undefined,
      });
      continue;
    }
    if (lateFee !== null && lateFee < 0) {
      result.errors.push({
        row: r,
        reason: 'Late Fee cannot be negative',
        policyNo,
        installmentNo: installmentNoRaw ?? undefined,
      });
      continue;
    }

    // Look up the row to ensure it exists and isn't already paid.
    const existing = db
      .select()
      .from(premiumPayments)
      .where(eq(premiumPayments.id, paymentId))
      .get();
    if (!existing) {
      result.errors.push({
        row: r,
        reason: `No matching payment for id ${paymentId.slice(0, 8)}…`,
        policyNo,
        installmentNo: installmentNoRaw ?? undefined,
      });
      continue;
    }
    if (existing.status === 'paid') {
      result.skipped++;
      continue;
    }

    const finalPaidAmount = RUPEE_TO_PAISE(
      paidAmount !== null ? paidAmount : existing.expectedAmount / 100,
    );

    try {
      updateStmt.run({
        id: paymentId,
        paid_date: paidDate,
        paid_amount: finalPaidAmount,
        penalty: RUPEE_TO_PAISE(penalty ?? 0),
        late_fee: RUPEE_TO_PAISE(lateFee ?? 0),
        payment_source: paymentSource,
        payment_source_name: sourceName,
        receipt_no: refNo,
        notes,
      });
      result.updated++;
    } catch (err) {
      result.errors.push({
        row: r,
        reason: (err as Error).message,
        policyNo,
        installmentNo: installmentNoRaw ?? undefined,
      });
    }
  }

  return result;
};

// Reference exports for future use (avoid TS unused warnings).
export { PAYMENT_SOURCES };
export const _imports = { policies, sql };
