import { dialog } from 'electron';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { getRawSqlite } from './db';

const paiseToRupees = (p: number | null | undefined) =>
  p === null || p === undefined ? null : p / 100;

export const exportAllMutualFunds = async (opts?: {
  mutualFundIds?: string[];
}): Promise<{ saved: boolean; path?: string; rowCount?: number }> => {
  const sqlite = getRawSqlite();

  let rows: any[];
  if (opts?.mutualFundIds !== undefined) {
    if (opts.mutualFundIds.length === 0) {
      rows = [];
    } else {
      const placeholders = opts.mutualFundIds.map(() => '?').join(',');
      rows = sqlite
        .prepare(
          `SELECT * FROM mutual_funds
            WHERE id IN (${placeholders})
              AND deleted_at IS NULL
            ORDER BY account_holder ASC, folio_no ASC`,
        )
        .all(...opts.mutualFundIds) as any[];
    }
  } else {
    rows = sqlite
      .prepare(
        `SELECT * FROM mutual_funds
          WHERE deleted_at IS NULL
          ORDER BY account_holder ASC, folio_no ASC`,
      )
      .all() as any[];
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export mutual funds',
    defaultPath: `mutual-funds-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.xlsx`,
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PolicyHub';
  wb.created = new Date();
  const ws = wb.addWorksheet('Mutual Funds', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Folio No', key: 'folio_no', width: 18 },
    { header: 'Account Holder', key: 'account_holder', width: 24 },
    { header: 'Provider / AMC', key: 'provider', width: 22 },
    { header: 'Scheme', key: 'scheme_name', width: 32 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Amount (₹)', key: 'amount', width: 16 },
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
    ws.addRow({
      ...r,
      amount: paiseToRupees(r.amount),
    });
  }

  await wb.xlsx.writeFile(filePath);
  return { saved: true, path: filePath, rowCount: rows.length };
};
