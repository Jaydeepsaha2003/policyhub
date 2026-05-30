import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { getRawSqlite } from './db';

const paiseToRupees = (p: number | null | undefined) =>
  p === null || p === undefined ? null : p / 100;

// Single workbook with one sheet per domain. Always exports the full
// live dataset (recycle-bin items excluded). This is the "complete
// snapshot" export — use the per-tab export buttons for filter-aware
// downloads.
export const exportEverything = async (): Promise<{
  saved: boolean;
  path?: string;
  sheets?: Record<string, number>;
}> => {
  const sqlite = getRawSqlite();

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export all PolicyHub data',
    defaultPath: `policyhub-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();

  const sheets: Record<string, number> = {};

  // ----- Policies -----
  {
    const rows = sqlite
      .prepare(
        `SELECT * FROM policies
          WHERE deleted_at IS NULL
          ORDER BY policy_holder ASC, policy_no ASC`,
      )
      .all() as any[];
    const ws = wb.addWorksheet('Policies', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { header: 'Policy No', key: 'policy_no', width: 18 },
      { header: 'Holder', key: 'policy_holder', width: 24 },
      { header: 'Company', key: 'company_name', width: 18 },
      { header: 'Plan', key: 'plan_name', width: 26 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Premium (₹)', key: 'premium_amount', width: 14 },
      { header: 'Yearly premium (₹)', key: 'yearly_total_premium', width: 16 },
      { header: 'Mode', key: 'payment_mode', width: 12 },
      { header: 'Sum assured (₹)', key: 'sum_assured', width: 16 },
      { header: 'Commencement', key: 'commencement_date', width: 14 },
      { header: 'Maturity', key: 'maturity_date', width: 14 },
      { header: 'Nominee', key: 'nominee_name', width: 22 },
      { header: 'Agent', key: 'agent_name', width: 18 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        ...r,
        premium_amount: paiseToRupees(r.premium_amount),
        yearly_total_premium: paiseToRupees(r.yearly_total_premium),
        sum_assured: paiseToRupees(r.sum_assured),
      });
    }
    sheets.Policies = rows.length;
  }

  // ----- Mutual Funds -----
  {
    const rows = sqlite
      .prepare(
        `SELECT * FROM mutual_funds
          WHERE deleted_at IS NULL
          ORDER BY account_holder ASC, folio_no ASC`,
      )
      .all() as any[];
    const ws = wb.addWorksheet('Mutual Funds', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { header: 'Folio No', key: 'folio_no', width: 18 },
      { header: 'Account Holder', key: 'account_holder', width: 24 },
      { header: 'Provider', key: 'provider', width: 20 },
      { header: 'Scheme', key: 'scheme_name', width: 32 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Amount (₹)', key: 'amount', width: 14 },
      { header: 'Start date', key: 'start_date', width: 14 },
      { header: 'Installments', key: 'installment_count', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Agent', key: 'agent_name', width: 18 },
      { header: 'Agent contact', key: 'agent_contact', width: 16 },
      { header: 'Debit bank', key: 'debit_bank_name', width: 18 },
      { header: 'Debit A/c no', key: 'debit_account_no', width: 18 },
      { header: 'Debit IFSC', key: 'debit_ifsc', width: 14 },
      { header: 'Debit A/c holder', key: 'debit_account_holder', width: 22 },
      { header: 'Debit branch', key: 'debit_branch_name', width: 18 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({ ...r, amount: paiseToRupees(r.amount) });
    }
    sheets['Mutual Funds'] = rows.length;
  }

  // ----- Premium Payments -----
  {
    const rows = sqlite
      .prepare(
        `SELECT pp.id AS payment_id,
                p.policy_no, p.policy_holder, p.company_name,
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
    const ws = wb.addWorksheet('Premium Payments', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { header: 'Policy No', key: 'policy_no', width: 18 },
      { header: 'Holder', key: 'policy_holder', width: 22 },
      { header: 'Company', key: 'company_name', width: 18 },
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
    for (const r of rows) {
      ws.addRow({
        ...r,
        expected_amount: paiseToRupees(r.expected_amount),
        paid_amount: paiseToRupees(r.paid_amount),
        penalty_amount: paiseToRupees(r.penalty_amount),
        late_fee: paiseToRupees(r.late_fee),
      });
    }
    sheets['Premium Payments'] = rows.length;
  }

  // ----- Mutual Fund Payments (SIP installments) -----
  {
    const rows = sqlite
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
    for (const r of rows) {
      ws.addRow({
        ...r,
        expected_amount: paiseToRupees(r.expected_amount),
        paid_amount: paiseToRupees(r.paid_amount),
      });
    }
    sheets['MF Payments'] = rows.length;
  }

  // ----- Repayments -----
  {
    const rows = sqlite
      .prepare(
        `SELECT r.title, r.installment_no, r.frequency,
                r.expected_date, r.amount, r.status,
                r.received_date, r.received_amount,
                r.received_source, r.received_source_name, r.ref_no, r.notes,
                p.policy_no, p.policy_holder
           FROM repayments r
           LEFT JOIN policies p ON p.id = r.policy_id
          WHERE r.policy_id IS NULL OR p.deleted_at IS NULL
          ORDER BY r.expected_date ASC`,
      )
      .all() as any[];
    const ws = wb.addWorksheet('Repayments', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { header: 'Policy No', key: 'policy_no', width: 18 },
      { header: 'Holder', key: 'policy_holder', width: 22 },
      { header: 'Title', key: 'title', width: 28 },
      { header: 'Frequency', key: 'frequency', width: 14 },
      { header: 'Installment #', key: 'installment_no', width: 12 },
      { header: 'Expected', key: 'expected_date', width: 12 },
      { header: 'Amount (₹)', key: 'amount', width: 14 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Received on', key: 'received_date', width: 12 },
      { header: 'Received (₹)', key: 'received_amount', width: 14 },
      { header: 'Source', key: 'received_source', width: 14 },
      { header: 'Source name', key: 'received_source_name', width: 18 },
      { header: 'Ref no', key: 'ref_no', width: 16 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        ...r,
        amount: paiseToRupees(r.amount),
        received_amount: paiseToRupees(r.received_amount),
      });
    }
    sheets.Repayments = rows.length;
  }

  // ----- Calendar Events -----
  {
    const rows = sqlite
      .prepare(
        `SELECT title, category, custom_category AS customCategory,
                event_date AS eventDate, status,
                is_recurring AS isRecurring, frequency,
                occurrence_no AS occurrenceNo,
                occurrence_total AS occurrenceTotal,
                reminder_offsets_days AS reminderOffsetsDays,
                amount, completed_date AS completedDate, notes
           FROM calendar_events
          WHERE deleted_at IS NULL
          ORDER BY event_date ASC`,
      )
      .all() as any[];
    const ws = wb.addWorksheet('Calendar Events', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = [
      { header: 'Title', key: 'title', width: 28 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Custom label', key: 'customCategory', width: 18 },
      { header: 'Date', key: 'eventDate', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Recurring', key: 'isRecurring', width: 10 },
      { header: 'Frequency', key: 'frequency', width: 12 },
      { header: 'Occurrence', key: 'occurrenceNo', width: 10 },
      { header: 'Of', key: 'occurrenceTotal', width: 8 },
      { header: 'Reminder offsets (days)', key: 'reminderOffsetsDays', width: 22 },
      { header: 'Amount (₹)', key: 'amount', width: 14 },
      { header: 'Completed on', key: 'completedDate', width: 14 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        ...r,
        amount: paiseToRupees(r.amount),
        isRecurring: r.isRecurring ? 'Yes' : 'No',
      });
    }
    sheets['Calendar Events'] = rows.length;
  }

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath, sheets };
};
