import { v4 as uuid } from 'uuid';
import { addMonths, format, parseISO } from 'date-fns';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb, getRawSqlite } from '../db';
import { mutualFunds, mutualFundPayments } from '../../shared/db/schema';
import { rupeesToPaise, type MutualFundFormInput } from '../../shared/types';

export const listMutualFunds = () => {
  const db = getDb();
  return db
    .select()
    .from(mutualFunds)
    .where(isNull(mutualFunds.deletedAt))
    .orderBy(asc(mutualFunds.accountHolder))
    .all();
};

export const listDeletedMutualFunds = () => {
  const db = getDb();
  return db
    .select()
    .from(mutualFunds)
    .where(isNotNull(mutualFunds.deletedAt))
    .orderBy(asc(mutualFunds.deletedAt))
    .all();
};

export const getMutualFund = (id: string) => {
  const db = getDb();
  return db.select().from(mutualFunds).where(eq(mutualFunds.id, id)).get() ?? null;
};

// Default occurrence count when the form doesn't specify one — covers
// roughly a 10-year SIP horizon for each frequency. Pending occurrence
// rows past the user-relevant window are cheap, and the regenerate flow
// rewrites them on edits.
const defaultInstallmentCount = (
  type: MutualFundFormInput['type'],
): number => {
  switch (type) {
    case 'monthly':
      return 120; // 10 years
    case 'quarterly':
      return 40;  // 10 years
    case 'half_yearly':
      return 20;  // 10 years
    case 'yearly':
      return 10;  // 10 years
    case 'lumpsum':
      return 1;
  }
};

const normalize = (input: MutualFundFormInput) => ({
  folioNo: input.folioNo.trim(),
  accountHolder: input.accountHolder.trim(),
  agentName: input.agentName?.trim() || null,
  agentContact: input.agentContact?.trim() || null,
  provider: input.provider.trim(),
  schemeName: input.schemeName.trim(),
  type: input.type,
  amount: rupeesToPaise(input.amount),
  startDate: input.startDate,
  installmentCount:
    input.installmentCount && input.installmentCount > 0
      ? Math.max(1, Math.floor(input.installmentCount))
      : defaultInstallmentCount(input.type),
  status: input.status ?? 'active',
  debitBankName: input.debitBankName?.trim() || null,
  debitAccountNo: input.debitAccountNo?.trim() || null,
  debitIfsc: input.debitIfsc?.trim().toUpperCase() || null,
  debitAccountHolder: input.debitAccountHolder?.trim() || null,
  debitBranchName: input.debitBranchName?.trim() || null,
  notes: input.notes?.trim() || null,
});

export const createMutualFund = (input: MutualFundFormInput): string => {
  const db = getDb();
  const id = uuid();
  const data = normalize(input);
  db.insert(mutualFunds)
    .values({ id, ...data })
    .run();
  // Only generate installments for active funds. Closed/redeemed are
  // historical records the user can manage manually.
  if (data.status === 'active') {
    regenerateMfInstallments(id);
  }
  return id;
};

export const updateMutualFund = (id: string, input: MutualFundFormInput) => {
  const db = getDb();
  const before = getMutualFund(id);
  if (!before) throw new Error('Mutual fund not found');
  const data = normalize(input);
  db.update(mutualFunds)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(mutualFunds.id, id))
    .run();

  // Regenerate when anything that affects the schedule changed.
  const scheduleChanged =
    before.type !== data.type ||
    before.startDate !== data.startDate ||
    before.installmentCount !== data.installmentCount ||
    before.amount !== data.amount;
  if (scheduleChanged && data.status === 'active') {
    regenerateMfInstallments(id);
  }
};

// Soft-delete → recycle bin.
export const deleteMutualFund = (id: string) => {
  const db = getDb();
  db.update(mutualFunds)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(mutualFunds.id, id))
    .run();
};

export const restoreMutualFund = (id: string) => {
  const db = getDb();
  db.update(mutualFunds).set({ deletedAt: null }).where(eq(mutualFunds.id, id)).run();
};

// Hard delete. mutual_fund_payments cascade automatically via the schema.
export const purgeMutualFund = (id: string) => {
  const db = getDb();
  db.delete(mutualFunds).where(eq(mutualFunds.id, id)).run();
};

// Months between two consecutive installments for the given fund type.
const stepMonthsForType = (type: string): number => {
  switch (type) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'half_yearly':
      return 6;
    case 'yearly':
      return 12;
    case 'lumpsum':
    default:
      return 0;
  }
};

// Build the installment schedule. Preserves any rows already marked paid
// and rewrites the pending tail.
export const regenerateMfInstallments = (mutualFundId: string) => {
  const db = getDb();
  const mf = getMutualFund(mutualFundId);
  if (!mf) return;

  const count = mf.type === 'lumpsum' ? 1 : Math.max(1, mf.installmentCount);
  const step = stepMonthsForType(mf.type);
  const start = parseISO(mf.startDate);

  const desired = Array.from({ length: count }, (_, i) => ({
    installmentNo: i + 1,
    // step=0 (lumpsum) collapses to the start date for the single row.
    dueDate: format(addMonths(start, i * step), 'yyyy-MM-dd'),
  }));

  const existing = db
    .select()
    .from(mutualFundPayments)
    .where(eq(mutualFundPayments.mutualFundId, mutualFundId))
    .all();
  const byInstallment = new Map(existing.map((r) => [r.installmentNo, r]));

  for (const inst of desired) {
    const existingRow = byInstallment.get(inst.installmentNo);
    if (existingRow) {
      if (existingRow.status === 'pending') {
        db.update(mutualFundPayments)
          .set({
            dueDate: inst.dueDate,
            expectedAmount: mf.amount,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(mutualFundPayments.id, existingRow.id))
          .run();
      }
      byInstallment.delete(inst.installmentNo);
    } else {
      db.insert(mutualFundPayments)
        .values({
          id: uuid(),
          mutualFundId,
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          expectedAmount: mf.amount,
          status: 'pending',
        })
        .run();
    }
  }
  // Pending rows past the new term: drop them.
  for (const leftover of byInstallment.values()) {
    if (leftover.status === 'pending') {
      db.delete(mutualFundPayments)
        .where(eq(mutualFundPayments.id, leftover.id))
        .run();
    }
  }
};

export const countActiveMutualFunds = () => {
  const db = getDb();
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(mutualFunds)
    .where(and(eq(mutualFunds.status, 'active'), isNull(mutualFunds.deletedAt)))
    .get();
  return row?.c ?? 0;
};

// Keep the import referenced for the type-graph.
export const _ref = { mutualFundPayments };
