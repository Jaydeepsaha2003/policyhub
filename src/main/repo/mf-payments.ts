import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { format } from 'date-fns';
import { getDb, getRawSqlite } from '../db';
import { mutualFunds, mutualFundPayments } from '../../shared/db/schema';
import { rupeesToPaise } from '../../shared/types';

export const listMfPaymentsByFund = (mutualFundId: string) => {
  const db = getDb();
  return db
    .select()
    .from(mutualFundPayments)
    .where(eq(mutualFundPayments.mutualFundId, mutualFundId))
    .orderBy(asc(mutualFundPayments.installmentNo))
    .all();
};

// Joined listing for the unified Payments tab. Returns one row per
// installment with the parent fund's identifying fields. Soft-deleted
// funds are filtered out.
export const listAllMfPayments = (filters?: {
  status?: 'pending' | 'paid' | 'overdue';
  mutualFundId?: string;
  from?: string;
  to?: string;
}) => {
  const db = getDb();
  const where = [isNull(mutualFunds.deletedAt)] as any[];
  if (filters?.status) where.push(eq(mutualFundPayments.status, filters.status));
  if (filters?.mutualFundId)
    where.push(eq(mutualFundPayments.mutualFundId, filters.mutualFundId));
  if (filters?.from) where.push(gte(mutualFundPayments.dueDate, filters.from));
  if (filters?.to) where.push(lte(mutualFundPayments.dueDate, filters.to));

  return db
    .select({
      id: mutualFundPayments.id,
      mutualFundId: mutualFundPayments.mutualFundId,
      installmentNo: mutualFundPayments.installmentNo,
      dueDate: mutualFundPayments.dueDate,
      expectedAmount: mutualFundPayments.expectedAmount,
      status: mutualFundPayments.status,
      paidDate: mutualFundPayments.paidDate,
      paidAmount: mutualFundPayments.paidAmount,
      paymentMethod: mutualFundPayments.paymentMethod,
      paymentSource: mutualFundPayments.paymentSource,
      paymentSourceName: mutualFundPayments.paymentSourceName,
      receiptNo: mutualFundPayments.receiptNo,
      folioNo: mutualFunds.folioNo,
      accountHolder: mutualFunds.accountHolder,
      provider: mutualFunds.provider,
      schemeName: mutualFunds.schemeName,
      fundType: mutualFunds.type,
      // Default debit details — surfaced so the mark-paid dialog can
      // pre-fill source / source name. Per-installment overrides live
      // on mutual_fund_payments.payment_source(_name).
      debitBankName: mutualFunds.debitBankName,
      debitAccountNo: mutualFunds.debitAccountNo,
    })
    .from(mutualFundPayments)
    .innerJoin(mutualFunds, eq(mutualFundPayments.mutualFundId, mutualFunds.id))
    .where(and(...where))
    .orderBy(asc(mutualFundPayments.dueDate))
    .all();
};

export type MarkMfPaidInput = {
  paymentId: string;
  paidDate: string;
  paidAmount: number; // rupees
  paymentMethod?: string;
  paymentSource?: string;
  paymentSourceName?: string;
  receiptNo?: string;
  notes?: string;
};

export const markMfPaid = (input: MarkMfPaidInput) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (input.paidDate && input.paidDate > today) {
    throw new Error("Paid date can't be in the future");
  }
  if (!Number.isFinite(input.paidAmount) || input.paidAmount <= 0) {
    throw new Error('Paid amount must be greater than zero');
  }
  const db = getDb();
  db.update(mutualFundPayments)
    .set({
      status: 'paid',
      paidDate: input.paidDate,
      paidAmount: rupeesToPaise(input.paidAmount),
      paymentMethod: input.paymentMethod ?? null,
      paymentSource: input.paymentSource ?? null,
      paymentSourceName: input.paymentSourceName ?? null,
      receiptNo: input.receiptNo ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(mutualFundPayments.id, input.paymentId))
    .run();
};

export type UpdateMfPaymentInput = {
  id: string;
  status: 'pending' | 'paid' | 'overdue';
  dueDate?: string;
  expectedAmount?: number; // rupees
  paidDate?: string | null;
  paidAmount?: number | null; // rupees
  paymentMethod?: string | null;
  paymentSource?: string | null;
  paymentSourceName?: string | null;
  receiptNo?: string | null;
  notes?: string | null;
};

export const updateMfPayment = (input: UpdateMfPaymentInput) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (input.paidDate && input.paidDate > today) {
    throw new Error("Paid date can't be in the future");
  }
  if (input.status === 'paid') {
    if (!input.paidDate) throw new Error('Paid date is required');
    if (!Number.isFinite(input.paidAmount) || (input.paidAmount as number) <= 0) {
      throw new Error('Paid amount must be greater than zero');
    }
  }
  if (input.expectedAmount !== undefined && input.expectedAmount <= 0) {
    throw new Error('Expected amount must be greater than zero');
  }

  const sqlite = getRawSqlite();
  const stmt = sqlite.prepare(`
    UPDATE mutual_fund_payments
       SET status = @status,
           due_date = COALESCE(@due_date, due_date),
           expected_amount = COALESCE(@expected_amount, expected_amount),
           paid_date = @paid_date,
           paid_amount = @paid_amount,
           payment_method = @payment_method,
           payment_source = @payment_source,
           payment_source_name = @payment_source_name,
           receipt_no = @receipt_no,
           notes = @notes,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = @id
  `);
  const isPaid = input.status === 'paid';
  stmt.run({
    id: input.id,
    status: input.status,
    due_date: input.dueDate ?? null,
    expected_amount:
      input.expectedAmount !== undefined ? rupeesToPaise(input.expectedAmount) : null,
    paid_date: isPaid ? input.paidDate ?? null : null,
    paid_amount: isPaid && input.paidAmount != null ? rupeesToPaise(input.paidAmount) : null,
    payment_method: isPaid ? input.paymentMethod ?? null : null,
    payment_source: isPaid ? input.paymentSource ?? null : null,
    payment_source_name: isPaid ? input.paymentSourceName ?? null : null,
    receipt_no: isPaid ? input.receiptNo ?? null : null,
    notes: input.notes ?? null,
  });
};

export const markMfOverdueInstallments = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `UPDATE mutual_fund_payments
          SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'pending'
          AND due_date < ?
          AND mutual_fund_id IN (SELECT id FROM mutual_funds WHERE deleted_at IS NULL)`,
    )
    .run(today);
};
