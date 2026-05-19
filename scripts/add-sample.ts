/* eslint-disable no-console */
/**
 * One-off helper that inserts a realistic sample policy + repayments into the
 * running app's database (~/AppData/Roaming/PolicyHub/policies.db on Windows,
 * ~/Library/Application Support/PolicyHub/policies.db on macOS).
 *
 * Run with:  npm run add-sample
 *
 * IMPORTANT: close the PolicyHub app first so we own the write lock.
 */

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { addMonths, format, subYears } from 'date-fns';
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

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const RUPEES = (r: number) => Math.round(r * 100);

const policyId = uuid();
const today = new Date();

// ----- Policy -----
const policy = {
  id: policyId,
  policyNo: `LIC-${Math.floor(100000 + Math.random() * 900000)}`,
  policyHolder: 'Jayanta Saha',
  holderEmail: 'jayanta.test@example.com',
  holderPhone: '+91 9876543210',
  companyName: 'LIC',
  planName: 'Jeevan Anand (149)',
  premiumAmount: RUPEES(15000), // ₹15,000 per installment
  yearlyTotalPremium: RUPEES(60000),
  paymentMode: 'quarterly',
  sumAssured: RUPEES(1500000),
  nomineeName: 'Anita Saha',
  nomineeRelation: 'Spouse',
  commencementDate: format(subYears(today, 2), 'yyyy-MM-dd'),
  maturityDate: format(addMonths(subYears(today, 2), 20 * 12), 'yyyy-MM-dd'),
  policyTermYears: 20,
  premiumPaymentTermYears: 15,
  branchName: 'LIC Branch 814 — Kolkata',
  agentName: 'Self',
  agentContact: '+91 9876543210',
  status: 'active',
  maturityType: 'lumpsum' as const,
  maturityFrequency: null as string | null,
  maturityAccountDetails:
    'HDFC Bank · A/c 50100123456789 · IFSC HDFC0000123 · Salt Lake branch',
  notes: 'Sample policy inserted by scripts/add-sample.ts',
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
    @id, @policyNo, @policyHolder, @holderEmail, @holderPhone,
    @companyName, @planName,
    @premiumAmount, @yearlyTotalPremium, @paymentMode, @sumAssured,
    @nomineeName, @nomineeRelation,
    @commencementDate, @maturityDate,
    @policyTermYears, @premiumPaymentTermYears,
    @branchName, @agentName, @agentContact,
    @status, @maturityType, @maturityFrequency, @maturityAccountDetails, @notes
  )
`);

// ----- Premium installments (15 years × 4 quarterly = 60) -----
const insertPayment = db.prepare(`
  INSERT INTO premium_payments (
    id, policy_id, installment_no, due_date, expected_amount, status,
    paid_date, paid_amount, payment_method,
    payment_source, payment_source_name, receipt_no, notes,
    penalty_amount, late_fee
  ) VALUES (
    @id, @policyId, @installmentNo, @dueDate, @expectedAmount, @status,
    @paidDate, @paidAmount, @paymentMethod,
    @paymentSource, @paymentSourceName, @receiptNo, @notes,
    @penaltyAmount, @lateFee
  )
`);

// ----- Repayments (example regular money-back + monthly commissions) -----
const insertRepayment = db.prepare(`
  INSERT INTO repayments (
    id, policy_id, title, amount, expected_date, frequency, installment_no,
    status, received_date, received_amount,
    received_source, received_source_name, ref_no, notes
  ) VALUES (
    @id, @policyId, @title, @amount, @expectedDate, @frequency, @installmentNo,
    @status, @receivedDate, @receivedAmount,
    @receivedSource, @receivedSourceName, @refNo, @notes
  )
`);

db.transaction(() => {
  insertPolicy.run(policy);

  // Generate 60 quarterly installments starting from commencement date.
  const start = new Date(policy.commencementDate);
  const todayStr = format(today, 'yyyy-MM-dd');
  for (let i = 0; i < 60; i++) {
    const due = addMonths(start, i * 3);
    const dueStr = format(due, 'yyyy-MM-dd');

    // First 8 installments paid (= 2 years), rest pending.
    const isPaid = i < 8;
    insertPayment.run({
      id: uuid(),
      policyId,
      installmentNo: i + 1,
      dueDate: dueStr,
      expectedAmount: policy.premiumAmount,
      status: isPaid ? 'paid' : 'pending',
      paidDate: isPaid ? dueStr : null,
      paidAmount: isPaid ? policy.premiumAmount : null,
      paymentMethod: isPaid ? 'UPI' : null,
      paymentSource: isPaid ? 'Bank' : null,
      paymentSourceName: isPaid ? 'HDFC Bank' : null,
      receiptNo: isPaid ? `RCPT${100 + i}` : null,
      notes: null,
      penaltyAmount: 0,
      lateFee: 0,
    });
    // Mark a single overdue example: don't pay i=8 but its due is in the past.
    if (i === 8 && dueStr < todayStr) {
      // already pending; the app will flip it to overdue on next dashboard load
    }
  }

  // Repayment 1: a survival benefit lumpsum expected in 6 months.
  insertRepayment.run({
    id: uuid(),
    policyId,
    title: 'Survival benefit — 25% SA',
    amount: RUPEES(375000), // 25% of 15L
    expectedDate: format(addMonths(today, 6), 'yyyy-MM-dd'),
    frequency: 'one_time',
    installmentNo: 1,
    status: 'pending',
    receivedDate: null,
    receivedAmount: null,
    receivedSource: null,
    receivedSourceName: null,
    refNo: null,
    notes: 'Expected per policy money-back schedule at the 5-year milestone',
  });

  // Repayment 2: monthly renewal commission, 6 past + 6 future.
  for (let i = -6; i < 6; i++) {
    const expected = addMonths(today, i);
    const expectedStr = format(expected, 'yyyy-MM-dd');
    const isReceived = i < 0;
    insertRepayment.run({
      id: uuid(),
      policyId: null, // standalone agent commission, no specific policy
      title: 'Renewal commission — monthly',
      amount: RUPEES(1200),
      expectedDate: expectedStr,
      frequency: 'monthly',
      installmentNo: i + 7,
      status: isReceived ? 'received' : 'pending',
      receivedDate: isReceived ? expectedStr : null,
      receivedAmount: isReceived ? RUPEES(1200) : null,
      receivedSource: isReceived ? 'Bank' : null,
      receivedSourceName: isReceived ? 'HDFC Bank' : null,
      refNo: isReceived ? `COM${100 + i}` : null,
      notes: null,
    });
  }
})();

console.log(`[add-sample] inserted policy ${policy.policyNo} (${policyId.slice(0, 8)}…)`);
console.log(`[add-sample] 60 quarterly installments, first 8 marked paid`);
console.log(`[add-sample] 1 survival benefit + 12 monthly commissions (6 received, 6 pending)`);
db.close();
