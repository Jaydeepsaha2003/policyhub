import {
  addDays,
  addMonths,
  addQuarters,
  addYears,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
  subYears,
} from 'date-fns';
import { getRawSqlite } from '../db';

export type Period = 'monthly' | 'quarterly' | 'yearly';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

const periodRange = (period: Period, anchor: Date = new Date()) => {
  if (period === 'monthly') {
    return { from: fmt(startOfMonth(anchor)), to: fmt(endOfMonth(anchor)) };
  }
  if (period === 'quarterly') {
    return { from: fmt(startOfQuarter(anchor)), to: fmt(endOfQuarter(anchor)) };
  }
  return { from: fmt(startOfYear(anchor)), to: fmt(endOfYear(anchor)) };
};

export type DashboardOverview = {
  period: Period;
  from: string;
  to: string;
  // counts
  totalActivePolicies: number;
  premiumsDueInWindow: number;     // count of pending+overdue with due in window
  premiumsPaidInWindow: number;    // count of paid in window
  policiesMaturingInWindow: number;
  // amounts (paise)
  outstandingOverdueAmount: number;
  overdueCount: number;
  duePendingAmount: number;        // pending (not overdue) in window
  collectedInWindow: number;       // paid_amount paid in window
  latePenaltyInWindow: number;     // sum of penalty + late_fee on payments paid in window
  remindersSentLast7Days: number;
};

export const buildOverview = (period: Period): DashboardOverview => {
  const sqlite = getRawSqlite();
  const today = fmt(new Date());
  const { from, to } = periodRange(period);

  // Flip pending → overdue first.
  sqlite
    .prepare(
      `UPDATE premium_payments
         SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending' AND due_date < ?`,
    )
    .run(today);

  const get = <T = any>(sql: string, ...params: any[]): T =>
    sqlite.prepare(sql).get(...params) as T;

  const totalActivePolicies = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM policies WHERE status = 'active'`,
  ).c;

  const premiumsDueInWindow = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM premium_payments
       WHERE status IN ('pending','overdue') AND due_date BETWEEN ? AND ?`,
    from,
    to,
  ).c;

  const premiumsPaidInWindow = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM premium_payments
       WHERE status = 'paid' AND paid_date BETWEEN ? AND ?`,
    from,
    to,
  ).c;

  const policiesMaturingInWindow = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM policies WHERE maturity_date BETWEEN ? AND ?`,
    from,
    to,
  ).c;

  const overdueAgg = get<{ amount: number | null; c: number }>(
    `SELECT COALESCE(SUM(expected_amount), 0) AS amount, COUNT(*) AS c
       FROM premium_payments WHERE status = 'overdue'`,
  );

  const duePendingAmount = get<{ amount: number | null }>(
    `SELECT COALESCE(SUM(expected_amount), 0) AS amount FROM premium_payments
       WHERE status = 'pending' AND due_date BETWEEN ? AND ?`,
    from,
    to,
  ).amount ?? 0;

  const collectedInWindow = get<{ amount: number | null }>(
    `SELECT COALESCE(SUM(COALESCE(paid_amount, expected_amount)), 0) AS amount
       FROM premium_payments
       WHERE status = 'paid' AND paid_date BETWEEN ? AND ?`,
    from,
    to,
  ).amount ?? 0;

  const latePenaltyInWindow = get<{ amount: number | null }>(
    `SELECT COALESCE(SUM(penalty_amount + late_fee), 0) AS amount
       FROM premium_payments
       WHERE status = 'paid' AND paid_date BETWEEN ? AND ?`,
    from,
    to,
  ).amount ?? 0;

  const remindersSentLast7Days = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM reminder_log
       WHERE success = 1 AND sent_at >= ?`,
    fmt(addDays(new Date(), -7)),
  ).c;

  return {
    period,
    from,
    to,
    totalActivePolicies,
    premiumsDueInWindow,
    premiumsPaidInWindow,
    policiesMaturingInWindow,
    outstandingOverdueAmount: overdueAgg.amount ?? 0,
    overdueCount: overdueAgg.c,
    duePendingAmount,
    collectedInWindow,
    latePenaltyInWindow,
    remindersSentLast7Days,
  };
};

export type SeriesPoint = {
  label: string;        // human-readable bucket label
  bucketStart: string;  // ISO yyyy-MM-dd
  bucketEnd: string;
  dueAmount: number;    // pending+overdue with due_date in bucket
  paidAmount: number;   // paid with paid_date in bucket
};

// Returns 12 / 8 / 5 buckets ending at the current period (inclusive).
export const buildSeries = (period: Period): SeriesPoint[] => {
  const sqlite = getRawSqlite();
  const buckets: { label: string; from: string; to: string }[] = [];

  if (period === 'monthly') {
    for (let i = 11; i >= 0; i--) {
      const anchor = subMonths(new Date(), i);
      buckets.push({
        label: format(anchor, 'MMM yy'),
        from: fmt(startOfMonth(anchor)),
        to: fmt(endOfMonth(anchor)),
      });
    }
  } else if (period === 'quarterly') {
    for (let i = 7; i >= 0; i--) {
      const anchor = subQuarters(new Date(), i);
      const q = Math.floor(anchor.getMonth() / 3) + 1;
      buckets.push({
        label: `Q${q} ${format(anchor, 'yy')}`,
        from: fmt(startOfQuarter(anchor)),
        to: fmt(endOfQuarter(anchor)),
      });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const anchor = subYears(new Date(), i);
      buckets.push({
        label: format(anchor, 'yyyy'),
        from: fmt(startOfYear(anchor)),
        to: fmt(endOfYear(anchor)),
      });
    }
  }

  const dueStmt = sqlite.prepare(
    `SELECT COALESCE(SUM(expected_amount), 0) AS amt FROM premium_payments
       WHERE due_date BETWEEN ? AND ?`,
  );
  const paidStmt = sqlite.prepare(
    `SELECT COALESCE(SUM(COALESCE(paid_amount, expected_amount)), 0) AS amt
       FROM premium_payments WHERE status = 'paid' AND paid_date BETWEEN ? AND ?`,
  );

  return buckets.map((b) => {
    const due = dueStmt.get(b.from, b.to) as { amt: number };
    const paid = paidStmt.get(b.from, b.to) as { amt: number };
    return {
      label: b.label,
      bucketStart: b.from,
      bucketEnd: b.to,
      dueAmount: due.amt ?? 0,
      paidAmount: paid.amt ?? 0,
    };
  });
};

// Policies whose maturity_date falls inside the given period window.
export const maturingPolicies = (period: Period) => {
  const sqlite = getRawSqlite();
  const { from, to } = periodRange(period);
  return sqlite
    .prepare(
      `SELECT id, policy_no AS policyNo, policy_holder AS policyHolder,
              company_name AS companyName, plan_name AS planName,
              maturity_date AS maturityDate, sum_assured AS sumAssured
         FROM policies
        WHERE maturity_date BETWEEN ? AND ?
        ORDER BY maturity_date ASC`,
    )
    .all(from, to);
};

// Premiums in current calendar month (for "Current month outstanding" view).
export const currentMonthPayments = () => {
  const sqlite = getRawSqlite();
  const from = fmt(startOfMonth(new Date()));
  const to = fmt(endOfMonth(new Date()));
  return sqlite
    .prepare(
      `SELECT pp.id, pp.installment_no AS installmentNo, pp.due_date AS dueDate,
              pp.expected_amount AS expectedAmount, pp.status,
              pp.paid_date AS paidDate, pp.paid_amount AS paidAmount,
              p.id AS policyId, p.policy_no AS policyNo,
              p.policy_holder AS policyHolder, p.company_name AS companyName
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE pp.due_date BETWEEN ? AND ?
        ORDER BY pp.due_date ASC`,
    )
    .all(from, to);
};
