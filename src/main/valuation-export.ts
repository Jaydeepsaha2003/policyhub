import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';

export type ValuationExportRow = {
  policyNo: string;
  policyHolder: string;
  companyName: string;
  planName: string;
  paymentMode: string;
  premiumPaymentTermMonths: number;
  commencementDate: string;        // ISO yyyy-MM-dd
  maturityDate: string;            // ISO yyyy-MM-dd
  roiPct: number;                  // % per annum
  compoundingFrequency: string;    // 'annual' | 'half_yearly' | 'quarterly' | 'monthly'
  valuationDate: string;           // ISO yyyy-MM-dd
  sumAssuredPaise: number;
  totalContributedPaise: number;
  contributionsCount: number;
  estimatedValuationPaise: number;
};

const PAISE_TO_RUPEES = (p: number | null | undefined) =>
  p === null || p === undefined ? null : p / 100;

const isoToDmy = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const freqLabel = (f: string): string => {
  switch (f) {
    case 'annual':
      return 'Annual';
    case 'half_yearly':
      return 'Half-yearly';
    case 'quarterly':
      return 'Quarterly';
    case 'monthly':
      return 'Monthly';
    default:
      return f;
  }
};

const modeLabel = (m: string): string => {
  switch (m) {
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'half_yearly':
      return 'Half-yearly';
    case 'yearly':
      return 'Yearly';
    default:
      return m;
  }
};

export const exportValuation = async (
  rows: ValuationExportRow[],
): Promise<{ saved: boolean; path?: string; rowCount?: number }> => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { saved: false };
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export valuation',
    defaultPath: `valuation-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();

  const ws = wb.addWorksheet('Valuation', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  type Col = {
    header: string;
    width: number;
    money?: boolean;
    pct?: boolean;
    bold?: boolean;
  };
  const columns: Col[] = [
    { header: 'Policy No', width: 18 },
    { header: 'Holder', width: 24 },
    { header: 'Company', width: 18 },
    { header: 'Plan', width: 22 },
    { header: 'Payment mode', width: 14 },
    { header: 'PPT (months)', width: 12 },
    { header: 'Commencement', width: 14 },
    { header: 'Maturity', width: 14 },
    { header: 'ROI (% p.a.)', width: 12, pct: true },
    { header: 'Compounding', width: 14 },
    { header: 'Valuation date', width: 14 },
    { header: 'Sum assured (₹)', width: 16, money: true },
    { header: 'Total contributed (₹)', width: 18, money: true },
    { header: 'Installments counted', width: 18 },
    { header: 'Estimated valuation (₹)', width: 22, money: true, bold: true },
  ];

  ws.getRow(1).values = columns.map((c) => c.header);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.columns = columns.map((c) => ({ width: c.width }));

  rows.forEach((row, i) => {
    const r = ws.getRow(i + 2);
    r.values = [
      row.policyNo,
      row.policyHolder,
      row.companyName,
      row.planName,
      modeLabel(row.paymentMode),
      row.premiumPaymentTermMonths,
      isoToDmy(row.commencementDate),
      isoToDmy(row.maturityDate),
      row.roiPct,
      freqLabel(row.compoundingFrequency),
      isoToDmy(row.valuationDate),
      PAISE_TO_RUPEES(row.sumAssuredPaise),
      PAISE_TO_RUPEES(row.totalContributedPaise),
      row.contributionsCount,
      PAISE_TO_RUPEES(row.estimatedValuationPaise),
    ];
    columns.forEach((c, idx) => {
      const cell = r.getCell(idx + 1);
      if (c.money) cell.numFmt = '#,##0.00';
      if (c.pct) cell.numFmt = '0.00';
      if (c.bold) cell.font = { bold: true };
    });
  });

  // Totals row at the bottom.
  const totalRow = ws.getRow(rows.length + 2);
  const totalContrib = rows.reduce((s, r) => s + (r.totalContributedPaise || 0), 0);
  const totalVal = rows.reduce((s, r) => s + (r.estimatedValuationPaise || 0), 0);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(13).value = PAISE_TO_RUPEES(totalContrib);
  totalRow.getCell(13).numFmt = '#,##0.00';
  totalRow.getCell(13).font = { bold: true };
  totalRow.getCell(15).value = PAISE_TO_RUPEES(totalVal);
  totalRow.getCell(15).numFmt = '#,##0.00';
  totalRow.getCell(15).font = { bold: true };

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath, rowCount: rows.length };
};
