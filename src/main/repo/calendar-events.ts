import { v4 as uuid } from 'uuid';
import { addMonths, format, parseISO } from 'date-fns';
import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { getDb, getRawSqlite } from '../db';
import { calendarEvents } from '../../shared/db/schema';
import {
  rupeesToPaise,
  type CalendarEventFormInput,
  type CalendarEventFrequency,
} from '../../shared/types';

const monthsBetween = (f: CalendarEventFrequency): number => {
  switch (f) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'half_yearly':
      return 6;
    case 'yearly':
      return 12;
    case 'one_time':
      return 0;
  }
};

export type ListFilters = {
  status?: 'pending' | 'completed' | 'skipped';
  category?: string;
  from?: string;
  to?: string;
};

export const listCalendarEvents = (filters?: ListFilters) => {
  const db = getDb();
  const where = [isNull(calendarEvents.deletedAt)] as any[];
  if (filters?.status) where.push(eq(calendarEvents.status, filters.status));
  if (filters?.category) where.push(eq(calendarEvents.category, filters.category as any));
  if (filters?.from) where.push(gte(calendarEvents.eventDate, filters.from));
  if (filters?.to) where.push(lte(calendarEvents.eventDate, filters.to));
  return db
    .select()
    .from(calendarEvents)
    .where(and(...where))
    .orderBy(asc(calendarEvents.eventDate))
    .all();
};

export const listDeletedCalendarEvents = () => {
  const db = getDb();
  return db
    .select()
    .from(calendarEvents)
    .where(isNotNull(calendarEvents.deletedAt))
    .orderBy(asc(calendarEvents.deletedAt))
    .all();
};

export const getCalendarEvent = (id: string) => {
  const db = getDb();
  return db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .get() ?? null;
};

const validate = (input: CalendarEventFormInput) => {
  if (!input.title.trim()) throw new Error('Title is required');
  if (!input.eventDate) throw new Error('Event date is required');
  if (input.category === 'other' && !input.customCategory?.trim()) {
    throw new Error("Please enter a label when category is 'Other'");
  }
  if (input.isRecurring) {
    if (input.frequency === 'one_time') {
      throw new Error('Pick a recurrence frequency');
    }
    if (input.occurrenceTotal < 1 || input.occurrenceTotal > 240) {
      throw new Error('Occurrence count must be between 1 and 240');
    }
  }
  if (input.amount !== undefined && input.amount < 0) {
    throw new Error('Amount cannot be negative');
  }
  // Reasonable bounds on reminder offsets (0..365 days).
  for (const d of input.reminderOffsetsDays) {
    if (!Number.isFinite(d) || d < 0 || d > 365) {
      throw new Error(`Reminder offset must be 0–365 days; got ${d}`);
    }
  }
};

// Create one event. For recurring rules, generates N occurrence rows in a
// single transaction. Returns the head occurrence's id.
export const createCalendarEvent = (input: CalendarEventFormInput): string => {
  validate(input);
  const sqlite = getRawSqlite();
  const total = input.isRecurring ? Math.max(1, Math.floor(input.occurrenceTotal)) : 1;
  const step = input.isRecurring ? monthsBetween(input.frequency) : 0;
  const start = parseISO(input.eventDate);
  const seriesId = uuid();
  const offsets = JSON.stringify(input.reminderOffsetsDays);
  const amountPaise = input.amount !== undefined ? rupeesToPaise(input.amount) : null;

  const insert = sqlite.prepare(`
    INSERT INTO calendar_events (
      id, title, category, custom_category, event_date,
      series_id, is_recurring, frequency, occurrence_no, occurrence_total,
      status, reminder_offsets_days, amount, notes
    ) VALUES (
      @id, @title, @category, @custom_category, @event_date,
      @series_id, @is_recurring, @frequency, @occurrence_no, @occurrence_total,
      'pending', @reminder_offsets_days, @amount, @notes
    )
  `);

  let headId: string | null = null;
  const tx = sqlite.transaction(() => {
    for (let i = 0; i < total; i++) {
      const id = uuid();
      if (i === 0) headId = id;
      const due = step === 0 ? start : addMonths(start, i * step);
      insert.run({
        id,
        title: input.title.trim(),
        category: input.category,
        custom_category:
          input.category === 'other' ? input.customCategory?.trim() ?? null : null,
        event_date: format(due, 'yyyy-MM-dd'),
        series_id: seriesId,
        is_recurring: input.isRecurring ? 1 : 0,
        frequency: input.isRecurring ? input.frequency : 'one_time',
        occurrence_no: i + 1,
        occurrence_total: total,
        reminder_offsets_days: offsets,
        amount: amountPaise,
        notes: input.notes?.trim() || null,
      });
    }
  });
  tx();
  return headId!;
};

// Update one occurrence. Editing the rule itself (recurrence) regenerates
// the future occurrences of the same series; past + completed ones stay.
export const updateCalendarEvent = (id: string, input: CalendarEventFormInput) => {
  validate(input);
  const before = getCalendarEvent(id);
  if (!before) throw new Error('Event not found');
  const sqlite = getRawSqlite();

  const ruleChanged =
    before.isRecurring !== input.isRecurring ||
    before.frequency !== (input.isRecurring ? input.frequency : 'one_time') ||
    before.occurrenceTotal !== (input.isRecurring ? input.occurrenceTotal : 1);

  const offsets = JSON.stringify(input.reminderOffsetsDays);
  const amountPaise = input.amount !== undefined ? rupeesToPaise(input.amount) : null;

  sqlite.transaction(() => {
    // Update this row in place.
    sqlite
      .prepare(
        `UPDATE calendar_events
            SET title = @title,
                category = @category,
                custom_category = @custom_category,
                event_date = @event_date,
                is_recurring = @is_recurring,
                frequency = @frequency,
                occurrence_total = @occurrence_total,
                reminder_offsets_days = @reminder_offsets_days,
                amount = @amount,
                notes = @notes,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = @id`,
      )
      .run({
        id,
        title: input.title.trim(),
        category: input.category,
        custom_category:
          input.category === 'other' ? input.customCategory?.trim() ?? null : null,
        event_date: input.eventDate,
        is_recurring: input.isRecurring ? 1 : 0,
        frequency: input.isRecurring ? input.frequency : 'one_time',
        occurrence_total: input.isRecurring ? input.occurrenceTotal : 1,
        reminder_offsets_days: offsets,
        amount: amountPaise,
        notes: input.notes?.trim() || null,
      });

    // If the recurrence rule changed, regenerate future pending rows
    // for the same series. Completed/skipped past rows are preserved.
    if (ruleChanged) {
      sqlite
        .prepare(
          `DELETE FROM calendar_events
            WHERE series_id = ?
              AND id != ?
              AND status = 'pending'`,
        )
        .run(before.seriesId, id);

      if (input.isRecurring && input.frequency !== 'one_time') {
        const step = monthsBetween(input.frequency);
        const start = parseISO(input.eventDate);
        const total = Math.max(1, Math.floor(input.occurrenceTotal));
        const insert = sqlite.prepare(`
          INSERT INTO calendar_events (
            id, title, category, custom_category, event_date,
            series_id, is_recurring, frequency, occurrence_no, occurrence_total,
            status, reminder_offsets_days, amount, notes
          ) VALUES (
            @id, @title, @category, @custom_category, @event_date,
            @series_id, 1, @frequency, @occurrence_no, @occurrence_total,
            'pending', @reminder_offsets_days, @amount, @notes
          )
        `);
        // Occurrence 1 already exists (the row we just updated above);
        // generate 2..total.
        for (let i = 1; i < total; i++) {
          const due = addMonths(start, i * step);
          insert.run({
            id: uuid(),
            title: input.title.trim(),
            category: input.category,
            custom_category:
              input.category === 'other'
                ? input.customCategory?.trim() ?? null
                : null,
            event_date: format(due, 'yyyy-MM-dd'),
            series_id: before.seriesId,
            frequency: input.frequency,
            occurrence_no: i + 1,
            occurrence_total: total,
            reminder_offsets_days: offsets,
            amount: amountPaise,
            notes: input.notes?.trim() || null,
          });
        }
      }
    }
  })();
};

export const markCalendarEventCompleted = (
  id: string,
  completedDate?: string,
) => {
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `UPDATE calendar_events
          SET status = 'completed',
              completed_date = COALESCE(?, date('now')),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    )
    .run(completedDate ?? null, id);
};

export const markCalendarEventPending = (id: string) => {
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `UPDATE calendar_events
          SET status = 'pending',
              completed_date = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    )
    .run(id);
};

export const markCalendarEventSkipped = (id: string) => {
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `UPDATE calendar_events
          SET status = 'skipped', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    )
    .run(id);
};

// Soft-delete a single occurrence (moves to Recycle Bin).
export const deleteCalendarEvent = (id: string) => {
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `UPDATE calendar_events
          SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    )
    .run(id);
};

// Soft-delete every occurrence in the same series.
export const deleteCalendarEventSeries = (id: string) => {
  const before = getCalendarEvent(id);
  if (!before) return;
  const sqlite = getRawSqlite();
  sqlite
    .prepare(
      `UPDATE calendar_events
          SET deleted_at = CURRENT_TIMESTAMP
        WHERE series_id = ? AND deleted_at IS NULL`,
    )
    .run(before.seriesId);
};

export const restoreCalendarEvent = (id: string) => {
  const sqlite = getRawSqlite();
  sqlite
    .prepare(`UPDATE calendar_events SET deleted_at = NULL WHERE id = ?`)
    .run(id);
};

export const purgeCalendarEvent = (id: string) => {
  const sqlite = getRawSqlite();
  sqlite.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(id);
};

// Quick count helper for the dashboard, in a [from, to] window.
export const countUpcomingCalendarEvents = (fromIso: string, toIso: string) => {
  const db = getDb();
  const row = db
    .select({ c: sql<number>`count(*)` })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.status, 'pending'),
        gte(calendarEvents.eventDate, fromIso),
        lte(calendarEvents.eventDate, toIso),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .get();
  return row?.c ?? 0;
};
