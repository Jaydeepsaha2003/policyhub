import nodemailer, { type Transporter } from 'nodemailer';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { v4 as uuid } from 'uuid';
import { getRawSqlite } from './db';
import { readSettings, readSmtpPassword } from './repo/settings';
import type { SmtpTestInput } from '../shared/types';

const formatCurrencyINR = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);

const renderTemplate = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });

const buildTransport = (host: string, port: number, user: string, pass: string): Transporter =>
  nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

export const testSmtp = async (input: SmtpTestInput): Promise<void> => {
  const t = buildTransport(input.smtpHost, input.smtpPort, input.smtpUser, input.smtpPassword);
  await t.verify();
};

const buildConfiguredTransport = (): { transport: Transporter; from: string } | null => {
  const settings = readSettings();
  const password = readSmtpPassword();
  if (
    !settings.smtpHost ||
    !settings.smtpPort ||
    !settings.smtpUser ||
    !password ||
    !settings.fromEmail
  ) {
    return null;
  }
  const transport = buildTransport(
    settings.smtpHost,
    settings.smtpPort,
    settings.smtpUser,
    password,
  );
  const from = settings.fromName
    ? `"${settings.fromName}" <${settings.fromEmail}>`
    : settings.fromEmail;
  return { transport, from };
};

const sendMail = async (to: string, subject: string, body: string): Promise<void> => {
  const conf = buildConfiguredTransport();
  if (!conf) throw new Error('SMTP not configured');
  await conf.transport.sendMail({ from: conf.from, to, subject, text: body });
};

// ---- Monthly summary reminders (1st / 10th / 20th by default) ----

type ListedItem = {
  policyNo: string;
  policyHolder: string;
  companyName: string;
  dueDate: string;
  expectedAmount: number;
};

const collectMonthBuckets = (): {
  dueThisMonth: ListedItem[];
  overdue: ListedItem[];
} => {
  const sqlite = getRawSqlite();
  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  // Mark overdues so the buckets are clean.
  sqlite
    .prepare(
      `UPDATE premium_payments SET status='overdue', updated_at=CURRENT_TIMESTAMP
        WHERE status='pending' AND due_date < ?`,
    )
    .run(today);

  const due = sqlite
    .prepare(
      `SELECT p.policy_no AS policyNo, p.policy_holder AS policyHolder,
              p.company_name AS companyName,
              pp.due_date AS dueDate, pp.expected_amount AS expectedAmount
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE pp.status = 'pending'
          AND pp.due_date BETWEEN ? AND ?
        ORDER BY pp.due_date ASC`,
    )
    .all(monthStart, monthEnd) as ListedItem[];

  const overdue = sqlite
    .prepare(
      `SELECT p.policy_no AS policyNo, p.policy_holder AS policyHolder,
              p.company_name AS companyName,
              pp.due_date AS dueDate, pp.expected_amount AS expectedAmount
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE pp.status = 'overdue'
        ORDER BY pp.due_date ASC`,
    )
    .all() as ListedItem[];

  return { dueThisMonth: due, overdue };
};

const formatList = (items: ListedItem[]): string => {
  if (items.length === 0) return '  (none)';
  return items
    .map(
      (i) =>
        `  - ${i.policyNo} | ${i.policyHolder} | ${i.companyName} | ${format(
          parseISO(i.dueDate),
          'dd MMM yyyy',
        )} | ${formatCurrencyINR(i.expectedAmount)}`,
    )
    .join('\n');
};

const sumAmt = (items: ListedItem[]) =>
  items.reduce((acc, i) => acc + i.expectedAmount, 0);

export type RemindersRunResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  reason?: string;
};

const alreadySentToday = (sendDate: string, emailTo: string): boolean => {
  const sqlite = getRawSqlite();
  const row = sqlite
    .prepare(
      `SELECT id FROM monthly_reminder_log
        WHERE send_date = ? AND email_to = ? AND success = 1
        LIMIT 1`,
    )
    .get(sendDate, emailTo);
  return Boolean(row);
};

const recordMonthly = (entry: {
  sendDate: string;
  dayOfMonth: number;
  emailTo: string;
  subject: string;
  dueCount: number;
  overdueCount: number;
  success: boolean;
  errorMessage?: string;
}) => {
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `INSERT INTO monthly_reminder_log
         (id, send_date, day_of_month, email_to, subject, due_count, overdue_count, success, error_message)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      uuid(),
      entry.sendDate,
      entry.dayOfMonth,
      entry.emailTo,
      entry.subject,
      entry.dueCount,
      entry.overdueCount,
      entry.success ? 1 : 0,
      entry.errorMessage ?? null,
    );
};

const collectRecipients = (settings: {
  reminderRecipient: 'agent' | 'client' | 'both';
  agentEmail: string | null;
}): string[] => {
  // Monthly summary is an agent-facing email by nature. We send it to the
  // agent regardless; "client/both" doesn't make sense here (clients shouldn't
  // see other people's policies). Keep this simple: agent email only.
  return settings.agentEmail ? [settings.agentEmail] : [];
};

// Core entry: send today's monthly summary IF today is one of the configured
// days-of-month. Force=true overrides the date check (used by "Send now").
export const runMonthlyReminders = async (force = false): Promise<RemindersRunResult> => {
  const settings = readSettings();
  const today = new Date();
  const dayOfMonth = today.getDate();
  const sendDate = format(today, 'yyyy-MM-dd');

  if (!force) {
    if (!settings.reminderDaysOfMonth.includes(dayOfMonth)) {
      return { attempted: 0, succeeded: 0, failed: 0, reason: 'not a send-day' };
    }
  }

  const recipients = collectRecipients(settings);
  if (recipients.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, reason: 'no agent email configured' };
  }

  const { dueThisMonth, overdue } = collectMonthBuckets();

  // If there's literally nothing to report and we're on a scheduled day,
  // still send a short "all caught up" email so the agent knows the system is alive.
  const dueTotal = sumAmt(dueThisMonth);
  const overdueTotal = sumAmt(overdue);

  const subject = `PolicyHub: Premium summary for ${format(today, 'MMMM yyyy')} (day ${dayOfMonth})`;
  const tpl =
    settings.emailTemplateMonthly ??
    `Premium summary for {{month}}\n\nDue this month: {{due_count}} ({{due_total}})\n{{due_list}}\n\nOverdue: {{overdue_count}} ({{overdue_total}})\n{{overdue_list}}\n`;
  const body = renderTemplate(tpl, {
    month: format(today, 'MMMM yyyy'),
    day_of_month: dayOfMonth,
    due_count: dueThisMonth.length,
    due_total: formatCurrencyINR(dueTotal),
    due_list: formatList(dueThisMonth),
    overdue_count: overdue.length,
    overdue_total: formatCurrencyINR(overdueTotal),
    overdue_list: formatList(overdue),
    agent_name: settings.fromName ?? '',
  });

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  for (const to of recipients) {
    if (!force && alreadySentToday(sendDate, to)) continue;
    attempted++;
    try {
      await sendMail(to, subject, body);
      recordMonthly({
        sendDate,
        dayOfMonth,
        emailTo: to,
        subject,
        dueCount: dueThisMonth.length,
        overdueCount: overdue.length,
        success: true,
      });
      succeeded++;
    } catch (err) {
      recordMonthly({
        sendDate,
        dayOfMonth,
        emailTo: to,
        subject,
        dueCount: dueThisMonth.length,
        overdueCount: overdue.length,
        success: false,
        errorMessage: (err as Error).message,
      });
      failed++;
    }
  }

  return { attempted, succeeded, failed };
};

// Public API kept for compatibility — same signature, new behavior.
export const runReminders = (): Promise<RemindersRunResult> => runMonthlyReminders(false);

// Manual "Send now" trigger from the UI / tray.
export const sendNow = (): Promise<RemindersRunResult> => runMonthlyReminders(true);
