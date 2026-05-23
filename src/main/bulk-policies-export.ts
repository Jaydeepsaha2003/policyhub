import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { getRawSqlite } from './db';

const PAISE_TO_RUPEES = (p: number | null | undefined) =>
  p === null || p === undefined ? null : p / 100;

export const exportAllPolicies = async (): Promise<{
  saved: boolean;
  path?: string;
  rowCount?: number;
}> => {
  const sqlite = getRawSqlite();

  const rows = sqlite
    .prepare(
      `SELECT *
         FROM policies
        ORDER BY policy_holder ASC, policy_no ASC`,
    )
    .all() as any[];

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export all policies',
    defaultPath: `policies-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();

  const ws = wb.addWorksheet('Policies', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Header definitions (label, key in row, optional formatter).
  type Col = {
    header: string;
    key: keyof typeof rows[number] | string;
    width: number;
    money?: boolean;
  };

  const columns: Col[] = [
    { header: 'Policy No', key: 'policy_no', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Holder', key: 'policy_holder', width: 24 },
    { header: 'Holder email', key: 'holder_email', width: 28 },
    { header: 'Holder phone', key: 'holder_phone', width: 18 },
    { header: 'Company', key: 'company_name', width: 18 },
    { header: 'Plan', key: 'plan_name', width: 26 },
    { header: 'Branch', key: 'branch_name', width: 22 },
    { header: 'Agent', key: 'agent_name', width: 18 },
    { header: 'Agent contact', key: 'agent_contact', width: 18 },
    { header: 'Payment mode', key: 'payment_mode', width: 12 },
    { header: 'Premium amount (₹)', key: 'premium_amount', width: 16, money: true },
    { header: 'Yearly premium (₹)', key: 'yearly_total_premium', width: 16, money: true },
    { header: 'Sum assured (₹)', key: 'sum_assured', width: 18, money: true },
    { header: 'Commencement', key: 'commencement_date', width: 14 },
    { header: 'Maturity date', key: 'maturity_date', width: 14 },
    { header: 'Policy term (months)', key: 'policy_term_months', width: 14 },
    { header: 'PPT (months)', key: 'premium_payment_term_months', width: 12 },
    { header: 'Nominee', key: 'nominee_name', width: 22 },
    { header: 'Nominee relation', key: 'nominee_relation', width: 14 },
    { header: 'Maturity type', key: 'maturity_type', width: 14 },
    { header: 'Maturity frequency', key: 'maturity_frequency', width: 14 },
    { header: 'Maturity bank', key: 'maturity_bank_name', width: 18 },
    { header: 'Maturity A/c holder', key: 'maturity_account_holder', width: 22 },
    { header: 'Maturity A/c no', key: 'maturity_account_no', width: 22 },
    { header: 'Maturity IFSC', key: 'maturity_ifsc', width: 14 },
    { header: 'Maturity branch', key: 'maturity_branch_name', width: 22 },
    {
      header: 'Maturity account (legacy free-form)',
      key: 'maturity_account_details',
      width: 32,
    },
    { header: 'Notes', key: 'notes', width: 32 },
    { header: 'Created at', key: 'created_at', width: 18 },
    { header: 'Updated at', key: 'updated_at', width: 18 },
  ];

  ws.getRow(1).values = columns.map((c) => c.header);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.columns = columns.map((c) => ({ width: c.width }));

  rows.forEach((row, i) => {
    const r = ws.getRow(i + 2);
    r.values = columns.map((c) => {
      const v = (row as any)[c.key];
      if (v === null || v === undefined) return '';
      if (c.money && typeof v === 'number') return PAISE_TO_RUPEES(v);
      return v;
    });
    columns.forEach((c, idx) => {
      if (c.money) r.getCell(idx + 1).numFmt = '#,##0.00';
    });
  });

  // Add a 'Payment summary' sheet with per-policy paid / pending / overdue counts.
  const summary = sqlite
    .prepare(
      `SELECT p.policy_no AS policyNo,
              p.policy_holder AS policyHolder,
              p.company_name AS companyName,
              p.status AS status,
              COUNT(pp.id) AS totalInstallments,
              SUM(CASE WHEN pp.status = 'paid' THEN 1 ELSE 0 END) AS paidCount,
              SUM(CASE WHEN pp.status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
              SUM(CASE WHEN pp.status = 'overdue' THEN 1 ELSE 0 END) AS overdueCount,
              COALESCE(SUM(CASE WHEN pp.status = 'paid' THEN COALESCE(pp.paid_amount, pp.expected_amount) ELSE 0 END), 0) AS totalPaidPaise,
              COALESCE(SUM(CASE WHEN pp.status != 'paid' THEN pp.expected_amount ELSE 0 END), 0) AS totalUnpaidPaise
         FROM policies p
         LEFT JOIN premium_payments pp ON pp.policy_id = p.id
        GROUP BY p.id
        ORDER BY p.policy_holder ASC, p.policy_no ASC`,
    )
    .all() as any[];

  const ws2 = wb.addWorksheet('Payment summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const sumCols = [
    { header: 'Policy No', width: 18 },
    { header: 'Holder', width: 24 },
    { header: 'Company', width: 18 },
    { header: 'Status', width: 14 },
    { header: 'Total installments', width: 14 },
    { header: 'Paid', width: 8 },
    { header: 'Pending', width: 10 },
    { header: 'Overdue', width: 10 },
    { header: 'Total paid (₹)', width: 16 },
    { header: 'Total unpaid (₹)', width: 16 },
  ];
  ws2.getRow(1).values = sumCols.map((c) => c.header);
  ws2.getRow(1).font = { bold: true };
  ws2.columns = sumCols.map((c) => ({ width: c.width }));
  summary.forEach((s, i) => {
    const r = ws2.getRow(i + 2);
    r.values = [
      s.policyNo,
      s.policyHolder,
      s.companyName,
      s.status,
      s.totalInstallments,
      s.paidCount,
      s.pendingCount,
      s.overdueCount,
      PAISE_TO_RUPEES(s.totalPaidPaise),
      PAISE_TO_RUPEES(s.totalUnpaidPaise),
    ];
    r.getCell(9).numFmt = '#,##0.00';
    r.getCell(10).numFmt = '#,##0.00';
  });

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath, rowCount: rows.length };
};
