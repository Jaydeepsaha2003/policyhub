/* eslint-disable no-console */
/**
 * Insert a realistic sample policy + repayments into the running app's database.
 *
 * Run with:  npm run add-sample
 *
 * Uses Node 22's built-in `node:sqlite` (so it doesn't fight better-sqlite3's
 * Electron-22 binding). Make sure the PolicyHub app is closed before running.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const dbPath =
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'PolicyHub', 'policies.db')
    : process.platform === 'win32'
      ? path.join(process.env.APPDATA ?? '', 'PolicyHub', 'policies.db')
      : path.join(os.homedir(), '.config', 'PolicyHub', 'policies.db');

if (!fs.existsSync(dbPath)) {
  console.error(`No app database at ${dbPath}.`);
  console.error('Launch the app once to create it, then re-run this script.');
  process.exit(1);
}

console.log(`[add-sample] DB: ${dbPath}`);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Ensure all tables/columns this script needs are present (newer schema bits
// may not exist if the app wasn't relaunched after a code update).
const ensureSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repayments (
      id TEXT PRIMARY KEY,
      policy_id TEXT REFERENCES policies(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      amount INTEGER NOT NULL,
      expected_date TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'one_time',
      installment_no INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      received_date TEXT,
      received_amount INTEGER,
      received_source TEXT,
      received_source_name TEXT,
      ref_no TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_repayments_policy ON repayments(policy_id);
    CREATE INDEX IF NOT EXISTS idx_repayments_status_date ON repayments(status, expected_date);
  `);

  // Idempotent ALTERs for the newer columns the app added later.
  const hasCol = (table, col) => {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some((r) => r.name === col);
  };

  if (!hasCol('policies', 'maturity_type')) {
    db.exec(`ALTER TABLE policies ADD COLUMN maturity_type TEXT NOT NULL DEFAULT 'lumpsum'`);
  }
  if (!hasCol('policies', 'maturity_frequency')) {
    db.exec(`ALTER TABLE policies ADD COLUMN maturity_frequency TEXT`);
  }
  if (!hasCol('policies', 'maturity_account_details')) {
    db.exec(`ALTER TABLE policies ADD COLUMN maturity_account_details TEXT`);
  }
  if (!hasCol('premium_payments', 'payment_source')) {
    db.exec(`ALTER TABLE premium_payments ADD COLUMN payment_source TEXT`);
  }
  if (!hasCol('premium_payments', 'payment_source_name')) {
    db.exec(`ALTER TABLE premium_payments ADD COLUMN payment_source_name TEXT`);
  }
};

ensureSchema();

const RUPEES = (r) => Math.round(r * 100);

const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Handle month-end overflow (e.g. Jan 31 + 1 month = Feb 28).
  if (d.getDate() < day) d.setDate(0);
  return d;
};
const subYears = (date, years) => {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d;
};
const fmt = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const today = new Date();
const policyId = randomUUID();

// ----- Policy -----
const policy = {
  id: policyId,
  policyNo: `LIC-${Math.floor(100000 + Math.random() * 900000)}`,
  policyHolder: 'Jayanta Saha',
  holderEmail: 'jayanta.test@example.com',
  holderPhone: '+91 9876543210',
  companyName: 'LIC',
  planName: 'Jeevan Anand (149)',
  premiumAmount: RUPEES(15000),
  yearlyTotalPremium: RUPEES(60000),
  paymentMode: 'quarterly',
  sumAssured: RUPEES(1500000),
  nomineeName: 'Anita Saha',
  nomineeRelation: 'Spouse',
  commencementDate: fmt(subYears(today, 2)),
  maturityDate: fmt(addMonths(subYears(today, 2), 20 * 12)),
  policyTermYears: 20,
  premiumPaymentTermYears: 15,
  branchName: 'LIC Branch 814 — Kolkata',
  agentName: 'Self',
  agentContact: '+91 9876543210',
  status: 'active',
  maturityType: 'lumpsum',
  maturityFrequency: null,
  maturityAccountDetails:
    'HDFC Bank · A/c 50100123456789 · IFSC HDFC0000123 · Salt Lake branch',
  notes: 'Sample policy inserted by scripts/add-sample.mjs',
};

const insertPolicy = db.prepare(`
  INSERT INTO policies (
    id, policy_no, policy_holder, holder_email, holder_phone,
    company_name, plan_name,
    premium_amount, yearly_total_premium, payment_mode, sum_assured,
    nominee_name, nominee_relation,
    commencement_date, maturity_date,
    policy_term_years, premium_payment_term_years,
    branch_name, agent_name, agent_contact,
    status, maturity_type, maturity_frequency, maturity_account_details, notes
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?
  )
`);

const insertPayment = db.prepare(`
  INSERT INTO premium_payments (
    id, policy_id, installment_no, due_date, expected_amount, status,
    paid_date, paid_amount, payment_method,
    payment_source, payment_source_name, receipt_no, notes,
    penalty_amount, late_fee
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?
  )
`);

const insertRepayment = db.prepare(`
  INSERT INTO repayments (
    id, policy_id, title, amount, expected_date, frequency, installment_no,
    status, received_date, received_amount,
    received_source, received_source_name, ref_no, notes
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?
  )
`);

// node:sqlite has no native transaction wrapper; use BEGIN/COMMIT.
db.exec('BEGIN');
try {
  insertPolicy.run(
    policy.id,
    policy.policyNo,
    policy.policyHolder,
    policy.holderEmail,
    policy.holderPhone,
    policy.companyName,
    policy.planName,
    policy.premiumAmount,
    policy.yearlyTotalPremium,
    policy.paymentMode,
    policy.sumAssured,
    policy.nomineeName,
    policy.nomineeRelation,
    policy.commencementDate,
    policy.maturityDate,
    policy.policyTermYears,
    policy.premiumPaymentTermYears,
    policy.branchName,
    policy.agentName,
    policy.agentContact,
    policy.status,
    policy.maturityType,
    policy.maturityFrequency,
    policy.maturityAccountDetails,
    policy.notes,
  );

  const start = new Date(policy.commencementDate);
  for (let i = 0; i < 60; i++) {
    const due = addMonths(start, i * 3);
    const dueStr = fmt(due);
    const isPaid = i < 8;
    insertPayment.run(
      randomUUID(),
      policyId,
      i + 1,
      dueStr,
      policy.premiumAmount,
      isPaid ? 'paid' : 'pending',
      isPaid ? dueStr : null,
      isPaid ? policy.premiumAmount : null,
      isPaid ? 'UPI' : null,
      isPaid ? 'Bank' : null,
      isPaid ? 'HDFC Bank' : null,
      isPaid ? `RCPT${100 + i}` : null,
      null,
      0,
      0,
    );
  }

  // Repayment 1: survival benefit lumpsum in 6 months.
  insertRepayment.run(
    randomUUID(),
    policyId,
    'Survival benefit — 25% SA',
    RUPEES(375000),
    fmt(addMonths(today, 6)),
    'one_time',
    1,
    'pending',
    null,
    null,
    null,
    null,
    null,
    'Expected per policy money-back schedule at the 5-year milestone',
  );

  // Repayment 2: monthly commissions — 6 past (received) + 6 future (pending).
  for (let i = -6; i < 6; i++) {
    const expected = fmt(addMonths(today, i));
    const isReceived = i < 0;
    insertRepayment.run(
      randomUUID(),
      null,
      'Renewal commission — monthly',
      RUPEES(1200),
      expected,
      'monthly',
      i + 7,
      isReceived ? 'received' : 'pending',
      isReceived ? expected : null,
      isReceived ? RUPEES(1200) : null,
      isReceived ? 'Bank' : null,
      isReceived ? 'HDFC Bank' : null,
      isReceived ? `COM${100 + i}` : null,
      null,
    );
  }

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('[add-sample] insert failed', err);
  process.exit(1);
}

console.log(`[add-sample] policy ${policy.policyNo} created (id ${policyId.slice(0, 8)}…)`);
console.log('[add-sample] 60 quarterly installments — first 8 marked paid');
console.log(
  '[add-sample] 1 survival benefit (pending) + 12 monthly commissions (6 received, 6 pending)',
);
db.close();
