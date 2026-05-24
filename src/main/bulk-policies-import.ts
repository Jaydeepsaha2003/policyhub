import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { createPolicy } from './repo/policies';
import { getRawSqlite } from './db';

const PAYMENT_MODES = ['monthly', 'quarterly', 'half_yearly', 'yearly'] as const;
const STATUSES = ['active', 'active_ppt_over', 'matured', 'lapsed', 'surrendered'] as const;
const MATURITY_TYPES = ['lumpsum', 'regular_income'] as const;

// ---- Template generation ----

export const generatePolicyTemplate = async (): Promise<{
  saved: boolean;
  path?: string;
}> => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save new-policy template',
    defaultPath: `policies-template-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();
  const ws = wb.addWorksheet('Policies', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  const headers = [
    'Policy No*',                  // A
    'Holder*',                     // B
    'Holder email',                // C
    'Holder phone',                // D
    'Company*',                    // E
    'Plan*',                       // F
    'Branch name',                 // G
    'Agent name',                  // H
    'Agent contact',               // I
    'Premium amount (₹)*',         // J
    'Yearly premium (₹)*',         // K (typically Premium × payments/yr)
    'Payment mode*',               // L (monthly/quarterly/half_yearly/yearly)
    'Sum assured (₹)*',            // M
    'Commencement date (DD-MM-YYYY)*', // N
    'Maturity date (DD-MM-YYYY)*',     // O
    'Policy term (months)*',       // P
    'PPT (months)*',               // Q
    'Status',                      // R (defaults to "active")
    'Nominee*',                    // S
    'Nominee relation',            // T
    'Maturity type',               // U (lumpsum/regular_income; defaults lumpsum)
    'Maturity bank',               // V
    'Maturity A/c holder',         // W
    'Maturity A/c no',             // X
    'Maturity IFSC',               // Y
    'Maturity branch',             // Z
    'Notes',                       // AA
  ];

  ws.mergeCells('A1:AA1');
  ws.getCell('A1').value =
    'New policies template — fill one row per policy. Required fields are marked with *. Then upload via Policies → Upload policy template.';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FF6D28D9' } };
  ws.getCell('A1').alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 32;

  ws.getRow(2).values = headers;
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };

  // Column widths.
  const widths = [
    18, 24, 26, 16, 18, 24, 22, 18, 16, // A-I
    16, 16, 14, 18, 22, 22, 16, 14, 14, // J-R
    20, 16, 16, 18, 22, 22, 14, 22, 32, // S-AA
  ];
  ws.columns = widths.map((w) => ({ width: w }));

  // Sample row 3 to guide the user.
  ws.getRow(3).values = [
    'LIC123001', 'Aarav Sharma', 'aarav@example.com', '+91 9876543210',
    'LIC', 'Jeevan Anand (149)', 'Salt Lake Branch', 'Self', '+91 9876543210',
    15000, 60000, 'quarterly', 1500000, '01-01-2025', '01-01-2045', 240, 180,
    'active', 'Anita Sharma', 'Spouse',
    'lumpsum', 'HDFC Bank', 'Aarav Sharma', '50100123456789', 'HDFC0000123', 'Salt Lake',
    'Imported via Excel',
  ];
  ws.getRow(3).font = { italic: true, color: { argb: 'FF6B7280' } };

  // Data validation lists for the dropdown columns.
  const lastRow = 1000;
  const dv = (ws as any).dataValidations;
  dv.add(`L4:L${lastRow}`, {
    type: 'list',
    allowBlank: false,
    formulae: [`"${PAYMENT_MODES.join(',')}"`],
  });
  dv.add(`R4:R${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${STATUSES.join(',')}"`],
  });
  dv.add(`U4:U${lastRow}`, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${MATURITY_TYPES.join(',')}"`],
  });

  // Instructions sheet.
  const help = wb.addWorksheet('Instructions');
  help.columns = [{ width: 100 }];
  const lines = [
    'PolicyHub — new policies bulk upload',
    '',
    '1. Each row on the "Policies" tab is a new policy to create.',
    '2. Required fields are marked with *. The row #3 is a SAMPLE — replace or delete it.',
    '3. Dates should be in DD-MM-YYYY format (also accepts YYYY-MM-DD or DD/MM/YYYY).',
    '4. Payment mode: monthly, quarterly, half_yearly, or yearly.',
    '5. Status: active (default), active_ppt_over, matured, lapsed, surrendered.',
    '6. Maturity type: lumpsum (default) or regular_income.',
    '7. Sum assured should ideally be at least 10 × yearly premium (IRDA Section 80C).',
    '8. Duplicates: rows whose Policy No already exists in the database are skipped.',
    '9. Upload from Policies → Upload policy template. A result dialog shows what got created vs skipped.',
  ];
  lines.forEach((l, i) => {
    help.getCell(i + 1, 1).value = l;
  });
  help.getRow(1).font = { bold: true, size: 14 };

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath };
};

// ---- Import ----

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
  return null;
};

export type PolicyImportResult = {
  picked: boolean;
  file?: string;
  totalRows: number;
  created: number;
  skipped: number;
  errors: { row: number; reason: string; policyNo?: string }[];
};

export const importPolicyTemplate = async (): Promise<PolicyImportResult> => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Pick the filled new-policy template',
    properties: ['openFile'],
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || filePaths.length === 0) {
    return { picked: false, totalRows: 0, created: 0, skipped: 0, errors: [] };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePaths[0]);
  const ws = wb.getWorksheet('Policies') ?? wb.worksheets[0];
  if (!ws) {
    return {
      picked: true,
      file: filePaths[0],
      totalRows: 0,
      created: 0,
      skipped: 0,
      errors: [{ row: 0, reason: 'No "Policies" worksheet found' }],
    };
  }

  const sqlite = getRawSqlite();
  const existingNos = new Set<string>(
    (sqlite.prepare(`SELECT policy_no FROM policies`).all() as Array<{ policy_no: string }>).map(
      (r) => r.policy_no,
    ),
  );

  const result: PolicyImportResult = {
    picked: true,
    file: filePaths[0],
    totalRows: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  // Data starts at row 4 (row 1 banner, row 2 headers, row 3 sample).
  // We also accept rows starting at 3 if user replaced the sample, so probe.
  const startRow = 3;
  for (let r = startRow; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r);
    const policyNo = cellString(row.getCell(1));
    if (!policyNo) continue;
    // Skip the sample row if it's still the default placeholder.
    if (r === 3 && policyNo === 'LIC123001' && cellString(row.getCell(2)) === 'Aarav Sharma') {
      continue;
    }

    result.totalRows++;

    if (existingNos.has(policyNo)) {
      result.skipped++;
      result.errors.push({
        row: r,
        reason: `Policy No "${policyNo}" already exists — skipped`,
        policyNo,
      });
      continue;
    }

    try {
      const policyHolder = cellString(row.getCell(2));
      const holderEmail = cellString(row.getCell(3));
      const holderPhone = cellString(row.getCell(4));
      const companyName = cellString(row.getCell(5));
      const planName = cellString(row.getCell(6));
      const branchName = cellString(row.getCell(7));
      const agentName = cellString(row.getCell(8));
      const agentContact = cellString(row.getCell(9));
      const premiumAmount = cellNumber(row.getCell(10));
      const yearlyTotalPremium = cellNumber(row.getCell(11));
      const paymentMode = cellString(row.getCell(12)).toLowerCase() as
        (typeof PAYMENT_MODES)[number];
      const sumAssured = cellNumber(row.getCell(13));
      const commencementDate = cellDateIso(row.getCell(14));
      const maturityDate = cellDateIso(row.getCell(15));
      const policyTermMonths = cellNumber(row.getCell(16));
      const premiumPaymentTermMonths = cellNumber(row.getCell(17));
      const statusRaw = cellString(row.getCell(18)).toLowerCase();
      const status = (STATUSES.includes(statusRaw as any)
        ? (statusRaw as (typeof STATUSES)[number])
        : 'active') as (typeof STATUSES)[number];
      const nomineeName = cellString(row.getCell(19));
      const nomineeRelation = cellString(row.getCell(20));
      const maturityTypeRaw = cellString(row.getCell(21)).toLowerCase();
      const maturityType = (MATURITY_TYPES.includes(maturityTypeRaw as any)
        ? (maturityTypeRaw as (typeof MATURITY_TYPES)[number])
        : 'lumpsum') as (typeof MATURITY_TYPES)[number];
      const maturityBankName = cellString(row.getCell(22));
      const maturityAccountHolder = cellString(row.getCell(23));
      const maturityAccountNo = cellString(row.getCell(24));
      const maturityIfsc = cellString(row.getCell(25));
      const maturityBranchName = cellString(row.getCell(26));
      const notes = cellString(row.getCell(27));

      // Validate required fields.
      const missing: string[] = [];
      if (!policyHolder) missing.push('Holder');
      if (!companyName) missing.push('Company');
      if (!planName) missing.push('Plan');
      if (premiumAmount === null && status !== 'matured') missing.push('Premium amount');
      if (yearlyTotalPremium === null && status !== 'matured') missing.push('Yearly premium');
      if (!paymentMode && status !== 'matured') missing.push('Payment mode');
      if (sumAssured === null && status !== 'matured') missing.push('Sum assured');
      if (!commencementDate && status !== 'matured') missing.push('Commencement date');
      if (!maturityDate) missing.push('Maturity date');
      if (policyTermMonths === null && status !== 'matured') missing.push('Policy term');
      if (premiumPaymentTermMonths === null && status !== 'matured') missing.push('PPT');
      if (!nomineeName) missing.push('Nominee');

      if (missing.length > 0) {
        result.errors.push({
          row: r,
          policyNo,
          reason: `Missing required: ${missing.join(', ')}`,
        });
        continue;
      }

      if (paymentMode && !PAYMENT_MODES.includes(paymentMode as any)) {
        result.errors.push({
          row: r,
          policyNo,
          reason: `Invalid payment mode "${paymentMode}". Allowed: ${PAYMENT_MODES.join(', ')}`,
        });
        continue;
      }

      // Cross-field checks (skip when matured).
      if (
        status !== 'matured' &&
        policyTermMonths !== null &&
        premiumPaymentTermMonths !== null &&
        premiumPaymentTermMonths > policyTermMonths
      ) {
        result.errors.push({
          row: r,
          policyNo,
          reason: `PPT (${premiumPaymentTermMonths}) > policy term (${policyTermMonths})`,
        });
        continue;
      }
      if (
        commencementDate &&
        maturityDate &&
        new Date(maturityDate) <= new Date(commencementDate)
      ) {
        result.errors.push({
          row: r,
          policyNo,
          reason: 'Maturity date must be after commencement',
        });
        continue;
      }

      // Build input for createPolicy (rupees, not paise — createPolicy converts).
      createPolicy({
        policyNo,
        policyHolder,
        holderEmail: holderEmail || undefined,
        holderPhone: holderPhone || undefined,
        companyName,
        planName,
        premiumAmount: premiumAmount ?? 0,
        yearlyTotalPremium: yearlyTotalPremium ?? 0,
        paymentMode: (paymentMode as any) || 'yearly',
        sumAssured: sumAssured ?? 0,
        nomineeName,
        nomineeRelation: nomineeRelation || undefined,
        commencementDate: commencementDate ?? maturityDate ?? format(new Date(), 'yyyy-MM-dd'),
        maturityDate: maturityDate!,
        policyTermMonths: policyTermMonths ?? 0,
        premiumPaymentTermMonths: premiumPaymentTermMonths ?? 0,
        branchName: branchName || undefined,
        agentName: agentName || undefined,
        agentContact: agentContact || undefined,
        status,
        maturityType,
        maturityBankName: maturityBankName || undefined,
        maturityAccountHolder: maturityAccountHolder || undefined,
        maturityAccountNo: maturityAccountNo || undefined,
        maturityIfsc: maturityIfsc || undefined,
        maturityBranchName: maturityBranchName || undefined,
        notes: notes || undefined,
      });
      existingNos.add(policyNo);
      result.created++;
    } catch (err) {
      result.errors.push({ row: r, policyNo, reason: (err as Error).message });
    }
  }

  return result;
};
