import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { getRawSqlite } from './db';

const paiseToRupees = (p: number | null | undefined) =>
  p === null || p === undefined ? null : p / 100;

// Two-sheet workbook for the Payments tab:
//   Sheet 1: "Policy Payments" — premium installments
//   Sheet 2: "MF Payments"     — mutual-fund SIP installments
// Each sheet honors its own ID list (passed from the renderer's
// filtered view). Empty list → empty sheet. Undefined → export
// everything live (recycle-bin items excluded).
export const exportPaymentsWorkbook = async (opts?: {
  paymentIds?: string[];
  mfPaymentIds?: string[];
}): Promise<{
  saved: boolean;
  path?: string;
  sheets?: Record<string, number>;
}> => {
  const sqlite = getRawSqlite();

  // ---- Policy Payments ----
  let policyRows: any[];
  if (opts?.paymentIds !== undefined) {
    if (opts.paymentIds.length === 0) {
      policyRows = [];
    } else {
      const ph = opts.paymentIds.map(() => '?').join(',');
      policyRows = sqlite
        .prepare(
          `SELECT pp.id AS payment_id,
                  p.policy_no, p.policy_holder, p.company_name, p.plan_name,
                  pp.installment_no, pp.due_date,
                  pp.expected_amount, pp.status,
                  pp.paid_date, pp.paid_amount,
                  pp.payment_method, pp.payment_source, pp.payment_source_name,
                  pp.receipt_no, pp.penalty_amount, pp.late_fee, pp.notes
             FROM premium_payments pp
             JOIN policies p ON p.id = pp.policy_id
            WHERE pp.id IN (${ph})
              AND p.deleted_at IS NULL
            ORDER BY pp.due_date ASC, p.policy_no ASC`,
        )
        .all(...opts.paymentIds) as any[];
    }
  } else {
    policyRows = sqlite
      .prepare(
        `SELECT pp.id AS payment_id,
                p.policy_no, p.policy_holder, p.company_name, p.plan_name,
                pp.installment_no, pp.due_date,
                pp.expected_amount, pp.status,
                pp.paid_date, pp.paid_amount,
                pp.payment_method, pp.payment_source, pp.payment_source_name,
                pp.receipt_no, pp.penalty_amount, pp.late_fee, pp.notes
           FROM premium_payments pp
           JOIN policies p ON p.id = pp.policy_id
          WHERE p.deleted_at IS NULL
          ORDER BY pp.due_date ASC, p.policy_no ASC`,
      )
      .all() as any[];
  }

  // ---- MF Payments ----
  let mfRows: any[];
  if (opts?.mfPaymentIds !== undefined) {
    if (opts.mfPaymentIds.length === 0) {
      mfRows = [];
    } else {
      const ph = opts.mfPaymentIds.map(() => '?').join(',');
      mfRows = sqlite
        .prepare(
          `SELECT m.folio_no, m.account_holder, m.provider, m.scheme_name, m.type AS fund_type,
                  mp.installment_no, mp.due_date,
                  mp.expected_amount, mp.status,
                  mp.paid_date, mp.paid_amount,
                  mp.payment_method, mp.payment_source, mp.payment_source_name,
                  mp.receipt_no, mp.notes
             FROM mutual_fund_payments mp
             JOIN mutual_funds m ON m.id = mp.mutual_fund_id
            WHERE mp.id IN (${ph})
              AND m.deleted_at IS NULL
            ORDER BY mp.due_date ASC, m.folio_no ASC`,
        )
        .all(...opts.mfPaymentIds) as any[];
    }
  } else {
    mfRows = sqlite
      .prepare(
        `SELECT m.folio_no, m.account_holder, m.provider, m.scheme_name, m.type AS fund_type,
                mp.installment_no, mp.due_date,
                mp.expected_amount, mp.status,
                mp.paid_date, mp.paid_amount,
                mp.payment_method, mp.payment_source, mp.payment_source_name,
                mp.receipt_no, mp.notes
           FROM mutual_fund_payments mp
           JOIN mutual_funds m ON m.id = mp.mutual_fund_id
          WHERE m.deleted_at IS NULL
          ORDER BY mp.due_date ASC, m.folio_no ASC`,
      )
      .all() as any[];
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export payments',
    defaultPath: `payments-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();

  // ---- Sheet 1: Policy Payments ----
  {
    const ws = wb.addWorksheet('Policy Payments', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { header: 'Policy No', key: 'policy_no', width: 18 },
      { header: 'Holder', key: 'policy_holder', width: 22 },
      { header: 'Company', key: 'company_name', width: 18 },
      { header: 'Plan', key: 'plan_name', width: 26 },
      { header: 'Installment #', key: 'installment_no', width: 12 },
      { header: 'Due', key: 'due_date', width: 12 },
      { header: 'Expected (₹)', key: 'expected_amount', width: 14 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Paid on', key: 'paid_date', width: 12 },
      { header: 'Paid (₹)', key: 'paid_amount', width: 14 },
      { header: 'Method', key: 'payment_method', width: 14 },
      { header: 'Source', key: 'payment_source', width: 14 },
      { header: 'Source name', key: 'payment_source_name', width: 18 },
      { header: 'Receipt', key: 'receipt_no', width: 14 },
      { header: 'GST (₹)', key: 'penalty_amount', width: 12 },
      { header: 'Late fee (₹)', key: 'late_fee', width: 12 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of policyRows) {
      ws.addRow({
        ...r,
        expected_amount: paiseToRupees(r.expected_amount),
        paid_amount: paiseToRupees(r.paid_amount),
        penalty_amount: paiseToRupees(r.penalty_amount),
        late_fee: paiseToRupees(r.late_fee),
      });
    }
  }

  // ---- Sheet 2: MF Payments ----
  {
    const ws = wb.addWorksheet('MF Payments', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { header: 'Folio No', key: 'folio_no', width: 18 },
      { header: 'Account Holder', key: 'account_holder', width: 22 },
      { header: 'Provider', key: 'provider', width: 18 },
      { header: 'Scheme', key: 'scheme_name', width: 28 },
      { header: 'Type', key: 'fund_type', width: 10 },
      { header: 'Installment #', key: 'installment_no', width: 12 },
      { header: 'Due', key: 'due_date', width: 12 },
      { header: 'Expected (₹)', key: 'expected_amount', width: 14 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Paid on', key: 'paid_date', width: 12 },
      { header: 'Paid (₹)', key: 'paid_amount', width: 14 },
      { header: 'Method', key: 'payment_method', width: 14 },
      { header: 'Source', key: 'payment_source', width: 14 },
      { header: 'Source name', key: 'payment_source_name', width: 18 },
      { header: 'Receipt', key: 'receipt_no', width: 14 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of mfRows) {
      ws.addRow({
        ...r,
        expected_amount: paiseToRupees(r.expected_amount),
        paid_amount: paiseToRupees(r.paid_amount),
      });
    }
  }

  await wb.xlsx.writeFile(filePath);
  return {
    saved: true,
    path: filePath,
    sheets: {
      'Policy Payments': policyRows.length,
      'MF Payments': mfRows.length,
    },
  };
};
