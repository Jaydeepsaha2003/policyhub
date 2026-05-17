"use strict";
/* eslint-disable no-console */
// Seed script: inserts ~10 sample policies. Run in dev with `npm run db:seed`.
// NOTE: This bypasses Electron and writes directly to a local SQLite file at
//   ./dev-data/policies.db   (so it doesn't touch your real app DB).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const uuid_1 = require("uuid");
const date_fns_1 = require("date-fns");
const root = process.cwd();
const dir = node_path_1.default.join(root, 'dev-data');
if (!node_fs_1.default.existsSync(dir))
    node_fs_1.default.mkdirSync(dir, { recursive: true });
const dbPath = node_path_1.default.join(dir, 'policies.db');
console.log(`[seed] writing to ${dbPath}`);
const sqlite = new better_sqlite3_1.default(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY,
    policy_no TEXT NOT NULL UNIQUE,
    policy_holder TEXT NOT NULL,
    holder_email TEXT, holder_phone TEXT,
    company_name TEXT NOT NULL, plan_name TEXT NOT NULL,
    premium_amount INTEGER NOT NULL, yearly_total_premium INTEGER NOT NULL,
    payment_mode TEXT NOT NULL, sum_assured INTEGER NOT NULL,
    nominee_name TEXT NOT NULL, nominee_relation TEXT,
    commencement_date TEXT NOT NULL, maturity_date TEXT NOT NULL,
    policy_term_years INTEGER NOT NULL, premium_payment_term_years INTEGER NOT NULL,
    branch_name TEXT, agent_name TEXT, agent_contact TEXT,
    status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS premium_payments (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    installment_no INTEGER NOT NULL, due_date TEXT NOT NULL,
    expected_amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_date TEXT, paid_amount INTEGER,
    penalty_amount INTEGER NOT NULL DEFAULT 0, late_fee INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT, receipt_no TEXT, notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reminder_log (
    id TEXT PRIMARY KEY, policy_id TEXT, payment_id TEXT,
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, email_to TEXT NOT NULL,
    kind TEXT NOT NULL, days_before_due INTEGER NOT NULL,
    subject TEXT NOT NULL, success INTEGER NOT NULL, error_message TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    smtp_host TEXT, smtp_port INTEGER, smtp_user TEXT, smtp_password_encrypted TEXT,
    from_email TEXT, from_name TEXT,
    reminder_offsets_days TEXT NOT NULL DEFAULT '[30,14,7,1]',
    overdue_reminder_interval_days INTEGER NOT NULL DEFAULT 7,
    daily_check_enabled INTEGER NOT NULL DEFAULT 1,
    reminder_recipient TEXT NOT NULL DEFAULT 'agent',
    agent_email TEXT, email_template_due_soon TEXT, email_template_overdue TEXT,
    start_at_login INTEGER NOT NULL DEFAULT 0,
    setup_complete INTEGER NOT NULL DEFAULT 0,
    theme TEXT NOT NULL DEFAULT 'system'
  );
  INSERT OR IGNORE INTO settings (id) VALUES (1);
`);
const sample = [
    { policyNo: 'LIC123001', policyHolder: 'Aarav Sharma', holderEmail: 'aarav@example.com', company: 'LIC', plan: 'Jeevan Anand', premium: 15000, yearly: 60000, mode: 'quarterly', sumAssured: 1000000, nominee: 'Anaya Sharma', termYears: 20, ppt: 15, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 400), 'yyyy-MM-dd') },
    { policyNo: 'HDFC234556', policyHolder: 'Vivaan Patel', holderEmail: 'vivaan@example.com', company: 'HDFC Life', plan: 'Sanchay Plus', premium: 50000, yearly: 50000, mode: 'yearly', sumAssured: 1500000, nominee: 'Riya Patel', termYears: 15, ppt: 10, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 730), 'yyyy-MM-dd') },
    { policyNo: 'ICICI778812', policyHolder: 'Ishaan Verma', company: 'ICICI Prudential', plan: 'iSelect Smart Term', premium: 1250, yearly: 15000, mode: 'monthly', sumAssured: 5000000, nominee: 'Meera Verma', termYears: 30, ppt: 30, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 200), 'yyyy-MM-dd') },
    { policyNo: 'MAXLIFE332', policyHolder: 'Aditya Rao', company: 'Max Life', plan: 'Smart Wealth', premium: 30000, yearly: 30000, mode: 'yearly', sumAssured: 800000, nominee: 'Lakshmi Rao', termYears: 20, ppt: 12, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 1100), 'yyyy-MM-dd') },
    { policyNo: 'TATA9981', policyHolder: 'Sara Khan', holderEmail: 'sara@example.com', company: 'Tata AIA', plan: 'Maha Raksha Supreme', premium: 18000, yearly: 36000, mode: 'half_yearly', sumAssured: 2000000, nominee: 'Imran Khan', termYears: 25, ppt: 20, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 60), 'yyyy-MM-dd') },
    { policyNo: 'BAJAJ4422', policyHolder: 'Diya Mehta', company: 'Bajaj Allianz Life', plan: 'Goal Assure', premium: 10000, yearly: 120000, mode: 'monthly', sumAssured: 1200000, nominee: 'Karan Mehta', termYears: 18, ppt: 18, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 1000), 'yyyy-MM-dd') },
    { policyNo: 'SBI5510', policyHolder: 'Kabir Singh', company: 'SBI Life', plan: 'eShield', premium: 5000, yearly: 5000, mode: 'yearly', sumAssured: 7500000, nominee: 'Aisha Singh', termYears: 30, ppt: 30, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 365), 'yyyy-MM-dd') },
    { policyNo: 'PNB1191', policyHolder: 'Reyansh Nair', company: 'PNB MetLife', plan: 'Mera Term Plan', premium: 8000, yearly: 8000, mode: 'yearly', sumAssured: 5000000, nominee: 'Anika Nair', termYears: 25, ppt: 25, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 50), 'yyyy-MM-dd') },
    { policyNo: 'KOTAK7711', policyHolder: 'Aanya Bose', company: 'Kotak Life', plan: 'Premier Endowment', premium: 25000, yearly: 25000, mode: 'yearly', sumAssured: 1000000, nominee: 'Rohit Bose', termYears: 20, ppt: 15, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 900), 'yyyy-MM-dd') },
    { policyNo: 'LIC123002', policyHolder: 'Vihaan Joshi', company: 'LIC', plan: 'New Endowment Plan', premium: 12000, yearly: 24000, mode: 'half_yearly', sumAssured: 800000, nominee: 'Priya Joshi', termYears: 20, ppt: 20, start: (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), 10), 'yyyy-MM-dd') },
];
const insertPolicy = sqlite.prepare(`
  INSERT INTO policies (
    id, policy_no, policy_holder, holder_email,
    company_name, plan_name,
    premium_amount, yearly_total_premium,
    payment_mode, sum_assured,
    nominee_name, commencement_date, maturity_date,
    policy_term_years, premium_payment_term_years
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const insertPayment = sqlite.prepare(`
  INSERT INTO premium_payments (
    id, policy_id, installment_no, due_date, expected_amount, status,
    paid_date, paid_amount, payment_method
  ) VALUES (?,?,?,?,?,?,?,?,?)
`);
const stepFor = (m) => m === 'monthly' ? 1 : m === 'quarterly' ? 3 : m === 'half_yearly' ? 6 : 12;
const perYear = (m) => m === 'monthly' ? 12 : m === 'quarterly' ? 4 : m === 'half_yearly' ? 2 : 1;
const today = new Date();
sqlite.transaction(() => {
    for (const p of sample) {
        const id = (0, uuid_1.v4)();
        const maturity = (0, date_fns_1.format)((0, date_fns_1.addMonths)(new Date(p.start), p.termYears * 12), 'yyyy-MM-dd');
        insertPolicy.run(id, p.policyNo, p.policyHolder, p.holderEmail ?? null, p.company, p.plan, Math.round(p.premium * 100), Math.round(p.yearly * 100), p.mode, Math.round(p.sumAssured * 100), p.nominee, p.start, maturity, p.termYears, p.ppt);
        const total = perYear(p.mode) * p.ppt;
        const step = stepFor(p.mode);
        for (let i = 0; i < total; i++) {
            const due = (0, date_fns_1.addMonths)(new Date(p.start), i * step);
            const isPast = due < today;
            const status = isPast ? 'paid' : 'pending';
            insertPayment.run((0, uuid_1.v4)(), id, i + 1, (0, date_fns_1.format)(due, 'yyyy-MM-dd'), Math.round(p.premium * 100), status, isPast ? (0, date_fns_1.format)(due, 'yyyy-MM-dd') : null, isPast ? Math.round(p.premium * 100) : null, isPast ? 'UPI' : null);
        }
    }
})();
const count = sqlite.prepare('SELECT COUNT(*) as c FROM policies').get();
console.log(`[seed] ${count.c} policies seeded to ${dbPath}`);
console.log(`[seed] To use this DB in dev, copy it over the app DB location after first launch.`);
sqlite.close();
