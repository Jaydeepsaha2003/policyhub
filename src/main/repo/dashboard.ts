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
  totalActiveMutualFunds: number;
  // Counts and amounts below combine policy premiums + MF SIP installments
  // so the dashboard reflects everything the user is actually on the hook
  // for, not just policies.
  premiumsDueInWindow: number;     // count of pending+overdue with due in window
  premiumsPaidInWindow: number;    // count of paid in window
  policiesMaturingInWindow: number;
  // amounts (paise)
  outstandingOverdueAmount: number;
  overdueCount: number;
  duePendingAmount: number;        // pending (not overdue) in window
  collectedInWindow: number;       // paid_amount paid in window
  latePenaltyInWindow: number;     // sum of penalty + late_fee — policy-only (MFs don't carry fees)
  remindersSentLast7Days: number;
};

export const buildOverview = (
  period: Period,
  customRange?: { from?: string | null; to?: string | null } | null,
): DashboardOverview => {
  const sqlite = getRawSqlite();
  const today = fmt(new Date());
  const range =
    customRange && customRange.from && customRange.to
      ? { from: customRange.from, to: customRange.to }
      : periodRange(period);
  const { from, to } = range;

  // Flip pending → overdue first, on both tables.
  sqlite
    .prepare(
      `UPDATE premium_payments
         SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending' AND due_date < ?`,
    )
    .run(today);
  sqlite
    .prepare(
      `UPDATE mutual_fund_payments
         SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending'
         AND due_date < ?
         AND mutual_fund_id IN (SELECT id FROM mutual_funds WHERE deleted_at IS NULL)`,
    )
    .run(today);

  const get = <T = any>(sql: string, ...params: any[]): T =>
    sqlite.prepare(sql).get(...params) as T;

  // Subqueries that exclude rows tied to soft-deleted parents. Reused
  // everywhere a metric needs to combine the two installment tables.
  const PP_LIVE = `premium_payments pp WHERE pp.policy_id IN (SELECT id FROM policies WHERE deleted_at IS NULL)`;
  const MF_LIVE = `mutual_fund_payments mp WHERE mp.mutual_fund_id IN (SELECT id FROM mutual_funds WHERE deleted_at IS NULL)`;

  const totalActivePolicies = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM policies WHERE status = 'active' AND deleted_at IS NULL`,
  ).c;

  const totalActiveMutualFunds = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM mutual_funds WHERE status = 'active' AND deleted_at IS NULL`,
  ).c;

  const premiumsDueInWindow = get<{ c: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM ${PP_LIVE} AND pp.status IN ('pending','overdue') AND pp.due_date BETWEEN ? AND ?) +
       (SELECT COUNT(*) FROM ${MF_LIVE} AND mp.status IN ('pending','overdue') AND mp.due_date BETWEEN ? AND ?)
     ) AS c`,
    from, to, from, to,
  ).c;

  const premiumsPaidInWindow = get<{ c: number }>(
    `SELECT (
       (SELECT COUNT(*) FROM ${PP_LIVE} AND pp.status = 'paid' AND pp.paid_date BETWEEN ? AND ?) +
       (SELECT COUNT(*) FROM ${MF_LIVE} AND mp.status = 'paid' AND mp.paid_date BETWEEN ? AND ?)
     ) AS c`,
    from, to, from, to,
  ).c;

  const policiesMaturingInWindow = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM policies WHERE maturity_date BETWEEN ? AND ? AND deleted_at IS NULL`,
    from,
    to,
  ).c;

  const overdueAgg = get<{ amount: number | null; c: number }>(
    `SELECT (
       COALESCE((SELECT SUM(pp.expected_amount) FROM ${PP_LIVE} AND pp.status = 'overdue'), 0) +
       COALESCE((SELECT SUM(mp.expected_amount) FROM ${MF_LIVE} AND mp.status = 'overdue'), 0)
     ) AS amount,
     (
       (SELECT COUNT(*) FROM ${PP_LIVE} AND pp.status = 'overdue') +
       (SELECT COUNT(*) FROM ${MF_LIVE} AND mp.status = 'overdue')
     ) AS c`,
  );

  const duePendingAmount = get<{ amount: number | null }>(
    `SELECT (
       COALESCE((SELECT SUM(pp.expected_amount) FROM ${PP_LIVE} AND pp.status = 'pending' AND pp.due_date BETWEEN ? AND ?), 0) +
       COALESCE((SELECT SUM(mp.expected_amount) FROM ${MF_LIVE} AND mp.status = 'pending' AND mp.due_date BETWEEN ? AND ?), 0)
     ) AS amount`,
    from, to, from, to,
  ).amount ?? 0;

  const collectedInWindow = get<{ amount: number | null }>(
    `SELECT (
       COALESCE((SELECT SUM(COALESCE(pp.paid_amount, pp.expected_amount)) FROM ${PP_LIVE} AND pp.status = 'paid' AND pp.paid_date BETWEEN ? AND ?), 0) +
       COALESCE((SELECT SUM(COALESCE(mp.paid_amount, mp.expected_amount)) FROM ${MF_LIVE} AND mp.status = 'paid' AND mp.paid_date BETWEEN ? AND ?), 0)
     ) AS amount`,
    from, to, from, to,
  ).amount ?? 0;

  // GST + late fee are policy-only fields. MF SIPs don't carry them
  // so this metric stays narrow on purpose.
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
    totalActiveMutualFunds,
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
export const maturingPolicies = (
  period: Period,
  customRange?: { from?: string | null; to?: string | null } | null,
) => {
  const sqlite = getRawSqlite();
  const range =
    customRange && customRange.from && customRange.to
      ? { from: customRange.from, to: customRange.to }
      : periodRange(period);
  const { from, to } = range;
  return sqlite
    .prepare(
      `SELECT id, policy_no AS policyNo, policy_holder AS policyHolder,
              company_name AS companyName, plan_name AS planName,
              maturity_date AS maturityDate, sum_assured AS sumAssured
         FROM policies
        WHERE maturity_date BETWEEN ? AND ? AND deleted_at IS NULL
        ORDER BY maturity_date ASC`,
    )
    .all(from, to);
};

// "Current — outstanding & paid":
//   - all outstanding (pending/overdue) installments whose due date is on or
//     before the end of the current month (includes previous months'
//     unpaid carry-forwards)
//   - PLUS installments paid within the current calendar month
//
// Returns a UNION of premium_payments + mutual_fund_payments. Each row
// carries a `kind` discriminator ('policy' | 'mutual_fund') plus the
// identifying fields the dashboard renders. Soft-deleted parents are
// filtered out via the JOIN's hidden deleted_at check.
//
// Sort: overdue first (oldest due_date first), then pending (oldest
// first), then paid (most recent paid_date last).
export const currentMonthPayments = () => {
  const sqlite = getRawSqlite();
  const from = fmt(startOfMonth(new Date()));
  const to = fmt(endOfMonth(new Date()));
  return sqlite
    .prepare(
      `SELECT 'policy' AS kind,
              pp.id, pp.installment_no AS installmentNo, pp.due_date AS dueDate,
              pp.expected_amount AS expectedAmount, pp.status,
              pp.paid_date AS paidDate, pp.paid_amount AS paidAmount,
              p.id AS policyId, p.policy_no AS policyNo,
              p.policy_holder AS policyHolder, p.company_name AS companyName,
              NULL AS mutualFundId, NULL AS folioNo,
              NULL AS accountHolder, NULL AS provider, NULL AS schemeName
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE p.deleted_at IS NULL
          AND ((pp.status IN ('pending','overdue') AND pp.due_date <= ?)
            OR (pp.status = 'paid' AND pp.paid_date BETWEEN ? AND ?))
       UNION ALL
       SELECT 'mutual_fund' AS kind,
              mp.id, mp.installment_no AS installmentNo, mp.due_date AS dueDate,
              mp.expected_amount AS expectedAmount, mp.status,
              mp.paid_date AS paidDate, mp.paid_amount AS paidAmount,
              NULL AS policyId, NULL AS policyNo,
              NULL AS policyHolder, NULL AS companyName,
              m.id AS mutualFundId, m.folio_no AS folioNo,
              m.account_holder AS accountHolder,
              m.provider AS provider, m.scheme_name AS schemeName
         FROM mutual_fund_payments mp
         JOIN mutual_funds m ON m.id = mp.mutual_fund_id
        WHERE m.deleted_at IS NULL
          AND ((mp.status IN ('pending','overdue') AND mp.due_date <= ?)
            OR (mp.status = 'paid' AND mp.paid_date BETWEEN ? AND ?))
        ORDER BY
          CASE status WHEN 'overdue' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
          dueDate ASC`,
    )
    .all(to, from, to, to, from, to);
};
