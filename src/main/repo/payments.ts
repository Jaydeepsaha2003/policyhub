import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { differenceInCalendarDays, format } from 'date-fns';
import { getDb, getRawSqlite } from '../db';
import { policies, premiumPayments } from '../../shared/db/schema';
import { rupeesToPaise, type MarkPaidInput, type UpcomingPremium } from '../../shared/types';

export const listPaymentsByPolicy = (policyId: string) => {
  const db = getDb();
  return db
    .select()
    .from(premiumPayments)
    .where(eq(premiumPayments.policyId, policyId))
    .orderBy(asc(premiumPayments.installmentNo))
    .all();
};

export const listAllPayments = (filters?: {
  status?: 'pending' | 'paid' | 'overdue';
  policyId?: string;
  from?: string;
  to?: string;
}) => {
  const db = getDb();
  const where = [] as any[];
  if (filters?.status) where.push(eq(premiumPayments.status, filters.status));
  if (filters?.policyId) where.push(eq(premiumPayments.policyId, filters.policyId));
  if (filters?.from) where.push(gte(premiumPayments.dueDate, filters.from));
  if (filters?.to) where.push(lte(premiumPayments.dueDate, filters.to));

  const q = db.select().from(premiumPayments);
  return (where.length ? q.where(and(...where)) : q)
    .orderBy(desc(premiumPayments.dueDate))
    .all();
};

export const markPaid = (input: MarkPaidInput) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (input.paidDate && input.paidDate > today) {
    throw new Error("Paid date can't be in the future");
  }
  if (!Number.isFinite(input.paidAmount) || input.paidAmount <= 0) {
    throw new Error('Paid amount must be greater than zero');
  }
  const db = getDb();
  db.update(premiumPayments)
    .set({
      status: 'paid',
      paidDate: input.paidDate,
      paidAmount: rupeesToPaise(input.paidAmount),
      penaltyAmount: rupeesToPaise(input.penaltyAmount ?? 0),
      lateFee: rupeesToPaise(input.lateFee ?? 0),
      paymentMethod: input.paymentMethod ?? null,
      receiptNo: input.receiptNo ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(premiumPayments.id, input.paymentId))
    .run();
};

// Mark every pending installment of a policy with due_date <= upToDate as paid.
// Sets paid_date = due_date, paid_amount = expected_amount, and applies the
// given default payment method. Returns the number of rows updated.
export const markAllPaidUpTo = (
  policyId: string,
  upToDate: string,
  paymentMethod?: string,
): number => {
  const sqlite = getRawSqlite();
  const stmt = sqlite.prepare(`
    UPDATE premium_payments
       SET status = 'paid',
           paid_date = due_date,
           paid_amount = expected_amount,
           payment_method = COALESCE(payment_method, ?),
           updated_at = CURRENT_TIMESTAMP
     WHERE policy_id = ?
       AND status IN ('pending', 'overdue')
       AND due_date <= ?
  `);
  const info = stmt.run(paymentMethod ?? null, policyId, upToDate);
  return info.changes;
};

// Edit a payment row. Allows changing status (paid/pending/overdue) and any of
// the recorded fields. If status is being moved away from "paid", we clear the
// receipt-side fields.
export type UpdatePaymentInput = {
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
  penaltyAmount?: number; // rupees
  lateFee?: number; // rupees
  notes?: string | null;
};

export const updatePayment = (input: UpdatePaymentInput) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (input.paidDate && input.paidDate > today) {
    throw new Error("Paid date can't be in the future");
  }
  if (input.status === 'paid') {
    if (!input.paidDate) throw new Error('Paid date is required for paid status');
    if (!Number.isFinite(input.paidAmount) || (input.paidAmount as number) <= 0) {
      throw new Error('Paid amount must be greater than zero');
    }
  }
  if (input.penaltyAmount !== undefined && input.penaltyAmount < 0) {
    throw new Error('Penalty cannot be negative');
  }
  if (input.lateFee !== undefined && input.lateFee < 0) {
    throw new Error('Late fee cannot be negative');
  }
  if (input.expectedAmount !== undefined && input.expectedAmount <= 0) {
    throw new Error('Expected amount must be greater than zero');
  }

  const sqlite = getRawSqlite();
  const stmt = sqlite.prepare(`
    UPDATE premium_payments
       SET status = @status,
           due_date = COALESCE(@due_date, due_date),
           expected_amount = COALESCE(@expected_amount, expected_amount),
           paid_date = @paid_date,
           paid_amount = @paid_amount,
           payment_method = @payment_method,
           payment_source = @payment_source,
           payment_source_name = @payment_source_name,
           receipt_no = @receipt_no,
           penalty_amount = COALESCE(@penalty_amount, penalty_amount),
           late_fee = COALESCE(@late_fee, late_fee),
           notes = @notes,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = @id
  `);
  // If status moves away from paid, clear the receipt fields.
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
    penalty_amount:
      input.penaltyAmount !== undefined ? rupeesToPaise(input.penaltyAmount) : null,
    late_fee: input.lateFee !== undefined ? rupeesToPaise(input.lateFee) : null,
    notes: input.notes ?? null,
  });
};

export const markOverdueInstallments = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const db = getDb();
  db.update(premiumPayments)
    .set({ status: 'overdue', updatedAt: new Date().toISOString() })
    .where(
      and(eq(premiumPayments.status, 'pending'), sql`due_date < ${today}`),
    )
    .run();
};

export const upcomingPremiums = (limit = 10): UpcomingPremium[] => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const db = getDb();
  const rows = db
    .select({
      paymentId: premiumPayments.id,
      policyId: policies.id,
      policyNo: policies.policyNo,
      policyHolder: policies.policyHolder,
      companyName: policies.companyName,
      dueDate: premiumPayments.dueDate,
      expectedAmount: premiumPayments.expectedAmount,
      status: premiumPayments.status,
    })
    .from(premiumPayments)
    .innerJoin(policies, eq(premiumPayments.policyId, policies.id))
    .where(
      and(
        sql`${premiumPayments.status} IN ('pending','overdue')`,
        gte(premiumPayments.dueDate, today),
      ),
    )
    .orderBy(asc(premiumPayments.dueDate))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    paymentId: r.paymentId,
    policyId: r.policyId,
    policyNo: r.policyNo,
    policyHolder: r.policyHolder,
    companyName: r.companyName,
    dueDate: r.dueDate,
    expectedAmount: r.expectedAmount,
    daysRemaining: differenceInCalendarDays(new Date(r.dueDate), new Date(today)),
  }));
};
