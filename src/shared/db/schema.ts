import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Currency is stored as integer paise to avoid float drift. Convert at UI boundary.
// Dates are stored as ISO yyyy-MM-dd strings for simplicity.

export const policies = sqliteTable('policies', {
  id: text('id').primaryKey(),
  policyNo: text('policy_no').notNull().unique(),
  policyHolder: text('policy_holder').notNull(),
  holderEmail: text('holder_email'),
  holderPhone: text('holder_phone'),
  companyName: text('company_name').notNull(),
  planName: text('plan_name').notNull(),
  premiumAmount: integer('premium_amount').notNull(), // paise
  yearlyTotalPremium: integer('yearly_total_premium').notNull(), // paise
  paymentMode: text('payment_mode', {
    enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'],
  }).notNull(),
  sumAssured: integer('sum_assured').notNull(), // paise
  nomineeName: text('nominee_name').notNull(),
  nomineeRelation: text('nominee_relation'),
  commencementDate: text('commencement_date').notNull(),
  maturityDate: text('maturity_date').notNull(),
  policyTermMonths: integer('policy_term_months').notNull(),
  premiumPaymentTermMonths: integer('premium_payment_term_months').notNull(),
  branchName: text('branch_name'),
  agentName: text('agent_name'),
  agentContact: text('agent_contact'),
  status: text('status', {
    enum: ['active', 'active_ppt_over', 'matured', 'lapsed', 'surrendered'],
  })
    .notNull()
    .default('active'),
  // Maturity details
  maturityType: text('maturity_type', { enum: ['lumpsum', 'regular_income'] })
    .notNull()
    .default('lumpsum'),
  maturityFrequency: text('maturity_frequency', {
    enum: ['monthly', 'quarterly', 'half_yearly', 'yearly'],
  }),
  maturityAccountDetails: text('maturity_account_details'), // legacy free-form (kept for backward compat)
  maturityBankName: text('maturity_bank_name'),
  maturityAccountNo: text('maturity_account_no'),
  maturityIfsc: text('maturity_ifsc'),
  maturityBranchName: text('maturity_branch_name'),
  maturityAccountHolder: text('maturity_account_holder'),
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  // Soft-delete timestamp. Null = live; non-null = in recycle bin, scheduled
  // for permanent deletion 90 days after this timestamp.
  deletedAt: text('deleted_at'),
});

export const premiumPayments = sqliteTable('premium_payments', {
  id: text('id').primaryKey(),
  policyId: text('policy_id')
    .notNull()
    .references(() => policies.id, { onDelete: 'cascade' }),
  installmentNo: integer('installment_no').notNull(),
  dueDate: text('due_date').notNull(),
  expectedAmount: integer('expected_amount').notNull(), // paise
  status: text('status', { enum: ['pending', 'paid', 'overdue'] })
    .notNull()
    .default('pending'),
  paidDate: text('paid_date'),
  paidAmount: integer('paid_amount'),
  penaltyAmount: integer('penalty_amount').notNull().default(0),
  lateFee: integer('late_fee').notNull().default(0),
  paymentMethod: text('payment_method'),
  paymentSource: text('payment_source'),
  paymentSourceName: text('payment_source_name'),
  receiptNo: text('receipt_no'),
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const reminderLog = sqliteTable('reminder_log', {
  id: text('id').primaryKey(),
  policyId: text('policy_id')
    .notNull()
    .references(() => policies.id, { onDelete: 'cascade' }),
  paymentId: text('payment_id')
    .notNull()
    .references(() => premiumPayments.id, { onDelete: 'cascade' }),
  sentAt: text('sent_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  emailTo: text('email_to').notNull(),
  kind: text('kind', { enum: ['due_soon', 'overdue'] }).notNull(),
  daysBeforeDue: integer('days_before_due').notNull(),
  subject: text('subject').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  errorMessage: text('error_message'),
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpUser: text('smtp_user'),
  // base64-encoded ciphertext from Electron safeStorage.encryptString
  smtpPasswordEncrypted: text('smtp_password_encrypted'),
  fromEmail: text('from_email'),
  fromName: text('from_name'),
  reminderOffsetsDays: text('reminder_offsets_days').notNull().default('[30,14,7,1]'),
  overdueReminderIntervalDays: integer('overdue_reminder_interval_days')
    .notNull()
    .default(7),
  dailyCheckEnabled: integer('daily_check_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  reminderRecipient: text('reminder_recipient', {
    enum: ['agent', 'client', 'both'],
  })
    .notNull()
    .default('agent'),
  agentEmail: text('agent_email'),
  emailTemplateDueSoon: text('email_template_due_soon'),
  emailTemplateOverdue: text('email_template_overdue'),
  startAtLogin: integer('start_at_login', { mode: 'boolean' })
    .notNull()
    .default(false),
  setupComplete: integer('setup_complete', { mode: 'boolean' })
    .notNull()
    .default(false),
  theme: text('theme', { enum: ['light', 'dark', 'system'] })
    .notNull()
    .default('system'),
  reminderDaysOfMonth: text('reminder_days_of_month').notNull().default('[1,10,20]'),
  emailTemplateMonthly: text('email_template_monthly'),
  // Cloud reminders (Google Sheets + Apps Script)
  cloudSheetUrl: text('cloud_sheet_url'),
  cloudSheetSecretEncrypted: text('cloud_sheet_secret_encrypted'),
  cloudSyncOnQuit: integer('cloud_sync_on_quit', { mode: 'boolean' }).notNull().default(false),
  cloudSyncOnChange: integer('cloud_sync_on_change', { mode: 'boolean' }).notNull().default(false),
  cloudLastSyncedAt: text('cloud_last_synced_at'),
});

export const monthlyReminderLog = sqliteTable('monthly_reminder_log', {
  id: text('id').primaryKey(),
  sentAt: text('sent_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  sendDate: text('send_date').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  emailTo: text('email_to').notNull(),
  subject: text('subject').notNull(),
  dueCount: integer('due_count').notNull(),
  overdueCount: integer('overdue_count').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  errorMessage: text('error_message'),
});

export const repayments = sqliteTable('repayments', {
  id: text('id').primaryKey(),
  policyId: text('policy_id').references(() => policies.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  amount: integer('amount').notNull(),                   // paise
  expectedDate: text('expected_date').notNull(),
  frequency: text('frequency', {
    enum: ['one_time', 'monthly', 'quarterly', 'half_yearly', 'yearly'],
  })
    .notNull()
    .default('one_time'),
  installmentNo: integer('installment_no').notNull().default(1),
  status: text('status', {
    enum: ['pending', 'received', 'overdue', 'cancelled'],
  })
    .notNull()
    .default('pending'),
  receivedDate: text('received_date'),
  receivedAmount: integer('received_amount'),             // paise
  receivedSource: text('received_source'),
  receivedSourceName: text('received_source_name'),
  refNo: text('ref_no'),
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type Repayment = typeof repayments.$inferSelect;

// ---- Mutual Funds ----
//
// Same recycle-bin parity as policies (deletedAt). A `monthly` MF behaves
// like a SIP — its installments live in mutual_fund_payments and surface
// in the unified Payments tab alongside premium installments. A `lumpsum`
// MF is a one-time investment record (still gets one installment row so
// the Payments tab can show it).
export const mutualFunds = sqliteTable('mutual_funds', {
  id: text('id').primaryKey(),
  folioNo: text('folio_no').notNull(),
  accountHolder: text('account_holder').notNull(),
  agentName: text('agent_name'),
  agentContact: text('agent_contact'),
  provider: text('provider').notNull(),
  schemeName: text('scheme_name').notNull(),
  type: text('type', {
    enum: ['lumpsum', 'monthly', 'quarterly', 'half_yearly', 'yearly'],
  })
    .notNull()
    .default('lumpsum'),
  amount: integer('amount').notNull(), // paise — per-installment for SIPs, total for lumpsum
  startDate: text('start_date').notNull(),
  // Internal book-keeping: how many installments to generate. For lumpsum
  // it's always 1. For SIPs we default to a long horizon (10 years' worth)
  // so the user doesn't have to think about a count.
  installmentCount: integer('installment_count').notNull().default(1),
  status: text('status', { enum: ['active', 'redeemed', 'closed'] })
    .notNull()
    .default('active'),
  // Default debit account — the bank account this SIP/lumpsum is paid
  // from. All optional. The mark-paid dialog pre-fills source / source
  // name from these but allows override per installment (so if a single
  // month came out of a different account, the user can correct it).
  debitBankName: text('debit_bank_name'),
  debitAccountNo: text('debit_account_no'),
  debitIfsc: text('debit_ifsc'),
  debitAccountHolder: text('debit_account_holder'),
  debitBranchName: text('debit_branch_name'),
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  deletedAt: text('deleted_at'),
});

export type MutualFund = typeof mutualFunds.$inferSelect;

export const mutualFundPayments = sqliteTable('mutual_fund_payments', {
  id: text('id').primaryKey(),
  mutualFundId: text('mutual_fund_id')
    .notNull()
    .references(() => mutualFunds.id, { onDelete: 'cascade' }),
  installmentNo: integer('installment_no').notNull(),
  dueDate: text('due_date').notNull(),
  expectedAmount: integer('expected_amount').notNull(), // paise
  status: text('status', { enum: ['pending', 'paid', 'overdue'] })
    .notNull()
    .default('pending'),
  paidDate: text('paid_date'),
  paidAmount: integer('paid_amount'),
  paymentMethod: text('payment_method'),
  paymentSource: text('payment_source'),
  paymentSourceName: text('payment_source_name'),
  receiptNo: text('receipt_no'),
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type MutualFundPayment = typeof mutualFundPayments.$inferSelect;

// ---- Calendar Events ----
//
// General-purpose reminder/compliance tracker — credit-card dues, health
// insurance renewals, motor PUC, property tax, RR badge, audits, etc.
// Each row is one occurrence (a specific date). Recurring rules are
// expanded into N occurrence rows up-front, so each can be marked
// complete / skipped individually.
export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category', {
    enum: [
      'credit_card',
      'health_insurance',
      'motor_insurance',
      'property_insurance',
      'property_tax',
      'rr_badge',
      'audit',
      'vehicle_puc',
      'vehicle_fitness',
      'license_renewal',
      'other',
    ],
  })
    .notNull()
    .default('other'),
  // Free-text label shown when category = 'other'.
  customCategory: text('custom_category'),
  eventDate: text('event_date').notNull(), // ISO yyyy-MM-dd
  // Group id — all occurrences generated from the same recurring rule
  // share this so we can edit / delete the series as a unit.
  seriesId: text('series_id').notNull(),
  // For the head row of a series: stores the frequency + total count
  // so we can extend the series later. Occurrence rows mirror these.
  isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
  frequency: text('frequency', {
    enum: ['one_time', 'monthly', 'quarterly', 'half_yearly', 'yearly'],
  })
    .notNull()
    .default('one_time'),
  occurrenceNo: integer('occurrence_no').notNull().default(1),
  occurrenceTotal: integer('occurrence_total').notNull().default(1),
  status: text('status', { enum: ['pending', 'completed', 'skipped'] })
    .notNull()
    .default('pending'),
  completedDate: text('completed_date'),
  // Days-before-due reminder offsets, JSON-encoded e.g. "[30,14,7,1]".
  reminderOffsetsDays: text('reminder_offsets_days').notNull().default('[30,7,1]'),
  amount: integer('amount'), // optional, paise (e.g. expected credit-card bill)
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  deletedAt: text('deleted_at'),
});

export type CalendarEvent = typeof calendarEvents.$inferSelect;

// User-defined Calendar categories. Built-ins (Credit card, Health
// insurance, etc.) live in code with fixed colors. Anything in this
// table is a custom preset: the user picks a label + color once and
// it shows up in the form's category dropdown next to the built-ins.
//
// When a user picks a custom category, the event itself is saved with
// `category='other'` and `customCategory=<label>` so existing storage
// stays intact. The chip color on the calendar grid is looked up by
// matching customCategory against this table's labels.
export const calendarCategories = sqliteTable('calendar_categories', {
  id: text('id').primaryKey(),
  label: text('label').notNull().unique(),
  // Color key matches the Tailwind color name (e.g. 'red', 'emerald').
  // Restricted at the UI layer to a curated palette.
  colorKey: text('color_key').notNull().default('slate'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type CalendarCategory = typeof calendarCategories.$inferSelect;

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  policyId: text('policy_id')
    .notNull()
    .references(() => policies.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  storedName: text('stored_name').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedAt: text('uploaded_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  description: text('description'),
});

export type Attachment = typeof attachments.$inferSelect;

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
export type PremiumPayment = typeof premiumPayments.$inferSelect;
export type NewPremiumPayment = typeof premiumPayments.$inferInsert;
export type ReminderLog = typeof reminderLog.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type PaymentMode = Policy['paymentMode'];
export type PolicyStatus = Policy['status'];
export type PaymentStatus = PremiumPayment['status'];
