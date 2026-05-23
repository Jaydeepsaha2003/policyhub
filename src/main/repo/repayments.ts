import { v4 as uuid } from 'uuid';
import { addMonths, format, parseISO } from 'date-fns';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb, getRawSqlite } from '../db';
import { repayments, policies } from '../../shared/db/schema';
import { rupeesToPaise } from '../../shared/types';

export type RepaymentFrequency = 'one_time' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

const monthsBetween = (f: RepaymentFrequency): number => {
  switch (f) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'half_yearly':
      return 6;
    case 'yearly':
      return 12;
    case 'one_time':
      return 0;
  }
};

export const markRepaymentsOverdue = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `UPDATE repayments
         SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending' AND expected_date < ?`,
    )
    .run(today);
};

export type ListFilters = {
  status?: 'pending' | 'received' | 'overdue' | 'cancelled';
  policyId?: string;
  from?: string;
  to?: string;
};

export const listRepayments = (filters?: ListFilters) => {
  markRepaymentsOverdue();
  const db = getDb();
  const where = [] as any[];
  if (filters?.status) where.push(eq(repayments.status, filters.status));
  if (filters?.policyId) where.push(eq(repayments.policyId, filters.policyId));
  if (filters?.from) where.push(gte(repayments.expectedDate, filters.from));
  if (filters?.to) where.push(lte(repayments.expectedDate, filters.to));
  const q = db.select().from(repayments);
  return (where.length ? q.where(and(...where)) : q)
    .orderBy(asc(repayments.expectedDate))
    .all();
};

// Joined list — includes policy_no/holder for the page table.
export const listRepaymentsWithPolicy = (filters?: ListFilters) => {
  markRepaymentsOverdue();
  const sqlite = getRawSqlite();
  const where: string[] = [];
  const args: any[] = [];
  if (filters?.status) {
    where.push('r.status = ?');
    args.push(filters.status);
  }
  if (filters?.policyId) {
    where.push('r.policy_id = ?');
    args.push(filters.policyId);
  }
  if (filters?.from) {
    where.push('r.expected_date >= ?');
    args.push(filters.from);
  }
  if (filters?.to) {
    where.push('r.expected_date <= ?');
    args.push(filters.to);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = sqlite
    .prepare(
      `SELECT r.id, r.policy_id AS policyId, r.title,
              r.amount, r.expected_date AS expectedDate,
              r.frequency, r.installment_no AS installmentNo,
              r.status,
              r.received_date AS receivedDate,
              r.received_amount AS receivedAmount,
              r.received_source AS receivedSource,
              r.received_source_name AS receivedSourceName,
              r.ref_no AS refNo, r.notes,
              p.policy_no AS policyNo, p.policy_holder AS policyHolder
         FROM repayments r
         LEFT JOIN policies p ON p.id = r.policy_id
         ${whereClause}
         ORDER BY r.expected_date ASC`,
    )
    .all(...args);
  return rows;
};

export type CreateBatchInput = {
  policyId: string | null;
  title: string;
  amount: number;       // rupees from UI; converted to paise here
  expectedDate: string; // ISO yyyy-MM-dd
  frequency: RepaymentFrequency;
  count: number;        // total installments (>= 1)
  notes?: string;
};

export const createRepaymentBatch = (input: CreateBatchInput) => {
  const db = getDb();
  const count = Math.max(1, Math.floor(input.count));
  const amountPaise = rupeesToPaise(input.amount);
  const step = monthsBetween(input.frequency);
  const start = parseISO(input.expectedDate);

  const ids: string[] = [];
  for (let i = 0; i < (input.frequency === 'one_time' ? 1 : count); i++) {
    const id = uuid();
    const due = step === 0 ? start : addMonths(start, i * step);
    db.insert(repayments)
      .values({
        id,
        policyId: input.policyId ?? null,
        title: input.title.trim(),
        amount: amountPaise,
        expectedDate: format(due, 'yyyy-MM-dd'),
        frequency: input.frequency,
        installmentNo: i + 1,
        status: 'pending',
        notes: input.notes?.trim() || null,
      })
      .run();
    ids.push(id);
  }
  return ids;
};

export type MarkReceivedInput = {
  id: string;
  receivedDate: string;
  receivedAmount: number;     // rupees
  receivedSource?: string;
  receivedSourceName?: string;
  refNo?: string;
  notes?: string;
};

export const markRepaymentReceived = (input: MarkReceivedInput) => {
  // No future dates allowed.
  const today = format(new Date(), 'yyyy-MM-dd');
  if (input.receivedDate && input.receivedDate > today) {
    throw new Error("Received date can't be in the future");
  }
  const db = getDb();
  db.update(repayments)
    .set({
      status: 'received',
      receivedDate: input.receivedDate,
      receivedAmount: rupeesToPaise(input.receivedAmount),
      receivedSource: input.receivedSource ?? null,
      receivedSourceName: input.receivedSourceName ?? null,
      refNo: input.refNo ?? null,
      notes: input.notes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(repayments.id, input.id))
    .run();
};

export type UpdateRepaymentInput = {
  id: string;
  status: 'pending' | 'received' | 'overdue' | 'cancelled';
  title?: string;
  policyId?: string | null;
  amount?: number; // rupees
  expectedDate?: string;
  receivedDate?: string | null;
  receivedAmount?: number | null; // rupees
  receivedSource?: string | null;
  receivedSourceName?: string | null;
  refNo?: string | null;
  notes?: string | null;
};

export const updateRepayment = (input: UpdateRepaymentInput) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (input.receivedDate && input.receivedDate > today) {
    throw new Error("Received date can't be in the future");
  }
  if (input.status === 'received') {
    if (!input.receivedDate) throw new Error('Received date is required');
    if (!Number.isFinite(input.receivedAmount) || (input.receivedAmount as number) <= 0) {
      throw new Error('Received amount must be greater than zero');
    }
  }
  if (input.amount !== undefined && input.amount <= 0) {
    throw new Error('Expected amount must be greater than zero');
  }
  if (input.title !== undefined && !input.title.trim()) {
    throw new Error('Title is required');
  }

  const sqlite = getRawSqlite();
  const stmt = sqlite.prepare(`
    UPDATE repayments
       SET status = @status,
           policy_id = @policy_id,
           title = COALESCE(@title, title),
           amount = COALESCE(@amount, amount),
           expected_date = COALESCE(@expected_date, expected_date),
           received_date = @received_date,
           received_amount = @received_amount,
           received_source = @received_source,
           received_source_name = @received_source_name,
           ref_no = @ref_no,
           notes = @notes,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = @id
  `);
  const isReceived = input.status === 'received';
  stmt.run({
    id: input.id,
    status: input.status,
    policy_id: input.policyId === undefined ? null : input.policyId,
    title: input.title ?? null,
    amount: input.amount !== undefined ? rupeesToPaise(input.amount) : null,
    expected_date: input.expectedDate ?? null,
    received_date: isReceived ? input.receivedDate ?? null : null,
    received_amount:
      isReceived && input.receivedAmount != null ? rupeesToPaise(input.receivedAmount) : null,
    received_source: isReceived ? input.receivedSource ?? null : null,
    received_source_name: isReceived ? input.receivedSourceName ?? null : null,
    ref_no: isReceived ? input.refNo ?? null : null,
    notes: input.notes ?? null,
  });
};

export const cancelRepayment = (id: string) => {
  const db = getDb();
  db.update(repayments)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(eq(repayments.id, id))
    .run();
};

export const deleteRepayment = (id: string) => {
  const db = getDb();
  db.delete(repayments).where(eq(repayments.id, id)).run();
};

const paymentsPerYear = (f: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'): number => {
  switch (f) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half_yearly':
      return 2;
    case 'yearly':
      return 1;
  }
};

// Default horizon for regular-income maturity payouts: 10 years of income.
const REGULAR_INCOME_YEARS = 10;
const MATURITY_TITLE_PREFIX = 'Maturity ';

// Sync the policy's maturity payouts into the repayments table.
// - Lumpsum  → one row at maturity_date with amount=sum_assured.
// - Regular income → REGULAR_INCOME_YEARS × frequency-per-year rows starting at
//   maturity_date, evenly splitting sum_assured across them.
//
// Already-received maturity rows are preserved. Pending maturity rows
// (titles starting with "Maturity ") are deleted and recreated.
export const generateMaturityRepayments = (
  policyId: string,
): { created: number; removed: number } => {
  const sqlite = getRawSqlite();
  const policy = sqlite
    .prepare(
      `SELECT id, sum_assured AS sumAssured, maturity_date AS maturityDate,
              maturity_type AS maturityType, maturity_frequency AS maturityFrequency
         FROM policies WHERE id = ?`,
    )
    .get(policyId) as
    | {
        id: string;
        sumAssured: number;
        maturityDate: string;
        maturityType: 'lumpsum' | 'regular_income';
        maturityFrequency:
          | 'monthly'
          | 'quarterly'
          | 'half_yearly'
          | 'yearly'
          | null;
      }
    | undefined;
  if (!policy) throw new Error('Policy not found');

  const removed = sqlite
    .prepare(
      `DELETE FROM repayments
        WHERE policy_id = ?
          AND status IN ('pending','overdue')
          AND title LIKE ?`,
    )
    .run(policyId, `${MATURITY_TITLE_PREFIX}%`).changes;

  const insert = sqlite.prepare(`
    INSERT INTO repayments (
      id, policy_id, title, amount, expected_date, frequency, installment_no,
      status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  let created = 0;

  if (policy.maturityType === 'lumpsum') {
    insert.run(
      uuid(),
      policy.id,
      `${MATURITY_TITLE_PREFIX}payout`,
      policy.sumAssured,
      policy.maturityDate,
      'one_time',
      1,
      'Auto-generated from policy maturity (lumpsum)',
    );
    created = 1;
  } else {
    const freq = policy.maturityFrequency ?? 'monthly';
    const total = REGULAR_INCOME_YEARS * paymentsPerYear(freq);
    const each = Math.round(policy.sumAssured / total);
    const stepMonths = 12 / paymentsPerYear(freq);
    const start = parseISO(policy.maturityDate);
    for (let i = 0; i < total; i++) {
      const due = addMonths(start, Math.round(i * stepMonths));
      insert.run(
        uuid(),
        policy.id,
        `${MATURITY_TITLE_PREFIX}income #${i + 1}`,
        each,
        format(due, 'yyyy-MM-dd'),
        freq,
        i + 1,
        `Auto-generated from policy maturity (regular income, total = sum assured / ${total})`,
      );
    }
    created = total;
  }

  return { created, removed };
};

// Reference to avoid TS unused warning.
export const _ref = { policies, sql, desc };
