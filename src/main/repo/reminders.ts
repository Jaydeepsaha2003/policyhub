import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { format, subDays } from 'date-fns';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db';
import { reminderLog } from '../../shared/db/schema';

export const listReminderLog = (limit = 200) => {
  const db = getDb();
  return db
    .select()
    .from(reminderLog)
    .orderBy(desc(reminderLog.sentAt))
    .limit(limit)
    .all();
};

export const countRemindersLast7Days = () => {
  const since = format(subDays(new Date(), 7), 'yyyy-MM-dd');
  const db = getDb();
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(reminderLog)
    .where(and(eq(reminderLog.success, true), gte(reminderLog.sentAt, since)))
    .get();
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
