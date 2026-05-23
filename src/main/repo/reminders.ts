import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { format, subDays } from 'date-fns';
import { v4 as uuid } from 'uuid';
import { getDb, getRawSqlite } from '../db';
import { reminderLog } from '../../shared/db/schema';

// Reads from the NEW monthly_reminder_log table (the per-recipient send log
// from v0.2.x onward). The old reminder_log table is kept for backward
// compatibility but is no longer written to.
export const listReminderLog = (limit = 200) => {
  const sqlite = getRawSqlite();
  const rows = sqlite
    .prepare(
      `SELECT id,
              sent_at AS sentAt,
              send_date AS sendDate,
              day_of_month AS dayOfMonth,
              email_to AS emailTo,
              subject,
              due_count AS dueCount,
              overdue_count AS overdueCount,
              success,
              error_message AS errorMessage
         FROM monthly_reminder_log
        ORDER BY sent_at DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    sentAt: string;
    sendDate: string;
    dayOfMonth: number;
    emailTo: string;
    subject: string;
    dueCount: number;
    overdueCount: number;
    success: number;
    errorMessage: string | null;
  }>;
  // Coerce integer success → boolean for the renderer.
  return rows.map((r) => ({ ...r, success: r.success === 1 }));
};

export const countRemindersLast7Days = () => {
  const since = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  const sqlite = getRawSqlite();
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS c
         FROM monthly_reminder_log
        WHERE success = 1 AND sent_at >= ?`,
    )
    .get(since) as { c: number } | undefined;
  return row?.c ?? 0;
};

export const recordReminder = (entry: {
  policyId: string;
  paymentId: string;
  emailTo: string;
  kind: 'due_soon' | 'overdue';
  daysBeforeDue: number;
  subject: string;
  success: boolean;
  errorMessage?: string;
}) => {
  const db = getDb();
  db.insert(reminderLog)
    .values({
      id: uuid(),
      policyId: entry.policyId,
      paymentId: entry.paymentId,
      emailTo: entry.emailTo,
      kind: entry.kind,
      daysBeforeDue: entry.daysBeforeDue,
      subject: entry.subject,
      success: entry.success,
      errorMessage: entry.errorMessage ?? null,
    })
    .run();
};

export const reminderExists = (
  paymentId: string,
  daysBeforeDue: number,
): boolean => {
  const db = getDb();
  const row = db
    .select({ id: reminderLog.id })
    .from(reminderLog)
    .where(
      and(
        eq(reminderLog.paymentId, paymentId),
        eq(reminderLog.daysBeforeDue, daysBeforeDue),
        eq(reminderLog.success, true),
      ),
    )
    .get();
  return Boolean(row);
};
