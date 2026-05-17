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
  policyTermYears: integer('policy_term_years').notNull(),
  premiumPaymentTermYears: integer('premium_payment_term_years').notNull(),
  branchName: text('branch_name'),
  agentName: text('agent_name'),
  agentContact: text('agent_contact'),
  status: text('status', {
    enum: ['active', 'matured', 'lapsed', 'surrendered'],
  })
    .notNull()
    .default('active'),
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
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
