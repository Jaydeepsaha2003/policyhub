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
