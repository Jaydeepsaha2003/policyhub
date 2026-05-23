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

type RoutedItem = ListedItem & {
  policyHolderEmail: string | null;
  bucket: 'due' | 'overdue';
};

// Returns every item that should be reminded about, with the policy holder's
// email attached so the caller can group by recipient.
const collectAllItems = (): RoutedItem[] => {
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

  const dueRows = sqlite
    .prepare(
      `SELECT p.policy_no AS policyNo, p.policy_holder AS policyHolder,
              p.holder_email AS policyHolderEmail,
              p.company_name AS companyName,
              pp.due_date AS dueDate, pp.expected_amount AS expectedAmount
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE pp.status = 'pending'
          AND pp.due_date BETWEEN ? AND ?
        ORDER BY pp.due_date ASC`,
    )
    .all(monthStart, monthEnd) as Array<ListedItem & { policyHolderEmail: string | null }>;

  const overdueRows = sqlite
    .prepare(
      `SELECT p.policy_no AS policyNo, p.policy_holder AS policyHolder,
              p.holder_email AS policyHolderEmail,
              p.company_name AS companyName,
              pp.due_date AS dueDate, pp.expected_amount AS expectedAmount
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE pp.status = 'overdue'
        ORDER BY pp.due_date ASC`,
    )
    .all() as Array<ListedItem & { policyHolderEmail: string | null }>;

  return [
    ...dueRows.map((r) => ({ ...r, bucket: 'due' as const })),
    ...overdueRows.map((r) => ({ ...r, bucket: 'overdue' as const })),
  ];
};

const formatList = (items: ListedItem[]): string => {
  if (items.length === 0) return '  (none)';
  return items
    .map(
      (i) =>
        `  - ${i.policyNo} | ${i.policyHolder} | ${i.companyName} | ${format(
          parseISO(i.dueDate),
          'dd-MM-yyyy',
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

type RecipientGroup = {
  email: string;
  recipientName: string;
  isAgentFallback: boolean;
  due: ListedItem[];
  overdue: ListedItem[];
};

// Group every routed item by recipient = holder_email || agent_email.
const groupByRecipient = (
  items: RoutedItem[],
  agentEmail: string,
  agentName: string,
): RecipientGroup[] => {
  const byEmail = new Map<string, RecipientGroup>();
  for (const it of items) {
    const holder = it.policyHolderEmail?.trim();
    const email = holder && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holder) ? holder : agentEmail;
    const isAgentFallback = email === agentEmail;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        recipientName: isAgentFallback ? agentName : it.policyHolder,
        isAgentFallback,
        due: [],
        overdue: [],
      });
    }
    const g = byEmail.get(email)!;
    if (it.bucket === 'due') g.due.push(it);
    else g.overdue.push(it);
  }
  return Array.from(byEmail.values());
};

// Core entry: send today's per-recipient reminder emails IF today is one of the
// configured days-of-month. Force=true overrides the date check (used by "Send now").
//
// Routing: each policy's reminder goes to its `holder_email`. If a policy has
// no holder email, those items go to the agent (catch-all). Multiple policies
// sharing the same email are consolidated into one email per recipient.
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

  if (!settings.agentEmail) {
    return {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      reason: 'no agent email configured (used as fallback for policies without holder email)',
    };
  }

  const items = collectAllItems();
  if (items.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, reason: 'no items to remind about' };
  }

  const agentName = settings.fromName || 'PolicyHub';
  const groups = groupByRecipient(items, settings.agentEmail, agentName);

  const tpl =
    settings.emailTemplateMonthly ??
    `Hello {{recipient_name}},\n\nPremium summary for {{month}}.\n\nDUE THIS MONTH ({{due_count}}, total {{due_total}}):\n{{due_list}}\n\nOVERDUE ({{overdue_count}}, total {{overdue_total}}):\n{{overdue_list}}\n\nSent by PolicyHub on day {{day_of_month}}.`;

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  for (const g of groups) {
    if (!force && alreadySentToday(sendDate, g.email)) continue;
    const dueTotal = sumAmt(g.due);
    const overdueTotal = sumAmt(g.overdue);
    const subject = `PolicyHub: Premium summary for ${format(today, 'MMMM yyyy')} (day ${dayOfMonth})`;
    const body = renderTemplate(tpl, {
      recipient_name: g.recipientName,
      holder: g.recipientName,
      agent_name: agentName,
      month: format(today, 'MMMM yyyy'),
      day_of_month: dayOfMonth,
      due_count: g.due.length,
      due_total: formatCurrencyINR(dueTotal),
      due_list: formatList(g.due),
      overdue_count: g.overdue.length,
      overdue_total: formatCurrencyINR(overdueTotal),
      overdue_list: formatList(g.overdue),
    });

    attempted++;
    try {
      await sendMail(g.email, subject, body);
      recordMonthly({
        sendDate,
        dayOfMonth,
        emailTo: g.email,
        subject,
        dueCount: g.due.length,
        overdueCount: g.overdue.length,
        success: true,
      });
      succeeded++;
    } catch (err) {
      recordMonthly({
        sendDate,
        dayOfMonth,
        emailTo: g.email,
        subject,
        dueCount: g.due.length,
        overdueCount: g.overdue.length,
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
