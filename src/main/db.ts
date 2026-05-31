import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../shared/db/schema';

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _sqlite: Database.Database | null = null;
let _dbPath: string | null = null;

export const getDbPath = (): string => {
  if (_dbPath) return _dbPath;
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _dbPath = path.join(dir, 'policies.db');
  return _dbPath;
};

export const getDb = () => {
  if (_db) return _db;
  const dbPath = getDbPath();
  _sqlite = new Database(dbPath);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  _db = drizzle(_sqlite, { schema });
  applySchema(_sqlite);
  return _db;
};

export const getRawSqlite = () => {
  if (!_sqlite) getDb();
  return _sqlite!;
};

export const closeDb = () => {
  try {
    _sqlite?.close();
  } catch (err) {
    console.error('[db] close failed', err);
  }
  _sqlite = null;
  _db = null;
};

// Inline schema bootstrap (CREATE TABLE IF NOT EXISTS).
// In production you'd run Drizzle migrations; this keeps the app self-installing.
const applySchema = (sqlite: Database.Database) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      policy_no TEXT NOT NULL UNIQUE,
      policy_holder TEXT NOT NULL,
      holder_email TEXT,
      holder_phone TEXT,
      company_name TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      premium_amount INTEGER NOT NULL,
      yearly_total_premium INTEGER NOT NULL,
      payment_mode TEXT NOT NULL,
      sum_assured INTEGER NOT NULL,
      nominee_name TEXT NOT NULL,
      nominee_relation TEXT,
      commencement_date TEXT NOT NULL,
      maturity_date TEXT NOT NULL,
      policy_term_months INTEGER NOT NULL,
      premium_payment_term_months INTEGER NOT NULL,
      branch_name TEXT,
      agent_name TEXT,
      agent_contact TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      maturity_type TEXT NOT NULL DEFAULT 'lumpsum',
      maturity_frequency TEXT,
      maturity_account_details TEXT,
      maturity_bank_name TEXT,
      maturity_account_no TEXT,
      maturity_ifsc TEXT,
      maturity_branch_name TEXT,
      maturity_account_holder TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS premium_payments (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
      installment_no INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      expected_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_date TEXT,
      paid_amount INTEGER,
      penalty_amount INTEGER NOT NULL DEFAULT 0,
      late_fee INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT,
      payment_source TEXT,
      payment_source_name TEXT,
      receipt_no TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_payments_policy ON premium_payments(policy_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status_due ON premium_payments(status, due_date);

    CREATE TABLE IF NOT EXISTS reminder_log (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL REFERENCES premium_payments(id) ON DELETE CASCADE,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      email_to TEXT NOT NULL,
      kind TEXT NOT NULL,
      days_before_due INTEGER NOT NULL,
      subject TEXT NOT NULL,
      success INTEGER NOT NULL,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminder_payment ON reminder_log(payment_id, days_before_due);

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_user TEXT,
      smtp_password_encrypted TEXT,
      from_email TEXT,
      from_name TEXT,
      reminder_offsets_days TEXT NOT NULL DEFAULT '[30,14,7,1]',
      overdue_reminder_interval_days INTEGER NOT NULL DEFAULT 7,
      daily_check_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_recipient TEXT NOT NULL DEFAULT 'agent',
      agent_email TEXT,
      email_template_due_soon TEXT,
      email_template_overdue TEXT,
      start_at_login INTEGER NOT NULL DEFAULT 0,
      setup_complete INTEGER NOT NULL DEFAULT 0,
      theme TEXT NOT NULL DEFAULT 'system',
      reminder_days_of_month TEXT NOT NULL DEFAULT '[1,10,20]',
      email_template_monthly TEXT,
      cloud_sheet_url TEXT,
      cloud_sheet_secret_encrypted TEXT,
      cloud_sync_on_quit INTEGER NOT NULL DEFAULT 0,
      cloud_sync_on_change INTEGER NOT NULL DEFAULT 0,
      cloud_last_synced_at TEXT
    );

    INSERT OR IGNORE INTO settings (id) VALUES (1);

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

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      description TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_policy ON attachments(policy_id);

    CREATE TABLE IF NOT EXISTS monthly_reminder_log (
      id TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      send_date TEXT NOT NULL,          -- yyyy-MM-dd
      day_of_month INTEGER NOT NULL,    -- 1, 10, or 20
      email_to TEXT NOT NULL,
      subject TEXT NOT NULL,
      due_count INTEGER NOT NULL,
      overdue_count INTEGER NOT NULL,
      success INTEGER NOT NULL,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_monthly_reminder_send_date
      ON monthly_reminder_log(send_date, email_to);

    CREATE TABLE IF NOT EXISTS mutual_funds (
      id TEXT PRIMARY KEY,
      folio_no TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      agent_name TEXT,
      agent_contact TEXT,
      provider TEXT NOT NULL,
      scheme_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'lumpsum',
      amount INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      installment_count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      debit_bank_name TEXT,
      debit_account_no TEXT,
      debit_ifsc TEXT,
      debit_account_holder TEXT,
      debit_branch_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS mutual_fund_payments (
      id TEXT PRIMARY KEY,
      mutual_fund_id TEXT NOT NULL REFERENCES mutual_funds(id) ON DELETE CASCADE,
      installment_no INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      expected_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_date TEXT,
      paid_amount INTEGER,
      payment_method TEXT,
      payment_source TEXT,
      payment_source_name TEXT,
      receipt_no TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mf_payments_fund ON mutual_fund_payments(mutual_fund_id);
    CREATE INDEX IF NOT EXISTS idx_mf_payments_status_due ON mutual_fund_payments(status, due_date);

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      custom_category TEXT,
      event_date TEXT NOT NULL,
      series_id TEXT NOT NULL,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'one_time',
      occurrence_no INTEGER NOT NULL DEFAULT 1,
      occurrence_total INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      completed_date TEXT,
      reminder_offsets_days TEXT NOT NULL DEFAULT '[30,7,1]',
      amount INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_series ON calendar_events(series_id);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status, event_date);

    CREATE TABLE IF NOT EXISTS calendar_categories (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      color_key TEXT NOT NULL DEFAULT 'slate',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Idempotent ALTERs for upgrades from earlier schema versions.
  addColumnIfMissing(sqlite, 'settings', 'reminder_days_of_month', "TEXT NOT NULL DEFAULT '[1,10,20]'");
  addColumnIfMissing(sqlite, 'settings', 'email_template_monthly', 'TEXT');
  addColumnIfMissing(sqlite, 'policies', 'maturity_type', "TEXT NOT NULL DEFAULT 'lumpsum'");
  addColumnIfMissing(sqlite, 'policies', 'maturity_frequency', 'TEXT');
  addColumnIfMissing(sqlite, 'policies', 'maturity_account_details', 'TEXT');
  addColumnIfMissing(sqlite, 'policies', 'maturity_bank_name', 'TEXT');
  addColumnIfMissing(sqlite, 'policies', 'maturity_account_no', 'TEXT');
  addColumnIfMissing(sqlite, 'policies', 'maturity_ifsc', 'TEXT');
  addColumnIfMissing(sqlite, 'policies', 'maturity_branch_name', 'TEXT');
  addColumnIfMissing(sqlite, 'policies', 'maturity_account_holder', 'TEXT');
  addColumnIfMissing(sqlite, 'premium_payments', 'payment_source', 'TEXT');
  addColumnIfMissing(sqlite, 'premium_payments', 'payment_source_name', 'TEXT');
  addColumnIfMissing(sqlite, 'settings', 'cloud_sheet_url', 'TEXT');
  addColumnIfMissing(sqlite, 'settings', 'cloud_sheet_secret_encrypted', 'TEXT');
  addColumnIfMissing(sqlite, 'settings', 'cloud_sync_on_quit', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(sqlite, 'settings', 'cloud_last_synced_at', 'TEXT');
  addColumnIfMissing(sqlite, 'settings', 'cloud_sync_on_change', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(sqlite, 'policies', 'deleted_at', 'TEXT');
  // Mutual Funds — debit account columns (added in v0.4.1).
  addColumnIfMissing(sqlite, 'mutual_funds', 'debit_bank_name', 'TEXT');
  addColumnIfMissing(sqlite, 'mutual_funds', 'debit_account_no', 'TEXT');
  addColumnIfMissing(sqlite, 'mutual_funds', 'debit_ifsc', 'TEXT');
  addColumnIfMissing(sqlite, 'mutual_funds', 'debit_account_holder', 'TEXT');
  addColumnIfMissing(sqlite, 'mutual_funds', 'debit_branch_name', 'TEXT');

  // Auto-purge: hard-delete policies that have been in the recycle bin for
  // more than 90 days. Repayments are unlinked via ON DELETE SET NULL,
  // which would leave behind orphan rows with a blank policy number on
  // the Repayments tab — so we delete those repayments first inside a
  // single transaction.
  try {
    const purgeStaleRepayments = sqlite.prepare(
      `DELETE FROM repayments
        WHERE policy_id IN (
          SELECT id FROM policies
           WHERE deleted_at IS NOT NULL
             AND datetime(deleted_at, '+90 days') < datetime('now')
        )`,
    );
    const purgeStalePolicies = sqlite.prepare(
      `DELETE FROM policies
        WHERE deleted_at IS NOT NULL
          AND datetime(deleted_at, '+90 days') < datetime('now')`,
    );
    sqlite.transaction(() => {
      purgeStaleRepayments.run();
      purgeStalePolicies.run();
    })();
  } catch (err) {
    console.error('[db] recycle-bin auto-purge failed', err);
  }

  // One-time cleanup for users upgrading from older builds: remove
  // already-orphaned auto-generated maturity repayments left behind by
  // earlier purges (their policy_id was set to NULL by the schema, so
  // they show up in the Repayments tab with a blank policy number).
  // Genuine user-created standalone repayments (different notes) are
  // left alone.
  try {
    sqlite
      .prepare(
        `DELETE FROM repayments
          WHERE policy_id IS NULL
            AND notes LIKE 'Auto-generated from policy maturity%'`,
      )
      .run();
  } catch (err) {
    console.error('[db] orphan-repayment cleanup failed', err);
  }

  // Mutual-fund recycle bin: same 90-day rule as policies. Linked
  // mutual_fund_payments cascade-delete via the schema, so no extra
  // step needed here.
  try {
    sqlite
      .prepare(
        `DELETE FROM mutual_funds
          WHERE deleted_at IS NOT NULL
            AND datetime(deleted_at, '+90 days') < datetime('now')`,
      )
      .run();
  } catch (err) {
    console.error('[db] mutual-funds auto-purge failed', err);
  }

  // Calendar events recycle bin: same 90-day rule.
  try {
    sqlite
      .prepare(
        `DELETE FROM calendar_events
          WHERE deleted_at IS NOT NULL
            AND datetime(deleted_at, '+90 days') < datetime('now')`,
      )
      .run();
  } catch (err) {
    console.error('[db] calendar-events auto-purge failed', err);
  }

  // Migration: rename policy_term_years → policy_term_months and multiply by 12.
  const policiesCols = sqlite.prepare(`PRAGMA table_info(policies)`).all() as Array<{
    name: string;
  }>;
  const hasOldYears = policiesCols.some((c) => c.name === 'policy_term_years');
  const hasNewMonths = policiesCols.some((c) => c.name === 'policy_term_months');
  if (hasOldYears && !hasNewMonths) {
    sqlite.exec(`
      ALTER TABLE policies RENAME COLUMN policy_term_years TO policy_term_months;
      ALTER TABLE policies RENAME COLUMN premium_payment_term_years TO premium_payment_term_months;
      UPDATE policies
         SET policy_term_months = policy_term_months * 12,
             premium_payment_term_months = premium_payment_term_months * 12;
    `);
    console.log(
      '[db] Migrated policy_term_years/premium_payment_term_years → months (×12)',
    );
  }

  // Default email templates if not yet set.
  const row = sqlite
    .prepare(
      'SELECT email_template_due_soon, email_template_overdue, email_template_monthly FROM settings WHERE id = 1',
    )
    .get() as {
    email_template_due_soon: string | null;
    email_template_overdue: string | null;
    email_template_monthly: string | null;
  };

  if (!row.email_template_due_soon) {
    sqlite
      .prepare('UPDATE settings SET email_template_due_soon = ? WHERE id = 1')
      .run(DEFAULT_DUE_SOON_TEMPLATE);
  }
  if (!row.email_template_overdue) {
    sqlite
      .prepare('UPDATE settings SET email_template_overdue = ? WHERE id = 1')
      .run(DEFAULT_OVERDUE_TEMPLATE);
  }
  if (!row.email_template_monthly) {
    sqlite
      .prepare('UPDATE settings SET email_template_monthly = ? WHERE id = 1')
      .run(DEFAULT_MONTHLY_TEMPLATE);
  }
};

const addColumnIfMissing = (
  sqlite: Database.Database,
  table: string,
  column: string,
  ddl: string,
) => {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.find((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
};

const DEFAULT_MONTHLY_TEMPLATE = `Hello {{recipient_name}},

Here is the premium summary for {{month}}.

DUE THIS MONTH ({{due_count}} item(s), total {{due_total}}):
{{due_list}}

OVERDUE ({{overdue_count}} item(s), total {{overdue_total}}):
{{overdue_list}}

Sent automatically by PolicyHub on day {{day_of_month}} of the month.
— {{agent_name}}`;

const DEFAULT_DUE_SOON_TEMPLATE = `Hello {{holder}},

This is a reminder that your premium for policy {{policy_no}} ({{company}} - {{plan}}) is due on {{due_date}}.

Amount due: {{amount}}
Days until due: {{days_until_due}}

Please arrange the payment to keep the policy in force.

Regards,
{{agent_name}}`;

const DEFAULT_OVERDUE_TEMPLATE = `Hello {{holder}},

Your premium for policy {{policy_no}} ({{company}} - {{plan}}) was due on {{due_date}} and is now overdue.

Amount due: {{amount}}

Please clear the dues at the earliest to avoid policy lapse.

Regards,
{{agent_name}}`;
